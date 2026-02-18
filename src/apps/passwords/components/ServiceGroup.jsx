// src/apps/passwords/components/ServiceGroup.jsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Key, ArrowRightLeft } from 'lucide-react';
import PasswordCard from './PasswordCard';

const ServiceGroup = ({ serviceName, items, onEdit, onDelete, copyUtils, onMove }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Helper to move all items in this group
  const handleMoveGroup = (e) => {
      e.stopPropagation();
      if (onMove) {
          // Wrap them in a pseudo-group object so Passwords.jsx knows to iterate them
          onMove({ type: 'service_group', items: items });
      }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0 font-bold text-lg">
          {serviceName ? serviceName[0].toUpperCase() : <Key size={20} />}
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-800 truncate">{serviceName || "Untitled"}</h3>
          <p className="text-xs text-gray-500 mt-1">{items.length} accounts</p>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          {onMove && (
              <button 
                  onClick={handleMoveGroup} 
                  title="Move all to folder"
                  className="p-2 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
              >
                  <ArrowRightLeft size={18} />
              </button>
          )}
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </div>

      {isOpen && (
        <div className="p-3 bg-gray-50 border-t border-gray-100 flex flex-col gap-2">
          {items.map(item => (
            <PasswordCard 
                key={item.id} 
                item={item} 
                onEdit={onEdit} 
                onDelete={onDelete} 
                copyUtils={copyUtils} 
                isGrouped={true} 
                onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceGroup;