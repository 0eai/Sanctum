// src/apps/banking/Banking.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, ShieldCheck, Plus, CreditCard, Landmark, Globe, Smartphone, 
  Wallet, Settings 
} from 'lucide-react';

import { Modal, Button, LoadingSpinner } from '../../components/ui'; 
import Fab from '../../components/ui/Fab'; 
import ImportExportModal from '../../components/ui/ImportExportModal'; 

import { 
  listenToBankingItems, saveBankingItem, deleteBankingItem, 
  exportBankingData, importBankingData 
} from '../../services/banking';

import BankCard from './components/BankCard';
import AccountRow from './components/AccountRow';
import CredentialRow from './components/CredentialRow';
import BankingEditor from './components/BankingEditor'; 

// Define tabs
const TABS = [
  { id: 'cards', label: 'Cards', icon: CreditCard },
  { id: 'accounts', label: 'Accounts', icon: Landmark },
  { id: 'internet', label: 'Net Bank', icon: Globe },
  { id: 'mobile', label: 'Mobile', icon: Smartphone }
];

// FIXED: Accept route and navigate from props
const BankingApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Swipe State
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const MIN_SWIPE_DISTANCE = 50;

  // --- URL-Driven State ---
  const activeTab = TABS.find(t => t.id === route.resource)?.id || 'cards';
  const isSettingsOpen = route.query?.modal === 'settings';
  const editId = route.query?.edit;
  const currentBasePath = `#banking/${activeTab}`;

  // Find the item to edit if `editId` is present in the URL
  const editorItem = useMemo(() => {
      if (!editId) return null;
      if (editId === 'new') return {}; 
      return items.find(i => i.id === editId) || null;
  }, [editId, items]);

  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsubscribe = listenToBankingItems(user.uid, cryptoKey, (data) => {
        setItems(data);
        setLoading(false);
    });
    return () => unsubscribe();
  }, [user, cryptoKey]);

  // Sync Tab UI
  useEffect(() => {
      const tabEl = document.getElementById(`tab-${activeTab}`);
      if(tabEl) tabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab]);


  // --- Handlers ---
  const handleSaveFromEditor = async (data) => {
      const typeMap = { 'cards': 'card', 'accounts': 'account', 'internet': 'internet', 'mobile': 'mobile' };
      const savedId = await saveBankingItem(user.uid, cryptoKey, data, typeMap[activeTab]);
      
      // If we saved a 'new' item, silently update the URL to its real ID so refreshes work
      if (editId === 'new') {
          window.history.replaceState(null, '', `${currentBasePath}?edit=${savedId}`);
      }
  };

  const handleCloseEditor = async (finalData) => {
      // Navigate back to the base path to close the editor
      navigate(currentBasePath);

      if (!finalData) return;

      let isEmpty = false;
      const bankName = finalData.bankName?.trim() || "";
      
      if (activeTab === 'cards') {
          isEmpty = !bankName && !finalData.cardNumber;
      } else if (activeTab === 'accounts') {
          isEmpty = !bankName && !finalData.accountNumber;
      } else {
          isEmpty = !bankName && !finalData.userId;
      }

      if (isEmpty && finalData.id) {
          try {
              await deleteBankingItem(user.uid, finalData.id);
          } catch(e) {}
      }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteBankingItem(user.uid, deleteConfirm.id);
    setDeleteConfirm(null);
    if (editorItem?.id === deleteConfirm.id) navigate(currentBasePath);
  };

  // --- Import / Export ---
  const handleExport = async () => {
    setProcessing(true);
    try {
      const data = await exportBankingData(user.uid, cryptoKey);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `banking_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert("Export failed."); }
    setProcessing(false);
    navigate(currentBasePath);
  };

  const handleImport = async (file) => {
    if (!file) return;
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const count = await importBankingData(user.uid, cryptoKey, json);
        alert(`Imported ${count} items.`);
        navigate(currentBasePath);
      } catch (e) { alert("Import failed."); }
      setProcessing(false);
    };
    reader.readAsText(file);
  };

  // Swipe Handlers
  const onTouchStart = (e) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); };
  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd || editorItem) return;
    const distance = touchStart - touchEnd;
    const isLeft = distance > MIN_SWIPE_DISTANCE;
    const isRight = distance < -MIN_SWIPE_DISTANCE;
    const idx = TABS.findIndex(t => t.id === activeTab);
    
    if (isLeft && idx < TABS.length - 1) navigate(`#banking/${TABS[idx + 1].id}`);
    else if (isRight && idx > 0) navigate(`#banking/${TABS[idx - 1].id}`);
  };

  // --- RENDER ---
  const filteredItems = useMemo(() => items.filter(i => i.type === (activeTab === 'cards' ? 'card' : activeTab === 'accounts' ? 'account' : activeTab)), [items, activeTab]);

  if (editorItem) {
      return (
          <BankingEditor 
            item={editorItem}
            view={activeTab} // Pass activeTab since we derive the view type from the URL now
            onSave={handleSaveFromEditor}
            onClose={handleCloseEditor}
            onDelete={(item) => setDeleteConfirm(item)}
          />
      );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      
      {/* Header */}
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-xl md:max-w-4xl mx-auto px-4 pt-4 pb-0 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={24} /></button>
              <h1 className="text-xl font-bold flex items-center gap-2">Wallet <ShieldCheck size={20} className="opacity-70" /></h1>
            </div>
            <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
                <Settings size={20} />
            </button>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0 mt-1">
              {TABS.map(tab => (
                  <button 
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    onClick={() => navigate(`#banking/${tab.id}`)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap flex-1 justify-center sm:flex-initial sm:justify-start ${activeTab === tab.id ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
                  >
                      <tab.icon size={16} fill={activeTab === tab.id ? "currentColor" : "none"} /> 
                      {tab.label}
                  </button>
              ))}
          </div>
        </div>
      </header>

      <main 
        className="flex-1 overflow-y-auto scroll-smooth p-4"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      >
        <div className="max-w-xl md:max-w-3xl mx-auto pb-20 space-y-4">
            {loading ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : null}
            
            {!loading && filteredItems.length === 0 && (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
                    <div className="bg-white p-4 rounded-full shadow-sm opacity-50"><Wallet size={32} /></div>
                    <p>No {TABS.find(t => t.id === activeTab)?.label} details saved.</p>
                </div>
            )}

            {activeTab === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {filteredItems.map(item => <BankCard key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={(i) => navigate(`${currentBasePath}?edit=${i.id}`)} />)}
                </div>
            )}

            {activeTab === 'accounts' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredItems.map(item => <AccountRow key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={(i) => navigate(`${currentBasePath}?edit=${i.id}`)} />)}
                </div>
            )}

            {(activeTab === 'internet' || activeTab === 'mobile') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredItems.map(item => <CredentialRow key={item.id} data={item} type={activeTab} onDelete={setDeleteConfirm} onEdit={(i) => navigate(`${currentBasePath}?edit=${i.id}`)} />)}
                </div>
            )}
        </div>
      </main>

      <Fab 
        onClick={() => navigate(`${currentBasePath}?edit=new`)} 
        icon={<Plus size={28} />} 
        maxWidth="max-w-4xl" 
        ariaLabel="Add Item"
      />

      <ImportExportModal 
        isOpen={isSettingsOpen}
        onClose={() => navigate(currentBasePath)}
        onImport={handleImport}
        onExport={handleExport}
        isImporting={processing}
        title="Manage Wallet"
        accept=".json"
        importLabel="Import JSON"
        exportLabel="Export JSON"
      />

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