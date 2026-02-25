import React, { useState, useEffect } from 'react';
import { X, UserPlus, UserMinus, Users, Shield, Crown } from 'lucide-react';
import { getGroupMembers, addGroupMember, removeGroupMember } from '../../../services/secureshare';

const GroupInfoPanel = ({ group, contacts, currentUser, groupKey, onClose }) => {
    const currentUid = currentUser?.uid;
    const [members, setMembers] = useState([]);
    const [showAddMember, setShowAddMember] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadMembers();
    }, [group.id]);

    const loadMembers = async () => {
        setLoading(true);
        try {
            const memberDocs = await getGroupMembers(group.id);
            // Enrich with contact info
            const enriched = memberDocs.map(m => {
                // For current user, use the auth user object
                if (m.uid === currentUid) {
                    return {
                        ...m,
                        displayName: (currentUser.displayName || 'You') + ' (You)',
                        email: currentUser.email || '',
                        photoURL: currentUser.photoURL || null,
                        isCreator: m.uid === group.createdBy
                    };
                }
                const contact = contacts.find(c => c.id === m.uid);
                return {
                    ...m,
                    displayName: contact?.displayName || m.uid,
                    email: contact?.email || '',
                    photoURL: contact?.photoURL || null,
                    isCreator: m.uid === group.createdBy
                };
            });
            // If current user wasn't in memberDocs at all, add them
            if (!enriched.find(m => m.uid === currentUid)) {
                enriched.push({
                    uid: currentUid,
                    displayName: (currentUser.displayName || 'You') + ' (You)',
                    email: currentUser.email || '',
                    photoURL: currentUser.photoURL || null,
                    isCreator: currentUid === group.createdBy
                });
            }
            setMembers(enriched);
        } catch (e) {
            console.error("Failed to load members:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddMember = async (uid) => {
        try {
            await addGroupMember(group.id, uid, groupKey);
            setShowAddMember(false);
            loadMembers();
        } catch (e) {
            console.error("Failed to add member:", e);
            alert("Failed to add member");
        }
    };

    const handleRemoveMember = async (uid) => {
        if (!confirm("Remove this member from the group?")) return;
        try {
            await removeGroupMember(group.id, uid);
            loadMembers();
        } catch (e) {
            console.error("Failed to remove member:", e);
        }
    };

    const isCreator = currentUid === group.createdBy;
    const nonMembers = contacts.filter(c => !members.some(m => m.uid === c.id));

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">{group.name}</h3>
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Shield size={10} /> E2E Encrypted Group
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Members List */}
                <div className="flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                            Members ({members.length})
                        </p>
                        {isCreator && (
                            <button
                                onClick={() => setShowAddMember(!showAddMember)}
                                className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                            >
                                <UserPlus size={14} /> Add
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-sm text-gray-400">Loading members...</div>
                    ) : (
                        <div className="px-2 pb-4">
                            {members.map(m => (
                                <div key={m.uid} className="flex items-center gap-3 p-3 rounded-xl">
                                    {m.photoURL ? (
                                        <img src={m.photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
                                            {m.displayName?.charAt(0).toUpperCase() || '?'}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm truncate flex items-center gap-1.5">
                                            {m.displayName}
                                            {m.isCreator && <Crown size={12} className="text-yellow-500" />}
                                        </p>
                                        {m.email && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
                                    </div>
                                    {isCreator && m.uid !== currentUid && (
                                        <button
                                            onClick={() => handleRemoveMember(m.uid)}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
                                        >
                                            <UserMinus size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add Member Section */}
                    {showAddMember && nonMembers.length > 0 && (
                        <div className="border-t border-gray-100 px-2 pb-4">
                            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider px-3 pt-4 pb-2">
                                Add Members
                            </p>
                            {nonMembers.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => handleAddMember(c.id)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-green-50 transition-colors"
                                >
                                    {c.photoURL ? (
                                        <img src={c.photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-bold flex-shrink-0">
                                            {c.displayName?.charAt(0).toUpperCase() || '?'}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm truncate">{c.displayName}</p>
                                        <p className="text-xs text-gray-400 truncate">{c.email}</p>
                                    </div>
                                    <UserPlus size={16} className="text-green-500 flex-shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GroupInfoPanel;
