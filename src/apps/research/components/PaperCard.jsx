import React from 'react';
import {
    FileText, Folder, Star, X, Move, ChevronRight
} from 'lucide-react';

const PaperCard = ({ item, papers, onClick, onMove, onDelete }) => {
    const isFolder = item.type === 'folder';

    const formatDateTime = (dateVal) => {
        if (!dateVal) return '';
        // Handle Firestore Timestamp objects which have a toMillis() method
        const ms = typeof dateVal.toMillis === 'function' ? dateVal.toMillis() : dateVal;
        const date = new Date(ms);
        if (isNaN(date.getTime())) return '';
        return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    };

    // GRID VIEW
    return (
        <div
            onClick={onClick}
            className={`p-4 rounded-xl shadow-sm border transition-all cursor-pointer group flex flex-col h-44 relative ${isFolder ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100 hover:shadow-md'}`}
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 flex-1 pr-2">
                    {isFolder ? (
                        <Folder size={18} className="text-[#4285f4]" />
                    ) : (
                        <FileText size={18} className="text-gray-400" />
                    )}
                    <h3 className={`font-bold line-clamp-1 ${isFolder ? 'text-blue-700' : 'text-gray-800'}`}>
                        {item.title || "Untitled"}
                    </h3>
                </div>
            </div>

            {isFolder ? (
                <div className="flex-1 flex items-end">
                    <span className="text-xs text-blue-400 font-medium">
                        {papers.filter(p => p.parentId === item.id).length} items
                    </span>
                </div>
            ) : (
                <>
                    <p className="text-xs text-gray-400 font-mono line-clamp-2 flex-1 opacity-70 mb-2">
                        {item.authors || "Unknown Authors"}
                        <br />
                        {[item.year, item.venue].filter(Boolean).join(" • ")}
                    </p>

                    <div className="flex gap-2 mb-2">
                        {item.tags?.length > 0 && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center">
                                #{item.tags[0]} {item.tags.length > 1 && `+${item.tags.length - 1}`}
                            </span>
                        )}
                        {item.isPrivate && <span className="text-[10px] bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded">Private</span>}
                        {item.hasPdf && <span className="text-[10px] bg-emerald-50 text-emerald-500 px-1.5 py-0.5 rounded">PDF</span>}
                        {item.aiSummary && <span className="text-[10px] bg-purple-50 text-purple-500 px-1.5 py-0.5 rounded">AI</span>}
                    </div>
                </>
            )}

            <div className="flex justify-between items-center mt-auto pt-2 border-t border-black/5">
                <span className="text-[10px] text-gray-400 font-medium">
                    {formatDateTime(item.updatedAt || item.addedAt)}
                </span>
                <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onMove(item); }} className="text-gray-300 hover:text-blue-500 p-1">
                        <Move size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="text-gray-300 hover:text-red-500 p-1">
                        <X size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaperCard;
