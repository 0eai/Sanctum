// src/components/ui/CollaborateModal.jsx
// Two-tab modal:
//   Tab 1 "Collaborators" — E2EE per-user sharing via RSA-wrapped doc key
//   Tab 2 "Public Link"   — AES-encrypted read-only public link via sharing.js
import { useState, useEffect } from 'react';
import {
    X, Search, UserPlus, UserMinus, Crown, Edit3, Eye, Users, Loader,
    Check, AlertCircle, Link, Copy, Trash2, Globe, Lock, RefreshCw
} from 'lucide-react';
import {
    findUserByEmail, addDocCollaborator, removeDocCollaborator,
    getShareMembers, shareDocument, getDocumentKey
} from '../../services/collaboration';
import { shareItem, unshareItem, buildShareUrl } from '../../services/sharing';

const ROLES = [
    { value: 'editor', label: 'Editor', icon: Edit3, desc: 'Can edit' },
    { value: 'viewer', label: 'Viewer', icon: Eye, desc: 'Can view' }
];

const TTL_OPTIONS = [
    { label: '1 day',   minutes: 24 * 60 },
    { label: '7 days',  minutes: 7 * 24 * 60 },
    { label: '30 days', minutes: 30 * 24 * 60 },
    { label: 'Never',   minutes: 365 * 24 * 60 },
];

// ─── Tab 1: Collaborators ────────────────────────────────────────────────────

