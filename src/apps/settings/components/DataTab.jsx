import React, { useState, useRef } from 'react';
import { Download, Upload, Trash2, AlertTriangle, Database, ChevronDown } from 'lucide-react';
import { Button } from '../../../components/ui';
import { exportUserData, importUserData, wipeAllUserData } from '../../../services/settings';

const DataTab = ({ user, cryptoKey, setLoading, setMessage }) => {
    const fileInputRef = useRef(null);
    const [dangerOpen, setDangerOpen] = useState(false);

    const handleExport = async (singleApp = null) => {
        setLoading(true);
        try {
            const collections = singleApp ? [singleApp] : undefined; // Default is all
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

    return (
        <div className="space-y-4">
            {/* Backup & Restore — always open */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-4 text-gray-800 font-bold border-b border-gray-100 pb-2">
                    <Database size={18} className="text-[#4285f4]" /> Backup & Restore
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

            {/* Danger Zone — collapsed by default */}
            <div className="bg-red-50 rounded-2xl border border-red-100 overflow-hidden">
                <button
                    onClick={() => setDangerOpen(!dangerOpen)}
                    className="w-full p-4 flex items-center gap-2 text-red-700 font-bold text-sm"
                >
                    <AlertTriangle size={18} className="text-red-500" />
                    Danger Zone
                    <ChevronDown size={16} className={`ml-auto text-red-400 transition-transform duration-200 ${dangerOpen ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-200 ease-in-out overflow-hidden ${dangerOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="px-4 pb-4 border-t border-red-100 pt-4">
                        <p className="text-xs text-red-600 mb-4">
                            Permanently delete all tasks, notes, passwords, and finance data. Your account key will remain.
                        </p>
                        <Button onClick={handleWipe} variant="danger" className="w-full">
                            <Trash2 size={16} /> Delete All Data
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataTab;