// src/apps/alerts/Alerts.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    ChevronLeft, Settings, Layers, RefreshCw, CloudOff, AlertCircle, Clock
} from 'lucide-react';

import { LoadingSpinner, Button } from '../../components/ui';
import { getRelativeTime } from '../../lib/dateUtils';
import { encryptData } from '../../lib/crypto';
import { updateDoc, setDoc, doc } from 'firebase/firestore';
import { db, appId } from '../../lib/firebase';

import {
    listenToAlertsData, listenToCalendarEvents,
    initializeGoogleClient, createTokenClient,
    fetchAndSaveGcalEvents, checkStoredToken, disconnectGoogleCalendar
} from '../../services/alerts';

import AlertCard from './components/AlertCard';
import AlertSettingsModal from './components/AlertSettingsModal';

const TABS = [
    { id: 'today', label: 'Today' },
    { id: 'tomorrow', label: 'Tomorrow' },
    { id: 'this_week', label: 'This Week' },
    { id: 'next_week', label: 'Next Week' },
    { id: 'upcoming', label: 'Upcoming' },
];

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

// FIXED: Accepting route and navigate, removed onLaunch
const AlertsApp = ({ user, cryptoKey, onExit, route, navigate }) => {
    const [loading, setLoading] = useState(true);
    const [autoSwitched, setAutoSwitched] = useState(false);

    // --- URL-Driven State ---
    // Extract tab from route.resource (e.g., #alerts/today), fallback to 'today'
    const activeTab = TABS.find(t => t.id === route.resource)?.id || 'today';

    // Extract modal state from query param (e.g., #alerts/today?modal=settings)
    const isSettingsOpen = route.query?.modal === 'settings';

    // Data
    const [items, setItems] = useState({ tasks: [], notes: [], checklists: [], counters: [], finance: [], markdown: [] });
    const [calendarEvents, setCalendarEvents] = useState([]);

    // Google Auth
    const [tokenClient, setTokenClient] = useState(null);
    const [gapiInited, setGapiInited] = useState(false);
    const [gcalSignedIn, setGcalSignedIn] = useState(false);
    const [gcalError, setGcalError] = useState(null);
    const [syncing, setSyncing] = useState(false);

    const [calendarIds, setCalendarIds] = useState(() => JSON.parse(localStorage.getItem('daypulse_calendar_ids') || '[]'));

    // Swipe
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);

    // --- Listeners ---
    useEffect(() => {
        if (!user || !cryptoKey) return;
        const unsubAlerts = listenToAlertsData(user.uid, cryptoKey, (type, data) => {
            setItems(prev => ({ ...prev, [type === 'finance_sub' || type === 'finance_bill' ? 'finance' : type]: data }));
            setLoading(false); // Basic Loading done
        });
        const unsubCal = listenToCalendarEvents(user.uid, cryptoKey, setCalendarEvents);
        return () => { unsubAlerts(); unsubCal(); };
    }, [user, cryptoKey]);

    // --- Google Calendar Init ---
    useEffect(() => {
        initializeGoogleClient(
            (type) => { if (type === 'gapi') setGapiInited(true); else setTokenClient(createTokenClient(user.uid, cryptoKey, () => setGcalSignedIn(true))); },
            (err) => setGcalError(err)
        );
    }, [user, cryptoKey]);

    // --- Check Token on Load ---
    useEffect(() => {
        if (gapiInited && user && cryptoKey) {
            checkStoredToken(user.uid, cryptoKey, () => setGcalSignedIn(true), (err) => setGcalError(err));
        }
    }, [gapiInited, user, cryptoKey]);

    // --- Sync Logic ---
    const handleSync = async () => {
        if (gcalSignedIn && gapiInited) {
            setSyncing(true);
            await fetchAndSaveGcalEvents(user.uid, calendarIds, cryptoKey, setGcalError);
            setSyncing(false);
        }
    };

    // Auto-Sync on load/change
    useEffect(() => { handleSync(); }, [gcalSignedIn, gapiInited, calendarIds]);

    // --- Handlers ---
    const handleConnect = () => { if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' }); };
    const handleDisconnect = async () => {
        setGcalSignedIn(false);
        await disconnectGoogleCalendar(user.uid);
    };

    const handleAddCalendar = (input) => {
        let calId = input.trim();
        if (!calId) return;
        if (calId.includes('src=')) calId = decodeURIComponent(calId.match(/src=([^&]+)/)[1]);
        if (!calendarIds.includes(calId)) {
            const newIds = [...calendarIds, calId];
            setCalendarIds(newIds);
            localStorage.setItem('daypulse_calendar_ids', JSON.stringify(newIds));
        }
    };

    const handleRemoveCalendar = (id) => {
        const newIds = calendarIds.filter(c => c !== id);
        setCalendarIds(newIds);
        localStorage.setItem('daypulse_calendar_ids', JSON.stringify(newIds));
    };

    // --- Action Handlers ---
    const handleComplete = async (item) => {
        if (item.source === 'task') {
            const encrypted = await encryptData({ ...item.original, completed: true }, cryptoKey);
            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', item.id), encrypted);
        } else if (item.source === 'reminder') {
            const encrypted = await encryptData({ ...item.original, isActive: false }, cryptoKey);
            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'reminders', item.id), encrypted);
        }
    };

    const handleSnooze = async (item) => {
        const newDate = new Date(item.date);
        newDate.setDate(newDate.getDate() + 1);

        let collectionName = 'tasks';
        let dateField = 'dueDate';

        if (item.source === 'note') collectionName = 'notes';
        if (item.source === 'markdown') collectionName = 'markdown';
        if (item.source === 'checklist') collectionName = 'checklists';
        if (item.source === 'counter') collectionName = 'counters';
        // FIXED: Route snooze logic for Reminders
        if (item.source === 'reminder') { collectionName = 'reminders'; dateField = 'datetime'; }
        if (item.source.startsWith('finance')) { collectionName = 'finance'; dateField = item.source === 'finance_sub' ? 'nextDate' : 'dueDate'; }

        const newData = { ...item.original, [dateField]: newDate.toISOString() };

        const payload = { ...newData };
        delete payload.id; delete payload.updatedAt; delete payload.createdAt;
        if (item.source === 'task') delete payload.completed;

        const encrypted = await encryptData(payload, cryptoKey);
        // Use setDoc with merge:true instead of updateDoc to avoid 'not-found' errors
        // when the document ID is stale or the doc was deleted.
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, collectionName, item.id), encrypted, { merge: true });
    };

    const handleNavigate = (item) => {
        if (item.source === 'calendar') {
            window.open(item.link, '_blank');
        } else {
            const appMap = {
                task: 'tasks',
                note: 'notes',
                markdown: 'markdown',
                checklist: 'checklist',
                counter: 'counter',
                finance_sub: 'finance',
                finance_bill: 'finance',
                reminder: 'reminders' // <--- Added mapping
            };

            const targetApp = appMap[item.source];

            if (targetApp === 'markdown' || targetApp === 'notes') {
                navigate(`#${targetApp}/doc/${item.id}`);
            } else if (targetApp === 'finance') {
                const targetTab = item.source === 'finance_sub' ? 'subscriptions' : 'expenses';
                navigate(`#finance/${targetTab}`);
            } else if (targetApp === 'checklist') {
                navigate(`#checklist/list/${item.id}`);
            } else if (targetApp === 'tasks') {
                navigate(`#tasks/inbox?edit=${item.id}`);
            } else if (targetApp === 'reminders') {
                // FIXED: Direct route to editor modal
                navigate(`#reminders/upcoming?edit=${item.id}`);
            } else {
                navigate(`#${targetApp}?openId=${item.id}`);
            }
        }
    };

    // --- Grouping & Logic ---
    const { grouped, focusItem, totalCounts } = useMemo(() => {
        const allItems = [...Object.values(items).flat(), ...calendarEvents];
        allItems.sort((a, b) => a.date - b.date);

        const groups = { today: [], tomorrow: [], this_week: [], next_week: [], upcoming: [] };
        const urgent = allItems.filter(i => new Date(i.date) < new Date() || categorizeItem(i.date) === 'today');
        const focus = urgent.length > 0 ? urgent[0] : allItems[0];

        allItems.forEach(item => {
            const cat = categorizeItem(item.date);
            if (groups[cat]) groups[cat].push(item);
        });

        const counts = Object.keys(groups).reduce((acc, key) => ({ ...acc, [key]: groups[key].length }), {});
        return { grouped: groups, focusItem: focus, totalCounts: counts };
    }, [items, calendarEvents]);

    // --- Auto Switch ---
    // FIXED: Trigger URL navigation instead of setting state
    useEffect(() => {
        if (!loading && !autoSwitched && (gcalSignedIn || calendarEvents.length > 0)) {
            if (totalCounts.today === 0 && totalCounts.tomorrow === 0 && totalCounts.this_week > 0) {
                navigate(`#alerts/this_week`);
                setAutoSwitched(true);
            }
        }
    }, [loading, totalCounts, autoSwitched, gcalSignedIn, calendarEvents, navigate]);

    // --- Swipe Handlers ---
    // FIXED: Update URL based on swipe direction
    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const currentIndex = TABS.findIndex(t => t.id === activeTab);
        if (distance > 50 && currentIndex < TABS.length - 1) {
            navigate(`#alerts/${TABS[currentIndex + 1].id}`);
        } else if (distance < -50 && currentIndex > 0) {
            navigate(`#alerts/${TABS[currentIndex - 1].id}`);
        }
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50">
            <header className="flex-none bg-white border-b border-gray-100 z-10">
                <div className="max-w-4xl mx-auto px-4 pt-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600"><ChevronLeft size={20} /></button>
                            <div><h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">DayPulse</h1></div>
                        </div>
                        <div className="flex items-center gap-2">
                            {syncing && <RefreshCw size={16} className="text-blue-500 animate-spin" />}
                            {gcalError && <CloudOff size={16} className="text-gray-400" />}
                            {/* FIXED: Open Settings Modal by appending the query string to the current URL */}
                            <button onClick={() => navigate(`#alerts/${activeTab}?modal=settings`)} className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"><Settings size={20} /></button>
                        </div>
                    </div>

                    {focusItem ? (
                        <div className="rounded-2xl p-4 text-white shadow-md cursor-pointer bg-gradient-to-r from-blue-500 to-blue-600" onClick={() => handleNavigate(focusItem)}>
                            <div className="flex items-center gap-2 text-white/80 text-xs font-bold uppercase tracking-widest mb-1">
                                {focusItem.date < new Date() ? <AlertCircle size={12} /> : <Clock size={12} />}
                                {focusItem.date < new Date() ? 'Overdue' : 'Next Up'}
                            </div>
                            <h2 className="text-lg font-bold truncate leading-tight text-white">{focusItem.title}</h2>
                            <div className="mt-2 flex items-center gap-2 text-xs font-medium text-white/90">
                                <span className="bg-black/20 px-2 py-0.5 rounded">{getRelativeTime(focusItem.date)}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-green-50 rounded-2xl p-4 text-center border border-green-100"><p className="text-green-800 font-bold text-sm">All caught up!</p></div>
                    )}

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 border-b border-gray-100">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => navigate(`#alerts/${tab.id}`)}
                                className={`flex-shrink-0 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors relative ${activeTab === tab.id ? 'text-[#4285f4] bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                            >
                                {tab.label} {totalCounts[tab.id] > 0 && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-[#4285f4] text-white' : 'bg-gray-200 text-gray-500'}`}>{totalCounts[tab.id]}</span>}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main
                className="flex-1 overflow-y-auto scroll-smooth p-4 bg-gray-50"
                onTouchStart={e => { setTouchStart(e.targetTouches[0].clientX); setTouchEnd(null); }}
                onTouchMove={e => setTouchEnd(e.targetTouches[0].clientX)}
                onTouchEnd={handleTouchEnd}
            >
                <div className="max-w-3xl mx-auto pb-20">
                    {loading ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : grouped[activeTab].length === 0 ? (
                        <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
                            <div className="bg-white p-4 rounded-full shadow-sm opacity-50"><Layers size={32} /></div>
                            <p>No alerts for {TABS.find(t => t.id === activeTab).label.toLowerCase()}.</p>
                            {activeTab === 'today' && <button onClick={handleSync} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><RefreshCw size={12} /> Refresh Calendar</button>}
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

            <AlertSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => navigate(`#alerts/${activeTab}`)} // FIXED: Strip the modal query param to close it
                gcalSignedIn={gcalSignedIn}
                gcalError={gcalError}
                calendarIds={calendarIds}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onAddCalendar={handleAddCalendar}
                onRemoveCalendar={handleRemoveCalendar}
            />
        </div>
    );
};

export default AlertsApp;