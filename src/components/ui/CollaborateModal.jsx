// src/components/ui/CollaborateModal.jsx
// Modal for per-document sharing — search users, add/remove collaborators
// Supports two modes:
//   1. Existing share: pass shareId + docKey directly
//   2. New share: pass docId + appType + currentUser + cryptoKey + privateKey
//      The component will auto-create the share on first invite.
import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus, UserMinus, Crown, Edit3, Eye, Users, Loader, Check, AlertCircle } from 'lucide-react';
import {
    findUserByEmail, addDocCollaborator, removeDocCollaborator,
    getShareMembers, shareDocument, getDocumentKey
} from '../../services/collaboration';

const ROLES = [
    { value: 'editor', label: 'Editor', icon: Edit3, desc: 'Can edit' },
    { value: 'viewer', label: 'Viewer', icon: Eye, desc: 'Can view' }
];

const CollaborateModal = ({
    isOpen, onClose,
    // Existing share mode
    shareId: initialShareId, docKey: initialDocKey,
    // New share mode
    docId, docTitle, fullDocData, appType, currentUser, privateKey, cryptoKey,
    // Common
    currentUid, onMembersChanged, onShareCreated, onShareDeleted
}) => {
    const [shareId, setShareId] = useState(initialShareId || null);
    const [docKey, setDocKey] = useState(initialDocKey || null);
    const [members, setMembers] = useState([]);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('editor');
    const [loading, setLoading] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const uid = currentUid || currentUser?.uid;

    // Sync external props
    useEffect(() => {
        if (initialShareId) setShareId(initialShareId);
        if (initialDocKey) setDocKey(initialDocKey);
    }, [initialShareId, initialDocKey]);

    // Load members and auto-retrieve docKey when share exists
    useEffect(() => {
        if (!isOpen) return;
        if (shareId) {
            (async () => {
                await loadMembers();
                // Auto-retrieve docKey if missing (it's a CryptoKey that can't be persisted)
                // Only attempt if loadMembers didn't reset the shareId
                if (!docKey && privateKey && uid) {
                    try {
                        const key = await getDocumentKey(shareId, uid, privateKey);
                        if (key) setDocKey(key);
                    } catch (_) { /* Already handled by loadMembers reset */ }
                }
            })();
        } else {
            setMembers([]);
        }
    }, [isOpen, shareId]);

    // Reset state on close
    useEffect(() => {
        if (!isOpen) {
            setEmail('');
            setError(null);
            setSuccess(null);
            // Only reset shareId/docKey if they weren't passed as props
            if (!initialShareId) { setShareId(null); setDocKey(null); }
        }
    }, [isOpen]);

    const loadMembers = async () => {
        if (!shareId) return;
        try {
            const m = await getShareMembers(shareId);
            setMembers(m);
        } catch (e) {
            // Permission denied means the share is stale/broken — reset so user can re-share
            if (e?.code === 'permission-denied' || e?.message?.includes('permissions')) {
                console.warn('Share access denied — resetting stale shareId:', shareId);
                setShareId(null);
                setDocKey(null);
                setMembers([]);
            } else {
                console.error('Failed to load members:', e);
            }
        }
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        if (!email.trim()) return;

        setSearchLoading(true);
        setError(null);
        setSuccess(null);

        try {
            // Look up user
            const targetUser = await findUserByEmail(email.trim());
            if (!targetUser) {
                setError('User not found. They must have a Sanctum account with SecureShare enabled.');
                return;
            }
            if (targetUser.uid === uid) {
                setError('You are already the owner.');
                return;
            }

            let currentShareId = shareId;
            let currentDocKey = docKey;

            // If no share exists yet, create one
            if (!currentShareId && docId && appType && uid && cryptoKey) {
                const docData = fullDocData || { id: docId, title: docTitle || 'Untitled' };
                const result = await shareDocument(
                    uid, cryptoKey, docData, appType, 'document',
                    [uid, targetUser.uid]
                );
                currentShareId = result.shareId;
                currentDocKey = result.docKey;
                setShareId(currentShareId);
                setDocKey(currentDocKey);
                onShareCreated?.(currentShareId, currentDocKey);
            } else if (currentShareId && currentDocKey) {
                // Existing share — check for duplicates
                if (members.some(m => m.uid === targetUser.uid)) {
                    setError('This user is already a collaborator.');
                    return;
                }
                await addDocCollaborator(currentShareId, targetUser.uid, currentDocKey, role);
            } else {
                setError('Unable to share: missing document information.');
                return;
            }

            setSuccess(`${targetUser.displayName || targetUser.email} added as ${role}`);
            setEmail('');
            await loadMembers();
            onMembersChanged?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setSearchLoading(false);
        }
    };

    const handleRemove = async (memberUid) => {
        if (!docKey || !shareId) return;
        setLoading(true);
        try {
            const newKey = await removeDocCollaborator(shareId, memberUid, docKey);
            if (newKey) {
                // Key was rotated — update state and reload
                setDocKey(newKey);
                await loadMembers();
                onMembersChanged?.(newKey);
            } else {
                // Share was deleted (last collaborator removed) — reset everything
                setShareId(null);
                setDocKey(null);
                setMembers([]);
                onShareDeleted?.();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100 }}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-100 rounded-xl">
                            <Users size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">Collaborate</h3>
                            {docTitle && <p className="text-xs text-gray-400 truncate max-w-[200px]">{docTitle}</p>}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/60 rounded-full text-gray-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Invite form */}
                    <form onSubmit={handleInvite} className="space-y-3">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="email"
                                placeholder="Enter email address..."
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={role}
                                onChange={e => setRole(e.target.value)}
                                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {ROLES.map(r => (
                                    <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                                ))}
                            </select>
                            <button
                                type="submit"
                                disabled={searchLoading || !email.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                            >
                                {searchLoading ? <Loader size={14} className="animate-spin" /> : <UserPlus size={14} />}
                                Add
                            </button>
                        </div>
                    </form>

                    {/* Status messages */}
                    {error && (
                        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-xl">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                    {success && (
                        <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-xl">
                            <Check size={14} /> {success}
                        </div>
                    )}

                    {/* Member list */}
                    {members.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                Members ({members.length})
                            </h4>
                            <div className="space-y-2">
                                {members.map(member => (
                                    <div key={member.uid} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        {member.photoURL ? (
                                            <img src={member.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                                                {(member.displayName || member.email || '?')[0].toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-800 truncate">{member.displayName || 'Unknown'}</p>
                                            <p className="text-xs text-gray-400 truncate">{member.email}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${member.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                                            member.role === 'editor' ? 'bg-blue-100 text-blue-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                            {member.role === 'owner' && <Crown size={10} />}
                                            {member.role === 'editor' && <Edit3 size={10} />}
                                            {member.role === 'viewer' && <Eye size={10} />}
                                            {member.role}
                                        </span>
                                        {member.role !== 'owner' && member.uid !== uid && (
                                            <button
                                                onClick={() => handleRemove(member.uid)}
                                                disabled={loading}
                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Remove collaborator"
                                            >
                                                <UserMinus size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty state for new shares */}
                    {members.length === 0 && !shareId && (
                        <div className="text-center py-6 text-gray-400">
                            <Users size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No collaborators yet</p>
                            <p className="text-xs">Enter an email above to invite someone</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CollaborateModal;
