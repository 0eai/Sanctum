import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Key } from 'lucide-react';
import PasswordCard from './PasswordCard';

const ServiceGroup = ({ serviceName, items, onEdit, onDelete, copyUtils }) => {
  const [isOpen, setIsOpen] = useState(false);

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
        <div className="text-gray-400">
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceGroup;