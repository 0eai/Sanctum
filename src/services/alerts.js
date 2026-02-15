// src/services/alerts.js
import { 
  collection, query, onSnapshot, doc, getDoc, setDoc 
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

// --- CONFIGURATION ---
const GCAL_API_KEY = "AIzaSyBhWNmLtTvQs44icwi_VzkV-3jKTh77fEo"; 
const GCAL_CLIENT_ID = "996648471971-i52dl8kde2942aa0atcs7iat7t0cdepv.apps.googleusercontent.com";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.readonly";

// --- LISTENERS ---

export const listenToAlertsData = (userId, cryptoKey, callback) => {
  const collections = [
      { col: 'tasks', type: 'task' },
      { col: 'notes', type: 'note' },
      { col: 'markdown', type: 'markdown' },
      { col: 'checklists', type: 'checklist' },
      { col: 'counters', type: 'counter' },
      { col: 'finance', type: 'finance' },
      { col: 'reminders', type: 'reminder' } 
  ];

  const unsubs = collections.map(({ col, type }) => {
      const q = query(collection(db, 'artifacts', appId, 'users', userId, col));
      return onSnapshot(q, async (snap) => {
          const data = await Promise.all(snap.docs.map(async d => {
              const raw = d.data();
              if (raw.completed) return null; // Skip completed tasks
              
              const dec = await decryptData(raw, cryptoKey);
              
              // Handle Finance items differently
              if (type === 'finance') {
                  let financeType = null;
                  let dateStr = null;
                  if (dec.type === 'subscriptions') { financeType = 'finance_sub'; dateStr = dec.nextDate; }
                  else if (dec.type === 'debts') { financeType = 'finance_bill'; dateStr = dec.dueDate; }
                  
                  if (!financeType || !dateStr) return null;
                  
                  return { 
                      id: d.id, source: financeType, title: dec.name || dec.person || "Bill", 
                      date: new Date(dateStr), original: dec 
                  };
              }

              if (type === 'reminder') {
                  if (!dec.isActive || !dec.datetime) return null; // Skip inactive/completed or dateless reminders
                  return { id: d.id, source: type, title: dec.title || "Reminder", date: new Date(dec.datetime), original: dec };
              }

              // Handle Standard items (including Markdown)
              if (!dec.dueDate) return null;
              return { 
                  id: d.id, source: type, title: dec.title || "Untitled", 
                  date: new Date(dec.dueDate), original: dec 
              };
          }));
          callback(type, data.filter(i => i));
      });
  });

  return () => unsubs.forEach(u => u());
};

export const listenToCalendarEvents = (userId, cryptoKey, callback) => {
    const q = query(collection(db, 'artifacts', appId, 'users', userId, 'calendar_events'));
    return onSnapshot(q, async (snap) => {
        const events = await Promise.all(snap.docs.map(async d => {
            const dec = await decryptData(d.data(), cryptoKey);
            return {
                id: d.id,
                source: 'calendar',
                title: dec.summary || "Busy",
                date: new Date(dec.startStr),
                link: dec.link,
                calendarName: dec.calendarName,
                original: dec
            };
        }));
        // Filter out past events (older than yesterday)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        callback(events.filter(e => e.date > yesterday));
    });
};

// --- GOOGLE CALENDAR SYNC ---

export const initializeGoogleClient = (onInit, onError) => {
    const script1 = document.createElement('script');
    script1.src = "https://apis.google.com/js/api.js";
    script1.onload = () => {
        window.gapi.load('client', () => {
            window.gapi.client.init({ apiKey: GCAL_API_KEY, discoveryDocs: DISCOVERY_DOCS })
            .then(() => onInit('gapi'))
            .catch(err => onError("API Init Failed"));
        });
    };
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = "https://accounts.google.com/gsi/client";
    script2.onload = () => onInit('gis');
    document.body.appendChild(script2);
};

export const createTokenClient = (userId, cryptoKey, onSignedIn) => {
    return window.google.accounts.oauth2.initTokenClient({
        client_id: GCAL_CLIENT_ID,
        scope: SCOPES,
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                const token = { ...tokenResponse, expires_at: Date.now() + (tokenResponse.expires_in * 1000) };
                try {
                    const encryptedToken = await encryptData(token, cryptoKey);
                    await updateDoc(doc(db, 'users', userId), { gcal_token: encryptedToken });
                } catch (e) {}
                onSignedIn();
            }
        },
    });
};

export const fetchAndSaveGcalEvents = async (userId, calendarIds, cryptoKey, onError) => {
    try {
        const allEvents = [];
        const calendarsToFetch = ['primary', ...calendarIds];
        const now = new Date();
        const nextMonth = new Date();
        nextMonth.setDate(nextMonth.getDate() + 30);

        // 1. Get List of Calendars to map IDs to Names
        let calendarListItems = [];
        try {
            const calendarList = await window.gapi.client.calendar.calendarList.list();
            calendarListItems = calendarList.result.items;
        } catch(e) { console.warn("Calendar list fetch failed", e); }

        const finalFetchList = calendarListItems.length > 0 ? [...calendarListItems.map(c => c.id), ...calendarIds] : calendarsToFetch;
        const uniqueFetchList = [...new Set(finalFetchList)];

        // 2. Fetch Events
        for (const calId of uniqueFetchList) {
            try {
                const response = await window.gapi.client.calendar.events.list({
                    'calendarId': calId, 'timeMin': now.toISOString(), 'timeMax': nextMonth.toISOString(), 'showDeleted': false, 'singleEvents': true, 'maxResults': 20, 'orderBy': 'startTime'
                });
                
                if (response.result.items) {
                    const calMeta = calendarListItems.find(c => c.id === calId);
                    const calName = calMeta ? calMeta.summary : (calId === 'primary' ? 'My Calendar' : 'Calendar');
                    
                    const items = response.result.items.map(ev => ({
                        id: ev.id, 
                        summary: ev.summary || "Busy", 
                        startStr: ev.start.dateTime || ev.start.date, 
                        link: ev.htmlLink, 
                        calendarName: calName
                    }));
                    allEvents.push(...items);
                }
            } catch (e) {
                if (e.status === 401) onError("Session expired.");
            }
        }

        // 3. Save Encrypted to Firestore
        if (allEvents.length > 0) {
            await Promise.all(allEvents.map(async (ev) => {
                const encrypted = await encryptData(ev, cryptoKey);
                await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'calendar_events', ev.id), encrypted);
            }));
        }
    } catch (e) { console.error("Sync Error", e); }
};

export const checkStoredToken = async (userId, cryptoKey, onValidToken, onError) => {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists() && userDoc.data().gcal_token) {
            const token = await decryptData(userDoc.data().gcal_token, cryptoKey);
            if (token && token.access_token) {
                if (token.expires_at - Date.now() > 60000) {
                    window.gapi.client.setToken(token);
                    onValidToken();
                } else {
                    onError("Session expired.");
                    await updateDoc(doc(db, 'users', userId), { gcal_token: null });
                }
            }
        }
    } catch (e) { }
};

export const disconnectGoogleCalendar = async (userId) => {
    try { await updateDoc(doc(db, 'users', userId), { gcal_token: null }); } catch (e) {}
    const token = window.gapi?.client?.getToken();
    if (token !== null) {
        window.google.accounts.oauth2.revoke(token.access_token, () => {});
        window.gapi.client.setToken('');
    }
};