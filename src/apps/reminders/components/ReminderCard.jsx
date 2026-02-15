import React from 'react';
import { Bell, Clock, RotateCcw, Edit2, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { formatBadgeDate } from '../../../lib/dateUtils'; // Assuming this exists from your other apps

const ReminderCard = ({ item, onToggle, onEdit, onDelete }) => {
    const isOverdue = item.datetime && new Date(item.datetime) < new Date() && item.isActive;

    return (
        <div className={`bg-white rounded-xl shadow-sm border p-4 flex items-start gap-3 transition-all ${item.isActive ? 'border-gray-100 hover:shadow-md' : 'border-gray-50 opacity-60'}`}>
            {/* Toggle Button */}
            <button 
                onClick={(e) => { e.stopPropagation(); onToggle(item); }}
                className={`mt-0.5 flex-shrink-0 transition-colors ${item.isActive ? 'text-gray-300 hover:text-[#4285f4]' : 'text-gray-400'}`}
            >
                {item.isActive ? <Circle size={22} /> : <CheckCircle2 size={22} className="text-green-500" />}
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-base truncate ${item.isActive ? 'text-gray-800' : 'text-gray-500 line-through'}`}>
                    {item.title}
                </h3>
                
                <div className="flex flex-wrap gap-2 mt-2">
                    {item.datetime && (
                        <span className={`text-[10px] px-2 py-1 rounded-md flex items-center gap-1 font-medium ${isOverdue ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            <Clock size={12} /> {new Date(item.datetime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    {item.repeat !== 'none' && (
                        <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-1 rounded-md flex items-center gap-1 font-medium capitalize">
                            <RotateCcw size={12} /> {item.repeat}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => onEdit(item)} className="p-2 text-gray-400 hover:text-[#4285f4] rounded-full transition-colors"><Edit2 size={16} /></button>
                <button onClick={() => onDelete(item)} className="p-2 text-gray-400 hover:text-red-500 rounded-full transition-colors"><Trash2 size={16} /></button>
            </div>
        </div>
    );
};

export default ReminderCard;