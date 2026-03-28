// src/apps/passwords/Passwords.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Shield, Settings, FolderPlus, Home, Folder
} from 'lucide-react';

import { Modal, Button, LoadingSpinner, Input } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

import { useClipboard } from '../../hooks/useClipboard';
import { escapeCSV } from '../../lib/passwordUtils';
import {
  listenToPasswords, savePasswordItem, deletePasswordItem, createNewPasswordEntry,
  createPasswordFolder, updatePasswordFolder
} from './services/passwords';

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

  const handleBreadcrumbClick = (index, folder) => {
    navigate(folder.id ? `#passwords/folder/${folder.id}` : `#passwords`);
  };

  const handleSave = async (itemData) => {
    const finalParentId = itemData.parentId !== undefined ? itemData.parentId : (route.query?.folder || null);

    const savedId = await savePasswordItem(user.uid, cryptoKey, {
      ...itemData,
      parentId: finalParentId
    });

    return savedId;
  };

  const handleCloseEditor = async (finalData) => {
    const backFolder = finalData?.parentId || route.query?.folder || null;
    navigate(backFolder ? `#passwords/folder/${backFolder}` : `#passwords`);

    if (finalData) {
      const isEmpty = !finalData.service?.trim() && !finalData.username?.trim() && !finalData.password && !finalData.notes?.trim();
      if (isEmpty && finalData.id) {
        await deletePasswordItem(user.uid, finalData.id, allItems);
      }
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
    if (itemToMove.type === 'service_group') {
      const movePromises = itemToMove.items.map(item =>
        savePasswordItem(user.uid, cryptoKey, { ...item, parentId: targetFolderId })
      );
      await Promise.all(movePromises);
    } else {
      const payload = { ...itemToMove, parentId: targetFolderId };
      await savePasswordItem(user.uid, cryptoKey, payload);
    }

    setIsMoveModalOpen(false);
    setItemToMove(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.id) {
      await deletePasswordItem(user.uid, deleteConfirm.id, allItems);
    }

    if (editId) navigate(currentBasePath);
    setDeleteConfirm(null);
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
      onClick: () => navigate(`#passwords/edit/new${currentFolderId ? `?folder=${currentFolderId}` : ''}`),
      variant: 'primary'
    }
  ], [navigate, currentFolderId]);

  // --- RENDER ---

  if (editId) {
    return (
      <>
        <PasswordEditor
          item={editorItem || { parentId: currentFolderId }}
          onSave={handleSave}
          onClose={handleCloseEditor}
          onDelete={(item) => setDeleteConfirm(item)}
          copyUtils={copyUtils}
        />
        <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Item" zIndex={100}>
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
      </>
    );
  }

  return (
    <StandardAppLayout
      headerConfig={{
        onBack: handleBack,
        title: 'Passwords',
        icon: Shield,
        search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search logins...' },
        nav: !searchQuery ? {
          type: 'breadcrumbs',
          data: folderPath,
          onSelect: handleBreadcrumbClick,
        } : undefined,
        customActions: (
          <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
            <Settings size={20} />
          </button>
        ),
      }}
      fabConfig={{ actions: fabActions }}
    >
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
          onMove={(i) => { setItemToMove(i); setIsMoveModalOpen(true); }}
        />
      ) : (
        <ServiceGroup
          key={group.name}
          serviceName={group.name}
          items={group.items}
          onEdit={(i) => navigate(`#passwords/edit/${i.id}`)}
          onDelete={setDeleteConfirm}
          copyUtils={copyUtils}
          onMove={(i) => { setItemToMove(i); setIsMoveModalOpen(true); }}
        />
      ))}

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
    </StandardAppLayout>
  );
};

export default PasswordsApp;