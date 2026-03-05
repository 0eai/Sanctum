// src/components/ui/WorkspaceSwitcher.jsx
// Header dropdown to switch between Personal vault and shared Workspaces
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, FolderOpen, Users, Plus, Lock } from 'lucide-react';

const WS_STORAGE_KEY = 'sanctum_active_workspace_id';

export const getPersistedWorkspaceId = () => localStorage.getItem(WS_STORAGE_KEY);
export const persistWorkspaceId = (id) => {
    if (id) localStorage.setItem(WS_STORAGE_KEY, id);
    else localStorage.removeItem(WS_STORAGE_KEY);
};

const WorkspaceSwitcher = ({ workspaces, activeWorkspace, onSelect, onCreateNew }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${activeWorkspace
                    ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
            >
                {activeWorkspace ? (
                    <>
                        <Users size={14} className="text-blue-500" />
                        <span className="max-w-[120px] truncate">{activeWorkspace.name}</span>
                    </>
                ) : (
                    <>
                        <Lock size={14} className="text-gray-400" />
                        <span>Personal</span>
                    </>
                )}
                <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    {/* Personal option */}
                    <button
                        onClick={() => { onSelect(null); setIsOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors ${!activeWorkspace ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                            }`}
                    >
                        <Lock size={16} className={!activeWorkspace ? 'text-blue-500' : 'text-gray-400'} />
                        <div className="text-left">
                            <p className="font-medium">Personal Vault</p>
                            <p className="text-xs text-gray-400">Private, encrypted</p>
                        </div>
                    </button>

                    {workspaces.length > 0 && (
                        <>
                            <div className="border-t border-gray-100 px-4 py-2">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Workspaces</span>
                            </div>
                            {workspaces.map(ws => (
                                <button
                                    key={ws.id}
                                    onClick={() => { onSelect(ws); setIsOpen(false); }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${activeWorkspace?.id === ws.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                                        }`}
                                >
                                    <Users size={16} className={activeWorkspace?.id === ws.id ? 'text-blue-500' : 'text-gray-400'} />
                                    <div className="text-left flex-1 min-w-0">
                                        <p className="font-medium truncate">{ws.name}</p>
                                        <p className="text-xs text-gray-400">{ws.memberUids?.length || 1} members</p>
                                    </div>
                                </button>
                            ))}
                        </>
                    )}

                    {/* Create new workspace */}
                    <div className="border-t border-gray-100">
                        <button
                            onClick={() => { onCreateNew(); setIsOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium"
                        >
                            <Plus size={16} />
                            <span>New Workspace</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkspaceSwitcher;
