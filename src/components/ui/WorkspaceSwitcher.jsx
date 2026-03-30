// src/components/ui/WorkspaceSwitcher.jsx
// Header dropdown to switch between Personal vault and shared Workspaces
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Users, Plus, Lock, Check, X } from 'lucide-react';

const WS_STORAGE_KEY = 'sanctum_active_workspace_id';

export const getPersistedWorkspaceId = () => localStorage.getItem(WS_STORAGE_KEY);
export const persistWorkspaceId = (id) => {
    if (id) localStorage.setItem(WS_STORAGE_KEY, id);
    else localStorage.removeItem(WS_STORAGE_KEY);
};

const WorkspaceSwitcher = ({
    workspaces,
    activeWorkspace,
    onSelect,
    onCreateNew,
    // Naming inline UI props (from useCollaboration.switcherProps)
    isNamingWorkspace,
    workspaceNameDraft,
    onNameDraftChange,
    onConfirmName,
    onCancelName,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);
    const inputRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Focus input when naming state appears
    useEffect(() => {
        if (isNamingWorkspace && isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isNamingWorkspace, isOpen]);

    const handleCreateNew = () => {
        onCreateNew();
        // Keep dropdown open so the naming form appears
    };

    const handleConfirm = () => {
        onConfirmName?.();
        setIsOpen(false);
    };

    const handleCancelName = () => {
        onCancelName?.();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') handleCancelName();
    };

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
                <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    {/* Personal option */}
                    <button
                        onClick={() => { onSelect(null); setIsOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors ${!activeWorkspace ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                    >
                        <Lock size={16} className={!activeWorkspace ? 'text-blue-500' : 'text-gray-400'} />
                        <div className="text-left">
                            <p className="font-medium">Personal Vault</p>
                            <p className="text-xs text-gray-400">Private, encrypted</p>
                        </div>
                        {!activeWorkspace && <Check size={14} className="ml-auto text-blue-500" />}
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
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${activeWorkspace?.id === ws.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                                >
                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                        {ws.name?.[0]?.toUpperCase() || 'W'}
                                    </div>
                                    <div className="text-left flex-1 min-w-0">
                                        <p className="font-medium truncate">{ws.name}</p>
                                        <p className="text-xs text-gray-400">{ws.memberUids?.length || 1} member{ws.memberUids?.length !== 1 ? 's' : ''}</p>
                                    </div>
                                    {activeWorkspace?.id === ws.id && <Check size={14} className="text-blue-500 flex-shrink-0" />}
                                </button>
                            ))}
                        </>
                    )}

                    {/* Inline naming form or "New Workspace" button */}
                    <div className="border-t border-gray-100">
                        {isNamingWorkspace ? (
                            <div className="px-3 py-2.5">
                                <p className="text-xs font-medium text-gray-500 mb-1.5">Workspace name</p>
                                <div className="flex items-center gap-2">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={workspaceNameDraft}
                                        onChange={e => onNameDraftChange?.(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="e.g. Team Project"
                                        maxLength={40}
                                        className="flex-1 px-2.5 py-1.5 text-sm text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                    <button
                                        onClick={handleConfirm}
                                        disabled={!workspaceNameDraft?.trim()}
                                        className="p-1.5 bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
                                        title="Create"
                                    >
                                        <Check size={14} />
                                    </button>
                                    <button
                                        onClick={handleCancelName}
                                        className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors"
                                        title="Cancel"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleCreateNew}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium"
                            >
                                <Plus size={16} />
                                <span>New Workspace</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkspaceSwitcher;
