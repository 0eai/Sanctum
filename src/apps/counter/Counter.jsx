// src/apps/counter/Counter.jsx
import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Plus, AlertCircle, Edit2, Trash2, Settings, History, PieChart } from 'lucide-react';
import { Modal, Button, LoadingSpinner } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

// Sub-components
import CounterList from './components/CounterList';
import CounterDetail from './components/CounterDetail';
import CounterEditor from './components/CounterEditor';
import EntryModal from './components/EntryModal';
import ViewEntryModal from './components/ViewEntryModal';

// Services
import {
  listenToCounters, listenToEntries,
  saveCounter, saveEntry, deleteCounterEntity, startTimer, stopTimer,
  exportAllCounters, importCounters, reorderCounter, rescheduleCounter
} from './services/counter';

// --- Helpers ---
const getNextDate = (currentDateStr, frequency) => {
  if (!currentDateStr) return null;
  const date = new Date(currentDateStr);
  switch (frequency) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
    default: return null;
  }
  return date.toISOString();
};

export default function CounterApp({ user, cryptoKey, onExit, route, navigate }) {
  const { showToast } = useToast();
  const [counters, setCounters] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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
  const editingCounterData = view === 'editor' && selectedCounterId ? selectedCounter : null;

  useEffect(() => {
    if (route.query?.openId) {
      window.location.replace(
        `${window.location.pathname}${window.location.search}#counter/view/${route.query.openId}`
      );
    }
  }, [route]);

  // --- 2. Data Listeners (FIXED) ---

  // Use the service listener so the custom 'order' property is respected!
  useEffect(() => {
    if (!user || !cryptoKey) return;
    setLoading(true);

    const unsubscribe = listenToCounters(user.uid, cryptoKey, (data) => {
      setCounters(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, cryptoKey]);

  useEffect(() => {
    if (!user || !selectedCounter || !cryptoKey || view !== 'detail') return;

    const unsubscribe = listenToEntries(user.uid, selectedCounter.id, cryptoKey, (data) => {
      setEntries(data);
    });

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

    const savedId = await saveCounter(user.uid, cryptoKey, {
      title,
      mode: e.target.mode.value,
      groupBy: e.target.groupBy.value,
      useTags: e.target.useTags.checked,
      useNotes: e.target.useNotes.checked,
      dueDate: dDate || null,
      repeat: rFreq || 'none'
    }, selectedCounterId);

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

    if (!editingEntry) {
      await rescheduleCounter(user.uid, cryptoKey, selectedCounter);
    }

    await saveEntry(user.uid, selectedCounter.id, cryptoKey, entryData, selectedCounter);
    setIsEntryModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;

    const counterId = selectedCounter?.id;
    const entryId = deleteConfirmation.type === 'entry' ? deleteConfirmation.id : null;

    await deleteCounterEntity(user.uid, counterId, entryId);

    if (deleteConfirmation.type === 'counter') {
      navigate(`#counter`);
    }

    setDeleteConfirmation(null);
    if (viewingEntry) setViewingEntry(null);
  };

  const handleReorderCounter = async (counterId, direction) => {
    try {
      await reorderCounter(user.uid, counterId, direction, counters);
    } catch (e) {
      console.error("Reorder failed:", e);
      showToast("Failed to reorder: " + e.message, 'error');
    }
  };

  // --- Export / Import Handlers ---
  const currentBasePath = route.resourceId ? `#counter/${route.resource}/${route.resourceId}` : `#counter`;

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
  const filteredCounters = counters.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  if (view === 'detail' && !selectedCounter && !loading) {
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

  // --- Dynamic headerConfig ---
  const headerConfig = view === 'detail' && selectedCounter ? {
    // DETAIL VIEW: Title + Edit/Settings/Delete + History/Stats tabs
    onBack: handleBack,
    title: selectedCounter.title,
    customActions: (
      <>
        <button onClick={() => handleOpenEditor(selectedCounter)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white" title="Edit Counter">
          <Edit2 size={18} />
        </button>
        <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white" title="Settings">
          <Settings size={18} />
        </button>
        <button onClick={() => setDeleteConfirmation({ type: 'counter', id: selectedCounter.id })} className="p-2 hover:bg-white/20 text-red-100 hover:text-red-500 rounded-full transition-colors" title="Delete Counter">
          <Trash2 size={18} />
        </button>
      </>
    ),
    nav: {
      type: 'tabs',
      activeId: activeTab,
      data: [
        { id: 'history', label: 'History', icon: History },
        { id: 'stats', label: 'Stats', icon: PieChart },
      ],
      onSelect: (tabId) => setActiveTab(tabId),
    },
  } : {
    // LIST VIEW: Title + Search + Settings
    onBack: handleBack,
    title: 'My Counters',
    search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search counters...' },
    customActions: (
      <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white" title="Manage Data">
        <Settings size={20} />
      </button>
    ),
  };

  return (
    <StandardAppLayout
      headerConfig={headerConfig}
      mainProps={{
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
      }}
      fabConfig={{
        onClick: () => view === 'list' ? handleOpenEditor(null) : (() => { setEditingEntry(null); setIsEntryModalOpen(true); })(),
        icon: <Plus size={28} />,
        ariaLabel: view === 'list' ? "New Counter" : "Add Entry",
      }}
    >
      {loading ? <LoadingSpinner /> : view === 'list' ? (
        <CounterList
          counters={filteredCounters}
          loading={loading}
          onOpen={handleOpenCounter}
          onCreate={() => handleOpenEditor(null)}
          onReorder={handleReorderCounter}
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

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Confirm Delete">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-700 p-3 rounded-lg flex gap-2 items-start"><AlertCircle size={18} /> <p className="text-sm font-semibold">Are you sure you want to delete this?</p></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete}>Delete</Button></div>
        </div>
      </Modal>
    </StandardAppLayout>
  );
}