// src/apps/contacts/Contacts.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Star, User, Users, Tag } from 'lucide-react';

import { Modal, Button, LoadingSpinner } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

import {
    saveContact, deleteContact
} from './services/contacts';
import { useEncryptedCollection } from '../../hooks/useEncryptedCollection';

import ContactEditor from './components/ContactEditor';
import ContactDetail from './components/ContactDetail';

const TABS = [
    { id: 'all', label: 'All Contacts', icon: Users },
    { id: 'favorites', label: 'Favorites', icon: Star }
];

const ContactsApp = ({ user, cryptoKey, onExit, route, navigate }) => {
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [processing, setProcessing] = useState(false);

    // --- URL-Driven State ---
    const view = route.resource === 'edit' ? 'editor' : route.resource === 'view' ? 'detail' : 'list';

    let activeTab = 'all';
    if (route.resource === 'label' && route.resourceId) {
        activeTab = decodeURIComponent(route.resourceId);
    } else if (['favorites', 'all'].includes(route.resource)) {
        activeTab = route.resource;
    }

    const currentBasePath = route.resource === 'label' ? `#contacts/label/${encodeURIComponent(activeTab)}` : `#contacts/${activeTab}`;

    const selectedContactId = route.resourceId !== 'new' ? route.resourceId : null;
    const selectedContact = selectedContactId ? contacts.find(c => c.id === selectedContactId) : null;
    const editingData = view === 'editor' && selectedContactId ? selectedContact : null;

    const fetchedContacts = useEncryptedCollection(user?.uid, cryptoKey, 'contacts');

    useEffect(() => {
        if (fetchedContacts !== null) {
            setContacts(fetchedContacts);
            setLoading(false);
        }
    }, [fetchedContacts]);

    useEffect(() => {
        const safeId = activeTab.replace(/[^a-zA-Z0-9-_\s]/g, '');
        const tabEl = document.getElementById(`tab-${safeId}`);
        if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [activeTab]);

    // Extract all unique labels
    const allLabels = useMemo(() => {
        const labels = new Set();
        contacts.forEach(c => {
            if (c.labels) c.labels.forEach(l => labels.add(l));
        });
        return Array.from(labels).sort();
    }, [contacts]);

    // Build dynamic tabs: system tabs + label tabs
    const dynamicTabs = useMemo(() => {
        const labelTabs = allLabels.map(label => ({
            id: label,
            label: label,
            icon: Tag,
        }));
        return [...TABS, ...labelTabs];
    }, [allLabels]);

    const groupedContacts = useMemo(() => {
        let filtered = contacts;

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = contacts.filter(c =>
                (c.firstName?.toLowerCase().includes(q)) ||
                (c.lastName?.toLowerCase().includes(q)) ||
                (c.company?.toLowerCase().includes(q)) ||
                (c.phone?.includes(q)) || (c.phones?.some(p => p.value.includes(q))) ||
                (c.email?.toLowerCase().includes(q)) || (c.emails?.some(e => e.value.toLowerCase().includes(q)))
            );
        } else {
            if (activeTab === 'favorites') {
                filtered = contacts.filter(c => c.isFavorite);
            } else if (activeTab !== 'all') {
                filtered = contacts.filter(c => c.labels && c.labels.includes(activeTab));
            }
        }

        const groups = {};
        filtered.forEach(contact => {
            const nameToUse = contact.firstName || contact.lastName || contact.company || '#';
            let firstLetter = nameToUse.charAt(0).toUpperCase();
            if (!/[A-Z]/.test(firstLetter)) firstLetter = '#';

            if (!groups[firstLetter]) groups[firstLetter] = [];
            groups[firstLetter].push(contact);
        });

        return Object.keys(groups).sort().map(letter => ({
            letter,
            items: groups[letter]
        }));
    }, [contacts, searchQuery, activeTab]);

    const handleSave = async (data) => {
        try {
            const savedId = await saveContact(user.uid, cryptoKey, data);
            navigate(`#contacts/view/${savedId}`);
        } catch (error) {
            console.error("Failed to save contact:", error);
            alert("Failed to save contact. Please try again.");
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        await deleteContact(user.uid, deleteConfirm.id);
        setDeleteConfirm(null);
        navigate(currentBasePath);
    };

    const handleToggleFavorite = async (contact) => {
        await saveContact(user.uid, cryptoKey, { ...contact, isFavorite: !contact.isFavorite });
    };

    const handleTabSelect = (tabId) => {
        if (TABS.find(t => t.id === tabId)) {
            navigate(`#contacts/${tabId}`);
        } else {
            navigate(`#contacts/label/${encodeURIComponent(tabId)}`);
        }
    };

    if (view === 'detail' && selectedContact) {
        return (
            <>
                <ContactDetail
                    contact={selectedContact}
                    onBack={() => navigate(currentBasePath)}
                    onEdit={(c) => navigate(`#contacts/edit/${c.id}`)}
                    onDelete={(c) => setDeleteConfirm(c)}
                    onToggleFavorite={handleToggleFavorite}
                />

                <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Contact" zIndex={100}>
                    <div className="flex flex-col gap-4">
                        <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure you want to delete this contact?</div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                            <Button variant="danger" onClick={handleDelete}>Delete</Button>
                        </div>
                    </div>
                </Modal>
            </>
        );
    }

    if (view === 'editor') {
        return <ContactEditor
            contact={editingData}
            allLabels={allLabels}
            onSave={handleSave}
            onBack={() => editingData ? navigate(`#contacts/view/${editingData.id}`) : navigate(currentBasePath)}
        />;
    }

    return (
        <StandardAppLayout
            headerConfig={{
                onBack: onExit,
                title: 'Contacts',
                search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search contacts...' },
                nav: {
                    type: 'tabs',
                    data: dynamicTabs,
                    activeId: activeTab,
                    onSelect: handleTabSelect,
                },
            }}
            fabConfig={{ onClick: () => navigate(`#contacts/edit/new`), icon: <Plus size={28} />, ariaLabel: "Add Contact" }}
        >
            {loading ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : contacts.length === 0 ? (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
                    <div className="bg-gray-50 p-4 rounded-full shadow-sm"><User size={32} /></div>
                    <p>No contacts yet.</p>
                </div>
            ) : groupedContacts.length === 0 ? (
                <div className="text-center py-20 text-gray-400">No matching contacts.</div>
            ) : (
                <div className="flex flex-col">
                    {groupedContacts.map((group) => (
                        <div key={group.letter} className="flex flex-col">
                            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-6 py-2 border-b border-gray-100 z-10 font-bold text-[#4285f4]">
                                {group.letter}
                            </div>
                            <div className="divide-y divide-gray-100">
                                {group.items.map(contact => {
                                    const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.company;
                                    const initial = name ? name.charAt(0).toUpperCase() : '#';

                                    const displayPhone = contact.phones?.[0]?.value || contact.phone;
                                    const displayEmail = contact.emails?.[0]?.value || contact.email;

                                    const rawCustomFields = contact.customFields || [];
                                    const photoUrl = contact.photo || rawCustomFields.find(c => c.label?.toLowerCase() === 'photo')?.value;

                                    return (
                                        <div
                                            key={contact.id}
                                            onClick={() => navigate(`#contacts/view/${contact.id}`)}
                                            className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 cursor-pointer transition-colors group"
                                        >
                                            <div className="w-10 h-10 bg-blue-100 text-[#4285f4] rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 relative overflow-hidden">
                                                <span className="absolute inset-0 flex items-center justify-center">
                                                    {initial}
                                                </span>
                                                {photoUrl && (
                                                    <img
                                                        src={photoUrl}
                                                        alt={name}
                                                        className="w-full h-full object-cover relative z-10"
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-gray-900 truncate">{name}</h3>
                                                {contact.jobTitle && contact.company ? (
                                                    <p className="text-xs text-gray-500 truncate">{contact.jobTitle}, {contact.company}</p>
                                                ) : (displayPhone || displayEmail) ? (
                                                    <p className="text-xs text-gray-500 truncate">{displayPhone || displayEmail}</p>
                                                ) : null}
                                            </div>
                                            {contact.isFavorite && <Star size={16} fill="currentColor" className="text-yellow-400 flex-shrink-0" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Contact">
                <div className="flex flex-col gap-4">
                    <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure you want to delete this contact?</div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                        <Button variant="danger" onClick={handleDelete}>Delete</Button>
                    </div>
                </div>
            </Modal>
        </StandardAppLayout>
    );
};

export default ContactsApp;