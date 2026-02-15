// src/apps/passwords/components/PasswordEditor.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, Trash2, Shield, User, Copy, Check, Key, Eye, EyeOff, 
  History, RefreshCw, Globe, FileText 
} from 'lucide-react';
import { Modal, Button } from '../../../components/ui'; 
import { generateStrongPassword } from '../../../lib/passwordUtils';
import { formatDate } from '../../../lib/dateUtils';

const PasswordEditor = ({ item, onSave, onClose, onDelete, copyUtils }) => {
  const [data, setData] = useState({ 
    service: '', username: '', password: '', url: '', notes: '', history: [], ...item 
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState(null); 
  const [isClosing, setIsClosing] = useState(false); // FIXED: Prevent double save on back
  
  const dataRef = useRef(data);
  const lastSavedRef = useRef(item);
  const timerRef = useRef(null);
  const notesRef = useRef(null);

  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    return () => {
      if (timerRef.current && !isClosing) {
        clearTimeout(timerRef.current);
        triggerSave(dataRef.current, true);
      }
    };
  }, [isClosing]);

  useEffect(() => {
    if (notesRef.current) {
        notesRef.current.style.height = "auto";
        notesRef.current.style.height = notesRef.current.scrollHeight + "px";
    }
  }, [data.notes]);

  const triggerSave = (currentData, isUnmounting = false) => {
    const lastSaved = lastSavedRef.current;
    
    // Only save if there's actually a change
    const hasChanges = JSON.stringify(currentData) !== JSON.stringify(lastSaved);
    
    if (hasChanges) {
        let newData = { ...currentData, updatedAt: new Date().toISOString() };
        
        if (currentData.password !== lastSaved.password && lastSaved.password) {
            const historyEntry = { password: lastSaved.password, date: new Date().toISOString() };
            const newHistory = [historyEntry, ...(currentData.history || [])]; 
            newData.history = newHistory;
        }

        onSave(newData);
        lastSavedRef.current = newData;

        if (!isUnmounting) setData(newData);
    }
  };

  const handleDataChange = (patch) => {
    const newData = { ...data, ...patch };
    setData(newData);

    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = setTimeout(() => {
        triggerSave(newData);
        timerRef.current = null;
    }, 10000); // Save after 10 seconds of inactivity
  };

  // Safe Close Handler
  const handleClose = () => {
      setIsClosing(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      triggerSave(dataRef.current, true);
      onClose(dataRef.current);
  };

  const handleGenerateClick = () => setGeneratedPassword(generateStrongPassword());
  
  const confirmGeneratedPassword = () => {
      handleDataChange({ password: generatedPassword });
      setShowPassword(true);
      setGeneratedPassword(null);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      <div className="max-w-3xl mx-auto w-full h-full flex flex-col bg-white shadow-xl overflow-hidden relative">
        
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-20">
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft /></button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-green-600 uppercase tracking-wider flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full">
                <Shield size={10} /> Encrypted
            </span>
            {item?.id && (
              <button onClick={() => { setIsClosing(true); onDelete(data); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full">
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 flex flex-col gap-6 min-h-full">
            
            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Service</label>
                <input 
                    value={data.service}
                    onChange={(e) => handleDataChange({ service: e.target.value })}
                    placeholder="e.g. Google"
                    autoFocus={!item.id}
                    className="text-3xl font-bold bg-transparent outline-none w-full placeholder-gray-300 text-gray-800"
                />
            </div>

            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><User size={12} /> Username</label>
                    <div className="flex items-center gap-2">
                        <input 
                            value={data.username}
                            onChange={(e) => handleDataChange({ username: e.target.value })}
                            placeholder="username"
                            className="flex-1 bg-transparent outline-none text-base text-gray-700 font-medium min-w-0" 
                        />
                        <button onClick={() => copyUtils.copy(data.username, 'editor-user')} className="text-gray-400 hover:text-blue-500 p-1 flex-shrink-0">
                            {copyUtils.copiedId === 'editor-user' ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                    </div>
                </div>

                <div className="h-px bg-gray-200 w-full" />

                <div className="flex flex-col gap-1 relative">
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Key size={12} /> Password</label>
                        {data.updatedAt && <span className="text-[10px] font-normal text-gray-400">Updated {formatDate(data.updatedAt)}</span>}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <input 
                            type={showPassword ? "text" : "password"}
                            value={data.password}
                            onChange={(e) => handleDataChange({ password: e.target.value })}
                            placeholder="Required"
                            className={`flex-1 bg-transparent outline-none text-base text-gray-700 font-medium min-w-0 ${!showPassword ? 'font-mono tracking-widest' : ''}`}
                        />
                        
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-blue-500 p-2 rounded-full hover:bg-gray-200 transition-colors">
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                            <button onClick={() => setShowHistory(!showHistory)} className={`p-2 rounded-full transition-colors ${showHistory ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-200'}`} title="History">
                                <History size={18} />
                            </button>
                            <button onClick={() => copyUtils.copy(data.password, 'editor-pass')} className="text-gray-400 hover:text-blue-500 p-2 rounded-full hover:bg-gray-200 transition-colors">
                                {copyUtils.copiedId === 'editor-pass' ? <Check size={18} /> : <Copy size={18} />}
                            </button>
                        </div>
                    </div>

                    {showHistory && (
                        <div className="mt-4 bg-white rounded-lg border border-gray-200 p-3 animate-in slide-in-from-top-2 shadow-sm">
                            <h4 className="text-xs font-bold text-gray-500 mb-2">Previous Passwords</h4>
                            {!data.history || data.history.length === 0 ? <p className="text-xs text-gray-300 italic">No history.</p> : (
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                    {data.history.map((h, i) => (
                                        <div key={i} className="flex justify-between items-center text-xs group">
                                            <span className="font-mono text-gray-600 bg-gray-50 px-1 rounded select-all">{h.password}</span>
                                            <span className="text-gray-400 text-[10px]">{formatDate(h.date)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-2">
                    <button onClick={handleGenerateClick} className="text-xs flex items-center gap-1 text-blue-500 hover:text-blue-600 font-bold bg-blue-50 px-3 py-2 rounded-lg transition-colors">
                        <RefreshCw size={12} /> Generate Strong Password
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Globe size={12} /> Website URL</label>
                <input 
                    value={data.url} 
                    onChange={(e) => handleDataChange({ url: e.target.value })} 
                    placeholder="https://..." 
                    className="bg-transparent outline-none text-sm text-blue-500 underline-offset-2 w-full" 
                />
            </div>

            <div className="flex-1 flex flex-col gap-2 pt-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><FileText size={12} /> Notes</label>
                <textarea 
                    ref={notesRef}
                    value={data.notes} 
                    onChange={(e) => handleDataChange({ notes: e.target.value })} 
                    placeholder="Add secure notes..." 
                    className="w-full bg-gray-50 border-none rounded-xl p-4 text-sm text-gray-700 outline-none resize-none overflow-hidden pb-32" 
                    style={{ minHeight: '20vh' }}
                />
            </div>

          </div>
        </div>
      </div>

      {/* GENERATION CONFIRMATION MODAL */}
      <Modal isOpen={!!generatedPassword} onClose={() => setGeneratedPassword(null)} title="New Password">
        <div className="flex flex-col gap-6">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col items-center gap-2 text-center">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Generated Password</span>
                <div className="text-xl font-mono font-bold text-gray-800 break-all select-all">
                    {generatedPassword}
                </div>
            </div>
            
            <div className="flex gap-3">
                <Button 
                    variant="secondary" 
                    onClick={() => copyUtils.copy(generatedPassword, 'modal-gen')}
                    className="flex-1 bg-white border border-gray-200 shadow-sm"
                >
                    {copyUtils.copiedId === 'modal-gen' ? <Check size={16} className="mr-2 text-green-600" /> : <Copy size={16} className="mr-2" />}
                    Copy
                </Button>
                <Button onClick={confirmGeneratedPassword} className="flex-1 shadow-lg">
                    Use Password
                </Button>
            </div>
        </div>
      </Modal>

    </div>
  );
};

export default PasswordEditor;