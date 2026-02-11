import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc 
} from 'firebase/firestore';
import { 
  ChevronLeft, Plus, CreditCard, Landmark, Trash2, Copy, Eye, EyeOff, 
  ShieldCheck, Wallet, Edit2, FileText, MapPin, User, Globe, Smartphone, 
  ExternalLink, Link
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input, LoadingSpinner } from './components'; 
import { encryptData, decryptData } from './crypto';

// --- HELPERS ---
const formatCardNumber = (num) => {
  if (!num) return '';
  return num.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim();
};

const getCardBrand = (num) => {
  if (!num) return '';
  if (num.startsWith('4')) return 'Visa';
  if (num.startsWith('5')) return 'Mastercard';
  if (num.startsWith('3')) return 'Amex';
  return '';
};

const copyToClipboard = (text) => {
  if (!text) return;
  navigator.clipboard.writeText(text);
};

// --- SUB-COMPONENTS ---

const BankCard = ({ data, onDelete, onEdit }) => {
  const [showSensitive, setShowSensitive] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const brand = getCardBrand(data.cardNumber);
  
  const bgClass = brand === 'Visa' ? 'bg-gradient-to-br from-[#1a1f71] to-[#005da3]' : 
                  brand === 'Mastercard' ? 'bg-gradient-to-br from-[#eb001b] to-[#f79e1b]' : 
                  'bg-gradient-to-br from-slate-800 to-black';

  return (
    <div className={`relative w-full aspect-[1.586/1] rounded-2xl p-4 sm:p-5 md:p-6 text-white shadow-2xl transform transition-all ${bgClass} flex flex-col justify-between overflow-hidden group hover:scale-[1.01]`}>
      
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-48 h-48 md:w-72 md:h-72 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
      
      {/* 1. TOP: Header & Chip */}
      <div className="flex flex-col gap-1 z-10">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 max-w-[75%]">
              <h3 className="font-bold tracking-wider opacity-90 text-xs sm:text-sm md:text-lg uppercase truncate">{data.bankName}</h3>
              <span className="text-[7px] sm:text-[9px] font-bold bg-white/20 px-1.5 py-0.5 rounded text-white/90 uppercase tracking-widest backdrop-blur-sm shadow-sm flex-shrink-0">
                  {data.cardType || 'Debit'}
              </span>
          </div>
          <div className="flex gap-1.5">
              <button onClick={() => onEdit(data)} className="p-1.5 bg-black/20 hover:bg-black/40 rounded-full text-white/90 backdrop-blur-md transition-colors"><Edit2 size={14} className="md:w-4 md:h-4" /></button>
              <button onClick={() => onDelete(data)} className="p-1.5 bg-red-500/20 hover:bg-red-500/80 rounded-full text-white/90 backdrop-blur-md transition-colors"><Trash2 size={14} className="md:w-4 md:h-4" /></button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-1 md:mt-2">
          <div className="w-8 h-6 md:w-11 md:h-8 bg-gradient-to-tr from-yellow-200 to-yellow-500 rounded sm:rounded-md shadow-inner relative flex items-center justify-center opacity-90 overflow-hidden border border-yellow-600/30">
              <div className="w-full h-[1px] bg-black/20 absolute top-1.5"></div>
              <div className="w-full h-[1px] bg-black/20 absolute bottom-1.5"></div>
              <div className="h-full w-[1px] bg-black/20 absolute left-1/3"></div>
              <div className="h-full w-[1px] bg-black/20 absolute right-1/3"></div>
          </div>
          <span className="font-bold italic opacity-80 text-[10px] sm:text-xs md:text-sm">{brand}</span>
        </div>
      </div>

      {/* 2. MIDDLE: Number + Expiry/CVV */}
      <div className="flex flex-col justify-center z-10 my-auto w-full">
        
        {/* Card Number + Actions */}
        <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-sm sm:text-xl md:text-2xl tracking-widest leading-tight shadow-black/30 drop-shadow-md break-words w-full mt-1">
              {showSensitive ? formatCardNumber(data.cardNumber) : `•••• •••• •••• ${data.cardNumber?.slice(-4)}`}
            </span>
            <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                <button onClick={() => setShowSensitive(!showSensitive)} className="p-1 hover:bg-white/10 rounded text-white/80"><Eye size={12} className="md:w-4 md:h-4" /></button>
                <button onClick={() => copyToClipboard(data.cardNumber)} className="p-1 hover:bg-white/10 rounded text-white/80"><Copy size={12} className="md:w-4 md:h-4" /></button>
            </div>
        </div>

        {/* Expiry + CVV */}
        <div className="flex items-center justify-end gap-3 md:gap-5 mt-1.5 md:mt-1">
            <div className="flex items-center gap-1.5 md:gap-2">
                <span className="text-[7px] md:text-[9px] uppercase opacity-70 font-bold tracking-wider">Expires</span>
                <span className="font-mono text-xs sm:text-sm md:text-base shadow-black/20 drop-shadow-sm">{data.expiry}</span>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2">
                <span className="text-[7px] md:text-[9px] uppercase opacity-70 font-bold tracking-wider">CVV</span>
                <span className="font-mono text-xs sm:text-sm md:text-base shadow-black/20 drop-shadow-sm">{showSensitive ? data.cvv : '•••'}</span>
            </div>
        </div>
      </div>

      {/* 3. BOTTOM: Holder & PIN */}
      <div className="flex justify-between items-end z-10 mt-auto">
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-[6px] sm:text-[8px] md:text-[9px] uppercase opacity-60 tracking-wider">Card Holder</span>
          <span className="font-medium tracking-wide uppercase truncate text-[10px] sm:text-xs md:text-sm shadow-black/20 drop-shadow-sm max-w-[140px] md:max-w-[220px]">{data.holderName}</span>
        </div>
        
        {data.pin && (
            <button 
                onClick={(e) => { e.stopPropagation(); setShowPin(!showPin); }}
                className="flex items-center gap-1 bg-black/30 hover:bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm transition-colors border border-white/5"
            >
                <span className="text-[7px] md:text-[8px] uppercase opacity-70 font-bold">ATM PIN</span>
                <span className="font-mono text-[10px] sm:text-xs md:text-sm min-w-[24px] text-center text-yellow-300">{showPin ? data.pin : '****'}</span>
            </button>
        )}
      </div>
    </div>
  );
};

