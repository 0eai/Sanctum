import React, { useState, useEffect } from 'react';
import {
    X, FileText, CheckSquare, Bookmark, CreditCard, ChevronRight, Search,
    ClipboardList, FileCode, BellRing, Key, Users, Paperclip
} from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { decryptData } from '../../../lib/crypto';

const APP_TYPES = [
    { id: 'notes', label: 'Notes', icon: FileText, color: 'text-blue-500 bg-blue-50' },
    { id: 'markdown', label: 'Markdown', icon: FileCode, color: 'text-cyan-500 bg-cyan-50' },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, color: 'text-green-500 bg-green-50' },
    { id: 'checklists', label: 'Checklists', icon: ClipboardList, color: 'text-teal-500 bg-teal-50' },
    { id: 'reminders', label: 'Reminders', icon: BellRing, color: 'text-yellow-600 bg-yellow-50' },
    { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark, color: 'text-orange-500 bg-orange-50' },
    { id: 'banking', label: 'Wallet', icon: CreditCard, color: 'text-purple-500 bg-purple-50' },
    { id: 'passwords', label: 'Passwords', icon: Key, color: 'text-red-500 bg-red-50' },
    { id: 'contacts', label: 'Contacts', icon: Users, color: 'text-indigo-500 bg-indigo-50' },
];

/** Extracts a display title from a decrypted item depending on app type */
const getItemTitle = (item, appType) => {
    switch (appType) {
        case 'contacts':
            // contacts.js uses firstName/lastName, not name
            return [item.firstName, item.lastName].filter(Boolean).join(' ') || item.company || 'Untitled Contact';
        case 'passwords':
            // passwords.js uses service, not siteName/site/title
            return item.service || 'Untitled Password';
        case 'banking':
            return item.name || item.title || item.accountName || item.cardName || `${item.type || 'Wallet'} Entry`;
        case 'checklists':
            return item.title || item.name || 'Untitled Checklist';
        case 'reminders':
            return item.title || item.text || 'Untitled Reminder';
        case 'markdown':
            return item.title || 'Untitled Document';
        default:
            return item.title || item.name || 'Untitled';
    }
};

/** Extracts a preview line from a decrypted item */
const getItemPreview = (item, appType) => {
    switch (appType) {
        case 'contacts':
            // contacts.js uses phones[] and emails[] arrays
            const email = item.emails?.[0]?.value || '';
            const phone = item.phones?.[0]?.value || '';
            return [email, phone].filter(Boolean).join(' · ') || item.company || '';
        case 'passwords':
            return item.username || item.url || '';
        case 'banking': {
            const typeLabel = item.type === 'card' ? '💳 Card' : item.type === 'account' ? '🏦 Account' : '📝 Note';
            return typeLabel + (item.notes ? ` · ${item.notes.substring(0, 40)}` : '');
        }
        case 'checklists': {
            const total = item.itemCount || 0;
            const done = item.completedCount || 0;
            return total > 0 ? `${done}/${total} items done` : 'Empty checklist';
        }
        case 'reminders':
            return item.dueDate ? `Due: ${new Date(item.dueDate).toLocaleDateString()}` : (item.date ? `Date: ${new Date(item.date).toLocaleDateString()}` : '');
        case 'markdown':
            return (item.content || '').substring(0, 80);
        default:
            return (item.content || item.url || item.notes || '').substring(0, 80);
    }
};

