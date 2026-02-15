import React, { useState } from 'react';
import { Landmark, User, MapPin, Edit2, Trash2, Copy, FileText, Eye, EyeOff } from 'lucide-react';
import { useClipboard } from '../../../hooks/useClipboard';

const AccountRow = ({ data, onDelete, onEdit }) => {
  const [showSensitive, setShowSensitive] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const { copy } = useClipboard();

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative transition-all active:scale-[0.99] flex flex-col h-full justify-between">
      <div>
        <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-2.5 rounded-xl text-[#4285f4]"><Landmark size={24} /></div>
            <div>
                <h3 className="font-bold text-gray-800 line-clamp-1">{data.bankName}</h3>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{data.accountType || 'Savings'} Account</p>
            </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => onEdit(data)} className="p-2 text-gray-400 hover:text-[#4285f4] bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                <button onClick={() => onDelete(data)} className="p-2 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
            </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-600 truncate max-w-full">
                <User size={10} className="flex-shrink-0" /> {data.holderName}
            </span>
            {data.branch && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-600 truncate max-w-full">
                    <MapPin size={10} className="flex-shrink-0" /> {data.branch}
                </span>
            )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-3">
            <div className="bg-gray-50 p-2.5 rounded-lg flex flex-col relative overflow-hidden">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Account Number</span>
                <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-700 font-medium tracking-wide truncate pr-2">{showSensitive ? data.accountNumber : `•••• •••• ${data.accountNumber?.slice(-4)}`}</span>
                    <button onClick={() => copy(data.accountNumber)} className="text-gray-400 hover:text-[#4285f4]"><Copy size={12} /></button>
                </div>
            </div>
            
            <div className="bg-gray-50 p-2.5 rounded-lg flex flex-col overflow-hidden">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Routing / IFSC</span>
                <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-700 font-medium truncate pr-2">{data.routingNumber}</span>
                    <button onClick={() => copy(data.routingNumber)} className="text-gray-400 hover:text-[#4285f4]"><Copy size={12} /></button>
                </div>
            </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
            <button 
                onClick={() => setShowNotes(!showNotes)} 
                className={`text-xs flex items-center gap-1 px-2 py-1 rounded ${showNotes ? 'text-yellow-600 bg-yellow-50' : 'text-gray-400 hover:text-gray-600'}`}
            >
                <FileText size={12} /> {showNotes ? 'Hide Notes' : 'View Notes'}
            </button>
            
            <button onClick={() => setShowSensitive(!showSensitive)} className="text-xs font-bold text-[#4285f4] hover:text-blue-700 flex items-center gap-1 ml-auto">
                {showSensitive ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}
            </button>
        </div>
        
        {showNotes && data.notes && (
            <div className="mt-2 text-xs text-gray-600 bg-yellow-50 p-2 rounded-lg border border-yellow-100 animate-in fade-in slide-in-from-top-1 break-words">
                {data.notes}
            </div>
        )}
      </div>
    </div>
  );
};

export default AccountRow;