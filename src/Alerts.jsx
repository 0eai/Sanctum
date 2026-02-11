import React, { useState, useEffect, useMemo } from 'react';
import {
    collection, query, onSnapshot, updateDoc, doc, getDoc, setDoc
} from 'firebase/firestore';
import {
    Bell, CheckCircle, Clock, CalendarDays, ExternalLink, ChevronLeft,
    FileText, CheckSquare, TrendingUp, AlertCircle,
    Layers, ArrowRight, Settings, Plus, X, Globe, AlertTriangle, RefreshCw,
    CreditCard, Repeat, CloudOff
} from 'lucide-react';

import { db, appId } from './firebase';
import { LoadingSpinner, Modal, Input, Button } from './components';
import { decryptData, encryptData } from './crypto';

// --- CONFIGURATION ---
const GCAL_API_KEY = "AIzaSyBhWNmLtTvQs44icwi_VzkV-3jKTh77fEo";
const GCAL_CLIENT_ID = "996648471971-i52dl8kde2942aa0atcs7iat7t0cdepv.apps.googleusercontent.com";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.readonly";

// --- HELPERS ---
const formatDate = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
const formatTime = (date) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);

const getRelativeTime = (date) => {
    const now = new Date();
    const diffMs = date - now;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < 0) return "Overdue";
    if (diffHrs < 1) return "In < 1 hr";
    if (diffHrs < 24 && now.getDate() === date.getDate()) return formatTime(date);
    if (diffDays === 1) return "Tomorrow";
    return formatDate(date);
};

const categorizeItem = (date) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const itemDate = new Date(date);
    itemDate.setHours(0, 0, 0, 0);
    const diffTime = itemDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (date < new Date()) return 'today';
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';

    const dayOfWeek = now.getDay();
    const daysUntilEndOfWeek = 6 - dayOfWeek;
    if (diffDays <= daysUntilEndOfWeek) return 'this_week';

    const daysUntilEndOfNextWeek = daysUntilEndOfWeek + 7;
    if (diffDays <= daysUntilEndOfNextWeek) return 'next_week';

    return 'upcoming';
};

const getSourceIcon = (source) => {
    switch (source) {
        case 'task': return <CheckCircle size={20} />;
        case 'note': return <FileText size={20} />;
        case 'checklist': return <CheckSquare size={20} />;
        case 'counter': return <TrendingUp size={20} />;
        case 'calendar': return <CalendarDays size={20} />;
        case 'finance_sub': return <Repeat size={20} />;
        case 'finance_bill': return <CreditCard size={20} />;
        default: return <Bell size={20} />;
    }
};

const getSourceColor = (source) => {
    if (source.startsWith('finance')) return 'bg-emerald-50 text-emerald-600';
    switch (source) {
        case 'task': return 'bg-blue-50 text-blue-500';
        case 'note': return 'bg-yellow-50 text-yellow-600';
        case 'checklist': return 'bg-green-50 text-green-600';
        case 'counter': return 'bg-purple-50 text-purple-600';
        case 'calendar': return 'bg-orange-50 text-orange-500';
        default: return 'bg-gray-50 text-gray-500';
    }
};

const getSourceLabel = (source) => {
    switch (source) {
        case 'task': return 'My Tasks';
        case 'note': return 'Notes';
        case 'checklist': return 'Checklists';
        case 'counter': return 'Counters';
        case 'calendar': return 'Google Calendar';
        case 'finance_sub': return 'Subscriptions';
        case 'finance_bill': return 'Bills & Debts';
        default: return 'System';
    }
};

const TABS = [
    { id: 'today', label: 'Today' },
    { id: 'tomorrow', label: 'Tomorrow' },
    { id: 'this_week', label: 'This Week' },
    { id: 'next_week', label: 'Next Week' },
    { id: 'upcoming', label: 'Upcoming' },
];

