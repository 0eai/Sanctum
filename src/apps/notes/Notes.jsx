// src/apps/notes/Notes.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, Plus, FolderPlus, Home, ChevronRight, LayoutGrid, List,
  Loader, Link, Globe, Check, CloudOff, Folder, Settings 
} from 'lucide-react';

import { Modal, Button, Input } from '../../components/ui'; 
import MultiFab from '../../components/ui/MultiFab'; 
import ImportExportModal from '../../components/ui/ImportExportModal'; 

import { 
  listenToNotes, saveNote, createFolder, updateFolder, deleteNoteItem, 
  togglePin, rescheduleNote, shareNote, stopSharingNote,
  exportNotes, importNotes 
} from '../../services/notes';

import NoteCard from './components/NoteCard';
import NoteEditor from './components/NoteEditor';

// FIXED: Accept route and navigate from props
const NotesApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('saved'); 
  
  // Navigation & View State
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderPath, setFolderPath] = useState([{ id: null, title: 'Notes' }]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState('grid'); 

  // Modal & Editor State
  const [editorState, setEditorState] = useState(null); 
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState('create'); 
  const [folderToEdit, setFolderToEdit] = useState(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [shareModal, setShareModal] = useState(null); 
  const [processing, setProcessing] = useState(false);

  // --- URL-Driven Modal State ---
  const isSettingsOpen = route.query?.modal === 'settings';
  // Helper to get the current base path for opening/closing modals without losing folder context
  const currentBasePath = route.resourceId ? `#notes/${route.resource}/${route.resourceId}` : `#notes`;

  // --- 1. Listeners ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsub = listenToNotes(user.uid, cryptoKey, (data) => {
        setItems(data);
        setLoading(false);
    });
    return () => unsub();
  }, [user, cryptoKey]);

  // --- 2. URL Route Sync ---
  // FIXED: Sync internal state strictly to the URL route object
  useEffect(() => {
    if (loading) return; 

    // FIXED: Catch legacy "?openId=123" deep links and redirect them to the new REST URL
    if (route.query?.openId) {
        window.location.replace(
            `${window.location.pathname}${window.location.search}#notes/doc/${route.query.openId}`
        );
        return; 
    }

    const { resource, resourceId } = route;

    if (resource === 'folder' && resourceId) {
        setCurrentFolderId(resourceId);
        setEditorState(null);
        buildBreadcrumbs(resourceId); 

    } else if (resource === 'doc' && resourceId) {
        if (resourceId === 'new') {
            setEditorState({ title: '', content: '', tags: [], attachments: [], isPinned: false, parentId: currentFolderId });
            return;
        }

        const targetNote = items.find(i => i.id === resourceId);
        if (targetNote) {
            setEditorState(targetNote);
            setCurrentFolderId(targetNote.parentId || null);
            buildBreadcrumbs(targetNote.parentId);
        }
    } else {
        // Root path fallback
        setCurrentFolderId(null);
        setEditorState(null);
        setFolderPath([{ id: null, title: 'Notes' }]);
    }
  }, [route, items, loading, currentFolderId, navigate]);

  const buildBreadcrumbs = (startId) => {
      const pathArray = [];
      let currentId = startId;
      while (currentId) {
          const parentFolder = items.find(i => i.id === currentId);
          if (parentFolder) {
              pathArray.unshift({ id: parentFolder.id, title: parentFolder.title });
              currentId = parentFolder.parentId;
          } else {
              break;
          }
      }
      setFolderPath([{ id: null, title: 'Notes' }, ...pathArray]);
  };

  // --- 3. Derived State ---
  const displayedItems = useMemo(() => {
    let filtered = items;
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = items.filter(i => 
            i.title?.toLowerCase().includes(q) || 
            i.content?.toLowerCase().includes(q) ||
            i.tags?.some(t => t.toLowerCase().includes(q))
        );
    } else {
        filtered = items.filter(i => i.parentId === currentFolderId);
    }
    return filtered.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
    });
  }, [items, currentFolderId, searchQuery]);

  const folderCounts = useMemo(() => {
    const counts = {};
    items.forEach(item => { if (item.parentId) counts[item.parentId] = (counts[item.parentId] || 0) + 1; });
    return counts;
  }, [items]);

  // --- 4. Handlers ---
  const handleSaveNote = async (noteData) => {
    if (!noteData.title.trim() && !noteData.content.trim() && noteData.attachments.length === 0) {
        if (noteData.id) await deleteNoteItem(user.uid, noteData, items);
        return;
    }
    setSaveStatus('saving');
    try {
        const id = await saveNote(user.uid, cryptoKey, noteData, currentFolderId);
        
        // Silently update the URL from 'new' to the actual ID so refreshes work
        if (!noteData.id) {
            setEditorState(prev => ({ ...prev, id }));
            window.history.replaceState(null, '', `#notes/doc/${id}/edit`);
        }
        
        setSaveStatus('saved');
    } catch (e) {
        console.error(e);
        setSaveStatus('error');
    }
  };

  const handleFolderAction = async (e) => {
    e.preventDefault();
    const title = e.target.title.value;
    if (folderModalMode === 'create') {
        await createFolder(user.uid, cryptoKey, title, currentFolderId);
    } else {
        await updateFolder(user.uid, cryptoKey, folderToEdit.id, title);
    }
    setIsFolderModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    await deleteNoteItem(user.uid, deleteConfirmation, items);
    setDeleteConfirmation(null);
  };

  const handleMove = async (targetFolderId) => {
    await saveNote(user.uid, cryptoKey, { ...itemToMove, parentId: targetFolderId }, currentFolderId);
    setIsMoveModalOpen(false);
    setItemToMove(null);
  };

  const handleShare = async (note) => {
      try {
          const { sharedId, shareUrlKey } = await shareNote(user.uid, cryptoKey, note);
          const url = `${window.location.origin}/#view?id=${sharedId}&k=${shareUrlKey}`;
          if (editorState?.id === note.id) setEditorState(s => ({ ...s, sharedId, shareUrlKey }));
          setShareModal({ isOpen: true, note: { ...note, sharedId, shareUrlKey }, link: url });
      } catch(e) { alert("Sharing failed."); }
  };

  const handleStopShare = async (note) => {
      await stopSharingNote(user.uid, cryptoKey, note);
      if (editorState?.id === note.id) setEditorState(s => ({ ...s, sharedId: null, shareUrlKey: null }));
      setShareModal(null);
  };

  // --- Import / Export Handlers ---
  const handleExport = async () => {
    setProcessing(true);
    try {
      const data = await exportNotes(user.uid, cryptoKey);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notes_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { alert("Export failed."); }
    setProcessing(false);
    navigate(currentBasePath); // Close modal
  };

  const handleImport = async (file) => {
    if (!file) return;
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const count = await importNotes(user.uid, cryptoKey, json);
        alert(`Successfully imported ${count} items.`);
        navigate(currentBasePath); // Close modal
      } catch (e) { alert("Import failed. Invalid file format."); }
      setProcessing(false);
    };
    reader.readAsText(file);
  };

  // --- Navigation Handlers ---
  const handleBreadcrumbClick = (index) => {
    const targetFolder = folderPath[index];
    if (targetFolder.id === null) navigate(`#notes`);
    else navigate(`#notes/folder/${targetFolder.id}`);
  };

  const handleBack = () => {
    if (editorState) {
        if (currentFolderId) navigate(`#notes/folder/${currentFolderId}`);
        else navigate(`#notes`);
    } else if (searchQuery) {
        setSearchQuery("");
    } else {
        if (folderPath.length > 1) handleBreadcrumbClick(folderPath.length - 2);
        else navigate(''); // Exit to launcher
    }
  };

  // --- Configuration for MultiFab ---
  const fabActions = useMemo(() => [
    {
      label: "New Folder",
      icon: <FolderPlus size={20} />,
      onClick: () => { setFolderModalMode('create'); setIsFolderModalOpen(true); },
      variant: 'secondary'
    },
    {
      label: "New Note",
      icon: <Plus size={24} />,
      onClick: () => navigate(`#notes/doc/new/edit`), // FIXED: Push URL instead of setting state
      variant: 'primary'
    }
  ], [currentFolderId, navigate]); 

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
      {editorState ? (
        <NoteEditor 
            note={editorState}
            onSave={handleSaveNote}
            onBack={handleBack}
            onPin={(e, item) => togglePin(user.uid, item.id, item.isPinned)} 
            onShare={(e, item) => { e.stopPropagation(); const url = item.sharedId ? `${window.location.origin}/#view?id=${item.sharedId}&k=${item.shareUrlKey}` : null; setShareModal({ isOpen: true, note: item, link: url }); }}
            saveStatus={saveStatus}
        />
      ) : (
        <>
          <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
            <div className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
                  <h1 className="text-xl font-bold">Notes</h1>
                </div>
                
                <div className="flex items-center gap-1">
                    <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                        {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
                    </button>
                    {/* FIXED: Open settings by pushing ?modal=settings to the current path */}
                    <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
                        <Settings size={20} />
                    </button>
                </div>
              </div>
              {!searchQuery && (
                <div className="flex items-center gap-1 text-sm text-blue-100 overflow-x-auto no-scrollbar whitespace-nowrap mask-fade-right">
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
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2"><Loader className="animate-spin" /> <p>Loading...</p></div>
              ) : displayedItems.length === 0 ? (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4"><div className="bg-white p-4 rounded-full shadow-sm"><FolderPlus size={32} className="opacity-50" /></div><p>Empty folder.</p></div>
              ) : (
                <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-3" : "flex flex-col gap-2"}>
                  {displayedItems.map(item => (
                    <NoteCard 
                        key={item.id} 
                        item={item} 
                        viewMode={viewMode}
                        onOpen={() => navigate(`#notes/doc/${item.id}/edit`)} // FIXED: Drive by URL
                        onFolderOpen={() => navigate(`#notes/folder/${item.id}`)} // FIXED: Drive by URL
                        onPin={(e) => { e.stopPropagation(); togglePin(user.uid, item.id, item.isPinned); }}
                        onMove={(e) => { e.stopPropagation(); setItemToMove(item); setIsMoveModalOpen(true); }}
                        onEditFolder={(e) => { e.stopPropagation(); setFolderToEdit(item); setFolderModalMode('edit'); setIsFolderModalOpen(true); }}
                        onDelete={(e) => { e.stopPropagation(); setDeleteConfirmation(item); }}
                        onShare={(e) => { e.stopPropagation(); const url = item.sharedId ? `${window.location.origin}/#view?id=${item.sharedId}&k=${item.shareUrlKey}` : null; setShareModal({ isOpen: true, note: item, link: url }); }}
                        onReschedule={(e) => { e.stopPropagation(); rescheduleNote(user.uid, cryptoKey, item); }}
                        folderCounts={folderCounts}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>

          <MultiFab actions={fabActions} maxWidth="max-w-4xl" />
        </>
      )}

      {/* Modals */}
      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title={folderModalMode === 'create' ? "New Folder" : "Rename Folder"}>
        <form onSubmit={handleFolderAction} className="flex flex-col gap-4">
          <Input name="title" label="Folder Name" defaultValue={folderToEdit?.title || ''} autoFocus required />
          <Button type="submit" className="w-full">{folderModalMode === 'create' ? "Create" : "Save Changes"}</Button>
        </form>
      </Modal>

      <Modal isOpen={isMoveModalOpen} onClose={() => { setIsMoveModalOpen(false); setItemToMove(null); }} title="Move to Folder">
        <div className="flex flex-col gap-2">
            <button onClick={() => handleMove(null)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2"><Home size={16} /> Home</button>
            {items.filter(i => i.type === 'folder' && i.id !== itemToMove?.id).map(f => (
                <button key={f.id} onClick={() => handleMove(f.id)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2"><Folder size={16} /> {f.title}</button>
            ))}
        </div>
      </Modal>

      <ImportExportModal 
        isOpen={isSettingsOpen}
        onClose={() => navigate(currentBasePath)} // FIXED: Close settings modal via URL
        onImport={handleImport}
        onExport={handleExport}
        isImporting={processing}
        title="Manage Notes"
        accept=".json"
        importLabel="Import JSON"
        exportLabel="Export JSON"
      />

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure? {deleteConfirmation?.type === 'folder' && "This deletes everything inside!"}</div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete}>Delete</Button></div>
        </div>
      </Modal>

      <Modal isOpen={!!shareModal} onClose={() => setShareModal(null)} title="Share Note" zIndex={100}>
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 text-green-600 text-sm font-bold"><Check size={16} /> Public Link Active</div>
                <div className="text-xs text-gray-500 break-all">{shareModal?.link || "Link not generated yet."}</div>
            </div>
            <div className="flex flex-col gap-2">
                {shareModal?.link ? (
                    <Button onClick={() => { navigator.clipboard.writeText(shareModal.link); alert("Copied!"); }} className="w-full flex items-center justify-center gap-2"><Link size={16} /> Copy Link</Button>
                ) : (
                    <Button onClick={() => handleShare(shareModal.note)} className="w-full flex items-center justify-center gap-2 bg-blue-100 text-blue-600 hover:bg-blue-200"><Globe size={16} /> Generate New Link</Button>
                )}
                <Button variant="danger" onClick={() => handleStopShare(shareModal.note)} className="w-full flex items-center justify-center gap-2"><CloudOff size={16} /> Stop Sharing</Button>
            </div>
        </div>
      </Modal>
    </div>
  );
};

export default NotesApp;