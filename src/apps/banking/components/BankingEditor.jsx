// src/apps/banking/components/BankingEditor.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, Trash2, Shield, CreditCard, Landmark, Globe, Smartphone, 
  User, Hash, Lock, FileText, Check, Eye, EyeOff 
} from 'lucide-react';

const BankingEditor = ({ item, onSave, onClose, onDelete, view }) => {
  const [data, setData] = useState({
    bankName: '', notes: '',
    cardType: 'Debit', holderName: '', cardNumber: '', expiry: '', cvv: '', pin: '',
    accountNumber: '', routingNumber: '', accountType: '', branch: '',
    userId: '', loginPassword: '', transPassword: '', url: '',
    ...item
  });

  const [saveStatus, setSaveStatus] = useState('idle'); 
  const [showPasswords, setShowPasswords] = useState({}); // Track visibility per field
  const [isClosing, setIsClosing] = useState(false); // FIXED: Flag to prevent double-saves

  const dataRef = useRef(data);
  const lastSavedRef = useRef(item);
  const timerRef = useRef(null);

  useEffect(() => { dataRef.current = data; }, [data]);

  // Cleanup: Force save on unmount only if not explicitly closing via button
  useEffect(() => {
    return () => {
      if (timerRef.current && !isClosing) {
        clearTimeout(timerRef.current);
        triggerSave(dataRef.current, true);
      }
    };
  }, [isClosing]); // Added isClosing to dependencies

  const triggerSave = (currentData, isUnmounting = false) => {
    const lastSaved = lastSavedRef.current;
    const hasChanges = JSON.stringify(currentData) !== JSON.stringify(lastSaved);

    if (hasChanges) {
        const hasContent = currentData.bankName || currentData.cardNumber || currentData.accountNumber || currentData.userId;
        
        if (hasContent || currentData.id) {
            setSaveStatus('saving');
            onSave(currentData);
            lastSavedRef.current = currentData;
            
            if (!isUnmounting) {
                setTimeout(() => setSaveStatus('saved'), 500);
                setTimeout(() => setSaveStatus('idle'), 2000);
            }
        }
    }
  };

  const handleDataChange = (field, value) => {
    const newData = { ...data, [field]: value };
    setData(newData);

    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveStatus('idle');
    
    timerRef.current = setTimeout(() => {
        triggerSave(newData);
        timerRef.current = null;
    }, 30000); 
  };

  // FIXED: Explicitly set flag before closing to avoid duplicate auto-save
  const handleClose = () => {
      setIsClosing(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      triggerSave(dataRef.current, true); 
      onClose(dataRef.current);
  };

  const toggleVisibility = (field) => {
      setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const Icon = view === 'cards' ? CreditCard : view === 'accounts' ? Landmark : view === 'internet' ? Globe : Smartphone;

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 fixed inset-0 z-50">
      <div className="max-w-3xl mx-auto w-full h-full flex flex-col bg-white shadow-xl overflow-hidden relative">
        
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-20">
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors">
            <ChevronLeft />
          </button>
          
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && <span className="text-xs text-gray-400 animate-pulse">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Saved</span>}
            
            <span className="text-xs font-bold text-green-600 uppercase tracking-wider flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full">
                <Shield size={10} /> Encrypted
            </span>
            {item?.id && (
              <button onClick={() => { setIsClosing(true); onDelete(data); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 flex flex-col gap-6 min-h-full pb-32">
            
            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {view === 'mobile' ? "App Name" : "Bank Name"}
                </label>
                <input 
                    value={data.bankName}
                    onChange={(e) => handleDataChange('bankName', e.target.value)}
                    placeholder={view === 'mobile' ? "e.g. GPay" : "e.g. Chase"}
                    className="text-3xl font-bold bg-transparent outline-none w-full placeholder-gray-300 text-gray-800"
                    autoFocus={!item.id} 
                />
            </div>

            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 flex flex-col gap-5 shadow-sm">
                <div className="flex items-center gap-2 text-blue-500 border-b border-gray-200 pb-3 mb-2">
                    <Icon size={18} />
                    <span className="text-sm font-bold uppercase tracking-wider">
                        {view === 'cards' ? 'Card Details' : view === 'accounts' ? 'Account Details' : 'Credentials'}
                    </span>
                </div>

                {/* --- CARDS VIEW --- */}
                {view === 'cards' && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 sm:col-span-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Card Type</label>
                                <select 
                                    value={data.cardType} 
                                    onChange={(e) => handleDataChange('cardType', e.target.value)}
                                    className="w-full bg-transparent border-b border-gray-300 py-1 text-gray-700 font-medium outline-none focus:border-blue-500"
                                >
                                    <option value="Debit">Debit Card</option>
                                    <option value="Credit">Credit Card</option>
                                    <option value="Prepaid">Prepaid / Forex</option>
                                </select>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Holder Name</label>
                                <input 
                                    value={data.holderName} 
                                    onChange={(e) => handleDataChange('holderName', e.target.value)}
                                    placeholder="Name on Card"
                                    className="w-full bg-transparent border-b border-gray-300 py-1 text-gray-700 font-medium outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Card Number</label>
                            <div className="flex items-center gap-2">
                                <CreditCard size={16} className="text-gray-400" />
                                <input 
                                    value={data.cardNumber} 
                                    onChange={(e) => handleDataChange('cardNumber', e.target.value)}
                                    placeholder="0000 0000 0000 0000"
                                    className="flex-1 bg-transparent border-b border-gray-300 py-1 text-gray-700 font-mono tracking-wide outline-none focus:border-blue-500"
                                    inputMode="numeric"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Expiry</label>
                                <input 
                                    value={data.expiry} 
                                    onChange={(e) => handleDataChange('expiry', e.target.value)}
                                    placeholder="MM/YY"
                                    className="w-full bg-transparent border-b border-gray-300 py-1 text-gray-700 font-medium outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">CVV</label>
                                <div className="flex items-center border-b border-gray-300 focus-within:border-blue-500">
                                    <input 
                                        value={data.cvv} 
                                        onChange={(e) => handleDataChange('cvv', e.target.value)}
                                        placeholder="123"
                                        type={showPasswords.cvv ? 'text' : 'password'}
                                        inputMode="numeric"
                                        className="w-full bg-transparent py-1 text-gray-700 font-medium outline-none"
                                    />
                                    <button onClick={() => toggleVisibility('cvv')} className="p-1 text-gray-400 hover:text-blue-500 focus:outline-none">
                                        {showPasswords.cvv ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">PIN</label>
                                <div className="flex items-center border-b border-gray-300 focus-within:border-blue-500">
                                    <input 
                                        value={data.pin} 
                                        onChange={(e) => handleDataChange('pin', e.target.value)}
                                        placeholder="****"
                                        type={showPasswords.pin ? 'text' : 'password'}
                                        inputMode="numeric"
                                        className="w-full bg-transparent py-1 text-gray-700 font-medium outline-none"
                                    />
                                    <button onClick={() => toggleVisibility('pin')} className="p-1 text-gray-400 hover:text-blue-500 focus:outline-none">
                                        {showPasswords.pin ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* --- ACCOUNTS VIEW --- */}
                {view === 'accounts' && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Holder Name</label>
                            <input 
                                value={data.holderName} 
                                onChange={(e) => handleDataChange('holderName', e.target.value)}
                                placeholder="Account Holder"
                                className="w-full bg-transparent border-b border-gray-300 py-1 text-gray-700 font-medium outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Account Number</label>
                            <input 
                                value={data.accountNumber} 
                                onChange={(e) => handleDataChange('accountNumber', e.target.value)}
                                placeholder="Account No"
                                className="w-full bg-transparent border-b border-gray-300 py-1 text-gray-700 font-mono outline-none focus:border-blue-500"
                                inputMode="numeric"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Routing / IFSC</label>
                                <input 
                                    value={data.routingNumber} 
                                    onChange={(e) => handleDataChange('routingNumber', e.target.value)}
                                    placeholder="Code"
                                    className="w-full bg-transparent border-b border-gray-300 py-1 text-gray-700 font-medium outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Type</label>
                                <input 
                                    value={data.accountType} 
                                    onChange={(e) => handleDataChange('accountType', e.target.value)}
                                    placeholder="Savings/Checking"
                                    className="w-full bg-transparent border-b border-gray-300 py-1 text-gray-700 font-medium outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Branch</label>
                            <input 
                                value={data.branch} 
                                onChange={(e) => handleDataChange('branch', e.target.value)}
                                placeholder="Branch Name"
                                className="w-full bg-transparent border-b border-gray-300 py-1 text-gray-700 font-medium outline-none focus:border-blue-500"
                            />
                        </div>
                    </>
                )}

                {/* --- INTERNET / MOBILE VIEW --- */}
                {(view === 'internet' || view === 'mobile') && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">{view === 'internet' ? "User ID / Cust ID" : "Mobile / ID"}</label>
                            <div className="flex items-center gap-2">
                                <User size={16} className="text-gray-400" />
                                <input 
                                    value={data.userId} 
                                    onChange={(e) => handleDataChange('userId', e.target.value)}
                                    placeholder="Login ID"
                                    className="flex-1 bg-transparent border-b border-gray-300 py-1 text-gray-700 font-medium outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">{view === 'internet' ? "Login Password" : "Login MPIN"}</label>
                            <div className="flex items-center gap-2 border-b border-gray-300 focus-within:border-blue-500">
                                <Lock size={16} className="text-gray-400" />
                                <input 
                                    value={data.loginPassword} 
                                    onChange={(e) => handleDataChange('loginPassword', e.target.value)}
                                    placeholder="******"
                                    type={showPasswords.login ? 'text' : 'password'}
                                    className="flex-1 bg-transparent py-1 text-gray-700 font-medium outline-none"
                                />
                                <button onClick={() => toggleVisibility('login')} className="p-1 text-gray-400 hover:text-blue-500 focus:outline-none">
                                    {showPasswords.login ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase">{view === 'internet' ? "Trans. Password" : "UPI / Trans. PIN"}</label>
                            <div className="flex items-center gap-2 border-b border-gray-300 focus-within:border-blue-500">
                                <Hash size={16} className="text-gray-400" />
                                <input 
                                    value={data.transPassword} 
                                    onChange={(e) => handleDataChange('transPassword', e.target.value)}
                                    placeholder="Optional"
                                    type={showPasswords.trans ? 'text' : 'password'}
                                    className="flex-1 bg-transparent py-1 text-gray-700 font-medium outline-none"
                                />
                                <button onClick={() => toggleVisibility('trans')} className="p-1 text-gray-400 hover:text-blue-500 focus:outline-none">
                                    {showPasswords.trans ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        {view === 'internet' && (
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Login URL</label>
                                <div className="flex items-center gap-2">
                                    <Globe size={16} className="text-gray-400" />
                                    <input 
                                        value={data.url} 
                                        onChange={(e) => handleDataChange('url', e.target.value)}
                                        placeholder="https://..."
                                        className="flex-1 bg-transparent border-b border-gray-300 py-1 text-blue-500 font-medium outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Notes Section */}
            <div className="flex-1 flex flex-col gap-2 pt-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={12} /> Secure Notes
                </label>
                <textarea 
                    value={data.notes} 
                    onChange={(e) => handleDataChange('notes', e.target.value)}
                    placeholder="Add any extra details here..." 
                    className="w-full bg-gray-50 border-none rounded-xl p-4 text-sm text-gray-700 outline-none resize-none overflow-hidden min-h-[150px]" 
                />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default BankingEditor;