const AlertCard = ({ item, onAction, onSnooze, onNavigate }) => {
    const isActionable = ['task'].includes(item.source);
    const isInternal = item.source !== 'calendar';
    const isOverdue = new Date(item.date) < new Date();

    return (
        <div className={`relative bg-white p-4 rounded-2xl border transition-all active:scale-[0.98] cursor-pointer ${isOverdue ? 'border-red-100 bg-red-50/20' : 'border-gray-100 shadow-sm'}`} onClick={() => onNavigate(item)}>
            <div className="flex items-start gap-4">
                <div className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getSourceColor(item.source)}`}>
                    {getSourceIcon(item.source)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h3 className={`font-bold text-gray-800 truncate pr-2 ${isOverdue ? 'text-red-600' : ''}`}>
                            {item.title}
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                            {getRelativeTime(item.date)}
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1">
                        {getSourceLabel(item.source)}
                        {!isInternal && <ExternalLink size={10} />}
                    </p>
                </div>
            </div>
            <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
                {isActionable ? (
                    <button onClick={(e) => { e.stopPropagation(); onAction(item); }} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-gray-50 text-green-600 hover:bg-green-50 transition-colors">
                        <CheckCircle size={14} /> Done
                    </button>
                ) : (
                    <button onClick={(e) => { e.stopPropagation(); onNavigate(item); }} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors">
                        {item.source === 'calendar' ? <ExternalLink size={14} /> : <ArrowRight size={14} />} Open
                    </button>
                )}
                {isInternal && (
                    <button onClick={(e) => { e.stopPropagation(); onSnooze(item); }} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-gray-50 text-blue-600 hover:bg-blue-50 transition-colors">
                        <Clock size={14} /> Snooze
                    </button>
                )}
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const AlertsApp = ({ user, cryptoKey, onExit, onLaunch }) => {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('today');
    const [autoSwitched, setAutoSwitched] = useState(false);

    // Data States
    const [tasks, setTasks] = useState([]);
    const [notes, setNotes] = useState([]);
    const [checklists, setChecklists] = useState([]);
    const [counters, setCounters] = useState([]);
    const [financeItems, setFinanceItems] = useState([]);
    const [calendarEvents, setCalendarEvents] = useState([]);

    // Google Auth States
    const [tokenClient, setTokenClient] = useState(null);
    const [gapiInited, setGapiInited] = useState(false);
    const [gcalSignedIn, setGcalSignedIn] = useState(false);
    const [gcalError, setGcalError] = useState(null);
    const [syncing, setSyncing] = useState(false);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [calendarIds, setCalendarIds] = useState(() => JSON.parse(localStorage.getItem('daypulse_calendar_ids') || '[]'));

    // Swipe State
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const MIN_SWIPE_DISTANCE = 50;

    // --- Data Fetching (Firebase Listeners) ---
    useEffect(() => {
        if (!user || !cryptoKey) return;

        // 1. Standard Tools Listeners
        const standardFetchers = [
            { col: 'tasks', type: 'task', setter: setTasks },
            { col: 'notes', type: 'note', setter: setNotes },
            { col: 'checklists', type: 'checklist', setter: setChecklists },
            { col: 'counters', type: 'counter', setter: setCounters }
        ];

        const unsubs = standardFetchers.map(({ col, type, setter }) => {
            const q = query(collection(db, 'artifacts', appId, 'users', user.uid, col));
            return onSnapshot(q, async (snap) => {
                const data = await Promise.all(snap.docs.map(async d => {
                    const raw = d.data();
                    if (raw.completed) return null;
                    const dec = await decryptData(raw, cryptoKey);
                    if (!dec.dueDate) return null;
                    return { id: d.id, source: type, title: dec.title || "Untitled", date: new Date(dec.dueDate), original: dec };
                }));
                setter(data.filter(i => i));
            });
        });

        // 2. Calendar Listener (Persisted Data)
        // We now read from 'calendar_events' collection instead of local API state
        const qCal = query(collection(db, 'artifacts', appId, 'users', user.uid, 'calendar_events'));
        const unsubCal = onSnapshot(qCal, async (snap) => {
            const data = await Promise.all(snap.docs.map(async d => {
                const raw = d.data();
                const dec = await decryptData(raw, cryptoKey);
                return {
                    id: d.id,
                    source: 'calendar',
                    title: dec.summary || "Busy",
                    date: new Date(dec.startStr), // Use string to recreate Date
                    link: dec.link,
                    calendarName: dec.calendarName,
                    original: dec
                };
            }));
            // Filter out old events (e.g. older than yesterday) to keep state clean
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            setCalendarEvents(data.filter(i => i.date > yesterday));
        });

        // 3. Finance Fetcher
        const qFinance = query(collection(db, 'artifacts', appId, 'users', user.uid, 'finance'));
        const unsubFinance = onSnapshot(qFinance, async (snap) => {
            const data = await Promise.all(snap.docs.map(async d => {
                const raw = d.data();
                const dec = await decryptData(raw, cryptoKey);
                let type = null;
                let dateStr = null;
                let title = null;

                if (dec.type === 'subscriptions') {
                    type = 'finance_sub';
                    dateStr = dec.nextDate;
                    title = `${dec.name} Subscription`;
                } else if (dec.type === 'debts') {
                    type = 'finance_bill';
                    dateStr = dec.dueDate;
                    title = dec.subType === 'lent' ? `${dec.person} owes you` : `Pay ${dec.person}`;
                }

                if (!type || !dateStr) return null;

                return {
                    id: d.id,
                    source: type,
                    title: title,
                    date: new Date(dateStr),
                    original: dec
                };
            }));
            setFinanceItems(data.filter(i => i));
            setLoading(false);
        });

        return () => {
            unsubs.forEach(u => u());
            unsubCal();
            unsubFinance();
        };
    }, [user, cryptoKey]);

    // --- GOOGLE CALENDAR SYNC LOGIC ---
    useEffect(() => {
        const loadGapi = () => {
            const script = document.createElement('script');
            script.src = "https://apis.google.com/js/api.js";
            script.onload = () => window.gapi.load('client', initGapiClient);
            document.body.appendChild(script);
        };
        const loadGis = () => {
            const script = document.createElement('script');
            script.src = "https://accounts.google.com/gsi/client";
            script.onload = initTokenClient;
            document.body.appendChild(script);
        };
        loadGapi();
        loadGis();
    }, []);

    const initGapiClient = () => {
        window.gapi.client.init({ apiKey: GCAL_API_KEY, discoveryDocs: DISCOVERY_DOCS })
            .then(() => setGapiInited(true))
            .catch(err => setGcalError("API Init Failed"));
    };

    const initTokenClient = () => {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: GCAL_CLIENT_ID,
            scope: SCOPES,
            callback: async (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    const token = { ...tokenResponse, expires_at: Date.now() + (tokenResponse.expires_in * 1000) };
                    try {
                        const encryptedToken = await encryptData(token, cryptoKey);
                        await updateDoc(doc(db, 'users', user.uid), { gcal_token: encryptedToken });
                    } catch (e) { }
                    setGcalSignedIn(true);
                    if (gapiInited) {
                        window.gapi.client.setToken(tokenResponse);
                        fetchAndSaveGcalEvents();
                    }
                }
            },
        });
        setTokenClient(client);
    };

    const handleConnect = () => { if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' }); };

    const handleDisconnect = async () => {
        setGcalSignedIn(false);
        // We do NOT clear setCalendarEvents here, so the persisted data remains visible
        try { await updateDoc(doc(db, 'users', user.uid), { gcal_token: null }); } catch (e) { }
        const token = window.gapi?.client?.getToken();
        if (token !== null) {
            window.google.accounts.oauth2.revoke(token.access_token, () => { });
            window.gapi.client.setToken('');
        }
    };

    // UPDATED: Fetches from Google AND Saves to Firebase
    const fetchAndSaveGcalEvents = async () => {
        if (!gapiInited) return;
        setSyncing(true);
        const allEvents = [];
        const calendarsToFetch = ['primary', ...calendarIds];
        const now = new Date();
        const nextMonth = new Date();
        nextMonth.setDate(nextMonth.getDate() + 30); // 30 Day Window

        try {
            let calendarListItems = [];
            try {
                const calendarList = await window.gapi.client.calendar.calendarList.list();
                calendarListItems = calendarList.result.items;
            } catch (e) { console.warn("Could not fetch calendar list (scopes?)", e); }

            const finalFetchList = calendarListItems.length > 0 ? [...calendarListItems.map(c => c.id), ...calendarIds] : calendarsToFetch;
            const uniqueFetchList = [...new Set(finalFetchList)];

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
                            startStr: ev.start.dateTime || ev.start.date, // Store as string
                            link: ev.htmlLink,
                            calendarName: calName
                        }));
                        allEvents.push(...items);
                    }
                } catch (e) {
                    if (e.status === 401) {
                        setGcalSignedIn(false);
                        setGcalError("Session expired. Reconnect to refresh.");
                    }
                }
            }

            // Save to Firestore (encrypted)
            if (allEvents.length > 0) {
                await Promise.all(allEvents.map(async (ev) => {
                    const encrypted = await encryptData(ev, cryptoKey);
                    // Use ev.id as doc ID to prevent duplicates
                    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'calendar_events', ev.id), encrypted);
                }));
            }
            setGcalError(null);
        } catch (e) { console.error("Fetch Events Error", e); }
        setSyncing(false);
    };

    useEffect(() => {
        const loadTokenFromDb = async () => {
            if (!gapiInited || !user || !cryptoKey) return;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists() && userDoc.data().gcal_token) {
                    const encryptedToken = userDoc.data().gcal_token;
                    const token = await decryptData(encryptedToken, cryptoKey);
                    if (token && token.access_token) {
                        const timeLeft = token.expires_at - Date.now();
                        if (timeLeft > 60000) {
                            window.gapi.client.setToken(token);
                            setGcalSignedIn(true);
                        } else {
                            setGcalError("Session expired. Reconnect to refresh.");
                            await updateDoc(doc(db, 'users', user.uid), { gcal_token: null });
                        }
                    }
                }
            } catch (e) { }
        };
        loadTokenFromDb();
    }, [gapiInited, user, cryptoKey]);

    useEffect(() => {
        if (gcalSignedIn && gapiInited) fetchAndSaveGcalEvents();
    }, [gcalSignedIn, gapiInited, calendarIds]);

    // --- Handlers ---

    const handleTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > MIN_SWIPE_DISTANCE;
        const isRightSwipe = distance < -MIN_SWIPE_DISTANCE;

        if (isLeftSwipe || isRightSwipe) {
            const currentIndex = TABS.findIndex(t => t.id === activeTab);
            let nextIndex = currentIndex;

            if (isLeftSwipe && currentIndex < TABS.length - 1) nextIndex = currentIndex + 1;
            else if (isRightSwipe && currentIndex > 0) nextIndex = currentIndex - 1;

            if (nextIndex !== currentIndex) setActiveTab(TABS[nextIndex].id);
        }
    };

    const handleAddCalendar = (e) => {
        e.preventDefault();
        let input = e.target.calUrl.value.trim();
        if (!input) return;
        let calId = input;
        if (input.includes('src=')) {
            const match = input.match(/src=([^&]+)/);
            if (match) calId = decodeURIComponent(match[1]);
        }
        if (!calendarIds.includes(calId)) {
            const newIds = [...calendarIds, calId];
            setCalendarIds(newIds);
            localStorage.setItem('daypulse_calendar_ids', JSON.stringify(newIds));
        }
        e.target.reset();
    };

    const removeCalendar = (id) => {
        const newIds = calendarIds.filter(c => c !== id);
        setCalendarIds(newIds);
        localStorage.setItem('daypulse_calendar_ids', JSON.stringify(newIds));
    };

    const handleComplete = async (item) => {
        if (item.source === 'task') {
            const encrypted = await encryptData({ ...item.original, completed: true }, cryptoKey);
            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', item.id), encrypted);
        }
    };

    const handleSnooze = async (item) => {
        try {
            const newDate = new Date(item.date);
            newDate.setDate(newDate.getDate() + 1);

            let collectionName = 'tasks';
            let dateField = 'dueDate';

            if (item.source === 'note') collectionName = 'notes';
            if (item.source === 'checklist') collectionName = 'checklists';
            if (item.source === 'counter') collectionName = 'counters';

            // Fix for Finance Items
            if (item.source === 'finance_sub') {
                collectionName = 'finance';
                dateField = 'nextDate';
            }
            if (item.source === 'finance_bill') {
                collectionName = 'finance';
                dateField = 'dueDate';
            }

            const newData = { ...item.original, [dateField]: newDate.toISOString() };

            const payload = { ...newData };
            delete payload.id; delete payload.updatedAt; delete payload.createdAt;
            if (item.source === 'task') delete payload.completed;

            const encrypted = await encryptData(payload, cryptoKey);

            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, collectionName, item.id), encrypted);
        } catch (e) { console.error("Snooze failed", e); }
    };

    const handleNavigate = (item) => {
        if (item.source === 'calendar') {
            window.open(item.link, '_blank');
        } else {
            const appMap = {
                task: 'tasks', note: 'notes', checklist: 'checklist', counter: 'counter',
                finance_sub: 'finance', finance_bill: 'finance'
            };
            const targetApp = appMap[item.source];
            if (targetApp && onLaunch) onLaunch(targetApp);
        }
    };

    // --- Grouping ---
    const { grouped, focusItem, totalCounts } = useMemo(() => {
        const combined = [...tasks, ...notes, ...checklists, ...counters, ...calendarEvents, ...financeItems].sort((a, b) => a.date - b.date);
        const groups = { today: [], tomorrow: [], this_week: [], next_week: [], upcoming: [] };
        const urgentItems = combined.filter(i => new Date(i.date) < new Date() || categorizeItem(i.date) === 'today');
        const focus = urgentItems.length > 0 ? urgentItems[0] : combined[0];
        combined.forEach(item => {
            const cat = categorizeItem(item.date);
            if (groups[cat]) groups[cat].push({ ...item, category: cat });
        });
        const counts = { today: groups.today.length, tomorrow: groups.tomorrow.length, this_week: groups.this_week.length, next_week: groups.next_week.length, upcoming: groups.upcoming.length };
        return { grouped: groups, focusItem: focus, totalCounts: counts };
    }, [tasks, notes, checklists, counters, calendarEvents, financeItems]);

    // --- Auto-Switch ---
    useEffect(() => {
        if (!loading && !autoSwitched && (gcalSignedIn || calendarEvents.length > 0)) {
            if (totalCounts.today === 0 && totalCounts.tomorrow === 0 && totalCounts.this_week > 0) {
                setActiveTab('this_week');
                setAutoSwitched(true);
            }
        }
    }, [loading, totalCounts, autoSwitched, gcalSignedIn, calendarEvents]);

    return (
        <div className="flex flex-col h-screen bg-gray-50">

            <header className="flex-none bg-white border-b border-gray-100 z-10">
                <div className="max-w-3xl mx-auto px-4 pt-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600"><ChevronLeft size={20} /></button>
                            <div><h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">DayPulse <div className={`w-2 h-2 rounded-full ${focusItem ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} /></h1></div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Sync Indicator */}
                            {syncing && <RefreshCw size={16} className="text-blue-500 animate-spin" />}
                            {gcalError && <CloudOff size={16} className="text-gray-400" />}
                            <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"><Settings size={20} /></button>
                        </div>
                    </div>

                    {focusItem ? (
                        <div className={`rounded-2xl p-4 text-white shadow-md transform transition-all active:scale-[0.99] cursor-pointer ${getSourceColor(focusItem.source).replace('text-', 'from-').replace('50', '500').replace('500', '600')} bg-gradient-to-r to-gray-400`} onClick={() => handleNavigate(focusItem)}>
                            <div className="flex items-center gap-2 text-white/80 text-xs font-bold uppercase tracking-widest mb-1">{focusItem.category === 'overdue' ? <AlertCircle size={12} /> : <Clock size={12} />} {focusItem.category === 'overdue' ? 'Overdue' : 'Next Up'}</div>
                            <h2 className="text-lg font-bold truncate leading-tight text-white">{focusItem.title}</h2>
                            <div className="mt-2 flex items-center gap-2 text-xs font-medium text-white/90"><span className="bg-black/20 px-2 py-0.5 rounded">{getRelativeTime(focusItem.date)}</span><span>• {getSourceLabel(focusItem.source)}</span></div>
                        </div>
                    ) : (
                        <div className="bg-green-50 rounded-2xl p-4 text-center border border-green-100"><p className="text-green-800 font-bold text-sm">All caught up!</p></div>
                    )}

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 border-b border-gray-100">
                        {TABS.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-shrink-0 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors relative ${activeTab === tab.id ? 'text-[#4285f4] bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
                                {tab.label} {totalCounts[tab.id] > 0 && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-[#4285f4] text-white' : 'bg-gray-200 text-gray-500'}`}>{totalCounts[tab.id]}</span>}
                                {tab.id === 'today' && grouped.today.some(i => new Date(i.date) < new Date()) && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white" />}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main
                className="flex-1 overflow-y-auto scroll-smooth p-4 bg-gray-50"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="max-w-3xl mx-auto pb-20">
                    {loading ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : grouped[activeTab].length === 0 ? (
                        <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
                            <div className="bg-white p-4 rounded-full shadow-sm opacity-50"><Layers size={32} /></div>
                            <p>No alerts for {TABS.find(t => t.id === activeTab).label.toLowerCase()}.</p>
                            {activeTab === 'today' && <button onClick={fetchAndSaveGcalEvents} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><RefreshCw size={12} /> Refresh Calendar</button>}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {grouped[activeTab].map(item => (
                                <AlertCard key={`${item.source}-${item.id}`} item={item} onAction={handleComplete} onSnooze={handleSnooze} onNavigate={handleNavigate} />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Alert Settings">
                <div className="flex flex-col gap-6">
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                        <div className="flex items-center gap-2 mb-2 text-orange-700 font-bold"><CalendarDays size={18} /> Google Calendar</div>
                        {gcalError && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 mb-2"><AlertTriangle size={12} /> {gcalError}</div>}
                        {!gcalSignedIn ? (
                            <div className="flex flex-col gap-2">
                                <p className="text-xs text-orange-600">Connect to sync events.</p>
                                <Button onClick={handleConnect} className="bg-orange-500 hover:bg-orange-600 text-white w-full">Connect Google Calendar</Button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-orange-200"><span className="text-xs font-bold text-orange-800 flex items-center gap-2"><CheckCircle size={12} /> Connected</span><button onClick={handleDisconnect} className="text-xs text-orange-400 hover:text-red-500 underline">Disconnect</button></div>
                                <div className="border-t border-orange-200 pt-3">
                                    <p className="text-xs font-bold text-orange-800 mb-2">Add Public Calendars</p>
                                    <form onSubmit={handleAddCalendar} className="flex gap-2 mb-2">
                                        <Input name="calUrl" placeholder="Calendar ID or Embed URL" className="bg-white text-xs h-9" />
                                        <Button type="submit" className="bg-orange-500 hover:bg-orange-600 h-9 w-9 p-0 flex items-center justify-center"><Plus size={16} /></Button>
                                    </form>
                                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                                        {calendarIds.map(id => (
                                            <div key={id} className="flex items-center justify-between bg-white p-2 rounded border border-orange-100 text-[10px] text-orange-700">
                                                <span className="truncate flex-1 pr-2"><Globe size={10} className="inline mr-1" /> {id}</span>
                                                <button onClick={() => removeCalendar(id)} className="text-orange-300 hover:text-red-500"><X size={12} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AlertsApp;