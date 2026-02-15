// src/apps/reminders/Reminders.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Plus, Settings, Bell, CheckCircle2 } from 'lucide-react';

import { LoadingSpinner, Button, Modal } from '../../components/ui';
import Fab from '../../components/ui/Fab';
import ImportExportModal from '../../components/ui/ImportExportModal';

import { listenToReminders, saveReminder, deleteReminder, exportReminders, importReminders } from '../../services/reminders';
import ReminderCard from './components/ReminderCard';
import ReminderFormModal from './components/ReminderFormModal';

const TABS = [
    { id: 'upcoming', label: 'Upcoming', icon: Bell },
    { id: 'completed', label: 'Completed', icon: CheckCircle2 }
];

const RemindersApp = ({ user, cryptoKey, onExit, route, navigate }) => {
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [processing, setProcessing] = useState(false);

    // --- Swipe State ---
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const MIN_SWIPE_DISTANCE = 50;

    // --- URL-Driven State ---
    const activeTab = TABS.find(t => t.id === route.resource)?.id || 'upcoming';
    const isSettingsOpen = route.query?.modal === 'settings';
    const editId = route.query?.edit;
    const currentBasePath = `#reminders/${activeTab}`;

    // Determine what to show in the editor modal
    const editingItem = useMemo(() => {
        if (!editId) return null;
        if (editId === 'new') return null; 
        return reminders.find(r => r.id === editId) || null;
    }, [editId, reminders]);

    // --- Listeners ---
    useEffect(() => {
        if (!user || !cryptoKey) return;
        const unsub = listenToReminders(user.uid, cryptoKey, (data) => {
            setReminders(data);
            setLoading(false);
        });
        return () => unsub();
    }, [user, cryptoKey]);

    // --- UI Sync ---
    // Smooth scroll the active tab into view
    useEffect(() => {
        const tabEl = document.getElementById(`tab-${activeTab}`);
        if(tabEl) tabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [activeTab]);

    // --- Derived State ---
    const displayedReminders = useMemo(() => {
        let filtered = reminders;
        if (activeTab === 'upcoming') {
            filtered = reminders.filter(r => r.isActive);
            filtered.sort((a, b) => new Date(a.datetime || '9999') - new Date(b.datetime || '9999'));
        } else {
            filtered = reminders.filter(r => !r.isActive);
            filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        }
        return filtered;
    }, [reminders, activeTab]);

    // --- Handlers ---
    const handleSave = async (data) => {
        await saveReminder(user.uid, cryptoKey, data);
        navigate(currentBasePath); // Close Modal
    };

    const handleToggle = async (item) => {
        await saveReminder(user.uid, cryptoKey, { ...item, isActive: !item.isActive });
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        await deleteReminder(user.uid, deleteConfirm.id);
        setDeleteConfirm(null);
    };

    // --- Swipe Logic ---
    const handleTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        
        const distance = touchStart - touchEnd;
        const currentIndex = TABS.findIndex(t => t.id === activeTab);
        
        // Swipe Left -> Next Tab
        if (distance > MIN_SWIPE_DISTANCE && currentIndex < TABS.length - 1) {
            navigate(`#reminders/${TABS[currentIndex + 1].id}`);
        } 
        // Swipe Right -> Prev Tab
        else if (distance < -MIN_SWIPE_DISTANCE && currentIndex > 0) {
            navigate(`#reminders/${TABS[currentIndex - 1].id}`);
        }
    };

    // --- Import / Export ---
    const handleExport = async () => {
        setProcessing(true);
        try {
            const data = await exportReminders(user.uid, cryptoKey);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reminders_backup_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { alert("Export failed."); }
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
                const count = await importReminders(user.uid, cryptoKey, json);
                alert(`Imported ${count} reminders.`);
                navigate(currentBasePath);
            } catch (e) { alert("Import failed."); }
            setProcessing(false);
        };
        reader.readAsText(file);
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
            <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 pb-0">
                <div className="max-w-4xl mx-auto px-4 pt-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={24} /></button>
                            <h1 className="text-xl font-bold flex items-center gap-2">Reminders</h1>
                        </div>
                        <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                            <Settings size={20} />
                        </button>
                    </div>

                    {/* Tab Bar */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0 mt-1">
                        {TABS.map(tab => (
                            <button 
                                key={tab.id}
                                id={`tab-${tab.id}`}
                                onClick={() => navigate(`#reminders/${tab.id}`)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg text-sm font-bold transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
                            >
                                <tab.icon size={16} /> {tab.label}
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-white/20 text-white'}`}>
                                    {/* FIXED: Using tab.id to calculate counts so they show accurately for each tab */}
                                    {tab.id === 'upcoming' ? reminders.filter(r => r.isActive).length : reminders.filter(r => !r.isActive).length}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main 
                className="flex-1 overflow-y-auto scroll-smooth p-4"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="max-w-3xl mx-auto pb-24">
                    {loading ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : displayedReminders.length === 0 ? (
                        <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
                            <div className="bg-white p-4 rounded-full shadow-sm opacity-50"><Bell size={32} /></div>
                            <p>No {activeTab} reminders.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {displayedReminders.map(item => (
                                <ReminderCard 
                                    key={item.id} 
                                    item={item} 
                                    onToggle={handleToggle}
                                    onEdit={(i) => navigate(`${currentBasePath}?edit=${i.id}`)}
                                    onDelete={setDeleteConfirm} 
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Fab 
                onClick={() => navigate(`${currentBasePath}?edit=new`)} 
                icon={<Plus size={28} />}
                maxWidth="max-w-4xl"
                ariaLabel="New Reminder"
            />

            <ReminderFormModal 
                isOpen={!!editId}
                onClose={() => navigate(currentBasePath)}
                onSave={handleSave}
                editingItem={editingItem}
            />

            <ImportExportModal 
                isOpen={isSettingsOpen}
                onClose={() => navigate(currentBasePath)}
                onImport={handleImport}
                onExport={handleExport}
                isImporting={processing}
                title="Manage Reminders"
                accept=".json"
                importLabel="Import Data"
                exportLabel="Export Data"
            />

            <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Reminder">
                <div className="flex flex-col gap-4">
                    <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure you want to delete this reminder?</div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                        <Button variant="danger" onClick={handleDelete}>Delete</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default RemindersApp;