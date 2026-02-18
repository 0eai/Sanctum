// src/apps/passwords/Passwords.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, Plus, Search, Shield, X, Settings, FolderPlus, Home, ChevronRight, Folder
} from 'lucide-react';

import { Modal, Button, LoadingSpinner, Input } from '../../components/ui'; 
import MultiFab from '../../components/ui/MultiFab';
import ImportExportModal from '../../components/ui/ImportExportModal';

import { useClipboard } from '../../hooks/useClipboard';
import { escapeCSV } from '../../lib/passwordUtils';
import { 
  listenToPasswords, savePasswordItem, deletePasswordItem, createNewPasswordEntry,
  createPasswordFolder, updatePasswordFolder
} from '../../services/passwords';

import PasswordCard from './components/PasswordCard';
import ServiceGroup from './components/ServiceGroup';
import PasswordEditor from './components/PasswordEditor';

const PasswordsApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Navigation
  const [folderPath, setFolderPath] = useState([{ id: null, title: 'Vault' }]);

  // UI Modals
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState('create');
  const [folderToEdit, setFolderToEdit] = useState(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState(null);
  
  const [importing, setImporting] = useState(false);
  const copyUtils = useClipboard();

  // --- URL-Driven State ---
  const currentFolderId = route.resource === 'folder' ? route.resourceId : null;
  const isSettingsOpen = route.query?.modal === 'settings';
  const editId = route.resource === 'edit' ? route.resourceId : null;
  const currentBasePath = currentFolderId ? `#passwords/folder/${currentFolderId}` : `#passwords`;

  const editorItem = useMemo(() => {
      if (!editId) return null;
      if (editId === 'new') return {}; 
      return allItems.find(i => i.id === editId) || null;
  }, [editId, allItems]);


  // --- Listeners ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsubscribe = listenToPasswords(user.uid, cryptoKey, (data) => {
        setAllItems(data);
        setLoading(false);
    });
    return () => unsubscribe();
  }, [user, cryptoKey]);

  // --- Breadcrumbs Sync ---
  useEffect(() => {
    if (loading) return;
    const pathArray = [];
    let currentId = currentFolderId;
    while (currentId) {
        const parentFolder = allItems.find(i => i.id === currentId);
        if (parentFolder) {
            pathArray.unshift({ id: parentFolder.id, title: parentFolder.title });
            currentId = parentFolder.parentId;
        } else break;
    }
    setFolderPath([{ id: null, title: 'Vault' }, ...pathArray]);
    setSearchQuery("");
  }, [currentFolderId, allItems, loading]);

  // --- Grouping Logic ---
  const viewItems = useMemo(() => {
    let filtered = allItems;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = allItems.filter(i => 
        i.service?.toLowerCase().includes(q) || 
        i.title?.toLowerCase().includes(q) ||
        i.username?.toLowerCase().includes(q)
      );
    } else {
      filtered = allItems.filter(item => item.parentId === currentFolderId);
    }

    const folders = filtered.filter(i => i.type === 'folder');
    const passwords = filtered.filter(i => i.type !== 'folder');

    // Only group passwords by service if we are searching or in a folder
    const groups = {};
    passwords.forEach(item => {
        const key = (item.service || "Untitled").trim();
        const normalizedKey = key.toLowerCase();
        if (!groups[normalizedKey]) {
            groups[normalizedKey] = { name: key, items: [] };
        }
        groups[normalizedKey].items.push(item);
    });

    const groupedPasswords = Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));

    return { folders, groupedPasswords };
  }, [allItems, searchQuery, currentFolderId]);

  // --- Handlers ---
  const handleBack = () => {
    if (searchQuery) {
        setSearchQuery("");
    } else {
        if (folderPath.length > 1) {
            const targetId = folderPath[folderPath.length - 2].id;
            navigate(targetId ? `#passwords/folder/${targetId}` : `#passwords`);
        } else {
            onExit();
        }
    }
  };

  const handleSave = async (itemData) => {
    const savedId = await savePasswordItem(user.uid, cryptoKey, { ...itemData, parentId: currentFolderId });
    if (editId === 'new') {
        window.history.replaceState(null, '', `#passwords/edit/${savedId}`);
    }
  };

  const handleCloseEditor = async (finalData) => {
      navigate(currentBasePath);
      if (finalData && !finalData.service && !finalData.username && !finalData.password && !finalData.notes) {
          if (finalData.id) await deletePasswordItem(user.uid, finalData.id, allItems);
      }
  };

  const handleFolderAction = async (e) => {
    e.preventDefault();
    const title = e.target.title.value.trim();
    if (!title) return;

    if (folderModalMode === 'create') {
        await createPasswordFolder(user.uid, cryptoKey, title, currentFolderId);
    } else {
        await updatePasswordFolder(user.uid, cryptoKey, folderToEdit.id, title);
    }
    setIsFolderModalOpen(false);
    setFolderToEdit(null);
  };

  const handleMove = async (targetFolderId) => {
    const payload = itemToMove.type === 'folder' 
        ? { ...itemToMove, parentId: targetFolderId } // Service needs a specific updateFolder if hierarchy supported
        : { ...itemToMove, parentId: targetFolderId };
    
    if (itemToMove.type !== 'folder') {
        await savePasswordItem(user.uid, cryptoKey, payload);
    } else {
        // Simple update for folder moving (you can add this to services later if needed, for now just update doc)
        // Since we didn't add it to services, let's keep it simple and just use the password saver logic
        // which works because our payload is encrypted.
        await savePasswordItem(user.uid, cryptoKey, payload);
    }
    
    setIsMoveModalOpen(false);
    setItemToMove(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deletePasswordItem(user.uid, deleteConfirm.id, allItems);
    
    if (editorItem && editorItem.id === deleteConfirm.id) navigate(currentBasePath);
    setDeleteConfirm(null);
  };

  // --- Export / Import Logic ---
  const handleExport = () => {
    if (allItems.length === 0) return alert("No passwords to export.");
    const headers = ['name', 'url', 'username', 'password', 'note'];
    const csvRows = [headers.join(',')];

    allItems.filter(i => i.type !== 'folder').forEach(item => {
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
    navigate(currentBasePath); 
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
                    type: 'password', service: name, url, username: userField, password: pass, notes: note, parentId: currentFolderId 
                });
                count++;
            }
        }
        alert(`Imported ${count} passwords.`);
        navigate(currentBasePath);
      } catch (err) {
        alert("Import failed.");
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const fabActions = useMemo(() => [
    {
      label: "New Folder",
      icon: <FolderPlus size={20} />,
      onClick: () => { setFolderModalMode('create'); setIsFolderModalOpen(true); },
      variant: 'secondary'
    },
    {
      label: "New Password",
      icon: <Plus size={24} />,
      onClick: () => navigate(`#passwords/edit/new`),
      variant: 'primary'
    }
  ], [navigate]);

  // --- RENDER ---
  
  if (editId) {
      return (
          <PasswordEditor 
            item={editorItem || { parentId: currentFolderId }} 
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
                <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
                <h1 className="text-xl font-bold flex items-center gap-2"><Shield size={20} /> Passwords</h1>
            </div>
            
            <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
                <Settings size={20} />
            </button>
            </div>

            <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search logins..." className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
            </div>

            {!searchQuery && (
                <div className="flex items-center gap-1 text-sm text-blue-100 overflow-x-auto no-scrollbar whitespace-nowrap mask-fade-right">
                {folderPath.map((folder, index) => (
                    <React.Fragment key={index}>
                    {index > 0 && <ChevronRight size={14} className="opacity-50" />}
                    <button onClick={() => navigate(folder.id ? `#passwords/folder/${folder.id}` : `#passwords`)} className={`hover:text-white transition-colors flex items-center gap-1 ${index === folderPath.length - 1 ? 'font-bold text-white' : ''}`}>
                        {index === 0 && <Home size={14} />} {folder.title}
                    </button>
                    </React.Fragment>
                ))}
                </div>
            )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-3xl mx-auto pb-32 space-y-3">
            {loading && <div className="flex justify-center py-10"><LoadingSpinner /></div>}
            
            {!loading && viewItems.folders.length === 0 && viewItems.groupedPasswords.length === 0 && (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
                <div className="bg-gray-100 p-4 rounded-full"><Shield size={32} className="opacity-50" /></div>
                <p>{searchQuery ? "No matching items found." : "This folder is empty."}</p>
                </div>
            )}

            {/* Folders */}
            {viewItems.folders.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                    {viewItems.folders.map(folder => (
                        <PasswordCard 
                            key={folder.id} 
                            item={folder} 
                            onEnterFolder={(f) => navigate(`#passwords/folder/${f.id}`)}
                            onEdit={(f) => { setFolderToEdit(f); setFolderModalMode('edit'); setIsFolderModalOpen(true); }}
                            onDelete={setDeleteConfirm} 
                            copyUtils={copyUtils} 
                        />
                    ))}
                </div>
            )}

            {/* Passwords */}
            {viewItems.groupedPasswords.map((group) => group.items.length === 1 ? (
                <PasswordCard 
                    key={group.items[0].id} 
                    item={group.items[0]} 
                    onEdit={(i) => navigate(`#passwords/edit/${i.id}`)} 
                    onDelete={setDeleteConfirm} 
                    copyUtils={copyUtils} 
                />
            ) : (
                <ServiceGroup 
                    key={group.name} 
                    serviceName={group.name} 
                    items={group.items} 
                    onEdit={(i) => navigate(`#passwords/edit/${i.id}`)} 
                    onDelete={setDeleteConfirm} 
                    copyUtils={copyUtils} 
                />
            ))}
        </div>
      </main>

      <MultiFab actions={fabActions} maxWidth="max-w-4xl" />

      {/* --- Modals --- */}
      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title={folderModalMode === 'create' ? "New Folder" : "Rename Folder"}>
        <form onSubmit={handleFolderAction} className="flex flex-col gap-4">
          <Input name="title" label="Folder Name" defaultValue={folderToEdit?.title || ''} autoFocus required />
          <div className="flex gap-2">
             {folderModalMode === 'edit' && (
                 <Button type="button" variant="secondary" onClick={() => { setItemToMove(folderToEdit); setIsMoveModalOpen(true); setIsFolderModalOpen(false); }} className="flex-1 bg-white border border-gray-200">Move</Button>
             )}
             <Button type="submit" className={folderModalMode === 'edit' ? "flex-1" : "w-full"}>{folderModalMode === 'create' ? "Create" : "Save"}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isMoveModalOpen} onClose={() => { setIsMoveModalOpen(false); setItemToMove(null); }} title="Move to Folder">
        <div className="flex flex-col gap-2">
            <button onClick={() => handleMove(null)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2"><Home size={16} /> Vault Root</button>
            {allItems.filter(i => i.type === 'folder' && i.id !== itemToMove?.id).map(f => (
                <button key={f.id} onClick={() => handleMove(f.id)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2"><Folder size={16} /> {f.title}</button>
            ))}
        </div>
      </Modal>

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

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
            Are you sure you want to delete <b>{deleteConfirm?.service || deleteConfirm?.title || "this entry"}</b>?
            {deleteConfirm?.type === 'folder' && <span className="block mt-1 font-bold">This deletes all contents!</span>}
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