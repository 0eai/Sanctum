// src/apps/finance/Finance.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronLeft, Plus, PieChart, BarChart3, Wallet, TrendingDown, 
  Sprout, Repeat, Users, Settings 
} from 'lucide-react';

import { Modal, Button, LoadingSpinner } from '../../components/ui'; 
import Fab from '../../components/ui/Fab'; 
import ImportExportModal from '../../components/ui/ImportExportModal'; 

import { 
  listenToFinanceItems, fetchFinanceConfig, saveFinanceItem, 
  deleteFinanceItem, calculateMonthlySummary, exportFinanceData, importFinanceData 
} from '../../services/finance';

import StatsView from './components/StatsView';
import FinanceFormModal from './components/FinanceFormModal';
import { 
  IncomeRow, ExpenseRow, InvestmentCard, SubscriptionCard, DebtRow 
} from './components/FinanceRows';

const TABS = [
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'income', label: 'Income', icon: Wallet },
  { id: 'expenses', label: 'Expenses', icon: TrendingDown },
  { id: 'investments', label: 'Invest', icon: Sprout },
  { id: 'subscriptions', label: 'Subs', icon: Repeat },
  { id: 'debts', label: 'Debts', icon: Users }
];

const CURRENCY_LOCALES = { KRW: 'ko-KR', INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP' };
const formatCurrency = (amount, code) => new Intl.NumberFormat(CURRENCY_LOCALES[code] || 'en-US', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(amount);

// FIXED: Accept route and navigate from props
const FinanceApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // Settings & Import/Export
  const [userCurrencies, setUserCurrencies] = useState(['KRW']);
  const [viewCurrency, setViewCurrency] = useState('KRW');
  const [categories, setCategories] = useState({});
  const [processing, setProcessing] = useState(false);

  // Swipe State
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const MIN_SWIPE_DISTANCE = 50;

  // --- URL-Driven State ---
  // Default to 'expenses' if no resource is found in the URL
  const activeTab = TABS.find(t => t.id === route.resource)?.id || 'expenses';
  const isSettingsOpen = route.query?.modal === 'settings';
  const currentBasePath = `#finance/${activeTab}`;

  // --- Listeners ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsub = listenToFinanceItems(user.uid, cryptoKey, (data) => {
        setItems(data);
        setLoading(false);
    });
    fetchFinanceConfig(user.uid, cryptoKey).then(config => {
        if(config.activeCurrencies) setUserCurrencies(config.activeCurrencies);
        if(!config.activeCurrencies.includes(viewCurrency) && config.activeCurrencies.length > 0) setViewCurrency(config.activeCurrencies[0]);
        if(config.categories) setCategories(config.categories);
    });
    return () => unsub();
  }, [user, cryptoKey]); // Note: viewCurrency omitted intentionally to avoid re-fetching on toggle

  // --- UI Sync ---
  // Automatically scroll the tab bar when the URL changes the active tab
  useEffect(() => {
    const tabEl = document.getElementById(`tab-${activeTab}`);
    if(tabEl) tabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab]);

  // --- Derived State ---
  const filteredItems = useMemo(() => items.filter(i => i.type === activeTab && i.currency === viewCurrency), [items, activeTab, viewCurrency]);
  const currentMonthTotal = useMemo(() => calculateMonthlySummary(items, activeTab, viewCurrency), [items, activeTab, viewCurrency]);

  // --- Handlers ---
  const handleSave = async (data) => {
    await saveFinanceItem(user.uid, cryptoKey, { ...data, id: editingItem?.id }, activeTab, viewCurrency);
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleDelete = async () => {
    if (deleteConfirm) await deleteFinanceItem(user.uid, deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const handleExport = async () => {
    setProcessing(true);
    try {
      const data = await exportFinanceData(user.uid, cryptoKey);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed.");
    }
    setProcessing(false);
    navigate(currentBasePath); // Close modal via URL
  };

  const handleImport = async (file) => {
    if (!file) return;
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const count = await importFinanceData(user.uid, cryptoKey, json);
        alert(`Successfully imported ${count} items.`);
        navigate(currentBasePath); // Close modal via URL
      } catch (e) {
        alert("Import failed. Invalid file format.");
      }
      setProcessing(false);
    };
    reader.readAsText(file);
  };

  // --- Swipe Logic ---
  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const currentIndex = TABS.findIndex(t => t.id === activeTab);
    const isLeftSwipe = distance > MIN_SWIPE_DISTANCE;
    const isRightSwipe = distance < -MIN_SWIPE_DISTANCE;

    // FIXED: Push to URL instead of setting state
    if (isLeftSwipe && currentIndex < TABS.length - 1) {
        navigate(`#finance/${TABS[currentIndex + 1].id}`);
    } else if (isRightSwipe && currentIndex > 0) {
        navigate(`#finance/${TABS[currentIndex - 1].id}`);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
      
      {/* Header */}
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 pb-0">
        <div className="max-w-xl md:max-w-4xl mx-auto px-4 pt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* If on root, exit. If on a specific tab, back button goes to Launcher */}
              <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={24} /></button>
              <h1 className="text-xl font-bold flex items-center gap-2">Finance</h1>
            </div>
            
            <div className="flex items-center gap-2">
                <div className="relative">
                    <select value={viewCurrency} onChange={(e) => setViewCurrency(e.target.value)} className="bg-white/20 text-white border-none rounded-lg text-sm font-bold py-1.5 pl-3 pr-8 outline-none cursor-pointer hover:bg-white/30 transition-colors appearance-none">
                        {userCurrencies.map(c => <option key={c} value={c} className="text-gray-900">{c}</option>)}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-70"><ChevronLeft size={12} className="-rotate-90" /></div>
                </div>
                {/* FIXED: Open Settings Modal by appending query string */}
                <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                    <Settings size={20} />
                </button>
            </div>
          </div>

          {/* Unified Tab Bar */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0 mt-1">
              {TABS.map(tab => (
                  <button 
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    onClick={() => navigate(`#finance/${tab.id}`)} // FIXED: Drive by URL
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
                  >
                      <tab.icon size={14} fill={activeTab === tab.id ? "currentColor" : "none"} /> 
                      {tab.label}
                  </button>
              ))}
          </div>
        </div>
      </header>

      {/* Monthly Stats Summary Bar */}
      {activeTab !== 'stats' && (
        <div className="bg-gray-50 border-b border-gray-200">
            <div className="max-w-xl md:max-w-3xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Current Month {activeTab}</p>
                        <div className="flex items-baseline gap-2 text-gray-800">
                            {activeTab === 'debts' ? (
                                <div className="flex gap-4">
                                    <span className="text-sm font-bold text-green-600">Lent: {formatCurrency(currentMonthTotal.lent, viewCurrency)}</span>
                                    <span className="text-sm font-bold text-orange-600">Borrowed: {formatCurrency(currentMonthTotal.borrowed, viewCurrency)}</span>
                                </div>
                            ) : (
                                <span className="text-2xl font-bold tabular-nums tracking-tight">{formatCurrency(currentMonthTotal, viewCurrency)}{activeTab === 'subscriptions' && <span className="text-xs font-medium text-gray-400 ml-1">est.</span>}</span>
                            )}
                        </div>
                    </div>
                    {/* Icon for context */}
                    <div className={`p-3 rounded-xl ${activeTab === 'income' ? 'bg-green-100 text-green-600' : activeTab === 'expenses' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                        {activeTab === 'income' && <Wallet size={20} />}
                        {activeTab === 'expenses' && <TrendingDown size={20} />}
                        {activeTab === 'investments' && <Sprout size={20} />}
                        {activeTab === 'subscriptions' && <Repeat size={20} />}
                        {activeTab === 'debts' && <Users size={20} />}
                    </div>
                </div>
            </div>
        </div>
      )}

      <main 
        className="flex-1 overflow-y-auto scroll-smooth p-4"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="max-w-xl md:max-w-3xl mx-auto pb-20 space-y-4">
            {loading && <div className="flex justify-center py-20"><LoadingSpinner /></div>}
            
            {!loading && activeTab !== 'stats' && filteredItems.length === 0 && (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
                    <div className="bg-white p-4 rounded-full shadow-sm opacity-50"><PieChart size={32} /></div>
                    <p>No {activeTab} in {viewCurrency}.</p>
                </div>
            )}

            {activeTab === 'stats' && <StatsView items={items} currentCurrency={viewCurrency} />}

            <div className={`grid grid-cols-1 ${['investments', 'subscriptions', 'debts'].includes(activeTab) ? 'md:grid-cols-2' : ''} gap-3`}>
                {activeTab === 'income' && filteredItems.map(item => <IncomeRow key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={(i) => { setEditingItem(i); setIsModalOpen(true); }} />)}
                {activeTab === 'expenses' && filteredItems.map(item => <ExpenseRow key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={(i) => { setEditingItem(i); setIsModalOpen(true); }} />)}
                {activeTab === 'investments' && filteredItems.map(item => <InvestmentCard key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={(i) => { setEditingItem(i); setIsModalOpen(true); }} />)}
                {activeTab === 'subscriptions' && filteredItems.map(item => <SubscriptionCard key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={(i) => { setEditingItem(i); setIsModalOpen(true); }} />)}
                {activeTab === 'debts' && filteredItems.map(item => <DebtRow key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={(i) => { setEditingItem(i); setIsModalOpen(true); }} />)}
            </div>
        </div>
      </main>

      {/* FAB (Only show when not in Stats view) */}
      {activeTab !== 'stats' && (
          <Fab 
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }} 
            icon={<Plus size={28} />}
            maxWidth="max-w-4xl"
            ariaLabel="Add Item"
          />
      )}

      <FinanceFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave} 
        editingItem={editingItem} 
        activeTab={activeTab} 
        viewCurrency={viewCurrency} 
        categories={categories}
      />

      <ImportExportModal 
        isOpen={isSettingsOpen}
        onClose={() => navigate(currentBasePath)} // FIXED: Close modal via URL
        onImport={handleImport}
        onExport={handleExport}
        isImporting={processing}
        title="Manage Finance Data"
        accept=".json"
        importLabel="Import JSON"
        exportLabel="Export JSON"
      />

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure? This cannot be undone.</div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete}>Delete</Button></div>
        </div>
      </Modal>
    </div>
  );
};

export default FinanceApp;