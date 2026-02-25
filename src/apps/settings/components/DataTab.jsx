import React, { useState, useRef } from 'react';
import { Download, Upload, Trash2, AlertTriangle, Database, ChevronDown, FileText } from 'lucide-react';
import { Button } from '../../../components/ui';
import { exportUserData, importUserData, wipeAllUserData } from '../../../services/settings';
import { exportContactsCSV, importContactsCSV, importContacts } from '../../../services/contacts';

// Per-app config: collection name, label, supported export/import formats
const APP_DATA_CONFIG = [
    { id: 'notes', label: 'Notes', collection: 'notes', formats: { export: ['json'], import: ['.json'] } },
    { id: 'tasks', label: 'Tasks', collection: 'tasks', formats: { export: ['json'], import: ['.json'] } },
    { id: 'contacts', label: 'Contacts', collection: 'contacts', formats: { export: ['json', 'csv'], import: ['.json', '.csv'] } },
    { id: 'passwords', label: 'Passwords', collection: 'passwords', formats: { export: ['json'], import: ['.json'] } },
    { id: 'bookmarks', label: 'Bookmarks', collection: 'bookmarks', formats: { export: ['json'], import: ['.json'] } },
    { id: 'finance', label: 'Finance', collection: 'finance', formats: { export: ['json'], import: ['.json'] } },
    { id: 'banking', label: 'Banking', collection: 'banking', formats: { export: ['json'], import: ['.json'] } },
    { id: 'checklists', label: 'Checklists', collection: 'checklists', formats: { export: ['json'], import: ['.json'] } },
    { id: 'counters', label: 'Counters', collection: 'counters', formats: { export: ['json'], import: ['.json'] } },
];

