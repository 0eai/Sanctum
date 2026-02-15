// src/apps/bookmarks/components/ViewBookmarkModal.jsx
import React from 'react';
import { 
  Globe, Folder, Copy, ExternalLink, Trash2, Pencil, Check 
} from 'lucide-react';
import { Modal, Button } from '../../../components/ui';
import { normalizeUrl } from '../../../lib/bookmarkUtils';

const ViewBookmarkModal = ({ item, onClose, onEdit, onDelete, copyUtils }) => {
  if (!item) return null;

  const { copy, copiedId } = copyUtils;
  const isFolder = item.type === 'folder';

  return (
    <Modal isOpen={!!item} onClose={onClose} title="Item Details">
      <div className="flex flex-col gap-6">
        
        {/* Header Section */}
        <div className="flex items-start gap-4">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${isFolder ? 'bg-blue-100 text-blue-600' : 'bg-gray-100'}`}>
                {isFolder ? <Folder size={32} /> : (
                    <img 
                        src={`https://www.google.com/s2/favicons?sz=128&domain_url=${item.url}`} 
                        alt="icon" 
                        className="h-10 w-10" 
                        onError={(e) => { e.target.style.display = 'none'; }} // FIXED: Removed raw HTML injection
                    />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-gray-900 leading-snug break-words">{item.title}</h3>
                <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-wider">{item.type}</p>
            </div>
        </div>

        {/* URL Section (Bookmarks Only) */}
        {!isFolder && (
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400 uppercase">Destination URL</label>
                <a href={normalizeUrl(item.url)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all text-sm font-medium leading-relaxed">
                    {item.url}
                </a>
                <div className="flex gap-2 mt-2">
                    <Button 
                        variant="secondary" 
                        onClick={() => window.open(normalizeUrl(item.url), '_blank')} 
                        className="flex-1 text-xs h-9 bg-white"
                    >
                        <ExternalLink size={14} className="mr-2" /> Open
                    </Button>
                    <Button 
                        variant="secondary" 
                        onClick={() => copy(item.url, 'modal-copy')} 
                        className="flex-1 text-xs h-9 bg-white"
                    >
                        {copiedId === 'modal-copy' ? <Check size={14} className="mr-2 text-green-600" /> : <Copy size={14} className="mr-2" />} 
                        {copiedId === 'modal-copy' ? 'Copied' : 'Copy'}
                    </Button>
                </div>
            </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button 
                variant="secondary" 
                onClick={() => { onClose(); onEdit(item); }} 
                className="flex-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
            >
                <Pencil size={16} className="mr-2" /> Edit
            </Button>
            <Button 
                variant="danger" 
                onClick={() => { onClose(); onDelete(item); }} 
                className="flex-1"
            >
                <Trash2 size={16} className="mr-2" /> Delete
            </Button>
        </div>

      </div>
    </Modal>
  );
};

export default ViewBookmarkModal;