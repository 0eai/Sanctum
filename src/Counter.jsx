import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  updateDoc, 
  increment, 
  getDocs 
} from 'firebase/firestore';
import { 
  Plus, Calendar, Clock, Trash2, ChevronLeft, ChevronRight, X, 
  TrendingUp, BarChart2, AlertCircle, MapPin, Pencil, Play, 
  Square, Download, Upload, Tag, StickyNote, Settings, Layers,
  Bell, RotateCcw, Edit2 
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Button, Input, Modal, LoadingSpinner } from './components';
import { encryptData, decryptData } from './crypto';

// --- Local Components ---
const SimpleBarChart = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end h-32 gap-2 mt-4 px-1 w-full overflow-x-auto pb-2">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center h-full justify-end group flex-shrink-0 min-w-[36px]">
          <div 
            className="w-6 bg-blue-200 rounded-t-sm transition-all duration-500 relative hover:bg-[#4285f4]"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? '4px' : '0' }}
          >
             <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
               {d.value}
             </div>
          </div>
          <span className="text-[9px] text-gray-400 mt-1 text-center block whitespace-nowrap px-1">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// --- Formatters & Helpers ---
const getCounterIcon = (mode) => (mode === 'range' ? <Clock size={20} /> : <Calendar size={20} />);

const toLocalISOString = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
};

const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric'
  }).format(d);
};

const formatTime = (date) => {
  if (!date || !(date instanceof Date)) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit'
    }).format(date);
  } catch (e) { return ''; }
};

const formatDuration = (ms) => {
  if (!ms || isNaN(ms)) return '0m';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  return `${minutes}m`;
};

// New Helper: Calculate Next Date
const getNextDate = (currentDateStr, frequency) => {
  if (!currentDateStr) return null;
  const date = new Date(currentDateStr);
  switch(frequency) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
    default: return null;
  }
  return date.toISOString();
};

