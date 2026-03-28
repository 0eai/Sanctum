// src/apps/finance/Finance.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, Plus, PieChart, BarChart3, Wallet, TrendingDown,
  Sprout, Repeat, Users, Settings
} from 'lucide-react';

import { Modal, Button, LoadingSpinner } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

import {
  listenToFinanceItems, fetchFinanceConfig, saveFinanceItem,
  deleteFinanceItem, calculateMonthlySummary, exportFinanceData, importFinanceData
} from './services/finance';

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

  // --- URL-Driven State ---
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
      if (config.activeCurrencies) setUserCurrencies(config.activeCurrencies);
      if (!config.activeCurrencies.includes(viewCurrency) && config.activeCurrencies.length > 0) setViewCurrency(config.activeCurrencies[0]);
      if (config.categories) setCategories(config.categories);
    });
    return () => unsub();
  }, [user, cryptoKey]);

  // --- UI Sync ---
  useEffect(() => {
    const tabEl = document.getElementById(`tab-${activeTab}`);
    if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
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

  return (
    <StandardAppLayout
      headerConfig={{
        onBack: onExit,
        title: 'Finance',
        nav: {
          type: 'tabs',
          data: TABS,
          activeId: activeTab,
          onSelect: (tabId) => navigate(`#finance/${tabId}`),
        },
        customActions: (
          <>
            <div className="relative">
              <select value={viewCurrency} onChange={(e) => setViewCurrency(e.target.value)} className="bg-white/20 text-white border-none rounded-lg text-sm font-bold py-1.5 pl-3 pr-8 outline-none cursor-pointer hover:bg-white/30 transition-colors appearance-none">
                {userCurrencies.map(c => <option key={c} value={c} className="text-gray-900">{c}</option>)}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-70"><ChevronLeft size={12} className="-rotate-90" /></div>
            </div>
            <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
              <Settings size={20} />
            </button>
          </>
        ),
      }}
      fabConfig={activeTab !== 'stats' ? { onClick: () => { setEditingItem(null); setIsModalOpen(true); }, icon: <Plus size={28} />, ariaLabel: "Add Item" } : null}
    >
      {/* Monthly Stats Summary Bar */}
      {activeTab !== 'stats' && (
        <div className="bg-gray-50 border-b border-gray-200 -mx-4 -mt-4 mb-4 px-4 py-3">
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
            <div className={`p-3 rounded-xl ${activeTab === 'income' ? 'bg-green-100 text-green-600' : activeTab === 'expenses' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
              {activeTab === 'income' && <Wallet size={20} />}
              {activeTab === 'expenses' && <TrendingDown size={20} />}
              {activeTab === 'investments' && <Sprout size={20} />}
              {activeTab === 'subscriptions' && <Repeat size={20} />}
              {activeTab === 'debts' && <Users size={20} />}
            </div>
          </div>
        </div>
      )}

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

      <FinanceFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        editingItem={editingItem}
        activeTab={activeTab}
        viewCurrency={viewCurrency}
        categories={categories}
      />

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure? This cannot be undone.</div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete}>Delete</Button></div>
        </div>
      </Modal>
    </StandardAppLayout>
  );
};

export default FinanceApp;