const CollaboratorsTab = ({
    isOpen, shareId: initialShareId, docKey: initialDocKey,
    docId, docTitle, fullDocData, appType, currentUser, privateKey, cryptoKey,
    currentUid, onMembersChanged, onShareCreated, onShareDeleted,
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

    useEffect(() => {
        if (initialShareId) setShareId(initialShareId);
        if (initialDocKey) setDocKey(initialDocKey);
    }, [initialShareId, initialDocKey]);

    useEffect(() => {
        if (!isOpen) return;
        if (shareId) {
            (async () => {
                await loadMembers();
                if (!docKey && privateKey && uid) {
                    try {
                        const key = await getDocumentKey(shareId, uid, privateKey);
                        if (key) setDocKey(key);
                    } catch (_) { }
                }
            })();
        } else {
            setMembers([]);
        }
    }, [isOpen, shareId]);

    useEffect(() => {
        if (!isOpen) {
            setEmail(''); setError(null); setSuccess(null);
            if (!initialShareId) { setShareId(null); setDocKey(null); }
        }
    }, [isOpen]);

    const loadMembers = async () => {
        if (!shareId) return;
        try {
            const m = await getShareMembers(shareId);
            setMembers(m);
        } catch (e) {
            if (e?.code === 'permission-denied' || e?.message?.includes('permissions')) {
                setShareId(null); setDocKey(null); setMembers([]);
            }
        }
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setSearchLoading(true); setError(null); setSuccess(null);
        try {
            const targetUser = await findUserByEmail(email.trim());
            if (!targetUser) { setError('User not found. They must have a Sanctum account with SecureShare enabled.'); return; }
            if (targetUser.uid === uid) { setError('You are already the owner.'); return; }

            let curShareId = shareId, curDocKey = docKey;
            if (!curShareId && docId && appType && uid && cryptoKey) {
                const docData = fullDocData || { id: docId, title: docTitle || 'Untitled' };
                const result = await shareDocument(uid, cryptoKey, docData, appType, 'document', [uid, targetUser.uid]);
                curShareId = result.shareId; curDocKey = result.docKey;
                setShareId(curShareId); setDocKey(curDocKey);
                onShareCreated?.(curShareId, curDocKey);
            } else if (curShareId && curDocKey) {
                if (members.some(m => m.uid === targetUser.uid)) { setError('This user is already a collaborator.'); return; }
                await addDocCollaborator(curShareId, targetUser.uid, curDocKey, role);
            } else {
                setError('Unable to share: missing document information.'); return;
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
            if (newKey) { setDocKey(newKey); await loadMembers(); onMembersChanged?.(newKey); }
            else { setShareId(null); setDocKey(null); setMembers([]); onShareDeleted?.(); }
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    return (
        <div className="space-y-4">
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
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                                    member.role === 'owner' ? 'bg-amber-100 text-amber-700' :
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

            {members.length === 0 && !shareId && (
                <div className="text-center py-6 text-gray-400">
                    <Users size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No collaborators yet</p>
                    <p className="text-xs">Enter an email above to invite someone</p>
                </div>
            )}
        </div>
    );
};

// ─── Tab 2: Public Link ──────────────────────────────────────────────────────

const PublicLinkTab = ({ fullDocData, existingSharedId, existingShareUrlKey, onLinkCreated, onLinkRevoked }) => {
    const [sharedId, setSharedId] = useState(existingSharedId || null);
    const [shareUrlKey, setShareUrlKey] = useState(existingShareUrlKey || null);
    const [ttlMinutes, setTtlMinutes] = useState(TTL_OPTIONS[1].minutes); // 7 days default
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (existingSharedId) setSharedId(existingSharedId);
        if (existingShareUrlKey) setShareUrlKey(existingShareUrlKey);
    }, [existingSharedId, existingShareUrlKey]);

    const shareUrl = sharedId && shareUrlKey ? buildShareUrl(sharedId, shareUrlKey) : null;

    const handleCreate = async () => {
        if (!fullDocData) { setError('No document data to share.'); return; }
        setLoading(true); setError(null);
        try {
            const { sharedId: id, shareUrlKey: key } = await shareItem(fullDocData, ttlMinutes);
            setSharedId(id); setShareUrlKey(key);
            onLinkCreated?.(id, key);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRevoke = async () => {
        if (!sharedId) return;
        setLoading(true); setError(null);
        try {
            await unshareItem(sharedId);
            setSharedId(null); setShareUrlKey(null);
            onLinkRevoked?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerate = async () => {
        if (!fullDocData) { setError('No document data to share.'); return; }
        setLoading(true); setError(null);
        try {
            if (sharedId) await unshareItem(sharedId);
            const { sharedId: id, shareUrlKey: key } = await shareItem(fullDocData, ttlMinutes);
            setSharedId(id); setShareUrlKey(key);
            onLinkCreated?.(id, key);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Failed to copy to clipboard.');
        }
    };

    return (
        <div className="space-y-4">
            {/* Info banner */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <Lock size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                    Content is <strong>AES-256-GCM encrypted</strong>. The decryption key lives only in the URL fragment and is never sent to any server. Anyone with the link can view it.
                </p>
            </div>

            {shareUrl ? (
                /* Active link UI */
                <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                        <Globe size={14} className="text-green-500 flex-shrink-0" />
                        <span className="flex-1 text-xs text-gray-600 truncate font-mono">{shareUrl}</span>
                        <button
                            onClick={handleCopy}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                        >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleRegenerate}
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {loading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            New link
                        </button>
                        <button
                            onClick={handleRevoke}
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {loading ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            Revoke
                        </button>
                    </div>
                </div>
            ) : (
                /* Create link UI */
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Link expires after</label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {TTL_OPTIONS.map(opt => (
                                <button
                                    key={opt.minutes}
                                    onClick={() => setTtlMinutes(opt.minutes)}
                                    className={`py-2 rounded-lg text-xs font-medium transition-colors ${ttlMinutes === opt.minutes ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={handleCreate}
                        disabled={loading || !fullDocData}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                        {loading ? <Loader size={14} className="animate-spin" /> : <Link size={14} />}
                        Create Public Link
                    </button>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-xl">
                    <AlertCircle size={14} /> {error}
                </div>
            )}
        </div>
    );
};

// ─── Root modal ──────────────────────────────────────────────────────────────

const CollaborateModal = ({
    isOpen, onClose,
    // Existing share mode
    shareId, docKey,
    // New share mode
    docId, docTitle, fullDocData, appType, currentUser, privateKey, cryptoKey,
    // Public link state (persisted by the parent app)
    publicSharedId, publicShareUrlKey,
    // Common
    currentUid, onMembersChanged, onShareCreated, onShareDeleted,
    onPublicLinkCreated, onPublicLinkRevoked,
    // Default tab
    defaultTab,
}) => {
    const [tab, setTab] = useState(defaultTab || 'collab');

    useEffect(() => {
        if (!isOpen) setTab(defaultTab || 'collab');
    }, [isOpen, defaultTab]);

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
                            <h3 className="text-lg font-bold text-gray-800">Share</h3>
                            {docTitle && <p className="text-xs text-gray-400 truncate max-w-[200px]">{docTitle}</p>}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/60 rounded-full text-gray-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                    <button
                        onClick={() => setTab('collab')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${tab === 'collab' ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Users size={14} />
                        Collaborators
                    </button>
                    <button
                        onClick={() => setTab('link')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${tab === 'link' ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Globe size={14} />
                        Public Link
                        {publicSharedId && <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-0.5" />}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {tab === 'collab' ? (
                        <CollaboratorsTab
                            isOpen={isOpen}
                            shareId={shareId} docKey={docKey}
                            docId={docId} docTitle={docTitle} fullDocData={fullDocData}
                            appType={appType} currentUser={currentUser}
                            privateKey={privateKey} cryptoKey={cryptoKey}
                            currentUid={currentUid}
                            onMembersChanged={onMembersChanged}
                            onShareCreated={onShareCreated}
                            onShareDeleted={onShareDeleted}
                        />
                    ) : (
                        <PublicLinkTab
                            fullDocData={fullDocData}
                            existingSharedId={publicSharedId}
                            existingShareUrlKey={publicShareUrlKey}
                            onLinkCreated={onPublicLinkCreated}
                            onLinkRevoked={onPublicLinkRevoked}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default CollaborateModal;
