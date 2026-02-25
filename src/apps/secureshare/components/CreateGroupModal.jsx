import React, { useState } from 'react';
import { X, Users, Check } from 'lucide-react';

const CreateGroupModal = ({ contacts, onClose, onCreate }) => {
    const [name, setName] = useState('');
    const [selected, setSelected] = useState([]);

    const toggle = (id) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleCreate = () => {
        if (!name.trim() || selected.length === 0) return;
        onCreate(name.trim(), selected);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Users size={20} className="text-blue-600" /> New Group
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Group Name */}
                <div className="p-4 border-b border-gray-50">
                    <input
                        autoFocus
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Group name..."
                        className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                </div>

                {/* Contact List */}
                <div className="flex-1 overflow-y-auto p-2">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider px-3 py-2">
                        Select members ({selected.length})
                    </p>
                    {contacts.map(c => (
                        <button
                            key={c.id}
                            onClick={() => toggle(c.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${selected.includes(c.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                        >
                            {c.photoURL ? (
                                <img src={c.photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                                    {c.displayName?.charAt(0).toUpperCase() || '?'}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 text-sm truncate">{c.displayName}</p>
                                <p className="text-xs text-gray-400 truncate">{c.email}</p>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${selected.includes(c.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
                                }`}>
                                {selected.includes(c.id) && <Check size={14} />}
                            </div>
                        </button>
                    ))}
                    {contacts.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-8">No contacts available</p>
                    )}
                </div>

                {/* Create Button */}
                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim() || selected.length === 0}
                        className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        Create Group ({selected.length} members)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateGroupModal;
