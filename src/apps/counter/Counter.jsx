// src/apps/counter/Counter.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Download, Upload, AlertCircle } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDocs } from 'firebase/firestore';
import { db, appId } from '../../lib/firebase';
import { Modal, Button, LoadingSpinner } from '../../components/ui';
import { encryptData, decryptData } from '../../lib/crypto'; 

// Sub-components
import CounterHeader from './components/CounterHeader';
import CounterList from './components/CounterList';
import CounterDetail from './components/CounterDetail';
import CounterEditor from './components/CounterEditor';
import EntryModal from './components/EntryModal';
import ViewEntryModal from './components/ViewEntryModal';
import Fab from '../../components/ui/Fab'; 
import ImportExportModal from '../../components/ui/ImportExportModal';

// Services
import { 
  saveCounter, saveEntry, deleteCounterEntity, startTimer, stopTimer, 
  exportAllCounters, importCounters
} from '../../services/counter';

// --- Helpers ---
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

// FIXED: Accept route and navigate from props
export default function CounterApp({ user, cryptoKey, onExit, route, navigate }) {
  const [counters, setCounters] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Tab State for Detail View
  const [activeTab, setActiveTab] = useState('history'); 

  // Modals
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [viewingEntry, setViewingEntry] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [processing, setProcessing] = useState(false); // For import/export spinner
  
  // Location & Swipe
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const MIN_SWIPE_DISTANCE = 50;

  // --- 1. URL-Driven State & Routing ---
  
  // View states derived from the URL path
  const view = route.resource === 'edit' ? 'editor' : route.resource === 'view' ? 'detail' : 'list';
  const isSettingsOpen = route.query?.modal === 'settings';

  // Identify the currently selected counter from the URL ID
  const selectedCounterId = route.resourceId !== 'new' ? route.resourceId : null;
  const selectedCounter = selectedCounterId ? counters.find(c => c.id === selectedCounterId) : null;
  
  // We use this for the editor. If we are editing an existing counter, pass the data.
  // If we are creating a new one (id === 'new'), pass null.
  const editingCounterData = view === 'editor' && selectedCounterId ? selectedCounter : null;

  // Legacy URL Fallback: Redirect old `?openId=123` links to the new detail view
  useEffect(() => {
    if (route.query?.openId) {
        window.location.replace(
            `${window.location.pathname}${window.location.search}#counter/view/${route.query.openId}`
        );
    }
  }, [route]);

  // --- 2. Data Listeners ---
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
            dueDate: raw.dueDate || decrypted.dueDate || null,
            repeat: raw.repeat || decrypted.repeat || 'none'
        };
      }));
      setCounters(data);
      setLoading(false);
    }, (error) => { console.error("Error fetching counters:", error); setLoading(false); });
    return () => unsubscribe();
  }, [user, cryptoKey]);

  useEffect(() => {
    if (!user || !selectedCounter || !cryptoKey || view !== 'detail') return;
    
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
  }, [user, selectedCounter, cryptoKey, view]);


  // --- 3. Handlers ---

  const handleOpenCounter = (counter) => {
    navigate(`#counter/view/${counter.id}`);
    setActiveTab('history');
  };

  const handleOpenEditor = (counter = null) => {
      if (counter) {
          navigate(`#counter/edit/${counter.id}`);
      } else {
          navigate(`#counter/edit/new`);
      }
  };

  const handleBack = () => {
    if (view === 'editor') {
        if (editingCounterData) {
            navigate(`#counter/view/${editingCounterData.id}`);
        } else {
            navigate(`#counter`);
        }
    } else if (view === 'detail') {
        navigate(`#counter`);
    } else {
        onExit();
    }
  };

  const handleCounterSave = async (e, dDate, rFreq) => {
    const title = e.target.title.value;
    if (!title) return;

    // Use selectedCounterId here in case we are editing an existing one
    const savedId = await saveCounter(user.uid, cryptoKey, {
        title,
        mode: e.target.mode.value,
        groupBy: e.target.groupBy.value,
        useTags: e.target.useTags.checked,
        useNotes: e.target.useNotes.checked,
        dueDate: dDate || null,
        repeat: rFreq || 'none'
    }, selectedCounterId);

    // After saving, route back to the detail view of that counter
    navigate(`#counter/view/${savedId}`);
  };

  const handleEntrySave = async (formData, location) => {
    const entryData = {
        id: editingEntry?.id,
        note: formData.note,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        location: location && !editingEntry ? location : undefined,
        timestamp: new Date(formData.startDate),
    };
    if (selectedCounter.mode === 'range') {
        entryData.endTimestamp = new Date(formData.endDate);
    }

    if(!editingEntry && selectedCounter.repeat && selectedCounter.repeat !== 'none' && selectedCounter.dueDate) {
        const nextDate = getNextDate(selectedCounter.dueDate, selectedCounter.repeat);
        const encryptedMeta = await encryptData({ title: selectedCounter.title, dueDate: nextDate, repeat: selectedCounter.repeat }, cryptoKey);
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'counters', selectedCounter.id), encryptedMeta);
    }

    await saveEntry(user.uid, selectedCounter.id, cryptoKey, entryData, selectedCounter);
    setIsEntryModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    
    const targetId = deleteConfirmation.type === 'counter' ? selectedCounter?.id : deleteConfirmation.id;
    const entryId = deleteConfirmation.type === 'entry' ? deleteConfirmation.id : null;
    
    await deleteCounterEntity(user.uid, targetId, entryId);
    
    if (deleteConfirmation.type === 'counter') {
        navigate(`#counter`);
    }
    
    setDeleteConfirmation(null);
    if(viewingEntry) setViewingEntry(null);
  };

  // --- Export / Import Handlers ---
  const currentBasePath = route.resourceId ? `#counter/${route.resource}/${route.resourceId}` : `#counter`;

  const handleExport = async () => {
    setProcessing(true);
    try {
      const data = await exportAllCounters(user.uid, cryptoKey);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `counters_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
      alert("Export failed.");
    }
    setProcessing(false);
    navigate(currentBasePath);
  };

  const handleImport = async (file) => {
    if (!file) return;
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const count = await importCounters(user.uid, cryptoKey, json);
        alert(`Successfully imported ${count} counters.`);
        navigate(currentBasePath);
      } catch (e) {
        console.error("Import failed", e);
        alert("Import failed. Invalid file format.");
      }
      setProcessing(false);
    };
    reader.readAsText(file);
  };

  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd || view !== 'detail') return;
    const distance = touchStart - touchEnd;
    if (distance > MIN_SWIPE_DISTANCE && activeTab === 'history') setActiveTab('stats');
    else if (distance < -MIN_SWIPE_DISTANCE && activeTab === 'stats') setActiveTab('history');
  };

  // --- RENDER LOGIC ---

  // Handle loading state gracefully, particularly if we navigated directly to a detail view
  // but the counters haven't loaded yet.
  if (view === 'detail' && !selectedCounter && !loading) {
       // If the counter doesn't exist (deleted or bad link), drop them back to list.
       navigate('#counter');
       return null; 
  }

  if (view === 'editor') {
      return (
          <CounterEditor 
            counter={editingCounterData}
            onSave={handleCounterSave}
            onBack={handleBack}
          />
      );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 text-gray-900 font-sans overflow-hidden">
      
      <CounterHeader 
        view={view}
        title={view === 'detail' && selectedCounter ? selectedCounter.title : 'My Counters'}
        onBack={handleBack}
        onEdit={() => handleOpenEditor(selectedCounter)}
        onSettings={() => navigate(`${currentBasePath}?modal=settings`)}
        onDelete={() => setDeleteConfirmation({ type: 'counter', id: selectedCounter?.id })}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main 
        className="flex-1 overflow-y-auto pb-24 scroll-smooth"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="max-w-3xl mx-auto p-4">
          {loading ? <LoadingSpinner /> : view === 'list' ? (
            <CounterList 
              counters={counters} 
              loading={loading}
              onOpen={handleOpenCounter}
              onCreate={() => handleOpenEditor(null)}
            />
          ) : (
            <CounterDetail 
              counter={selectedCounter}
              entries={entries}
              activeTab={activeTab}
              user={user}
              cryptoKey={cryptoKey}
              onStartTimer={startTimer}
              onStopTimer={stopTimer}
              onEditEntry={(entry) => { setEditingEntry(entry); setIsEntryModalOpen(true); }}
              onDeleteEntry={(id) => setDeleteConfirmation({ type: 'entry', id })}
              onViewEntry={setViewingEntry}
            />
          )}
        </div>
      </main>

      {/* REUSABLE FAB */}
      <Fab 
        onClick={() => view === 'list' ? handleOpenEditor(null) : (() => { setEditingEntry(null); setIsEntryModalOpen(true); })()} 
        icon={<Plus size={28} />}
        maxWidth="max-w-4xl"
        ariaLabel={view === 'list' ? "New Counter" : "Add Entry"}
      />

      <EntryModal 
        isOpen={isEntryModalOpen} 
        onClose={() => setIsEntryModalOpen(false)} 
        onSave={handleEntrySave} 
        editingEntry={editingEntry}
        mode={selectedCounter?.mode}
        useTags={selectedCounter?.useTags}
        useNotes={selectedCounter?.useNotes}
      />

      <ViewEntryModal 
        entry={viewingEntry}
        counter={selectedCounter}
        onClose={() => setViewingEntry(null)}
        onEdit={() => { setViewingEntry(null); setEditingEntry(viewingEntry); setIsEntryModalOpen(true); }}
        onDelete={() => { setViewingEntry(null); setDeleteConfirmation({ type: 'entry', id: viewingEntry.id }); }}
      />

      {/* IMPORT / EXPORT MODAL */}
      <ImportExportModal 
        isOpen={isSettingsOpen}
        onClose={() => navigate(currentBasePath)}
        onImport={handleImport}
        onExport={handleExport}
        isImporting={processing}
        title="Manage Counters"
        accept=".json"
        importLabel="Import Data"
        exportLabel="Export Data"
      />

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Confirm Delete">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-700 p-3 rounded-lg flex gap-2 items-start"><AlertCircle size={18} /> <p className="text-sm font-semibold">Are you sure you want to delete this?</p></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete}>Delete</Button></div>
        </div>
      </Modal>
    </div>
  );
}