// --- Main Application Component ---
export default function CounterApp({ user, cryptoKey, onExit }) {
  const [view, setView] = useState('list'); 
  const [activeTab, setActiveTab] = useState('history'); 
  const [selectedCounter, setSelectedCounter] = useState(null);
  
  const [counters, setCounters] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [calendarDate, setCalendarDate] = useState(new Date());
  const [entryLocation, setEntryLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // Modals
  const [isCounterFormOpen, setIsCounterFormOpen] = useState(false); // Unified Create/Edit Modal
  const [editingCounterData, setEditingCounterData] = useState(null); // Data for editing

  // Controlled Inputs for Form Clearing
  const [formDueDate, setFormDueDate] = useState('');
  const [formRepeat, setFormRepeat] = useState('none');

  const [isAddEntryModalOpen, setIsAddEntryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [viewingEntry, setViewingEntry] = useState(null); 
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);

  const fileInputRef = useRef(null);

  // --- HISTORY API ---
  useEffect(() => {
    const handlePopState = (event) => {
        if (event.state?.appId === 'counter') {
            if (event.state.view === 'detail' && event.state.counterId) {
                const counter = counters.find(c => c.id === event.state.counterId);
                if (counter) {
                    setSelectedCounter(counter);
                    setView('detail');
                } else {
                    setView('list');
                    setSelectedCounter(null);
                }
            } else {
                setView('list');
                setSelectedCounter(null);
            }
        }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [counters]);

  const handleOpenCounter = (counter) => {
    window.history.pushState({ appId: 'counter', view: 'detail', counterId: counter.id }, '', '#counter');
    setSelectedCounter(counter);
    setView('detail');
    setActiveTab('history');
  };

  const handleBack = () => {
    if (view === 'detail') {
        window.history.back();
    } else {
        onExit();
    }
  };

  // --- Derived Stats ---
  const { stats, dailyCounts, activeEntry, chartData } = useMemo(() => {
    if (!entries.length || !selectedCounter) return { stats: null, dailyCounts: {}, activeEntry: null, chartData: [] };
    
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const last24Hours = entries.filter(e => e.timestamp >= oneDayAgo).length;
    const last7Days = entries.filter(e => e.timestamp >= oneWeekAgo).length;
    const last30Days = entries.filter(e => e.timestamp >= oneMonthAgo).length;

    let totalDurationMs = 0;
    let todayC = 0;
    let monthC = 0;
    let yearC = 0;
    const dCounts = {};
    let active = null;

    entries.forEach(e => {
      if (!e.endTimestamp && selectedCounter.mode === 'range') {
        active = e;
      }
      if (e.timestamp) {
        if (selectedCounter.mode === 'range' && e.endTimestamp) {
          totalDurationMs += (e.endTimestamp - e.timestamp);
        }
        const dateKey = new Date(e.timestamp.getFullYear(), e.timestamp.getMonth(), e.timestamp.getDate()).toLocaleDateString('en-CA');
        dCounts[dateKey] = (dCounts[dateKey] || 0) + 1;

        const isSameDay = e.timestamp.getDate() === now.getDate() && e.timestamp.getMonth() === now.getMonth() && e.timestamp.getFullYear() === now.getFullYear();
        const isSameMonth = e.timestamp.getMonth() === now.getMonth() && e.timestamp.getFullYear() === now.getFullYear();
        const isSameYear = e.timestamp.getFullYear() === now.getFullYear();

        if (isSameDay) todayC++;
        if (isSameMonth) monthC++;
        if (isSameYear) yearC++;
      }
    });

    const statsData = {
      total: entries.length,
      last24Hours,
      last7Days,
      last30Days,
      today: todayC,
      thisMonth: monthC,
      thisYear: yearC,
      totalDuration: totalDurationMs,
      avgDuration: entries.length ? totalDurationMs / entries.length : 0
    };

    const chart = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      chart.push({
        label: d.getDate() === now.getDate() ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        value: dCounts[key] || 0
      });
    }
    return { stats: statsData, dailyCounts: dCounts, activeEntry: active, chartData: chart };
  }, [entries, selectedCounter]);

  const { monthlyTotal, yearlyTotal } = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    let mTotal = 0, yTotal = 0;
    entries.forEach(e => {
      if (e.timestamp && e.timestamp.getFullYear() === year) {
        yTotal++;
        if (e.timestamp.getMonth() === month) mTotal++;
      }
    });
    return { monthlyTotal: mTotal, yearlyTotal: yTotal };
  }, [entries, calendarDate]);

  const historyGroups = useMemo(() => {
    if (!selectedCounter || !entries.length) return [];
    const groupBy = selectedCounter.groupBy || 'none';
    if (groupBy === 'none') return [{ title: 'History', entries }];

    const groups = [];
    entries.forEach(entry => {
      if (!entry.timestamp) return;
      let key = '';
      const date = entry.timestamp;
      
      if (groupBy === 'date') key = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      else if (groupBy === 'week') {
         const d = new Date(date);
         const day = d.getDay(); 
         const startOfWeek = new Date(d);
         startOfWeek.setDate(d.getDate() - day);
         key = `Week of ${startOfWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      } else if (groupBy === 'month') key = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      else if (groupBy === 'year') key = date.getFullYear().toString();

      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.title === key) lastGroup.entries.push(entry);
      else groups.push({ title: key, entries: [entry] });
    });
    return groups;
  }, [entries, selectedCounter]);

  // --- Fetch Data ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    setLoading(true);
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'counters'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const data = await Promise.all(snapshot.docs.map(async doc => {
        const raw = doc.data();
        const decrypted = await decryptData(raw, cryptoKey);
        return { 
            id: doc.id, 
            ...raw, 
            ...decrypted,
            dueDate: raw.dueDate || decrypted.dueDate || null, // Handle both structures
            repeat: raw.repeat || decrypted.repeat || 'none'
        };
      }));
      setCounters(data);
      setLoading(false);
    }, (error) => { console.error("Error fetching counters:", error); setLoading(false); });
    
    return () => unsubscribe();
  }, [user, cryptoKey]);

  useEffect(() => {
    if (!user || !selectedCounter || !cryptoKey) return;
    
    const q = query(
      collection(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id, 'entries'), 
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const data = await Promise.all(snapshot.docs.map(async doc => {
        const d = doc.data();
        const decryptedData = await decryptData(d, cryptoKey);

        return { 
          id: doc.id, 
          ...decryptedData,
          timestamp: d.timestamp && typeof d.timestamp.toDate === 'function' ? d.timestamp.toDate() : null,
          endTimestamp: d.endTimestamp && typeof d.endTimestamp.toDate === 'function' ? d.endTimestamp.toDate() : null,
          createdAt: d.createdAt && typeof d.createdAt.toDate === 'function' ? d.createdAt.toDate() : null
        };
      }));
      setEntries(data);
    }, (error) => console.error("Error fetching entries:", error));
    
    return () => unsubscribe();
  }, [user, selectedCounter, cryptoKey]);

  // Location Fetch
    useEffect(() => {
      if (isAddEntryModalOpen || editingEntry) {
        if (editingEntry) return;
        setEntryLocation(null);
        setIsLocating(true);
        if (!navigator.geolocation) { setIsLocating(false); return; }
  
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            let addressText = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            try {
              const controller = new AbortController();
              const id = setTimeout(() => controller.abort(), 5000);
              
              const res = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`, 
                { signal: controller.signal }
              );
              clearTimeout(id);
              if (res.ok) {
                const data = await res.json();
                const city = data.city || data.locality || '';
                const region = data.principalSubdivision || '';
                const country = data.countryName || '';
                if (city && country) addressText = `${city}, ${country}`;
                else if (region && country) addressText = `${region}, ${country}`;
                else if (country) addressText = country;
              }
            } catch (e) { console.warn("Geocoding failed", e); }
            setEntryLocation({ lat: latitude, lng: longitude, address: addressText });
            setIsLocating(false);
          },
          (error) => { console.error("Location error:", error); setIsLocating(false); },
          { timeout: 10000, maximumAge: 60000 }
        );
      }
    }, [isAddEntryModalOpen, editingEntry]);
  // --- Handlers ---

  const handleCreateOrUpdateCounter = async (e) => {
    e.preventDefault();
    const form = e.target;
    const title = form.title.value;
    const mode = form.mode.value; 
    const groupBy = form.groupBy.value;
    const useTags = form.useTags.checked;
    const useNotes = form.useNotes.checked;
    
    // Alert Fields - use state for these to ensure we catch updates
    const dDate = formDueDate || null;
    const rFreq = formRepeat || 'none';
    
    if (!title) return;

    // Encrypt sensitive data (Title)
    const encryptedData = await encryptData({ title, dueDate: dDate, repeat: rFreq }, cryptoKey);

    const payload = {
        ...encryptedData,
        mode, 
        groupBy,
        useTags,  
        useNotes,
        updatedAt: serverTimestamp()
    };

    if (editingCounterData) {
        // Update Existing
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', editingCounterData.id), payload);
        // Refresh local view if currently selected
        if (selectedCounter?.id === editingCounterData.id) {
            setSelectedCounter(prev => ({ ...prev, title, mode, groupBy, useTags, useNotes, dueDate: dDate, repeat: rFreq }));
        }
    } else {
        // Create New
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'counters'), {
            ...payload,
            count: 0, 
            createdAt: serverTimestamp()
        });
    }
    setIsCounterFormOpen(false);
    setEditingCounterData(null);
  };

  const handleSaveEntry = async (e) => {
    e.preventDefault();
    const form = e.target;
    
    const sensitiveData = {};
    if (form.note) sensitiveData.note = form.note.value;
    if (form.tags) sensitiveData.tags = form.tags.value.split(',').map(t => t.trim()).filter(t => t);
    
    if (entryLocation && !editingEntry) sensitiveData.location = entryLocation;

    const encryptedContent = await encryptData(sensitiveData, cryptoKey);

    const finalPayload = {
      ...encryptedContent,
      timestamp: new Date(form.startDate.value),
    };
    if (selectedCounter.mode === 'range') {
      finalPayload.endTimestamp = new Date(form.endDate.value);
    }

    if (editingEntry) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id, 'entries', editingEntry.id), finalPayload);
      setEditingEntry(null);
    } else {
      // NEW ENTRY
      finalPayload.createdAt = serverTimestamp();
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id, 'entries'), finalPayload);
      
      // AUTO-UPDATE ALERT LOGIC
      const counterUpdates = { count: increment(1) };
      
      // If repeat is active, bump the due date
      if (selectedCounter.repeat && selectedCounter.repeat !== 'none' && selectedCounter.dueDate) {
          const nextDate = getNextDate(selectedCounter.dueDate, selectedCounter.repeat);
          const encryptedMeta = await encryptData({ title: selectedCounter.title, dueDate: nextDate, repeat: selectedCounter.repeat }, cryptoKey);
          Object.assign(counterUpdates, encryptedMeta);
          
          // Update local state immediately for visual feedback
          setSelectedCounter(prev => ({ ...prev, dueDate: nextDate }));
      }

      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id), counterUpdates);
    }
    setIsAddEntryModalOpen(false);
  };

  const handleDeleteCounter = (counterId) => setDeleteConfirmation({ type: 'counter', id: counterId });
  const handleDeleteEntry = (entryId) => setDeleteConfirmation({ type: 'entry', id: entryId });
  
  const handleStartTimer = async () => {
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id, 'entries'), {
      timestamp: serverTimestamp(), createdAt: serverTimestamp(), endTimestamp: null 
    });
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id), { count: increment(1) });
  };
  
  const handleStopTimer = async (entry) => {
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id, 'entries', entry.id), {
      endTimestamp: serverTimestamp()
    });
    
    // Auto-update alert logic for Timers too
    if (selectedCounter.repeat && selectedCounter.repeat !== 'none' && selectedCounter.dueDate) {
        const nextDate = getNextDate(selectedCounter.dueDate, selectedCounter.repeat);
        const encryptedMeta = await encryptData({ title: selectedCounter.title, dueDate: nextDate, repeat: selectedCounter.repeat }, cryptoKey);
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id), encryptedMeta);
        setSelectedCounter(prev => ({ ...prev, dueDate: nextDate }));
    }
  };
  
  const proceedWithDelete = async () => {
    if (!deleteConfirmation) return;
    const { type, id } = deleteConfirmation;
    if (type === 'counter') {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', id));
      if (selectedCounter?.id === id) { setView('list'); setSelectedCounter(null); }
    } else {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id, 'entries', id));
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id), { count: increment(-1) });
    }
    setDeleteConfirmation(null);
  };
  
  const openEditModal = (entry) => { setEditingEntry(entry); setIsAddEntryModalOpen(true); };
  
  // Helpers for Edit Counter Modal
  const openCreateModal = () => {
      setEditingCounterData(null);
      setFormDueDate('');
      setFormRepeat('none');
      setIsCounterFormOpen(true);
  };
  const openEditCounterModal = () => {
      setEditingCounterData(selectedCounter);
      setFormDueDate(selectedCounter.dueDate || '');
      setFormRepeat(selectedCounter.repeat || 'none');
      setIsCounterFormOpen(true);
  };

  const handleExportData = async () => {
    if (!selectedCounter) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id, 'entries'));
    const snapshot = await getDocs(q);
    const data = await Promise.all(snapshot.docs.map(async doc => {
      const d = doc.data();
      const decrypted = await decryptData(d, cryptoKey);
      return { ...d, ...decrypted, timestamp: d.timestamp?.toDate ? d.timestamp.toDate().toISOString() : null };
    }));
    const blob = new Blob([JSON.stringify({ counter: selectedCounter, entries: data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'backup.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  
  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = async (e) => { 
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.counter || !Array.isArray(data.entries)) { alert("Invalid file format"); return; }
        if (!confirm(`Import ${data.entries.length} entries into "${selectedCounter.title}"?`)) return;
        let addedCount = 0;
        for (const entry of data.entries) {
          const sensitiveData = { note: entry.note, tags: entry.tags, location: entry.location };
          const encryptedContent = await encryptData(sensitiveData, cryptoKey);
          const entryData = { ...encryptedContent, timestamp: entry.timestamp ? new Date(entry.timestamp) : null, endTimestamp: entry.endTimestamp ? new Date(entry.endTimestamp) : null, createdAt: serverTimestamp() };
          Object.keys(entryData).forEach(key => entryData[key] === undefined && delete entryData[key]);
          await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id, 'entries'), entryData);
          addedCount++;
        }
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id), { count: increment(addedCount) });
        alert(`Successfully imported ${addedCount} entries.`);
        setIsSettingsModalOpen(false);
      } catch (error) { console.error("Import failed:", error); alert("Failed to parse or import file."); }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const prevMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  const nextMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      
      <header className="flex-none bg-[#4285f4] text-white p-4 shadow-md z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={24} /></button>
            <h1 className="text-xl font-bold flex items-center gap-2 truncate">
                {view === 'detail' ? (
                    <>
                        <span className="truncate">{selectedCounter.title}</span>
                        {/* Edit Button in Header */}
                        <button onClick={openEditCounterModal} className="opacity-70 hover:opacity-100 hover:bg-white/20 p-1.5 rounded-full transition-all">
                            <Edit2 size={16} />
                        </button>
                    </>
                ) : 'My Counters'}
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 scroll-smooth">
        <div className="max-w-3xl mx-auto p-4">
          {loading ? <LoadingSpinner /> : view === 'list' ? (
            <div className="grid gap-4">
              {counters.length === 0 && <div className="text-center py-20 text-gray-400"><p className="mb-4">No counters yet</p><Button onClick={openCreateModal}>Create your first</Button></div>}
              {counters.map(counter => {
                  const isOverdue = counter.dueDate && new Date(counter.dueDate) < new Date();
                  return (
                    <div key={counter.id} onClick={() => handleOpenCounter(counter)} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between active:scale-[0.99] transition-transform cursor-pointer relative overflow-hidden">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${counter.mode === 'range' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-[#4285f4]'}`}>{getCounterIcon(counter.mode)}</div>
                        <div>
                          <h3 className="font-bold text-gray-800 text-lg">{counter.title || 'Untitled'}</h3>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{counter.mode === 'range' ? 'Duration' : 'Date'}</p>
                            {/* Alert Badge */}
                            {counter.dueDate && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-medium ${isOverdue ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                                    <Clock size={10} /> {formatDate(counter.dueDate)}
                                </span>
                            )}
                            {counter.repeat && counter.repeat !== 'none' && (
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <RotateCcw size={10} />
                                </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-2xl font-bold text-gray-800">{counter.count || 0}</span>
                    </div>
                  );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                 {/* Meta Info in Detail View */}
                 <div className="flex gap-2">
                    {selectedCounter.dueDate && (
                        <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-lg text-gray-500 flex items-center gap-1">
                            <Clock size={12} /> {formatDate(selectedCounter.dueDate)}
                        </span>
                    )}
                    {selectedCounter.repeat && selectedCounter.repeat !== 'none' && (
                        <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-lg text-gray-500 flex items-center gap-1">
                            <RotateCcw size={12} /> {selectedCounter.repeat}
                        </span>
                    )}
                 </div>
                 <div className="flex gap-2">
                   <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"><Settings size={20} /></button>
                   <button onClick={() => handleDeleteCounter(selectedCounter.id)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={20} /></button>
                 </div>
              </div>

              {selectedCounter.mode === 'range' && !activeEntry && activeTab === 'history' && (
                <Button onClick={handleStartTimer} variant="success" className="w-full py-4 text-lg shadow-lg mb-2"><Play size={24} fill="currentColor" /> Start Timer</Button>
              )}

              {activeEntry && (
                <div className="bg-green-50 border border-green-200 p-4 rounded-xl flex items-center justify-between shadow-sm animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-2 rounded-full text-green-600"><Clock size={20} /></div>
                    <div><p className="text-green-800 font-bold text-lg">Active Session</p><p className="text-green-600 text-sm">Started {formatTime(activeEntry.timestamp)}</p></div>
                  </div>
                  <Button onClick={() => handleStopTimer(activeEntry)} className="bg-red-500 hover:bg-red-600 text-white border-0"><Square size={18} fill="currentColor" /> Stop</Button>
                </div>
              )}

              <div className="flex p-1 bg-gray-200 rounded-xl mb-4">
                <button onClick={() => setActiveTab('history')} className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-white text-[#4285f4] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>History</button>
                <button onClick={() => setActiveTab('stats')} className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'stats' ? 'bg-white text-[#4285f4] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Stats</button>
              </div>

              {activeTab === 'stats' ? (
                               <div className="space-y-4 animate-in slide-in-from-right-4 duration-200 fade-in">
                                 {!entries.length ? (
                                   <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300"><p className="text-gray-500">Add entries to see stats</p></div>
                                 ) : (
                                   <>
                                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                        <h3 className="font-bold text-gray-800 text-sm mb-2">Activity (Last 14 Days)</h3>
                                        <SimpleBarChart data={chartData} />
                                      </div>
              
                                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-4">
                                        <div className="flex items-center justify-between mb-4">
                                          <div>
                                            <h3 className="font-bold text-gray-800 text-lg leading-tight">{calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                                            <p className="text-xs text-gray-500 font-semibold mt-0.5">{monthlyTotal} this month • {yearlyTotal} in {calendarDate.getFullYear()}</p>
                                          </div>
                                          <div className="flex gap-2">
                                            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} className="text-gray-600" /></button>
                                            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight size={20} className="text-gray-600" /></button>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-7 gap-1 text-center mb-2">{['S','M','T','W','T','F','S'].map((d, i) => (<div key={i} className="text-xs text-gray-400 font-bold">{d}</div>))}</div>
                                        <div className="grid grid-cols-7 gap-1">
                                          {(() => {
                                            const year = calendarDate.getFullYear();
                                            const month = calendarDate.getMonth();
                                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                                            const firstDayOfMonth = new Date(year, month, 1).getDay();
                                            const days = [];
                                            for (let i = 0; i < firstDayOfMonth; i++) days.push(<div key={`empty-${i}`} className="h-10" />);
                                            for (let i = 1; i <= daysInMonth; i++) {
                                              const dateKey = new Date(year, month, i).toLocaleDateString('en-CA');
                                              const count = dailyCounts[dateKey] || 0;
                                              days.push(
                                                <div key={i} className="flex flex-col items-center justify-center h-10 relative">
                                                  <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all ${count > 0 ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-700'}`}>
                                                    {i}
                                                    {count > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full border-2 border-white">{count}</span>}
                                                  </div>
                                                </div>
                                              );
                                            }
                                            return days;
                                          })()}
                                        </div>
                                      </div>
              
                                      <div className="grid grid-cols-3 gap-2 mb-2">
                                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">Today</p><p className="text-xl font-bold text-gray-800">{stats?.today || 0}</p></div>
                                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">Month</p><p className="text-xl font-bold text-gray-800">{stats?.thisMonth || 0}</p></div>
                                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">Year</p><p className="text-xl font-bold text-gray-800">{stats?.thisYear || 0}</p></div>
                                      </div>
              
                                      <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">24 Hours</p><p className="text-xl font-bold text-gray-800">{stats?.last24Hours || 0}</p></div>
                                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">7 Days</p><p className="text-xl font-bold text-gray-800">{stats?.last7Days || 0}</p></div>
                                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">30 Days</p><p className="text-xl font-bold text-gray-800">{stats?.last30Days || 0}</p></div>
                                      </div>
              
                                      {selectedCounter.mode === 'range' && (
                                        <div className="bg-[#4285f4] p-5 rounded-2xl text-white shadow-md">
                                          <div className="flex items-center gap-2 mb-4 opacity-90"><Clock size={20} /><span className="font-semibold">Time Analysis</span></div>
                                          <div className="grid grid-cols-2 gap-4">
                                            <div><p className="text-xs opacity-70 uppercase font-bold mb-1">Total Time</p><p className="text-xl font-bold">{formatDuration(stats?.totalDuration)}</p></div>
                                            <div><p className="text-xs opacity-70 uppercase font-bold mb-1">Avg / Entry</p><p className="text-xl font-bold">{formatDuration(stats?.avgDuration)}</p></div>
                                          </div>
                                        </div>
                                      )}
              
                                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                                         <div><p className="text-xs text-gray-500 font-semibold uppercase mb-1">All Time Entries</p><p className="text-2xl font-bold text-gray-800">{stats?.total || 0}</p></div>
                                         <div className="bg-blue-50 p-3 rounded-full text-[#4285f4]"><BarChart2 size={24} /></div>
                                      </div>
                                   </>
                                 )}
                               </div>
                            ) : (
                // HISTORY TAB
                <div className="space-y-6 animate-in slide-in-from-left-4 duration-200 fade-in">
                  {!entries.length && <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300"><p className="text-gray-500">No history yet.</p></div>}
                  {historyGroups.map((group, gIdx) => (
                    <div key={gIdx} className="space-y-2">
                      {selectedCounter.groupBy !== 'none' && <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-2 sticky top-0 bg-gray-50 py-1 z-10">{group.title}</h3>}
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {group.entries.map((entry, idx) => (
                          <div key={entry.id} className={`p-4 flex items-center justify-between ${idx !== group.entries.length - 1 ? 'border-b border-gray-100' : ''} cursor-pointer hover:bg-gray-50 transition-colors`} onClick={() => setViewingEntry(entry)}>
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-800 text-lg">{formatDate(entry.timestamp)}</span>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                  <span>{formatTime(entry.timestamp)}</span>
                                  {selectedCounter.mode === 'range' && (
                                     <>
                                       <span className="text-gray-300">•</span>
                                       {entry.endTimestamp ? (
                                         <><span>{formatTime(entry.endTimestamp)}</span><span className="text-[#4285f4] font-medium bg-blue-50 px-1.5 rounded ml-1 text-xs">{formatDuration(entry.endTimestamp - entry.timestamp)}</span></>
                                       ) : <span className="text-green-600 font-bold text-xs bg-green-100 px-2 py-0.5 rounded-full animate-pulse">Running</span>}
                                     </>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                  {entry.location && <div className="flex items-center gap-1.5 text-xs text-gray-400"><MapPin size={12} /><span className="truncate max-w-[150px]">{entry.location.address}</span></div>}
                                  {entry.note && <div className="group relative"><StickyNote size={12} className="text-yellow-500" /></div>}
                                  {entry.tags && entry.tags.map((tag, tIdx) => <span key={tIdx} className="text-[9px] bg-blue-50 text-[#4285f4] px-1.5 py-0.5 rounded-full font-medium">#{tag}</span>)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={(e) => { e.stopPropagation(); openEditModal(entry); }} className="p-2 text-gray-400 hover:text-[#4285f4] transition-colors"><Pencil size={18} /></button>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id); }} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={18} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-4 z-20 md:hidden">
        {view === 'list' ? (
          <button onClick={openCreateModal} className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"><Plus size={28} /></button>
        ) : (
          <button onClick={() => { setEditingEntry(null); setIsAddEntryModalOpen(true); }} className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"><Plus size={28} /></button>
        )}
      </div>

      <div className="hidden md:block fixed bottom-6 right-[calc(50%-20rem)] z-20">
         <Button onClick={() => view === 'list' ? openCreateModal() : (() => { setEditingEntry(null); setIsAddEntryModalOpen(true); })()} className="rounded-full shadow-xl py-4 px-6 text-lg flex items-center gap-2" disabled={view === 'detail' && activeTab === 'stats'}>
           <Plus size={24} /> {view === 'list' ? 'New Counter' : 'Add Count'}
         </Button>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />

      {/* CREATE / EDIT COUNTER MODAL */}
      <Modal isOpen={isCounterFormOpen} onClose={() => setIsCounterFormOpen(false)} title={editingCounterData ? "Edit Counter" : "New Counter"}>
        <form onSubmit={handleCreateOrUpdateCounter} className="flex flex-col gap-4">
          <Input name="title" label="Counter Name" defaultValue={editingCounterData?.title || ''} placeholder="e.g. Workouts, Water Intake" autoFocus required />
          
          <div className="flex flex-col gap-2 mb-2">
             <label className="text-sm font-medium text-gray-700">Tracking Mode</label>
             <div className="grid grid-cols-2 gap-3">
               <label className="cursor-pointer">
                   <input type="radio" name="mode" value="date" defaultChecked={!editingCounterData || editingCounterData.mode === 'date'} className="peer sr-only" />
                   <div className="p-3 border rounded-lg peer-checked:border-[#4285f4] peer-checked:bg-blue-50 peer-checked:text-[#4285f4] flex flex-col items-center gap-2 text-gray-500 hover:bg-gray-50 transition-all"><Calendar size={24} /><span className="text-xs font-semibold">Date Point</span></div>
               </label>
               <label className="cursor-pointer">
                   <input type="radio" name="mode" value="range" defaultChecked={editingCounterData?.mode === 'range'} className="peer sr-only" />
                   <div className="p-3 border rounded-lg peer-checked:border-[#4285f4] peer-checked:bg-blue-50 peer-checked:text-[#4285f4] flex flex-col items-center gap-2 text-gray-500 hover:bg-gray-50 transition-all"><Clock size={24} /><span className="text-xs font-semibold">Duration</span></div>
               </label>
             </div>
          </div>
          
          {/* New Alert Section - Clearable */}
          <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Due Date / Next Alert</label>
                  <input 
                    name="dueDate" 
                    type="datetime-local" 
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" 
                  />
                  {formDueDate && (
                    <button type="button" onClick={() => setFormDueDate('')} className="absolute right-8 top-7 text-gray-400 hover:text-red-500">
                        <X size={14} />
                    </button>
                  )}
              </div>
              <div className="flex-1 relative">
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Repeat</label>
                  <select 
                    name="repeat" 
                    value={formRepeat}
                    onChange={(e) => setFormRepeat(e.target.value)}
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none"
                  >
                        <option value="none">No Repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                  </select>
                  {formRepeat !== 'none' && (
                    <button type="button" onClick={() => setFormRepeat('none')} className="absolute right-8 top-7 text-gray-400 hover:text-red-500">
                        <X size={14} />
                    </button>
                  )}
              </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 font-medium cursor-pointer">
                <input type="checkbox" name="useTags" defaultChecked={editingCounterData ? editingCounterData.useTags : true} className="w-4 h-4 rounded text-[#4285f4] focus:ring-[#4285f4] border-gray-300" />
                Enable Tags
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 font-medium cursor-pointer">
                <input type="checkbox" name="useNotes" defaultChecked={editingCounterData ? editingCounterData.useNotes : true} className="w-4 h-4 rounded text-[#4285f4] focus:ring-[#4285f4] border-gray-300" />
                Enable Notes
            </label>
          </div>

          <div className="flex flex-col gap-2 mb-4">
             <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Layers size={16} /> History Grouping</label>
             <div className="relative">
               <select name="groupBy" defaultValue={editingCounterData?.groupBy || 'none'} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4285f4] focus:border-[#4285f4] outline-none bg-white appearance-none">
                  <option value="none">No Grouping (Default)</option>
                  <option value="date">By Date</option>
                  <option value="week">By Week</option>
                  <option value="month">By Month</option>
                  <option value="year">By Year</option>
               </select>
               <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500"><ChevronLeft className="-rotate-90" size={16} /></div>
             </div>
          </div>
          <Button type="submit" className="w-full py-3">{editingCounterData ? "Save Changes" : "Create Counter"}</Button>
        </form>
      </Modal>

      {/* ... Other Modals ... */}
      <Modal isOpen={isAddEntryModalOpen} onClose={() => setIsAddEntryModalOpen(false)} title={editingEntry ? 'Edit Entry' : (selectedCounter?.mode === 'range' ? 'Log Duration' : 'Log Date')}>
        <form onSubmit={handleSaveEntry} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
             <label className="text-sm font-medium text-gray-700">{selectedCounter?.mode === 'range' ? 'Start Time' : 'Date & Time'}</label>
             <input name="startDate" type="datetime-local" defaultValue={toLocalISOString(editingEntry ? editingEntry.timestamp : Date.now())} className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4285f4] focus:border-[#4285f4] outline-none w-full" required />
          </div>
          {selectedCounter?.mode === 'range' && (
            <div className="flex flex-col gap-1">
               <label className="text-sm font-medium text-gray-700">End Time</label>
               <input name="endDate" type="datetime-local" defaultValue={toLocalISOString(editingEntry ? editingEntry.endTimestamp : Date.now() + 3600000)} className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4285f4] focus:border-[#4285f4] outline-none w-full" required />
            </div>
          )}
          
          {(selectedCounter?.useTags !== false) && (
            <div className="flex flex-col gap-1">
               <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Tag size={14} /> Tags (comma separated)</label>
               <input name="tags" placeholder="e.g. gym, cardio, morning" defaultValue={editingEntry?.tags?.join(', ') || ''} className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4285f4] focus:border-[#4285f4] outline-none w-full" />
            </div>
          )}

          {(selectedCounter?.useNotes !== false) && (
            <div className="flex flex-col gap-1">
               <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><StickyNote size={14} /> Note</label>
               <textarea name="note" placeholder="Add a note..." defaultValue={editingEntry?.note || ''} className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4285f4] focus:border-[#4285f4] outline-none w-full resize-none h-20" />
            </div>
          )}
          
          {!editingEntry && (
            <div className="flex items-center gap-2 text-xs bg-gray-50 p-3 rounded-lg border border-gray-200 mt-2">
              <div className={`p-1.5 rounded-full ${isLocating ? 'bg-yellow-100 text-yellow-600 animate-pulse' : entryLocation ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}><MapPin size={16} /></div>
              <div className="flex-1">{isLocating ? <span className="text-gray-500 font-medium">Locating you...</span> : entryLocation ? <div className="flex flex-col"><span className="font-semibold text-gray-800">Location Found</span><span className="text-gray-500 truncate max-w-[200px]">{entryLocation.address}</span></div> : <span className="text-gray-400">Location detection unavailable</span>}</div>
            </div>
          )}

          <Button type="submit" className="w-full py-3 mt-2">{editingEntry ? 'Save Changes' : 'Add Entry'}</Button>
        </form>
      </Modal>

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Confirm Delete">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 bg-red-50 p-3 rounded-lg text-red-700 text-sm">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-semibold">Are you sure?</p>
              <p>{deleteConfirmation?.type === 'counter' ? "This will permanently delete the counter and all its history." : "This will permanently delete this entry."}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button>
            <Button variant="danger" onClick={proceedWithDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Settings">
        <div className="flex flex-col gap-4">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <h4 className="font-bold text-[#4285f4] mb-1">Data Management</h4>
            <p className="text-sm text-gray-600 mb-4">Export your history to JSON or import from a backup.</p>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handleExportData} className="flex flex-col items-center justify-center py-4 gap-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-sm" variant="ghost">
                <Download size={24} className="text-[#4285f4]" />
                <span className="text-xs font-semibold">Export Data</span>
              </Button>
              <Button onClick={handleImportClick} className="flex flex-col items-center justify-center py-4 gap-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-sm" variant="ghost">
                <Upload size={24} className="text-[#4285f4]" />
                <span className="text-xs font-semibold">Import Data</span>
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!viewingEntry} onClose={() => setViewingEntry(null)} title="Entry Details">
        {viewingEntry && (
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Time</label>
              <div className="text-gray-900 font-medium text-lg">{formatDate(viewingEntry.timestamp)}</div>
              <div className="text-gray-600">
                {formatTime(viewingEntry.timestamp)}
                {selectedCounter.mode === 'range' && viewingEntry.endTimestamp && <> <span className="mx-2 text-gray-400">→</span> {formatTime(viewingEntry.endTimestamp)}</>}
              </div>
              {selectedCounter.mode === 'range' && viewingEntry.endTimestamp && <div className="text-[#4285f4] font-semibold">Duration: {formatDuration(viewingEntry.endTimestamp - viewingEntry.timestamp)}</div>}
            </div>
            {viewingEntry.location && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><MapPin size={12} /> Location</label>
                <p className="text-gray-800">{viewingEntry.location.address}</p>
                <p className="text-xs text-gray-400">{viewingEntry.location.lat.toFixed(5)}, {viewingEntry.location.lng.toFixed(5)}</p>
              </div>
            )}
            {viewingEntry.tags && viewingEntry.tags.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Tag size={12} /> Tags</label>
                <div className="flex flex-wrap gap-2">{viewingEntry.tags.map((tag, i) => <span key={i} className="bg-blue-50 text-[#4285f4] px-2 py-1 rounded-md text-sm font-medium">#{tag}</span>)}</div>
              </div>
            )}
            {viewingEntry.note && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><StickyNote size={12} /> Note</label>
                <div className="bg-gray-50 p-3 rounded-lg text-gray-700 text-sm whitespace-pre-wrap">{viewingEntry.note}</div>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
              <Button variant="ghost" onClick={() => { setViewingEntry(null); openEditModal(viewingEntry); }} className="text-gray-600"><Pencil size={16} className="mr-2" /> Edit</Button>
              <Button variant="danger" onClick={() => { setViewingEntry(null); handleDeleteEntry(viewingEntry.id); }}><Trash2 size={16} className="mr-2" /> Delete</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}