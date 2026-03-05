// src/components/ui/WorkspacePanel.jsx
// Side panel for workspace management — invite/remove members, rename, delete
import React, { useState, useEffect } from 'react';
import {
    X, Users, UserPlus, UserMinus, Crown, Edit3, Eye, Search,
    Loader, Check, AlertCircle, Trash2, Settings
} from 'lucide-react';
import { inviteMember, removeMember, getWorkspaceMembers } from '../../services/workspace';
import { findUserByEmail } from '../../services/collaboration';

const WorkspacePanel = ({ isOpen, onClose, workspace, workspaceKey, currentUid, onKeyRotated, onDelete }) => {
    const [members, setMembers] = useState([]);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('editor');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        if (isOpen && workspace?.id) loadMembers();
    }, [isOpen, workspace?.id]);

    const loadMembers = async () => {
        try {
            const m = await getWorkspaceMembers(workspace.id);
            setMembers(m);
        } catch (e) {
            console.error('Failed to load members:', e);
        }
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        if (!email.trim() || !workspaceKey) return;
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const user = await findUserByEmail(email.trim());
            if (!user) { setError('User not found. They need a Sanctum account with SecureShare enabled.'); return; }
            if (members.some(m => m.uid === user.uid)) { setError('Already a member.'); return; }

            await inviteMember(workspace.id, user.uid, workspaceKey, role);
            setSuccess(`${user.displayName || user.email} added!`);
            setEmail('');
            await loadMembers();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async (uid) => {
        setLoading(true);
        try {
            const newKey = await removeMember(workspace.id, uid);
            await loadMembers();
            if (newKey) onKeyRotated?.(newKey);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        try {
            await onDelete?.(workspace.id);
            onClose();
        } catch (err) {
            setError(err.message);
        }
    };

    if (!isOpen) return null;

    const isOwner = workspace?.createdBy === currentUid;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100 }}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-100 rounded-xl">
                            <Settings size={18} className="text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">{workspace?.name || 'Workspace'}</h3>
                            <p className="text-xs text-gray-400">{members.length} members</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/60 rounded-full text-gray-500">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Invite */}
                    <form onSubmit={handleInvite} className="space-y-3">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="email"
                                placeholder="Invite by email..."
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={role}
                                onChange={e => setRole(e.target.value)}
                                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="editor">Editor</option>
                                <option value="viewer">Viewer</option>
                            </select>
                            <button
                                type="submit"
                                disabled={loading || !email.trim()}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                            >
                                {loading ? <Loader size={14} className="animate-spin" /> : <UserPlus size={14} />}
                                Invite
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

                    {/* Members */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Members</h4>
                        <div className="space-y-2">
                            {members.map(member => (
                                <div key={member.uid} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                    {member.photoURL ? (
                                        <img src={member.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                            {(member.displayName || '?')[0].toUpperCase()}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{member.displayName}</p>
                                        <p className="text-xs text-gray-400 truncate">{member.email}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${member.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                                            member.role === 'editor' ? 'bg-blue-100 text-blue-700' :
                                                'bg-gray-100 text-gray-600'
                                        }`}>
                                        {member.role === 'owner' && <Crown size={10} className="inline mr-1" />}
                                        {member.role}
                                    </span>
                                    {isOwner && member.role !== 'owner' && (
                                        <button
                                            onClick={() => handleRemove(member.uid)}
                                            disabled={loading}
                                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <UserMinus size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Delete workspace (owner only) */}
                    {isOwner && (
                        <div className="pt-2 border-t border-gray-100">
                            <button
                                onClick={handleDelete}
                                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${confirmDelete
                                        ? 'bg-red-600 text-white hover:bg-red-700'
                                        : 'text-red-500 hover:bg-red-50'
                                    }`}
                            >
                                <Trash2 size={14} />
                                {confirmDelete ? 'Confirm Delete Workspace' : 'Delete Workspace'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorkspacePanel;
