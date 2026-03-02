import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Plus, Search, ShieldCheck, X } from 'lucide-react';
import { Modal, Button, LoadingSpinner } from '../../components/ui';
import Fab from '../../components/ui/Fab';

import {
    listenToAuthenticators, saveAuthenticator, deleteAuthenticator
} from './services/authenticator';

import AuthCard from './components/AuthCard';
import AuthEditor from './components/AuthEditor';

const AuthenticatorApp = ({ user, cryptoKey, onExit, route, navigate }) => {
    const [authenticators, setAuthenticators] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        if (!user || !cryptoKey) return;
        const unsub = listenToAuthenticators(user.uid, cryptoKey, (data) => {
            setAuthenticators(data);
            setLoading(false);
        });
        return () => unsub();
    }, [user, cryptoKey]);

    const displayedItems = useMemo(() => {
        if (!searchQuery.trim()) return authenticators;
        const q = searchQuery.toLowerCase();
        return authenticators.filter(a =>
            a.service?.toLowerCase().includes(q) ||
            a.account?.toLowerCase().includes(q)
        );
    }, [authenticators, searchQuery]);

    const handleSave = async (data) => {
        try {
            await saveAuthenticator(user.uid, cryptoKey, data);
            setIsEditorOpen(false);
            setEditingItem(null);
        } catch (e) {
            alert("Failed to save. Ensure the secret is valid Base32.");
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        await deleteAuthenticator(user.uid, deleteConfirm.id);
        setDeleteConfirm(null);
    };

    const openEditor = (item = null) => {
        setEditingItem(item);
        setIsEditorOpen(true);
    };
    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
            <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
                <div className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                                <ChevronLeft />
                            </button>
                            <h1 className="text-xl font-bold flex items-center gap-2">
                                <ShieldCheck size={20} /> Authenticator
                            </h1>
                        </div>
                    </div>

                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search accounts..."
                            className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4">
                <div className="max-w-3xl mx-auto pb-32">
                    {loading ? (
                        <div className="flex justify-center py-20"><LoadingSpinner /></div>
                    ) : displayedItems.length === 0 ? (
                        <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
                            <div className="bg-white p-4 rounded-full shadow-sm"><ShieldCheck size={32} className="opacity-50" /></div>
                            <p>{searchQuery ? "No accounts found." : "No accounts added yet."}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {displayedItems.map(item => (
                                <AuthCard
                                    key={item.id}
                                    item={item}
                                    onEdit={openEditor}
                                    onDelete={setDeleteConfirm}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Fab onClick={() => openEditor()} icon={<Plus size={28} />} maxWidth="max-w-4xl" ariaLabel="Add Account" />

            {/* Modals */}
            {isEditorOpen && (
                <AuthEditor
                    isOpen={isEditorOpen}
                    item={editingItem}
                    onClose={() => { setIsEditorOpen(false); setEditingItem(null); }}
                    onSave={handleSave}
                />
            )}

            <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Account" zIndex={100}>
                <div className="flex flex-col gap-4">
                    <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
                        Are you sure you want to delete the 2FA codes for <b>{deleteConfirm?.service}</b>? You will be permanently locked out if you haven't backed up the secret elsewhere.
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                        <Button variant="danger" onClick={handleDelete}>Delete Permanently</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AuthenticatorApp;