const CollapsibleCard = ({ title, icon: Icon, children, defaultOpen = false, variant = 'default' }) => {
    const [open, setOpen] = useState(defaultOpen);
    const isRed = variant === 'danger';
    return (
        <div className={`rounded-2xl shadow-sm border overflow-hidden ${isRed ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
            <button
                onClick={() => setOpen(!open)}
                className={`w-full p-4 flex items-center gap-2 font-bold text-sm transition-colors ${isRed ? 'text-red-700' : 'text-gray-800'}`}
            >
                {Icon && <Icon size={18} className={isRed ? 'text-red-500' : 'text-[#4285f4]'} />}
                {title}
                <ChevronDown size={16} className={`ml-auto transition-transform duration-200 ${isRed ? 'text-red-400' : 'text-gray-400'} ${open ? 'rotate-180' : ''}`} />
            </button>
            <div className={`transition-all duration-200 ease-in-out overflow-hidden ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className={`px-4 pb-4 ${isRed ? 'border-t border-red-100' : 'border-t border-gray-100'} pt-4`}>
                    {children}
                </div>
            </div>
        </div>
    );
};

const DataTab = ({ user, cryptoKey, setLoading, setMessage }) => {
    const fileInputRef = useRef(null);
    const appFileInputRef = useRef(null);
    const [selectedApp, setSelectedApp] = useState(APP_DATA_CONFIG[0].id);
    const [appProcessing, setAppProcessing] = useState(false);

    // --- Full Backup ---
    const handleExport = async (singleApp = null) => {
        setLoading(true);
        try {
            const collections = singleApp ? [singleApp] : undefined;
            const data = await exportUserData(user.uid, cryptoKey, collections);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sanctum_backup_${singleApp || 'full'}_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setMessage({ type: 'success', text: "Export successful." });
        } catch (e) {
            console.error(e);
            setMessage({ type: 'error', text: "Export failed." });
        } finally {
            setLoading(false);
        }
    };

    const handleImport = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            setLoading(true);
            try {
                const json = JSON.parse(event.target.result);
                await importUserData(user.uid, cryptoKey, json);
                setMessage({ type: 'success', text: "Import successful! Please refresh." });
            } catch (e) {
                console.error(e);
                setMessage({ type: 'error', text: "Import failed. Invalid file?" });
            } finally {
                setLoading(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    // --- Per-App Export ---
    const handleAppExport = async (format) => {
        setAppProcessing(true);
        try {
            if (selectedApp === 'contacts' && format === 'csv') {
                const csvText = await exportContactsCSV(user.uid, cryptoKey);
                const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `contacts_export_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                await handleExport(selectedApp);
            }
            setMessage({ type: 'success', text: `Exported ${selectedApp} successfully.` });
        } catch (e) {
            setMessage({ type: 'error', text: `Export failed.` });
        } finally {
            setAppProcessing(false);
        }
    };

    // --- Per-App Import ---
    const handleAppImport = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAppProcessing(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const appConfig = APP_DATA_CONFIG.find(a => a.id === selectedApp);

                if (selectedApp === 'contacts' && file.name.toLowerCase().endsWith('.csv')) {
                    const count = await importContactsCSV(user.uid, cryptoKey, text);
                    setMessage({ type: 'success', text: `Imported ${count} contacts from CSV.` });
                } else if (selectedApp === 'contacts' && file.name.toLowerCase().endsWith('.json')) {
                    const json = JSON.parse(text);
                    // If it's a flat array of contacts, use importContacts
                    if (Array.isArray(json)) {
                        const count = await importContacts(user.uid, cryptoKey, json);
                        setMessage({ type: 'success', text: `Imported ${count} contacts.` });
                    } else {
                        // Standard Sanctum backup format
                        await importUserData(user.uid, cryptoKey, json);
                        setMessage({ type: 'success', text: `Imported contacts successfully.` });
                    }
                } else {
                    // Generic JSON import for all other apps
                    const json = JSON.parse(text);
                    await importUserData(user.uid, cryptoKey, json);
                    setMessage({ type: 'success', text: `Imported ${appConfig?.label || selectedApp} data.` });
                }
            } catch (e) {
                console.error(e);
                setMessage({ type: 'error', text: "Import failed. Invalid file format?" });
            } finally {
                setAppProcessing(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleWipe = async () => {
        const confirmStr = "DELETE EVERYTHING";
        const input = prompt(`WARNING: This will permanently delete ALL your data.\nTo confirm, type "${confirmStr}":`);
        if (input !== confirmStr) return;
        setLoading(true);
        try {
            await wipeAllUserData(user.uid);
            setMessage({ type: 'success', text: "All data erased." });
            window.location.reload();
        } catch (e) {
            setMessage({ type: 'error', text: "Wipe failed." });
        } finally {
            setLoading(false);
        }
    };

    const currentAppConfig = APP_DATA_CONFIG.find(a => a.id === selectedApp);

    return (
        <div className="space-y-4">
            {/* Full Backup & Restore */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-4 text-gray-800 font-bold border-b border-gray-100 pb-2">
                    <Database size={18} className="text-[#4285f4]" /> Full Backup & Restore
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Button onClick={() => handleExport()} variant="secondary" className="flex flex-col items-center py-4 h-auto gap-2 min-h-[56px]">
                        <Download size={24} /> <span>Export All Data</span>
                    </Button>
                    <Button onClick={() => fileInputRef.current.click()} variant="secondary" className="flex flex-col items-center py-4 h-auto gap-2">
                        <Upload size={24} /> <span>Import Data</span>
                    </Button>
                    <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />
                </div>
            </div>

            {/* Per-App Import/Export */}
            <CollapsibleCard title="App Import / Export" icon={FileText}>
                <div className="space-y-4">
                    <p className="text-xs text-gray-500">Export or import data for individual apps. Contacts support CSV format.</p>

                    {/* App Selector */}
                    <select
                        value={selectedApp}
                        onChange={(e) => setSelectedApp(e.target.value)}
                        className="w-full p-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-[#4285f4] outline-none bg-white"
                    >
                        {APP_DATA_CONFIG.map(app => (
                            <option key={app.id} value={app.id}>{app.label}</option>
                        ))}
                    </select>

                    {/* Export Buttons */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Export</label>
                        <div className="grid grid-cols-2 gap-2">
                            {currentAppConfig?.formats.export.map(fmt => (
                                <Button
                                    key={fmt}
                                    onClick={() => handleAppExport(fmt)}
                                    variant="secondary"
                                    disabled={appProcessing}
                                    className="flex items-center justify-center gap-2 py-3"
                                >
                                    <Download size={16} /> {fmt.toUpperCase()}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Import Button */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Import</label>
                        <Button
                            onClick={() => appFileInputRef.current.click()}
                            variant="secondary"
                            disabled={appProcessing}
                            className="w-full flex items-center justify-center gap-2 py-3"
                        >
                            <Upload size={16} /> Import {currentAppConfig?.label}
                        </Button>
                        <p className="text-[11px] text-gray-400 text-center">
                            Accepted: {currentAppConfig?.formats.import.join(', ')}
                        </p>
                        <input
                            type="file"
                            ref={appFileInputRef}
                            onChange={handleAppImport}
                            accept={currentAppConfig?.formats.import.join(',')}
                            className="hidden"
                        />
                    </div>
                </div>
            </CollapsibleCard>

            {/* Danger Zone */}
            <CollapsibleCard title="Danger Zone" icon={AlertTriangle} variant="danger">
                <p className="text-xs text-red-600 mb-4">
                    Permanently delete all tasks, notes, passwords, and finance data. Your account key will remain.
                </p>
                <Button onClick={handleWipe} variant="danger" className="w-full">
                    <Trash2 size={16} /> Delete All Data
                </Button>
            </CollapsibleCard>
        </div>
    );
};

export default DataTab;