const ShareMenu = ({ user, cryptoKey, onClose, onShare, onFileUpload }) => {
    const [selectedApp, setSelectedApp] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (selectedApp) {
            loadItems(selectedApp);
        }
    }, [selectedApp]);

    const loadItems = async (appType) => {
        setLoading(true);
        try {
            const snap = await getDocs(
                collection(db, 'artifacts', appId, 'users', user.uid, appType)
            );
            const decryptedItems = [];
            for (const d of snap.docs) {
                try {
                    const raw = d.data();
                    const decrypted = await decryptData(raw, cryptoKey);
                    if (decrypted) {
                        decryptedItems.push({
                            id: d.id,
                            ...decrypted,
                            // Keep plaintext metadata for checklists
                            ...(appType === 'checklists' ? { itemCount: raw.itemCount || 0, completedCount: raw.completedCount || 0 } : {})
                        });
                    }
                } catch (e) {
                    // Skip items that fail to decrypt
                }
            }
            // Filter out trashed items AND folder-type items
            const FOLDER_TYPES = ['folder'];
            setItems(decryptedItems.filter(i => !i.isTrashed && !FOLDER_TYPES.includes(i.type)));
        } catch (e) {
            console.error("Failed to load items:", e);
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = async (item) => {
        const { id, ...cleanData } = item;

        // For checklists, load the subcollection items and include them
        if (selectedApp === 'checklists') {
            try {
                const itemsSnap = await getDocs(
                    query(
                        collection(db, 'artifacts', appId, 'users', user.uid, 'checklists', id, 'items'),
                        orderBy('createdAt', 'asc')
                    )
                );
                const checklistItems = [];
                for (const d of itemsSnap.docs) {
                    try {
                        const raw = d.data();
                        const dec = await decryptData(raw, cryptoKey);
                        if (dec) {
                            checklistItems.push({
                                text: dec.text || '',
                                isCompleted: raw.isCompleted ?? dec.isCompleted ?? false,
                                dueDate: dec.dueDate || null,
                                repeat: dec.repeat || 'none',
                                order: raw.order ?? 0,
                            });
                        }
                    } catch (e) { }
                }
                checklistItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                cleanData.items = checklistItems;
            } catch (e) {
                console.error('Failed to load checklist items:', e);
            }
        }

        const artifact = {
            appType: selectedApp,
            data: cleanData,
            sharedTitle: getItemTitle(item, selectedApp),
            sharedPreview: getItemPreview(item, selectedApp),
        };
        onShare(artifact);
        onClose();
    };

    const filtered = items.filter(item => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const title = getItemTitle(item, selectedApp).toLowerCase();
        return title.includes(q);
    });

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900">
                        {selectedApp ? (
                            <button onClick={() => { setSelectedApp(null); setSearchQuery(''); setItems([]); }} className="flex items-center gap-2 hover:text-blue-600 transition-colors">
                                ← {APP_TYPES.find(a => a.id === selectedApp)?.label}
                            </button>
                        ) : 'Share from...'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                {!selectedApp ? (
                    /* App Type Grid */
                    <div className="p-4 grid grid-cols-3 gap-2 overflow-y-auto">
                        {/* File Upload Option */}
                        <label
                            className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all active:scale-95 cursor-pointer"
                        >
                            <div className="p-2.5 rounded-xl text-gray-500 bg-gray-50">
                                <Paperclip size={22} />
                            </div>
                            <span className="font-medium text-xs text-gray-700">File</span>
                            <input type="file" className="hidden" onChange={(e) => {
                                if (e.target.files[0] && onFileUpload) {
                                    onFileUpload(e.target.files[0]);
                                    onClose();
                                }
                                e.target.value = null;
                            }} />
                        </label>
                        {APP_TYPES.map(app => (
                            <button
                                key={app.id}
                                onClick={() => setSelectedApp(app.id)}
                                className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all active:scale-95"
                            >
                                <div className={`p-2.5 rounded-xl ${app.color}`}>
                                    <app.icon size={22} />
                                </div>
                                <span className="font-medium text-xs text-gray-700">{app.label}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    /* Item List */
                    <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
                        {/* Search */}
                        <div className="p-3 border-b border-gray-50">
                            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                                <Search size={16} className="text-gray-400 flex-shrink-0" />
                                <input
                                    autoFocus
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search..."
                                    className="bg-transparent outline-none text-sm w-full"
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-8 text-center text-sm text-gray-400">Loading items...</div>
                        ) : filtered.length === 0 ? (
                            <div className="p-8 text-center text-sm text-gray-400">No items found</div>
                        ) : (
                            <div className="px-2 pb-4">
                                {filtered.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleSelect(item)}
                                        className="w-full text-left p-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-3"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm text-gray-900 truncate">
                                                {getItemTitle(item, selectedApp)}
                                            </p>
                                            {getItemPreview(item, selectedApp) && (
                                                <p className="text-xs text-gray-400 truncate mt-0.5">
                                                    {getItemPreview(item, selectedApp)}
                                                </p>
                                            )}
                                        </div>
                                        <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ShareMenu;
