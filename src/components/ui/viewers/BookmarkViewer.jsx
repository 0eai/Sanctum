// src/components/ui/viewers/BookmarkViewer.jsx
import React from 'react';
import { X, Download, Bookmark, ExternalLink } from 'lucide-react';

const BookmarkViewer = ({ artifact, onClose, onImport, isMe }) => {
    const data = artifact?.data || {};

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start gap-3 p-4 border-b border-gray-100 shrink-0">
                    <div className="p-2 rounded-xl bg-orange-50 text-orange-500 shrink-0">
                        <Bookmark size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bookmark</p>
                        <h2 className="text-base font-bold text-gray-900 mt-0.5 break-words">{data.title || 'Untitled Bookmark'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {data.url && (
                        <a
                            href={data.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                            <ExternalLink size={16} className="shrink-0" />
                            <span className="text-sm font-medium truncate">{data.url}</span>
                        </a>
                    )}
                </div>

                {/* Footer */}
                {!isMe && onImport && (
                    <div className="shrink-0 border-t border-gray-100 p-3">
                        <button onClick={() => { onImport(artifact); onClose(); }} className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                            <Download size={14} /> Save to Bookmarks
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BookmarkViewer;
