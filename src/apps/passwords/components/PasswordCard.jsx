// src/apps/passwords/components/PasswordCard.jsx
import React from 'react';
import { Key, User, Check, Copy, Clock, Folder, MoreHorizontal, ArrowRightLeft } from 'lucide-react';
import { formatDate } from '../../../lib/dateUtils';

const PasswordCard = ({ item, onEdit, onEnterFolder, copyUtils, isGrouped = false, onMove }) => {
  const { copy, copiedId } = copyUtils;

  if (item.type === 'folder') {
      return (
        <div 
          onClick={(e) => { e.stopPropagation(); onEnterFolder(item); }}
          className="bg-blue-50/50 rounded-xl shadow-sm border border-blue-100 p-4 flex items-center gap-4 group active:scale-[0.99] transition-all cursor-pointer hover:border-blue-300"
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 text-[#4285f4] flex items-center justify-center flex-shrink-0">
            <Folder size={20} fill="currentColor" className="opacity-90" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-blue-900 truncate">{item.title}</h3>
            <p className="text-xs text-blue-400 font-medium mt-1 flex items-center gap-1">Folder</p>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            className="p-2 text-gray-300 hover:text-blue-500 hover:bg-white rounded-full transition-colors"
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
      );
  }

  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onEdit(item); }}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 group active:scale-[0.99] transition-all cursor-pointer hover:border-blue-200 ${isGrouped ? 'ml-8 border-l-4 border-l-blue-100' : ''}`}
    >
      {!isGrouped && (
        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0 font-bold text-lg">
          {item.service ? item.service[0].toUpperCase() : <Key size={20} />}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {!isGrouped && <h3 className="font-bold text-gray-800 truncate">{item.service || "Untitled"}</h3>}
        <p className="text-sm font-medium text-gray-700 truncate">{item.username || "No username"}</p>
        <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Clock size={10} /> Updated: {formatDate(item.updatedAt || item.createdAt)}
            </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {onMove && (
            <button 
              onClick={(e) => { e.stopPropagation(); onMove(item); }}
              title="Move to Folder"
              className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors hidden sm:flex"
            >
              <ArrowRightLeft size={16} />
            </button>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); copy(item.username, `user-${item.id}`); }}
          className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
        >
          {copiedId === `user-${item.id}` ? <Check size={16} className="text-green-500" /> : <User size={16} />}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); copy(item.password, `pass-${item.id}`); }}
          className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
        >
          {copiedId === `pass-${item.id}` ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
};

export default PasswordCard;