const AccountRow = ({ data, onDelete, onEdit }) => {
  const [showSensitive, setShowSensitive] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

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
                    <button onClick={() => copyToClipboard(data.accountNumber)} className="text-gray-400 hover:text-[#4285f4]"><Copy size={12} /></button>
                </div>
            </div>
            
            <div className="bg-gray-50 p-2.5 rounded-lg flex flex-col overflow-hidden">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Routing / IFSC</span>
                <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-700 font-medium truncate pr-2">{data.routingNumber}</span>
                    <button onClick={() => copyToClipboard(data.routingNumber)} className="text-gray-400 hover:text-[#4285f4]"><Copy size={12} /></button>
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

const CredentialRow = ({ data, onDelete, onEdit, type }) => {
    const [showLogin, setShowLogin] = useState(false);
    const [showTrans, setShowTrans] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
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
                        <button onClick={() => copyToClipboard(data.url)} className="p-2 text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors"><Link size={16} /></button>
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
                        <button onClick={() => copyToClipboard(data.loginPassword)} className="p-1.5 text-gray-400 hover:text-[#4285f4]"><Copy size={14} /></button>
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
                            <button onClick={() => copyToClipboard(data.transPassword)} className="p-1.5 text-blue-400 hover:text-[#4285f4]"><Copy size={14} /></button>
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

// --- MAIN APP COMPONENT ---

const BankingApp = ({ user, cryptoKey, onExit }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('cards'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    if (!user || !cryptoKey) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'banking'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, async (snap) => {
      const decrypted = await Promise.all(snap.docs.map(async d => {
        const raw = d.data();
        const data = await decryptData(raw, cryptoKey);
        return { id: d.id, ...data };
      }));
      setItems(decrypted);
      setLoading(false);
    });
  }, [user, cryptoKey]);

  const handleSave = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.type = view === 'internet' ? 'internet' : view === 'mobile' ? 'mobile' : view === 'cards' ? 'card' : 'account';
    
    const encrypted = await encryptData(data, cryptoKey);

    if (editingItem) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'banking', editingItem.id), { ...encrypted, updatedAt: serverTimestamp() });
    } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'banking'), { ...encrypted, createdAt: serverTimestamp() });
    }
    
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const openAddModal = () => { setEditingItem(null); setIsModalOpen(true); };
  const openEditModal = (item) => { setEditingItem(item); setIsModalOpen(true); };

  const handleDelete = async () => {
    if (deleteConfirm) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'banking', deleteConfirm.id));
        setDeleteConfirm(null);
    }
  };

  const filteredItems = useMemo(() => items.filter(i => i.type === (view === 'cards' ? 'card' : view === 'accounts' ? 'account' : view)), [items, view]);

  const TabButton = ({ id, icon: Icon, label }) => (
      <button 
        onClick={() => setView(id)}
        className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all ${view === id ? 'bg-white text-[#4285f4] shadow-sm' : 'text-blue-100 hover:bg-white/10'}`}
      >
          <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
      </button>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-xl md:max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={onExit} className="p-2 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={20} /></button>
              <h1 className="text-xl font-bold flex items-center gap-2">Wallet <ShieldCheck size={18} className="opacity-70" /></h1>
            </div>
            <button onClick={openAddModal} className="p-2 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-sm"><Plus size={20} /></button>
          </div>

          <div className="flex p-1 bg-black/20 rounded-xl gap-1">
              <TabButton id="cards" icon={CreditCard} label="Cards" />
              <TabButton id="accounts" icon={Landmark} label="Accounts" />
              <TabButton id="internet" icon={Globe} label="Net Bank" />
              <TabButton id="mobile" icon={Smartphone} label="Mobile" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-xl md:max-w-3xl mx-auto pb-20 space-y-4">
            {loading && <div className="flex justify-center py-20"><LoadingSpinner /></div>}
            {!loading && filteredItems.length === 0 && (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
                    <div className="bg-white p-4 rounded-full shadow-sm opacity-50"><Wallet size={32} /></div>
                    <p>No {view} details saved.</p>
                </div>
            )}

            {view === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {filteredItems.map(item => <BankCard key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={openEditModal} />)}
                </div>
            )}

            {view === 'accounts' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredItems.map(item => <AccountRow key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={openEditModal} />)}
                </div>
            )}

            {(view === 'internet' || view === 'mobile') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredItems.map(item => <CredentialRow key={item.id} data={item} type={view} onDelete={setDeleteConfirm} onEdit={openEditModal} />)}
                </div>
            )}
        </div>
      </main>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${editingItem ? 'Edit' : 'Add'} ${view === 'cards' ? 'Card' : view === 'accounts' ? 'Account' : view === 'internet' ? 'Net Banking' : 'Mobile Banking'}`}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
              <Input 
                name="bankName" 
                label={view === 'mobile' ? "App Name / Bank" : "Bank Name"} 
                defaultValue={editingItem?.bankName || ''} 
                placeholder={view === 'mobile' ? "e.g. GPay, Yono" : "e.g. HDFC"} 
                required autoFocus 
              />
              
              {view === 'cards' && (
                  <>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Card Type</label>
                        <select name="cardType" defaultValue={editingItem?.cardType || 'Debit'} className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-[#4285f4] bg-white">
                            <option value="Debit">Debit Card</option>
                            <option value="Credit">Credit Card</option>
                            <option value="Prepaid">Prepaid / Forex</option>
                        </select>
                    </div>
                    <Input name="holderName" label="Card Holder Name" defaultValue={editingItem?.holderName || ''} required />
                    <Input name="cardNumber" label="Card Number" defaultValue={editingItem?.cardNumber || ''} placeholder="0000 0000 0000 0000" required inputMode="numeric" />
                    <div className="flex gap-4">
                        <Input name="expiry" label="Expiry (MM/YY)" defaultValue={editingItem?.expiry || ''} placeholder="MM/YY" className="w-1/2" required />
                        <Input name="cvv" label="CVV" defaultValue={editingItem?.cvv || ''} placeholder="123" className="w-1/2" required inputMode="numeric" />
                    </div>
                    <Input name="pin" label="ATM Pin (Optional)" defaultValue={editingItem?.pin || ''} placeholder="****" type="password" inputMode="numeric" />
                  </>
              )}

              {view === 'accounts' && (
                  <>
                    <Input name="holderName" label="Account Holder Name" defaultValue={editingItem?.holderName || ''} required />
                    <Input name="accountNumber" label="Account Number" defaultValue={editingItem?.accountNumber || ''} required inputMode="numeric" />
                    <Input name="routingNumber" label="Routing / IFSC Code" defaultValue={editingItem?.routingNumber || ''} required />
                    <div className="flex gap-4">
                        <Input name="accountType" label="Type" defaultValue={editingItem?.accountType || ''} placeholder="Savings / Checking" className="w-1/2" />
                        <Input name="branch" label="Branch Name" defaultValue={editingItem?.branch || ''} placeholder="Home Branch" className="w-1/2" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Notes (Encrypted)</label>
                        <textarea name="notes" defaultValue={editingItem?.notes || ''} className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-[#4285f4] text-sm h-20 resize-none" placeholder="Add sensitive details here..." />
                    </div>
                  </>
              )}

              {view === 'internet' && (
                  <>
                    <Input name="userId" label="User ID / Customer ID" defaultValue={editingItem?.userId || ''} required />
                    <Input name="loginPassword" label="Login Password" defaultValue={editingItem?.loginPassword || ''} type="password" required />
                    <Input name="transPassword" label="Profile / Transaction Password" defaultValue={editingItem?.transPassword || ''} type="password" placeholder="Optional" />
                    <Input name="url" label="Login URL" defaultValue={editingItem?.url || ''} placeholder="https://..." />
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Notes (Encrypted)</label>
                        <textarea name="notes" defaultValue={editingItem?.notes || ''} className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-[#4285f4] text-sm h-20 resize-none" />
                    </div>
                  </>
              )}

              {view === 'mobile' && (
                  <>
                    <Input name="userId" label="Registered Mobile / ID" defaultValue={editingItem?.userId || ''} required />
                    <Input name="loginPassword" label="Login MPIN / Biometric PIN" defaultValue={editingItem?.loginPassword || ''} type="password" inputMode="numeric" required />
                    <Input name="transPassword" label="UPI PIN / Transaction PIN" defaultValue={editingItem?.transPassword || ''} type="password" inputMode="numeric" placeholder="Optional" />
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Notes (Encrypted)</label>
                        <textarea name="notes" defaultValue={editingItem?.notes || ''} className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-[#4285f4] text-sm h-20 resize-none" />
                    </div>
                  </>
              )}

              <Button type="submit" className="w-full mt-2 bg-[#4285f4] hover:bg-blue-600">
                  {editingItem ? 'Update Details' : 'Save Securely'}
              </Button>
          </form>
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure you want to delete this? This cannot be undone.</div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default BankingApp;