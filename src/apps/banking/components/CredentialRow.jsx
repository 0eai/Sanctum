import React, { useState } from 'react';
import { Smartphone, Globe, ExternalLink, Link, Edit2, Trash2, Eye, EyeOff, Copy, FileText } from 'lucide-react';
import { useClipboard } from '../../../hooks/useClipboard';

const CredentialRow = ({ data, onDelete, onEdit, type }) => {
    const [showLogin, setShowLogin] = useState(false);
    const [showTrans, setShowTrans] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const { copy } = useClipboard();
    const isMobile = type === 'mobile';
  
    return (
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative transition-all active:scale-[0.99] flex flex-col h-full justify-between">
        <div>
            <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-blue-50 p-2.5 rounded-xl text-[#4285f4] flex-shrink-0">
                {isMobile ? <Smartphone size={24} /> : <Globe size={24} />}
                </div>
                <div className="min-w-0">
                <h3 className="font-bold text-gray-800 truncate">{data.bankName}</h3>
                <p className="text-xs text-gray-500 uppercase tracking-wide truncate">{data.userId || 'User ID'}</p>
                </div>
            </div>
            <div className="flex gap-1 flex-shrink-0 ml-2">
                {data.url && (
                    <>
                        <button onClick={() => window.open(data.url, '_blank')} className="p-2 text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors"><ExternalLink size={16} /></button>
                        <button onClick={() => copy(data.url)} className="p-2 text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors"><Link size={16} /></button>
                    </>
                )}
                <div className="w-px bg-gray-200 mx-1"></div>
                <button onClick={() => onEdit(data)} className="p-2 text-gray-400 hover:text-[#4285f4] bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                <button onClick={() => onDelete(data)} className="p-2 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
            </div>
            </div>
    
            <div className="flex flex-col gap-2 mb-3">
                <div className="flex items-center justify-between bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{isMobile ? 'MPIN / Bio' : 'Login Password'}</span>
                        <span className="font-mono text-sm text-gray-700 truncate">{showLogin ? data.loginPassword : '••••••••'}</span>
                    </div>
                    <div className="flex items-center gap-2 pl-2 flex-shrink-0">
                        <button onClick={() => setShowLogin(!showLogin)} className="p-1.5 text-gray-400 hover:text-[#4285f4]">{showLogin ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                        <button onClick={() => copy(data.loginPassword)} className="p-1.5 text-gray-400 hover:text-[#4285f4]"><Copy size={14} /></button>
                    </div>
                </div>

                {(data.transPassword) && (
                    <div className="flex items-center justify-between bg-blue-50/50 p-2.5 rounded-lg border border-blue-100">
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-bold text-[#4285f4] uppercase">{isMobile ? 'UPI / Trans PIN' : 'Profile / Trans Pass'}</span>
                            <span className="font-mono text-sm text-gray-700 truncate">{showTrans ? data.transPassword : '••••••••'}</span>
                        </div>
                        <div className="flex items-center gap-2 pl-2 flex-shrink-0">
                            <button onClick={() => setShowTrans(!showTrans)} className="p-1.5 text-blue-400 hover:text-[#4285f4]">{showTrans ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                            <button onClick={() => copy(data.transPassword)} className="p-1.5 text-blue-400 hover:text-[#4285f4]"><Copy size={14} /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        <div>
            <button 
                onClick={() => setShowNotes(!showNotes)} 
                className={`text-xs flex items-center gap-1 px-2 py-1 rounded w-full ${showNotes ? 'text-yellow-600 bg-yellow-50' : 'text-gray-400 hover:bg-gray-50'}`}
            >
                <FileText size={12} /> {showNotes ? 'Hide Notes' : 'View Notes'}
            </button>
            {showNotes && data.notes && (
                <div className="mt-2 text-xs text-gray-600 bg-yellow-50 p-2 rounded-lg border border-yellow-100 break-words animate-in fade-in slide-in-from-top-1">
                    {data.notes}
                </div>
            )}
        </div>
      </div>
    );
};

export default CredentialRow;