// src/apps/banking/Banking.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, CreditCard, Landmark, Globe, Smartphone,
  Wallet, Settings
} from 'lucide-react';

import { Modal, Button, LoadingSpinner } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

import {
  listenToBankingItems, saveBankingItem, deleteBankingItem,
  exportBankingData, importBankingData
} from './services/banking';

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
  const [searchQuery, setSearchQuery] = useState("");

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
    if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab]);

  // --- Handlers ---
  const handleSaveFromEditor = async (data) => {
    const typeMap = { 'cards': 'card', 'accounts': 'account', 'internet': 'internet', 'mobile': 'mobile' };
    const savedId = await saveBankingItem(user.uid, cryptoKey, data, typeMap[activeTab]);

    if (editId === 'new') {
      window.history.replaceState(null, '', `${currentBasePath}?edit=${savedId}`);
    }
  };

  const handleCloseEditor = async (finalData) => {
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
      } catch (e) { }
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteBankingItem(user.uid, deleteConfirm.id);
    setDeleteConfirm(null);
    if (editorItem?.id === deleteConfirm.id) navigate(currentBasePath);
  };

  // --- RENDER ---
  const filteredItems = useMemo(() => {
    let filtered = items.filter(i => i.type === (activeTab === 'cards' ? 'card' : activeTab === 'accounts' ? 'account' : activeTab));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(i =>
        i.bankName?.toLowerCase().includes(q) ||
        i.cardNumber?.includes(q) ||
        i.accountNumber?.includes(q) ||
        i.userId?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [items, activeTab, searchQuery]);

  if (editorItem) {
    return (
      <BankingEditor
        item={editorItem}
        view={activeTab}
        onSave={handleSaveFromEditor}
        onClose={handleCloseEditor}
        onDelete={(item) => setDeleteConfirm(item)}
      />
    );
  }

  return (
    <StandardAppLayout
      headerConfig={{
        onBack: onExit,
        title: 'Wallet',
        search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search banking...' },
        nav: {
          type: 'tabs',
          data: TABS,
          activeId: activeTab,
          onSelect: (tabId) => navigate(`#banking/${tabId}`),
        },
        customActions: (
          <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
            <Settings size={20} />
          </button>
        ),
      }}
      fabConfig={{ onClick: () => navigate(`${currentBasePath}?edit=new`), icon: <Plus size={28} />, ariaLabel: "Add Item" }}
    >
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

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure you want to delete this? This cannot be undone.</div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </StandardAppLayout>
  );
};

export default BankingApp;