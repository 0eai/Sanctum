// src/apps/bookmarks/components/BookmarkCard.jsx
import React from 'react';
import { Folder, Globe, ExternalLink, MoreHorizontal } from 'lucide-react';
import { normalizeUrl, getDomain } from '../../../lib/bookmarkUtils';

const BookmarkCard = ({ item, onEnterFolder, onViewDetails }) => {
  
  const handleCardClick = () => {
      if (item.type === 'folder') {
          onEnterFolder(item);
      } else {
          // Default behavior: Open URL directly
          window.open(normalizeUrl(item.url), '_blank');
      }
  };

  return (
    <div 
      className={`
        p-4 rounded-xl shadow-sm border flex items-center gap-4 group transition-all cursor-pointer
        ${item.type === 'folder' ? 'bg-blue-50/50 border-blue-100 hover:border-blue-300' : 'bg-white border-gray-100 hover:shadow-md'}
      `}
      onClick={handleCardClick}
    >
      {/* Icon Section */}
      <div className={`h-12 w-12 relative rounded-xl flex items-center justify-center flex-shrink-0 ${item.type === 'folder' ? 'bg-blue-100 text-[#4285f4]' : 'bg-gray-50 text-gray-500'}`}>
        {item.type === 'folder' ? (
          <Folder size={24} fill="currentColor" className="opacity-90" />
        ) : (
          <>
            <img 
              src={`https://www.google.com/s2/favicons?sz=64&domain_url=${item.url}`} 
              alt="" 
              className="h-7 w-7 object-contain"
              onError={(e) => { e.target.style.display='none'; }} 
            />
            {/* Fallback Icon if image fails (positioned absolute to sit behind) */}
            <Globe size={24} className="absolute opacity-20" /> 
          </>
        )}
      </div>
      
      {/* Text Section */}
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <h3 className={`font-bold text-sm leading-tight line-clamp-2 ${item.type === 'folder' ? 'text-blue-900' : 'text-gray-800'}`}>
          {item.title || "Untitled"}
        </h3>
        
        {item.type === 'bookmark' && (
          <p className="text-xs text-gray-400 truncate mt-1 flex items-center gap-1">
            {getDomain(item.url)}
            <ExternalLink size={10} className="flex-shrink-0 opacity-50" />
          </p>
        )}
        {item.type === 'folder' && <p className="text-xs text-blue-400 font-medium mt-1">Folder</p>}
      </div>

      {/* Action Button (Opens Detail View) */}
      <button 
        onClick={(e) => { e.stopPropagation(); onViewDetails(item); }}
        className="p-2 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
      >
        <MoreHorizontal size={20} />
      </button>
    </div>
  );
};

export default BookmarkCard;