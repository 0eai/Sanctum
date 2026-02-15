// src/apps/settings/AppsTab.jsx
import React, { useState, useEffect } from 'react';
import { 
  ToggleLeft, ToggleRight, Grid, Plus, Trash2, Globe, MoveUp, MoveDown, ExternalLink,
  Cloud, Cast, Music, Video, MessageSquare, ShoppingBag, Briefcase, Layout, Bell,
  FileCode, FileText, CheckSquare, PieChart, Bookmark, Key, ListChecks, PlusSquare, Shield, Settings,
  Users, BellRing // <--- Added new icons
} from 'lucide-react';

// Make sure your constants.js exports an array that looks like this:
const AVAILABLE_APPS = [
    { id: 'alerts', name: 'DayPulse', icon: 'Bell' },
    { id: 'tasks', name: 'Tasks', icon: 'ListChecks' },
    { id: 'checklist', name: 'Checklists', icon: 'CheckSquare' },
    { id: 'reminders', name: 'Reminders', icon: 'BellRing' }, // <--- Added Reminders
    { id: 'counter', name: 'Counters', icon: 'PlusSquare' },
    { id: 'notes', name: 'Notes', icon: 'FileText' },
    { id: 'markdown', name: 'Markdown', icon: 'FileCode' },
    { id: 'contacts', name: 'Contacts', icon: 'Users' }, // <--- Added Contacts
    { id: 'passwords', name: 'Passwords', icon: 'Key' },
    { id: 'banking', name: 'Wallet', icon: 'CreditCard' },
    { id: 'finance', name: 'Finance', icon: 'PieChart' },
    { id: 'bookmarks', name: 'Bookmarks', icon: 'Bookmark' },
    { id: 'streampi', name: 'StreamPi', icon: 'Cast', isExternal: true, url: 'https://aks-streampi.web.app' },
    { id: 'drive', name: 'Cloud Drive', icon: 'Cloud', isExternal: true, url: 'https://aks-cloud-drive.web.app' },
    { id: 'settings', name: 'Settings', icon: 'Settings' },
    { id: 'vault', name: 'Vault', icon: 'Shield' }
];

import { fetchAppPreferences, saveAppPreferences } from '../../services/settings';
import { Button, Input, Modal } from '../../components/ui';

// --- Icon Mapping Configuration ---
const APP_TYPES = [
    { label: 'General / Web', value: 'Globe', icon: Globe },
    { label: 'Cloud Drive', value: 'Cloud', icon: Cloud },
    { label: 'Streaming', value: 'Cast', icon: Cast },
    { label: 'Music', value: 'Music', icon: Music },
    { label: 'Video', value: 'Video', icon: Video },
    { label: 'Social / Chat', value: 'MessageSquare', icon: MessageSquare },
    { label: 'Shopping', value: 'ShoppingBag', icon: ShoppingBag },
    { label: 'Work / Productivity', value: 'Briefcase', icon: Briefcase },
    { label: 'Dashboard', value: 'Layout', icon: Layout },
    { label: 'Markdown', value: 'FileCode', icon: FileCode },
];

// Helper to get Icon Component from string name
const getIconComponent = (iconName) => {
    // 1. Check Standard App Icons
    switch(iconName) {
        case 'Shield': return Shield;
        case 'FileText': return FileText;
        case 'CheckSquare': return CheckSquare;
        case 'PieChart': return PieChart;
        case 'Bookmark': return Bookmark;
        case 'Key': return Key;
        case 'ListChecks': return ListChecks;
        case 'PlusSquare': return PlusSquare;
        case 'FileCode': return FileCode; 
        case 'Settings': return Settings;
        case 'Users': return Users;       // <--- Added Contacts Mapping
        case 'BellRing': return BellRing; // <--- Added Reminders Mapping
        case 'Bell': return Bell;         // <--- Added Alerts Mapping
        default: break;
    }

    // 2. Check Custom App Types
    const type = APP_TYPES.find(t => t.value === iconName);
    return type ? type.icon : Globe; // Default
};

