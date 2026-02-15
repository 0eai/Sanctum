// src/apps/markdown/components/MarkdownCard.jsx
import React from 'react';
import { 
  FileText, Folder, Star, X, Move, Paperclip, Clock 
} from 'lucide-react';

const MarkdownCard = ({ item, docs, onClick, onMove, onDelete }) => {
  
  // Format Date & Time
  const formatDateTime = (dateVal) => {
    if (!dateVal) return '';
    const date = new Date(dateVal);
    // Returns format like "Oct 24, 2025 • 2:30 PM"
    return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  };

  return (
    <div 
        onClick={onClick}
        className={`p-4 rounded-xl shadow-sm border transition-all cursor-pointer group flex flex-col h-44 relative ${item.type === 'folder' ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100 hover:shadow-md'}`}
    >
        {/* Header: Icon, Title, Pin */}
        <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2 flex-1 pr-2">
                {item.type === 'folder' ? (
                    <Folder size={18} className="text-[#4285f4]" />
                ) : (
                    <FileText size={18} className="text-gray-400" />
                )}
                <h3 className={`font-bold line-clamp-1 ${item.type === 'folder' ? 'text-blue-700' : 'text-gray-800'}`}>
                    {item.title || "Untitled"}
                </h3>
            </div>
            {item.isPinned && <Star size={14} className="text-yellow-500 fill-current shrink-0" />}
        </div>
        
        {/* Body Content */}
        {item.type === 'folder' ? (
            <div className="flex-1 flex items-end">
                <span className="text-xs text-blue-400 font-medium">
                    {docs.filter(d => d.parentId === item.id).length} items
                </span>
            </div>
        ) : (
            <>
                <p className="text-xs text-gray-400 font-mono line-clamp-3 flex-1 break-all opacity-70 mb-2">
                    {item.content || "Empty document"}
                </p>
                
                {/* Meta Indicators */}
                <div className="flex gap-2 mb-2">
                    {item.tags?.length > 0 && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center">
                            #{item.tags[0]} {item.tags.length > 1 && `+${item.tags.length - 1}`}
                        </span>
                    )}
                    {item.attachments?.length > 0 && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Paperclip size={10} /> {item.attachments.length}
                        </span>
                    )}
                    {item.dueDate && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${new Date(item.dueDate) < new Date() ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                            <Clock size={10} /> {new Date(item.dueDate).toLocaleDateString(undefined, {month:'numeric', day:'numeric'})}
                        </span>
                    )}
                </div>
            </>
        )}

        {/* Footer: Date/Time & Actions */}
        <div className="flex justify-between items-center mt-auto pt-2 border-t border-black/5">
            <span className="text-[10px] text-gray-400 font-medium">
                {formatDateTime(item.updatedAt)}
            </span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={(e) => { e.stopPropagation(); onMove(item); }} 
                    className="text-gray-300 hover:text-blue-500 p-1"
                >
                    <Move size={14} />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(item); }} 
                    className="text-gray-300 hover:text-red-500 p-1"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    </div>
  );
};

export default MarkdownCard;