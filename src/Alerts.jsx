import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { 
  Bell, Calendar, CheckCircle, Clock, ChevronRight, AlertCircle, 
  MoreVertical, CalendarDays, RefreshCw, ArrowRight, X, ExternalLink, ChevronLeft,
  LogOut
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { LoadingSpinner } from './components'; 
import { decryptData } from './crypto';

// --- CONFIGURATION ---
// To enable REAL Google Calendar, fill these in from console.cloud.google.com
// and set ENABLE_REAL_GCAL = true;
const ENABLE_REAL_GCAL = false; 
const GCAL_API_KEY = "YOUR_API_KEY"; 
const GCAL_CLIENT_ID = "YOUR_CLIENT_ID";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/calendar.events.readonly";

// --- HELPERS ---

const formatDate = (date) => {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
};

const formatTime = (date) => {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
};

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
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  if (date < now) return 'overdue';
  if (date <= todayEnd) return 'today';
  if (date <= tomorrowEnd) return 'tomorrow';
  return 'upcoming';
};

// --- SUB-COMPONENTS ---

const AlertCard = ({ item, onComplete, onSnooze, onNavigate }) => {
  const isTask = item.source === 'task';
  
  return (
    <div className={`relative bg-white p-4 rounded-2xl border transition-all active:scale-[0.98] ${item.category === 'overdue' ? 'border-red-100 bg-red-50/30' : 'border-gray-100 shadow-sm'}`}>
      <div className="flex items-start gap-4">
        
        {/* Icon / Status */}
        <div className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isTask ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'}`}>
          {isTask ? <CheckCircle size={20} /> : <CalendarDays size={20} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0" onClick={() => onNavigate(item)}>
          <div className="flex justify-between items-start">
            <h3 className={`font-bold text-gray-800 truncate pr-2 ${item.category === 'overdue' ? 'text-red-600' : ''}`}>
              {item.title}
            </h3>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${item.category === 'overdue' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
              {getRelativeTime(item.date)}
            </span>
          </div>
          
          <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1">
            {isTask ? "Task • My Tasks" : item.location ? `Event • ${item.location}` : "Event • Google Calendar"}
            {!isTask && <ExternalLink size={10} />}
          </p>
        </div>
      </div>

      {/* Actions */}
      {isTask ? (
        <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
          <button 
            onClick={(e) => { e.stopPropagation(); onComplete(item); }}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-gray-50 text-green-600 hover:bg-green-50 transition-colors"
          >
            <CheckCircle size={14} /> Done
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onSnooze(item); }}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-gray-50 text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Clock size={14} /> Snooze
          </button>
        </div>
      ) : (
        // Calendar Actions (Link to GCal)
        <div className="mt-4 border-t border-gray-100 pt-3">
             <a href={item.link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-xs font-bold bg-gray-50 text-orange-600 hover:bg-orange-50 transition-colors">
                <ExternalLink size={14} /> Open Calendar
             </a>
        </div>
      )}
    </div>
  );
};

const SectionHeader = ({ title, count, color = "text-gray-400" }) => (
  <div className="flex items-center gap-2 px-2 py-3 mt-2">
    <h2 className={`text-xs font-bold uppercase tracking-widest ${color}`}>{title}</h2>
    <div className="h-px bg-gray-100 flex-1" />
    {count > 0 && <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{count}</span>}
  </div>
);

// --- MAIN COMPONENT ---

const AlertsApp = ({ user, cryptoKey, onExit }) => {
  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState([]);
  
  // Persist calendar state so it doesn't reset on tab switch
  const [calendarConnected, setCalendarConnected] = useState(() => {
      return localStorage.getItem('daypulse_gcal_connected') === 'true';
  });

  // --- Google Calendar Logic ---
  useEffect(() => {
    if (calendarConnected) {
        localStorage.setItem('daypulse_gcal_connected', 'true');
        // If ENABLE_REAL_GCAL is true, here you would initialize gapi.client
        // gapi.load('client:auth2', initClient);
    } else {
        localStorage.removeItem('daypulse_gcal_connected');
    }
  }, [calendarConnected]);

  // --- Fetch Data ---
  useEffect(() => {
    if (!user || !cryptoKey) return;

    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const tasks = await Promise.all(snapshot.docs.map(async d => {
        const raw = d.data();
        if (raw.completed) return null;

        const decrypted = await decryptData(raw, cryptoKey);
        if (!decrypted.dueDate) return null;

        return {
          id: d.id,
          source: 'task',
          title: decrypted.title || "Untitled",
          date: new Date(decrypted.dueDate),
          originalData: decrypted,
          raw: raw 
        };
      }));

      const activeTasks = tasks.filter(t => t !== null);
      
      // --- MOCK CALENDAR EVENTS (For Demo) ---
      // These are generated relative to "Now" so they always look good in the demo
      let calendarEvents = [];
      
      if (calendarConnected) {
          // If Real Integration is enabled, we would fetch here. 
          // For now, we generate robust mock data.
          const now = Date.now();
          calendarEvents = [
            { 
                id: 'c1', 
                source: 'calendar', 
                title: 'Team Sync', 
                date: new Date(now + 3600000), // 1 Hour from now
                location: 'Google Meet',
                link: 'https://calendar.google.com' 
            },
            { 
                id: 'c2', 
                source: 'calendar', 
                title: 'Project Review', 
                date: new Date(now + 86400000), // Tomorrow
                location: 'Conference Room A',
                link: 'https://calendar.google.com' 
            },
          ];
      }

      const combined = [...activeTasks, ...calendarEvents].sort((a, b) => a.date - b.date);
      setAllItems(combined);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, cryptoKey, calendarConnected]);

  // --- Actions ---

  const handleCompleteTask = async (item) => {
    try {
        const encrypted = await encryptData({ ...item.originalData, completed: true }, cryptoKey);
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', item.id), encrypted);
    } catch (e) {
        console.error("Failed to complete task", e);
    }
  };

  const handleSnoozeTask = async (item) => {
    try {
        const newDate = new Date(item.date);
        newDate.setDate(newDate.getDate() + 1);
        const newData = { ...item.originalData, dueDate: newDate.toISOString() };
        const encrypted = await encryptData(newData, cryptoKey);
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', item.id), encrypted);
    } catch (e) { console.error("Failed to snooze", e); }
  };

  const handleNavigate = (item) => {
      if (item.source === 'calendar') {
          window.open(item.link, '_blank');
      } else {
          window.location.hash = '#tasks';
      }
  };

  // --- Grouping ---
  const grouped = useMemo(() => {
    const groups = { overdue: [], today: [], tomorrow: [], upcoming: [] };
    allItems.forEach(item => {
        const cat = categorizeItem(item.date);
        if (groups[cat]) groups[cat].push({ ...item, category: cat });
    });
    return groups;
  }, [allItems]);

  const focusItem = grouped.overdue[0] || grouped.today[0];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      
      {/* Header */}
      <header className="flex-none bg-white border-b border-gray-100 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600">
                <ChevronLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    DayPulse <div className={`w-2 h-2 rounded-full ${focusItem ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                </h1>
                <p className="text-xs text-gray-400 font-medium">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            
            {/* Quick Actions Menu (Placeholder) */}
            <button className="p-2 text-gray-400 hover:text-blue-500 transition-colors">
                <MoreVertical size={20} />
            </button>
          </div>

          {/* Focus Card */}
          {focusItem ? (
             <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-5 text-white shadow-lg shadow-blue-200 transform transition-all hover:scale-[1.01] cursor-pointer" onClick={() => handleNavigate(focusItem)}>
                <div className="flex items-center gap-2 text-blue-100 text-xs font-bold uppercase tracking-widest mb-2">
                    {focusItem.category === 'overdue' ? <AlertCircle size={12} className="text-red-300" /> : <Clock size={12} />}
                    {focusItem.category === 'overdue' ? 'Needs Attention' : 'Up Next'}
                </div>
                <h2 className="text-2xl font-bold truncate leading-tight">{focusItem.title}</h2>
                <div className="mt-4 flex items-center gap-3">
                    <span className="bg-white/20 px-3 py-1 rounded-lg text-sm font-medium backdrop-blur-sm">
                        {getRelativeTime(focusItem.date)}
                    </span>
                    {focusItem.source === 'task' && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleCompleteTask(focusItem); }}
                            className="bg-white text-blue-600 px-4 py-1 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-50 transition-colors ml-auto flex items-center gap-1"
                        >
                            <CheckCircle size={14} /> Complete
                        </button>
                    )}
                </div>
             </div>
          ) : (
             <div className="bg-green-50 rounded-2xl p-6 text-center border border-green-100">
                 <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-green-500 mx-auto shadow-sm mb-2">
                     <CheckCircle size={24} />
                 </div>
                 <h2 className="text-green-800 font-bold">All caught up!</h2>
                 <p className="text-green-600 text-sm">No urgent tasks.</p>
             </div>
          )}
        </div>
      </header>

      {/* Main Timeline */}
      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-3xl mx-auto pb-32">
          
          {loading && <div className="flex justify-center py-10"><LoadingSpinner /></div>}

          {/* Calendar Integration Banner */}
          {!loading && (
              calendarConnected ? (
                <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-lg text-blue-500"><CheckCircle size={18} /></div>
                        <div className="text-xs">
                            <p className="font-bold text-blue-800">Google Calendar Connected</p>
                            <p className="text-blue-600 opacity-80">Events synced</p>
                        </div>
                    </div>
                    <button onClick={() => setCalendarConnected(false)} className="text-xs font-bold text-blue-400 hover:text-red-500 p-2">
                        <LogOut size={16} />
                    </button>
                </div>
              ) : (
                <div className="mb-6 bg-white border border-gray-100 rounded-xl p-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="bg-orange-50 p-2 rounded-lg text-orange-500"><CalendarDays size={18} /></div>
                        <div className="text-xs">
                            <p className="font-bold text-gray-700">Connect Google Calendar</p>
                            <p className="text-gray-400">Sync meetings to your timeline</p>
                        </div>
                    </div>
                    <button onClick={() => setCalendarConnected(true)} className="text-xs font-bold bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors">
                        Connect
                    </button>
                </div>
              )
          )}

          {/* Timeline Sections */}
          {grouped.overdue.length > 0 && (
            <div className="mb-6">
                <SectionHeader title="Overdue" count={grouped.overdue.length} color="text-red-400" />
                <div className="flex flex-col gap-3">
                    {grouped.overdue.map(item => (
                        <AlertCard key={item.id} item={item} onComplete={handleCompleteTask} onSnooze={handleSnoozeTask} onNavigate={handleNavigate} />
                    ))}
                </div>
            </div>
          )}

          {grouped.today.length > 0 && (
            <div className="mb-6">
                <SectionHeader title="Today" count={grouped.today.length} color="text-blue-400" />
                <div className="flex flex-col gap-3">
                    {grouped.today.map(item => (
                        <AlertCard key={item.id} item={item} onComplete={handleCompleteTask} onSnooze={handleSnoozeTask} onNavigate={handleNavigate} />
                    ))}
                </div>
            </div>
          )}

          {grouped.tomorrow.length > 0 && (
            <div className="mb-6">
                <SectionHeader title="Tomorrow" count={grouped.tomorrow.length} />
                <div className="flex flex-col gap-3">
                    {grouped.tomorrow.map(item => (
                        <AlertCard key={item.id} item={item} onComplete={handleCompleteTask} onSnooze={handleSnoozeTask} onNavigate={handleNavigate} />
                    ))}
                </div>
            </div>
          )}

          {grouped.upcoming.length > 0 && (
            <div className="mb-6">
                <SectionHeader title="Upcoming" count={grouped.upcoming.length} />
                <div className="flex flex-col gap-3">
                    {grouped.upcoming.map(item => (
                        <AlertCard key={item.id} item={item} onComplete={handleCompleteTask} onSnooze={handleSnoozeTask} onNavigate={handleNavigate} />
                    ))}
                </div>
            </div>
          )}

        </div>
      </main>

    </div>
  );
};

export default AlertsApp;