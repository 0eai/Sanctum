// src/components/ui/viewers/ContactViewer.jsx
import React from 'react';
import { X, Download, User, Phone, Mail, Building, Globe, Calendar, MapPin, Heart } from 'lucide-react';

const InfoSection = ({ icon: Icon, items }) => {
    if (!items || items.length === 0) return null;
    return (
        <div className="space-y-1.5">
            {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl">
                    <Icon size={14} className="text-gray-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-800 break-all">{item.value}</p>
                        {item.label && <p className="text-[10px] text-gray-400">{item.label}</p>}
                    </div>
                </div>
            ))}
        </div>
    );
};

const ContactViewer = ({ artifact, onClose, onImport, isMe }) => {
    const data = artifact?.data || {};
    const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with avatar */}
                <div className="p-5 text-center border-b border-gray-100 shrink-0 relative">
                    <button onClick={onClose} className="absolute top-3 right-3 p-2 hover:bg-gray-100 rounded-full text-gray-400">
                        <X size={20} />
                    </button>
                    <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold mx-auto">
                        {fullName ? fullName.charAt(0).toUpperCase() : <User size={24} />}
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 mt-2 break-words">{fullName || 'Unnamed Contact'}</h2>
                    {data.company && (
                        <p className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-0.5">
                            <Building size={12} /> {data.company}{data.jobTitle ? ` · ${data.jobTitle}` : ''}
                        </p>
                    )}
                    {data.isFavorite && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-pink-500 font-medium">
                            <Heart size={12} fill="currentColor" /> Favorite
                        </span>
                    )}
                </div>

                {/* Details */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <InfoSection icon={Phone} items={data.phones} />
                    <InfoSection icon={Mail} items={data.emails} />
                    <InfoSection icon={MapPin} items={data.addresses} />
                    <InfoSection icon={Globe} items={data.websites} />

                    {data.birthday && (
                        <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl">
                            <Calendar size={14} className="text-gray-400" />
                            <span className="text-sm text-gray-800">{data.birthday}</span>
                        </div>
                    )}

                    {data.notes && (
                        <div className="pt-2 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.notes}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!isMe && onImport && (
                    <div className="shrink-0 border-t border-gray-100 p-3">
                        <button onClick={() => { onImport(artifact); onClose(); }} className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                            <Download size={14} /> Save to Contacts
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContactViewer;
