import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import PasswordCard from './PasswordCard';

const ServiceGroup = ({ serviceName, items, onEdit, copyUtils }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="flex flex-col gap-2">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="bg-gray-50/80 hover:bg-blue-50/50 rounded-xl border border-gray-200 p-4 flex items-center gap-4 cursor-pointer select-none transition-colors"
            >
                <div className="w-10 h-10 rounded-full bg-white border border-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0 font-bold text-lg shadow-sm">
                    {serviceName[0].toUpperCase()}
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-gray-800">{serviceName}</h3>
                    <p className="text-xs text-gray-500">{items.length} accounts</p>
                </div>
                <div className="text-gray-400">
                    {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
            </div>
            
            {isOpen && (
                <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                    {items.map(item => (
                        <PasswordCard 
                            key={item.id} 
                            item={item} 
                            onEdit={onEdit} 
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