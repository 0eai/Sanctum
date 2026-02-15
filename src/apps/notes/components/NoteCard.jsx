// src/apps/notes/components/NoteCard.jsx
import React from 'react';
import { 
  Folder, FileText, Globe, Star, Clock, RotateCcw, Paperclip, Share2, ArrowRightLeft, Edit2, Trash2, RefreshCw 
} from 'lucide-react';
import { formatBadgeDate } from '../../../lib/dateUtils'; 

const NoteCard = ({ item, viewMode, onOpen, onFolderOpen, onPin, onMove, onEditFolder, onDelete, onShare, onReschedule, folderCounts }) => {
  const isOverdue = item.dueDate && new Date(item.dueDate) < new Date();

  return (
    <div 
        // FIXED: Using URL-driven functions passed from parent
        onClick={() => item.type === 'folder' ? onFolderOpen(item) : onOpen(item)}
        className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative group cursor-pointer active:scale-[0.99] transition-all flex ${viewMode === 'list' ? 'flex-row items-center p-3 gap-3' : 'flex-col p-4 h-48'}`}
    >
        <div className={`flex-shrink-0 flex items-center justify-center rounded-lg ${viewMode === 'list' ? 'w-10 h-10' : 'w-8 h-8 mb-2'} ${item.type === 'folder' ? 'bg-blue-50 text-[#4285f4]' : 'bg-yellow-50 text-yellow-600'}`}>
            {item.type === 'folder' ? <Folder size={20} /> : <FileText size={20} />}
        </div>

        <div className="flex-1 min-w-0 flex flex-col h-full">
            <div className="flex items-center justify-between gap-2">
                <h3 className={`font-bold text-gray-800 truncate ${item.isPinned && item.type !== 'folder' ? 'text-blue-600' : ''}`}>{item.title}</h3>
                <div className="flex items-center gap-1">
                    {item.sharedId && <Globe size={12} className="text-green-500" />}
                    {item.isPinned && <Star size={12} fill="currentColor" className="text-yellow-400 flex-shrink-0" />}
                </div>
            </div>
            
            {item.type === 'folder' ? (
                <p className="text-xs text-blue-400 font-medium mt-1">{folderCounts[item.id] || 0} items</p>
            ) : (
                <>
                    {/* Alert Badge */}
                    {item.dueDate && (
                        <div className={`flex items-center gap-1 mt-1 text-[10px] font-medium w-fit px-1.5 py-0.5 rounded ${isOverdue ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                            <Clock size={10} />
                            {formatBadgeDate(item.dueDate)}
                            {item.repeat !== 'none' && <RotateCcw size={8} className="ml-0.5" />}
                        </div>
                    )}

                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.content || "No content"}</p>
                    
                    <div className="mt-auto flex gap-1 pt-2 flex-wrap">
                        {item.tags.slice(0, 3).map((t, i) => <span key={i} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>)}
                        {item.attachments.length > 0 && <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Paperclip size={8} /> {item.attachments.length}</span>}
                    </div>
                </>
            )}
        </div>

        {/* Reschedule Button */}
        {isOverdue && item.repeat && item.repeat !== 'none' && item.type !== 'folder' && (
            <button 
                onClick={(e) => onReschedule(e, item)}
                className="absolute bottom-2 right-2 bg-blue-500 text-white p-1.5 rounded-full shadow-lg hover:bg-blue-600 transition-colors z-10"
                title="Reschedule"
            >
                <RefreshCw size={14} />
            </button>
        )}

        {/* Action Buttons */}
        <div className={`absolute top-2 right-2 flex flex-col gap-1 transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100 ${viewMode === 'list' ? 'relative top-auto right-auto flex-row' : ''}`}>
            {item.type === 'note' ? (
                <>
                    <button onClick={(e) => onShare(e, item)} className={`p-1.5 bg-white shadow-sm border border-gray-100 rounded-full ${item.sharedId ? 'text-green-500' : 'text-gray-400'} hover:text-blue-500 active:scale-95`}><Share2 size={14} /></button>
                    <button onClick={(e) => onPin(e, item)} className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 hover:text-yellow-500 active:scale-95"><Star size={14} fill={item.isPinned ? "currentColor" : "none"} /></button>
                    <button onClick={(e) => onMove(e, item)} className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 hover:text-green-500 active:scale-95"><ArrowRightLeft size={14} /></button>
                </>
            ) : (
                <button onClick={(e) => onEditFolder(e, item)} className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 hover:text-blue-500 active:scale-95"><Edit2 size={14} /></button>
            )}
            <button onClick={(e) => onDelete(e, item)} className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 hover:text-red-500 active:scale-95"><Trash2 size={14} /></button>
        </div>
    </div>
  );
};

export default NoteCard;