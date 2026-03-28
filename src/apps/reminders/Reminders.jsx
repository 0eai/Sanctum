// src/apps/reminders/Reminders.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Bell, CheckCircle2 } from 'lucide-react';

import { Button, Modal } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

import { listenToReminders, saveReminder, deleteReminder } from './services/reminders';
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
    const [searchQuery, setSearchQuery] = useState("");

    // --- URL-Driven State ---
    const activeTab = TABS.find(t => t.id === route.resource)?.id || 'upcoming';
    const editId = route.query?.edit;
    const currentBasePath = `#reminders/${activeTab}`;

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
    useEffect(() => {
        const tabEl = document.getElementById(`tab-${activeTab}`);
        if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [activeTab]);

    // --- Derived State ---
    const displayedReminders = useMemo(() => {
        let filtered = reminders;

        // Apply search filter first
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = reminders.filter(r =>
                r.title?.toLowerCase().includes(q) ||
                r.note?.toLowerCase().includes(q)
            );
        } else {
            if (activeTab === 'upcoming') {
                filtered = reminders.filter(r => r.isActive);
                filtered.sort((a, b) => new Date(a.datetime || '9999') - new Date(b.datetime || '9999'));
            } else {
                filtered = reminders.filter(r => !r.isActive);
                filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            }
        }
        return filtered;
    }, [reminders, activeTab, searchQuery]);

    // --- Handlers ---
    const handleSave = async (data) => {
        await saveReminder(user.uid, cryptoKey, data);
        navigate(currentBasePath);
    };

    const handleToggle = async (item) => {
        await saveReminder(user.uid, cryptoKey, { ...item, isActive: !item.isActive });
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        await deleteReminder(user.uid, deleteConfirm.id);
        setDeleteConfirm(null);
    };

    // Build tab data with counts
    const tabsWithCounts = useMemo(() => TABS.map(tab => ({
        ...tab,
        count: tab.id === 'upcoming' ? reminders.filter(r => r.isActive).length : reminders.filter(r => !r.isActive).length
    })), [reminders]);

    return (
        <StandardAppLayout
            headerConfig={{
                onBack: onExit,
                title: 'Reminders',
                search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search reminders...' },
                nav: {
                    type: 'tabs',
                    data: tabsWithCounts,
                    activeId: activeTab,
                    onSelect: (tabId) => navigate(`#reminders/${tabId}`),
                },
            }}
            fabConfig={{ onClick: () => navigate(`${currentBasePath}?edit=new`), icon: <Plus size={28} />, ariaLabel: "New Reminder" }}
        >
            {loading ? (
                <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
            ) : displayedReminders.length === 0 ? (
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

            <ReminderFormModal
                isOpen={!!editId}
                onClose={() => navigate(currentBasePath)}
                onSave={handleSave}
                editingItem={editingItem}
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
        </StandardAppLayout>
    );
};

export default RemindersApp;