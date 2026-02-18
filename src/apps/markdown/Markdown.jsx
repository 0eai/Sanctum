
// src/apps/markdown/Markdown.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, Plus, Search, FileText, Settings, X, Star, FileCode,
  FolderPlus, Folder, ChevronRight, Home
} from 'lucide-react';

import { Modal, Button, LoadingSpinner, Input } from '../../components/ui';
import MultiFab from '../../components/ui/MultiFab';
import ImportExportModal from '../../components/ui/ImportExportModal';

import {
  listenToMarkdownDocs, saveMarkdownDoc, deleteMarkdownItem, createFolder, updateFolder,
  exportMarkdownDocs, importMarkdownDocs
} from '../../services/markdown';

import MarkdownEditor from './components/MarkdownEditor';
import MarkdownCard from './components/MarkdownCard';

const MarkdownApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('saved');

  // Navigation State
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderPath, setFolderPath] = useState([{ id: null, title: 'Markdown' }]);
  const [searchQuery, setSearchQuery] = useState("");

  // Editor State
  const [editorDoc, setEditorDoc] = useState(null);

  // Modals
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState('create');
  const [folderToEdit, setFolderToEdit] = useState(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // --- Listeners ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsub = listenToMarkdownDocs(user.uid, cryptoKey, (data) => {
      setDocs(data);
      setLoading(false);
    });
    return () => unsub();
  }, [user, cryptoKey]);

  useEffect(() => {
    if (loading || docs.length === 0) return;

    const { resource, resourceId, action } = route;

    if (resource === 'folder' && resourceId) {
      setCurrentFolderId(resourceId);
      setEditorDoc(null);
      buildBreadcrumbs(resourceId);

    } else if (resource === 'doc' && resourceId) {
      // --- NEW DOC CREATION ---
      if (resourceId === 'new') {
        setEditorDoc({ title: '', content: '', isPinned: false, parentId: currentFolderId, initialPreview: false });
        return; // Skip the rest
      }

      // --- EXISTING DOC ---
      const targetDoc = docs.find(d => d.id === resourceId);
      if (targetDoc) {
        setEditorDoc({ ...targetDoc, initialPreview: action !== 'edit' });
        setCurrentFolderId(targetDoc.parentId || null);
        buildBreadcrumbs(targetDoc.parentId);
      }
    } else {
      setCurrentFolderId(null);
      setEditorDoc(null);
      setFolderPath([{ id: null, title: 'Markdown' }]);
    }
  }, [route, docs, loading]);

  // Helper function to reconstruct path
  const buildBreadcrumbs = (startId) => {
    const pathArray = [];
    let currentId = startId;
    while (currentId) {
      const parentFolder = docs.find(d => d.id === currentId);
      if (parentFolder) {
        pathArray.unshift({ id: parentFolder.id, title: parentFolder.title });
        currentId = parentFolder.parentId;
      } else {
        break;
      }
    }
    setFolderPath([{ id: null, title: 'Markdown' }, ...pathArray]);
  };

  // --- Handlers ---

  const handleSave = async (docData) => {
    if (!docData.title?.trim() && !docData.content?.trim()) {
      if (docData.id) await deleteMarkdownItem(user.uid, docData, docs);
      return;
    }

    setSaveStatus('saving');
    try {
      const id = await saveMarkdownDoc(user.uid, cryptoKey, docData, currentFolderId);

      if (!docData.id) {
        setEditorDoc(prev => ({ ...prev, id }));
        // Silently update the URL from 'new' to the actual ID so refreshes work safely
        window.history.replaceState(null, '', `#markdown/doc/${id}/edit`);
      }

      setSaveStatus('saved');
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
    }
  };

  const handleFolderAction = async (e) => {
    e.preventDefault();
    const title = e.target.title.value.trim();
    if (!title) return;

    if (folderModalMode === 'create') {
      await createFolder(user.uid, cryptoKey, title, currentFolderId);
    } else {
      await updateFolder(user.uid, cryptoKey, folderToEdit.id, title);
    }
    setIsFolderModalOpen(false);
    setFolderToEdit(null);
  };

  const handleMove = async (targetFolderId) => {
    if (itemToMove.type === 'folder') {
      // Move folder: update its parentId via updateFolder
      await updateFolder(user.uid, cryptoKey, itemToMove.id, itemToMove.title, targetFolderId);
    } else {
      // Move doc: re-save with new parentId (saveMarkdownDoc handles encryption)
      await saveMarkdownDoc(user.uid, cryptoKey, { ...itemToMove, parentId: targetFolderId }, currentFolderId);
    }

    setIsMoveModalOpen(false);
    setItemToMove(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteMarkdownItem(user.uid, deleteConfirm, docs);
    setDeleteConfirm(null);
  };

  // --- Navigation Handlers ---
  const handleEnterFolder = (folder) => {
    // Instead of setting state, update the URL!
    navigate(`#markdown/folder/${folder.id}`);
  };

  const handleBreadcrumbClick = (index) => {
    const targetFolder = folderPath[index];
    if (targetFolder.id === null) {
      navigate(`#markdown`);
    } else {
      navigate(`#markdown/folder/${targetFolder.id}`);
    }
  };

  // --- Import / Export Handlers ---
  const handleExport = async () => {
    setProcessing(true);
    try {
      const data = await exportMarkdownDocs(user.uid, cryptoKey);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `markdown_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert("Export failed."); }
    setProcessing(false);
    setIsSettingsOpen(false);
  };

  const handleImport = async (file) => {
    if (!file) return;
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const count = await importMarkdownDocs(user.uid, cryptoKey, json);
        alert(`Imported ${count} items.`);
        setIsSettingsOpen(false);
      } catch (e) { alert("Import failed."); }
      setProcessing(false);
    };
    reader.readAsText(file);
  };

  // --- Render Helpers ---
  const displayedItems = useMemo(() => {
    let filtered = docs;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = docs.filter(d => d.title.toLowerCase().includes(q) || (d.content && d.content.toLowerCase().includes(q)));
    } else {
      filtered = docs.filter(d => d.parentId === currentFolderId);
    }

    return filtered.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }, [docs, currentFolderId, searchQuery]);

  const fabActions = useMemo(() => [
    {
      label: "New Folder",
      icon: <FolderPlus size={20} />,
      onClick: () => { setFolderModalMode('create'); setIsFolderModalOpen(true); },
      variant: 'secondary'
    },
    {
      label: "New Document",
      icon: <Plus size={24} />,
      onClick: () => navigate(`#markdown/doc/new/edit`), // <-- Let the URL do the work!
      variant: 'primary'
    }
  ], [currentFolderId, navigate]);

  // --- View: Editor ---
  if (editorDoc) {
    return (
      <MarkdownEditor
        item={editorDoc}
        onSave={handleSave}
        onBack={() => {
          // Let the URL close the editor
          if (currentFolderId) {
            navigate(`#markdown/folder/${currentFolderId}`);
          } else {
            navigate(`#markdown`);
          }
        }}
        onExport={(d) => { /* handle export */ }}
        saveStatus={saveStatus}
        navigate={navigate}
      />
    );
  }

  // --- View: List ---
  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => {
                if (folderPath.length > 1) handleBreadcrumbClick(folderPath.length - 2);
                else onExit();
              }} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
              <h1 className="text-xl font-bold">Markdown</h1>
            </div>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
              <Settings size={20} />
            </button>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..."
              className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm"
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
          </div>

          {!searchQuery && (
            <div className="flex items-center gap-1 text-sm text-blue-100 overflow-x-auto no-scrollbar whitespace-nowrap">
              {folderPath.map((folder, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <ChevronRight size={14} className="opacity-50" />}
                  <button onClick={() => handleBreadcrumbClick(index)} className={`hover:text-white transition-colors flex items-center gap-1 ${index === folderPath.length - 1 ? 'font-bold text-white' : ''}`}>
                    {index === 0 && <Home size={14} />} {folder.title}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-3xl mx-auto pb-32">
          {loading ? (
            <div className="flex justify-center py-20"><LoadingSpinner /></div>
          ) : displayedItems.length === 0 ? (
            <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
              <div className="bg-white p-4 rounded-full shadow-sm"><FileCode size={32} className="opacity-50" /></div>
              <p>Empty folder.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayedItems.map(item => (
                <MarkdownCard
                  key={item.id}
                  item={item}
                  docs={docs}
                  onClick={() => item.type === 'folder'
                    ? navigate(`#markdown/folder/${item.id}`)
                    : navigate(`#markdown/doc/${item.id}`) // Defaults to view
                  }
                  onMove={(i) => { setItemToMove(i); setIsMoveModalOpen(true); }}
                  onDelete={(i) => setDeleteConfirm(i)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <MultiFab actions={fabActions} maxWidth="max-w-4xl" />

      {/* --- MODALS --- */}
      <ImportExportModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onImport={handleImport}
        onExport={handleExport}
        isImporting={processing}
        title="Manage Markdown"
        accept=".json"
        importLabel="Import JSON"
        exportLabel="Export JSON"
      />

      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title={folderModalMode === 'create' ? "New Folder" : "Rename Folder"}>
        <form onSubmit={handleFolderAction} className="flex flex-col gap-4">
          <Input name="title" label="Folder Name" defaultValue={folderToEdit?.title || ''} autoFocus required />
          <Button type="submit" className="w-full">{folderModalMode === 'create' ? "Create" : "Save Changes"}</Button>
        </form>
      </Modal>

      <Modal isOpen={isMoveModalOpen} onClose={() => { setIsMoveModalOpen(false); setItemToMove(null); }} title="Move to Folder">
        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
          <button onClick={() => handleMove(null)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2"><Home size={16} /> Home</button>
          {docs.filter(d => d.type === 'folder' && d.id !== itemToMove?.id).map(f => (
            <button key={f.id} onClick={() => handleMove(f.id)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2"><Folder size={16} /> {f.title}</button>
          ))}
        </div>
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
            Are you sure you want to delete <b>{deleteConfirm?.title || 'this item'}</b>?
            {deleteConfirm?.type === 'folder' && <span className="block mt-1 font-bold text-xs">This will delete all documents inside!</span>}
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete}>Delete</Button></div>
        </div>
      </Modal>
    </div>
  );
};

export default MarkdownApp;