const AppsTab = ({ user, setLoading, setMessage }) => {
    // State
    const [appList, setAppList] = useState(AVAILABLE_APPS); 
    const [selectedIds, setSelectedIds] = useState(AVAILABLE_APPS.map(a => a.id)); 
    const [loadingData, setLoadingData] = useState(true);
    
    // Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    useEffect(() => {
        const load = async () => {
            const prefs = await fetchAppPreferences(user.uid);
            if (prefs) {
                // Merge loaded custom list with defaults to ensure new apps (like Markdown, Contacts, Reminders) appear if not present
                if (prefs.customAppList) {
                    const newApps = AVAILABLE_APPS.filter(def => !prefs.customAppList.find(c => c.id === def.id));
                    setAppList([...prefs.customAppList, ...newApps]);
                } else {
                    setAppList(AVAILABLE_APPS);
                }

                if (prefs.selectedApps) setSelectedIds(prefs.selectedApps);
            }
            setLoadingData(false);
        };
        load();
    }, [user]);

    // --- Actions ---

    const toggleApp = (id) => {
        if (id === 'vault' || id === 'settings') return;
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const handleAddExternalApp = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const name = formData.get('name').trim();
        const url = formData.get('url').trim();
        const iconType = formData.get('iconType');

        if (!name || !url) return;

        const newApp = {
            id: `ext_${Date.now()}`,
            name,
            icon: iconType, 
            url,
            isExternal: true
        };

        setAppList(prev => [...prev, newApp]);
        setSelectedIds(prev => [...prev, newApp.id]); 
        setIsAddModalOpen(false);
    };

    const handleDeleteExternal = (id) => {
        if (!window.confirm("Remove this shortcut?")) return;
        setAppList(prev => prev.filter(app => app.id !== id));
        setSelectedIds(prev => prev.filter(pid => pid !== id));
    };

    const moveApp = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= appList.length) return;

        const newList = [...appList];
        const temp = newList[index];
        newList[index] = newList[newIndex];
        newList[newIndex] = temp;
        setAppList(newList);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await saveAppPreferences(user.uid, selectedIds, appList);
            setMessage({ type: 'success', text: "App layout saved!" });
            setTimeout(() => window.location.reload(), 1000); 
        } catch (e) {
            setMessage({ type: 'error', text: "Failed to save." });
        } finally {
            setLoading(false);
        }
    };

    if (loadingData) return <div className="text-center p-4 text-gray-400">Loading apps...</div>;

    return (
        <div className="space-y-6">
            
            {/* Toolbar */}
            <div className="flex justify-end">
                <Button onClick={() => setIsAddModalOpen(true)} variant="secondary" className="flex items-center gap-2 text-xs py-2">
                    <Plus size={16} /> Add External App
                </Button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
                    <Grid size={18} className="text-[#4285f4]" /> Customize Layout
                </div>
                
                <div className="divide-y divide-gray-50">
                    {appList.map((app, index) => {
                        const isEnabled = selectedIds.includes(app.id);
                        const isSystem = ['vault', 'settings'].includes(app.id);
                        const IconComponent = getIconComponent(app.icon);

                        return (
                            <div key={app.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    {/* Reorder Buttons */}
                                    <div className="flex flex-col gap-1 text-gray-300">
                                        <button onClick={() => moveApp(index, -1)} disabled={index === 0} className="hover:text-blue-500 disabled:opacity-30 p-0.5"><MoveUp size={12} /></button>
                                        <button onClick={() => moveApp(index, 1)} disabled={index === appList.length - 1} className="hover:text-blue-500 disabled:opacity-30 p-0.5"><MoveDown size={12} /></button>
                                    </div>

                                    <div className={`p-2 rounded-lg ${isEnabled ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                        <IconComponent size={18} />
                                    </div>
                                    
                                    <div>
                                        <p className={`text-sm font-medium ${isEnabled ? 'text-gray-800' : 'text-gray-400'}`}>
                                            {app.name}
                                        </p>
                                        {app.isExternal && (
                                            <a href={app.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline flex items-center gap-1">
                                                {new URL(app.url).hostname} <ExternalLink size={8} />
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {app.isExternal && (
                                        <button onClick={() => handleDeleteExternal(app.id)} className="text-gray-300 hover:text-red-500 p-2">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                    
                                    {!isSystem && (
                                        <button onClick={() => toggleApp(app.id)} className={`transition-colors ${isEnabled ? 'text-[#4285f4]' : 'text-gray-300'}`}>
                                            {isEnabled ? <ToggleRight size={28} fill="currentColor" /> : <ToggleLeft size={28} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <Button onClick={handleSave} className="w-full py-3 text-lg shadow-lg">Save Layout</Button>

            {/* Add App Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add External App">
                <form onSubmit={handleAddExternalApp} className="flex flex-col gap-4">
                    <Input name="name" label="App Name" placeholder="e.g. Google Drive" autoFocus required />
                    <Input name="url" label="URL" placeholder="https://drive.google.com" type="url" required />
                    
                    {/* App Type / Icon Selector */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">App Type</label>
                        <div className="grid grid-cols-3 gap-2">
                            {APP_TYPES.map((type) => (
                                <label key={type.value} className="cursor-pointer">
                                    <input type="radio" name="iconType" value={type.value} defaultChecked={type.value === 'Globe'} className="peer sr-only" />
                                    <div className="flex flex-col items-center justify-center p-2 rounded-lg border border-gray-200 peer-checked:bg-blue-50 peer-checked:border-[#4285f4] peer-checked:text-[#4285f4] hover:bg-gray-50 transition-all">
                                        <type.icon size={20} />
                                        <span className="text-[10px] mt-1 font-medium truncate w-full text-center">{type.label.split('/')[0]}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700 mt-2">
                        This adds a shortcut to the launcher.
                    </div>
                    <Button type="submit" className="w-full">Add Shortcut</Button>
                </form>
            </Modal>

        </div>
    );
};

export default AppsTab;