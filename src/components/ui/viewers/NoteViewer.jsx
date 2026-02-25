// src/components/ui/viewers/NoteViewer.jsx
import React from 'react';
import { X, Download, FileText, Tag, Calendar } from 'lucide-react';

const NoteViewer = ({ artifact, onClose, onImport, isMe }) => {
    const data = artifact?.data || {};

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start gap-3 p-4 border-b border-gray-100 shrink-0">
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-500 shrink-0">
                        <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Note</p>
                        <h2 className="text-base font-bold text-gray-900 mt-0.5 break-words">{data.title || 'Untitled Note'}</h2>
                        {data.dueDate && (
                            <p className="flex items-center gap-1 text-xs text-orange-500 mt-1">
                                <Calendar size={12} /> Due: {new Date(data.dueDate).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {data.content ? (
                        <div className="text-[15px] text-gray-700 whitespace-pre-wrap leading-relaxed">{data.content}</div>
                    ) : (
                        <p className="text-sm text-gray-400 italic">No content</p>
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 border-t border-gray-100 p-3 flex items-center gap-2">
                    {data.tags?.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
                            <Tag size={12} className="text-gray-400 shrink-0" />
                            {data.tags.map((tag, i) => (
                                <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs whitespace-nowrap">{tag}</span>
                            ))}
                        </div>
                    )}
                    {!isMe && onImport && (
                        <button onClick={() => { onImport(artifact); onClose(); }} className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 shrink-0">
                            <Download size={14} /> Save
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NoteViewer;
