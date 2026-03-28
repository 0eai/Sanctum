import React, { useState, useEffect, useMemo } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { Modal, Button, LoadingSpinner } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

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
        <StandardAppLayout
            headerConfig={{
                onBack: onExit,
                title: 'Authenticator',
                icon: ShieldCheck,
                search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search accounts...' },
            }}
            fabConfig={{ onClick: () => openEditor(), icon: <Plus size={28} />, ariaLabel: "Add Account" }}
        >
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
        </StandardAppLayout>
    );
};

export default AuthenticatorApp;
