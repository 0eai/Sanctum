// src/apps/passwords/Passwords.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, Plus, Search, Shield, X, Settings 
} from 'lucide-react';

import { Modal, Button, LoadingSpinner } from '../../components/ui'; 
import Fab from '../../components/ui/Fab';
import ImportExportModal from '../../components/ui/ImportExportModal';

import { useClipboard } from '../../hooks/useClipboard';
import { escapeCSV } from '../../lib/passwordUtils';
import { 
  listenToPasswords, savePasswordItem, deletePasswordItem, createNewPasswordEntry 
} from '../../services/passwords';

import PasswordCard from './components/PasswordCard';
import ServiceGroup from './components/ServiceGroup';
import PasswordEditor from './components/PasswordEditor';

// FIXED: Accept route and navigate props
const PasswordsApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [importing, setImporting] = useState(false);
  
  const copyUtils = useClipboard();

  // --- URL-Driven State ---
  const isSettingsOpen = route.query?.modal === 'settings';
  const editId = route.resource === 'edit' ? route.resourceId : null;
  const currentBasePath = `#passwords`;

  // Determine what to show in the editor modal
  const editorItem = useMemo(() => {
      if (!editId) return null;
      if (editId === 'new') return {}; // Empty object for new password
      return items.find(i => i.id === editId) || null;
  }, [editId, items]);


  // --- Listeners ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsubscribe = listenToPasswords(user.uid, cryptoKey, (data) => {
        setItems(data);
        setLoading(false);
    });
    return () => unsubscribe();
  }, [user, cryptoKey]);

  // --- Grouping Logic ---
  const groupedItems = useMemo(() => {
    let filtered = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = items.filter(i => 
        i.service?.toLowerCase().includes(q) || 
        i.username?.toLowerCase().includes(q)
      );
    }

    const groups = {};
    filtered.forEach(item => {
        const key = (item.service || "Untitled").trim();
        const normalizedKey = key.toLowerCase();
        if (!groups[normalizedKey]) {
            groups[normalizedKey] = { name: key, items: [] };
        }
        groups[normalizedKey].items.push(item);
    });

    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchQuery]);

  // --- Handlers ---
  const handleSave = async (itemData) => {
    const savedId = await savePasswordItem(user.uid, cryptoKey, itemData);
    // If it was a 'new' draft, silently update URL to the real ID
    if (editId === 'new') {
        window.history.replaceState(null, '', `#passwords/edit/${savedId}`);
    }
  };

  const handleAddNew = () => {
    // Navigate to the 'new' route
    navigate(`#passwords/edit/new`);
  };

  const handleCloseEditor = async (finalData) => {
      // Close the editor by navigating back to the root
      navigate(currentBasePath);

      // Auto-delete empty drafts on close
      if (finalData && !finalData.service && !finalData.username && !finalData.password && !finalData.notes) {
          if (finalData.id) {
              await deletePasswordItem(user.uid, finalData.id);
          }
      }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deletePasswordItem(user.uid, deleteConfirm.id);
    
    // If deleting the currently open item, go back to list
    if (editorItem && editorItem.id === deleteConfirm.id) {
        navigate(currentBasePath);
    }
    setDeleteConfirm(null);
  };

  // --- Export / Import Logic ---
  const handleExport = () => {
    if (items.length === 0) return alert("No passwords to export.");
    const headers = ['name', 'url', 'username', 'password', 'note'];
    const csvRows = [headers.join(',')];

    items.forEach(item => {
      csvRows.push([
        escapeCSV(item.service),
        escapeCSV(item.url),
        escapeCSV(item.username),
        escapeCSV(item.password),
        escapeCSV(item.notes)
      ].join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `passwords_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    navigate(currentBasePath); // Close Settings Modal
  };

  const handleImport = async (file) => {
    if (!file) return;
    setImporting(true);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r\n|\n/);
        const dataStart = lines[0].startsWith('name') ? 1 : 0;
        let count = 0;
        
        for (let i = dataStart; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Basic parser
            const row = []; 
            let inQuote = false; 
            let token = '';
            for(let c of line) {
                if (c === '"') inQuote = !inQuote;
                else if (c === ',' && !inQuote) { row.push(token); token = ''; }
                else token += c;
            }
            row.push(token);

            const [name, url, userField, pass, note] = row.map(cell => {
                let v = cell.trim();
                return (v.startsWith('"') && v.endsWith('"')) ? v.slice(1, -1).replace(/""/g, '"') : v;
            });

            if (name || userField || pass) {
                await savePasswordItem(user.uid, cryptoKey, { 
                    service: name, url, username: userField, password: pass, notes: note 
                });
                count++;
            }
        }
        alert(`Imported ${count} passwords.`);
        navigate(currentBasePath); // Close Settings Modal
      } catch (err) {
        alert("Import failed.");
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
  };

  // --- RENDER ---
  
  if (editId) {
      return (
          <PasswordEditor 
            item={editorItem || {}} // Pass empty object if new, or target data
            onSave={handleSave}
            onClose={handleCloseEditor}
            onDelete={(item) => setDeleteConfirm(item)}
            copyUtils={copyUtils}
          />
      );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
                <h1 className="text-xl font-bold flex items-center gap-2"><Shield size={20} /> Passwords</h1>
            </div>
            
            <button 
                onClick={() => navigate(`${currentBasePath}?modal=settings`)} 
                className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white"
            >
                <Settings size={20} />
            </button>
            </div>

            <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search logins..." className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
            </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-3xl mx-auto pb-32 space-y-3">
            {loading && <div className="flex justify-center py-10"><LoadingSpinner /></div>}
            {!loading && items.length === 0 && (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-full shadow-sm"><Shield size={32} className="opacity-50" /></div>
                <p>No passwords found.</p>
                </div>
            )}

            {groupedItems.map((group) => group.items.length === 1 ? (
                <PasswordCard 
                    key={group.items[0].id} 
                    item={group.items[0]} 
                    onEdit={(i) => navigate(`#passwords/edit/${i.id}`)} // Route to edit
                    onDelete={setDeleteConfirm} 
                    copyUtils={copyUtils} 
                />
            ) : (
                <ServiceGroup 
                    key={group.name} 
                    serviceName={group.name} 
                    items={group.items} 
                    onEdit={(i) => navigate(`#passwords/edit/${i.id}`)} // Route to edit
                    onDelete={setDeleteConfirm} 
                    copyUtils={copyUtils} 
                />
            ))}
        </div>
      </main>

      <Fab 
        onClick={handleAddNew} 
        icon={<Plus size={28} />}
        maxWidth="max-w-4xl"
        ariaLabel="Add Password"
      />

      {/* Generic Import/Export Modal */}
      <ImportExportModal 
        isOpen={isSettingsOpen}
        onClose={() => navigate(currentBasePath)}
        onImport={handleImport}
        onExport={handleExport}
        isImporting={importing}
        title="Manage Passwords"
        accept=".csv"
        importLabel="Import CSV"
        exportLabel="Export CSV"
      />

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Password" zIndex={100}>
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
            Are you sure you want to delete <b>{deleteConfirm?.service || "this entry"}</b>?
            <span className="block mt-1 text-xs opacity-75">This cannot be undone.</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PasswordsApp;