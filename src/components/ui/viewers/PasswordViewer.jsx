// src/components/ui/viewers/PasswordViewer.jsx
import React, { useState } from 'react';
import { X, Download, KeyRound, Eye, EyeOff, ExternalLink, Copy, Check } from 'lucide-react';

const PasswordViewer = ({ artifact, onClose, onImport, isMe }) => {
    const data = artifact?.data || {};
    const [showPassword, setShowPassword] = useState(false);
    const [copied, setCopied] = useState(null);

    const handleCopy = async (text, field) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(field);
            setTimeout(() => setCopied(null), 2000);
        } catch { }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start gap-3 p-4 border-b border-gray-100 shrink-0">
                    <div className="p-2 rounded-xl bg-red-50 text-red-500 shrink-0">
                        <KeyRound size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Password</p>
                        <h2 className="text-base font-bold text-gray-900 mt-0.5 break-words">{data.service || 'Untitled'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {data.username && (
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Username</p>
                                <p className="text-sm font-medium text-gray-800 truncate mt-0.5">{data.username}</p>
                            </div>
                            <button onClick={() => handleCopy(data.username, 'user')} className="p-2 hover:bg-gray-200 rounded-lg transition-colors shrink-0 ml-2">
                                {copied === 'user' ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-gray-400" />}
                            </button>
                        </div>
                    )}

                    {data.password && (
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Password</p>
                                <p className="text-sm font-mono font-medium text-gray-800 mt-0.5">
                                    {showPassword ? data.password : '•'.repeat(Math.min(data.password.length, 16))}
                                </p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 ml-2">
                                <button onClick={() => setShowPassword(!showPassword)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                                    {showPassword ? <EyeOff size={16} className="text-gray-400" /> : <Eye size={16} className="text-gray-400" />}
                                </button>
                                <button onClick={() => handleCopy(data.password, 'pass')} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                                    {copied === 'pass' ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-gray-400" />}
                                </button>
                            </div>
                        </div>
                    )}

                    {data.url && (
                        <a href={data.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl text-blue-600 hover:bg-blue-100 transition-colors">
                            <ExternalLink size={14} className="shrink-0" />
                            <span className="text-sm font-medium truncate">{data.url}</span>
                        </a>
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
                            <Download size={14} /> Save to Passwords
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PasswordViewer;
