// src/apps/notes/Notes.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, FolderPlus, LayoutGrid, List,
  Loader, Folder
} from 'lucide-react';

import { Modal, Button, Input } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

import WorkspaceSwitcher from '../../components/ui/WorkspaceSwitcher';
import WorkspacePanel from '../../components/ui/WorkspacePanel';
import CollaborateModal from '../../components/ui/CollaborateModal';
import MoveToContextModal from '../../components/ui/MoveToContextModal';
import useCollaboration from '../../hooks/useCollaboration';

import {
  listenToNotes, saveNote, createFolder, updateFolder, deleteNoteItem,
  togglePin, rescheduleNote, moveNoteDoc
} from './services/notes';

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

  // Collaboration (all state + effects handled by the hook)
  const collab = useCollaboration(user, cryptoKey, 'notes', route);
  const { ctx, activeWorkspace, sharedDocs, privateKey, wsLink } = collab;

  // Modal & Editor State
  const [editorState, setEditorState] = useState(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState('create');
  const [folderToEdit, setFolderToEdit] = useState(null);
  const [contextMoveItem, setContextMoveItem] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);

  // --- 1. Data listener ---

  useEffect(() => {
    if (!user || (!cryptoKey && !collab.workspaceKey)) return;
    if (activeWorkspace && !collab.workspaceKey) return;
    setLoading(true);

    const unsub = listenToNotes(user.uid, cryptoKey, (data) => {
      setItems(data);
      setLoading(false);
    }, ctx);
    return () => unsub();
  }, [user, cryptoKey, activeWorkspace, collab.workspaceKey, ctx]);

  // --- 2. URL Route Sync ---
  useEffect(() => {
    if (loading) return;

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

      const targetNote = items.find(i => i.id === resourceId) || sharedDocs.find(d => d.id === resourceId);
      if (targetNote) {
        setEditorState(targetNote);
        setCurrentFolderId(targetNote.parentId || null);
        buildBreadcrumbs(targetNote.parentId);
      }
    } else {
      setCurrentFolderId(null);
      setEditorState(null);
      setFolderPath([{ id: null, title: 'Notes' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, items, loading]);

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
      if (noteData.id) await deleteNoteItem(user.uid, noteData, items, ctx);
      return;
    }
    setSaveStatus('saving');
    try {
      const id = await saveNote(user.uid, cryptoKey, noteData, currentFolderId, ctx);

      if (!noteData.id) {
        setEditorState(prev => ({ ...prev, id }));
        window.history.replaceState(null, '', `#notes/doc/${id}/edit`);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
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
      await createFolder(user.uid, cryptoKey, title, currentFolderId, ctx);
    } else {
      await updateFolder(user.uid, cryptoKey, folderToEdit.id, title, ctx);
    }
    setIsFolderModalOpen(false);
  };

  const handleMoveNote = useCallback(async (item, _collectionName, destCtx, personalKey) => {
    await moveNoteDoc(user.uid, personalKey || cryptoKey, item, ctx, destCtx);
  }, [ctx, user, cryptoKey]);

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    await deleteNoteItem(user.uid, deleteConfirmation, items, ctx);
    setDeleteConfirmation(null);
  };


  // --- Navigation Handlers ---
  const handleBreadcrumbClick = (index, folder) => {
    if (folder.id === null) navigate(wsLink(`#notes`));
    else navigate(wsLink(`#notes/folder/${folder.id}`));
  };

  const handleBack = () => {
    if (editorState) {
      if (currentFolderId) navigate(wsLink(`#notes/folder/${currentFolderId}`));
      else navigate(wsLink(`#notes`));
    } else if (searchQuery) {
      setSearchQuery("");
    } else {
      if (folderPath.length > 1) handleBreadcrumbClick(folderPath.length - 2, folderPath[folderPath.length - 2]);
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
      onClick: () => navigate(wsLink(`#notes/doc/new/edit`)),
      variant: 'primary'
    }
  ], [currentFolderId, navigate]);

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
      {editorState ? (
        <NoteEditor
          note={editorState}
          cryptoKey={editorState.isSharedDoc && !activeWorkspace ? editorState.docKey : (ctx?.key || cryptoKey)}
          onSave={handleSaveNote}
          onBack={handleBack}
          onPin={(e, item) => togglePin(user.uid, item.id, item.isPinned, ctx)}
          onCollaborate={!ctx && !editorState.isSharedDoc ? ((e, item) => { e.stopPropagation(); collab.openCollaborateModal(item); }) : null}
          saveStatus={saveStatus}
          user={user}
          navigate={navigate}
          readOnly={editorState.isSharedDoc && editorState.role === 'viewer'}
        />
      ) : (
        <StandardAppLayout
          headerConfig={{
            onBack: handleBack,
            workspaceConfig: {
              switcherProps: collab.switcherProps,
              activeWorkspace: activeWorkspace,
              onSelect: (ws) => {
                collab.switchWorkspace(ws);
                navigate('#notes');
              },
              onOpenPanel: () => collab.setIsWorkspacePanelOpen(true),
            },
            search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search notes...' },
            nav: !searchQuery ? {
              type: 'breadcrumbs',
              data: folderPath,
              onSelect: handleBreadcrumbClick,
            } : undefined,
            customActions: (
              <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
                {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
              </button>
            ),
          }}
          fabConfig={{ actions: fabActions }}
        >

          {!searchQuery && !!activeWorkspace && (
            <p className="text-xs text-gray-400 px-1 mb-4">
              Shared items are not visible in workspace mode. Switch to Personal Vault to view them.
            </p>
          )}

          {!searchQuery && !activeWorkspace && !currentFolderId && sharedDocs.length > 0 && displayedItems.length > 0 && (
            <div className="flex items-center gap-2 px-1 mb-3">
              <Folder size={14} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Personal Vault
              </span>
            </div>
          )}

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
                  onOpen={() => navigate(wsLink(`#notes/doc/${item.id}/edit`))}
                  onFolderOpen={() => navigate(wsLink(`#notes/folder/${item.id}`))}
                  onPin={(e) => { e.stopPropagation(); togglePin(user.uid, item.id, item.isPinned, ctx); }}
                  onMove={(e) => { e.stopPropagation(); setContextMoveItem(item); }}
                  onEditFolder={(e) => { e.stopPropagation(); setFolderToEdit(item); setFolderModalMode('edit'); setIsFolderModalOpen(true); }}
                  onDelete={(e) => { e.stopPropagation(); setDeleteConfirmation(item); }}
                  onReschedule={(e) => { e.stopPropagation(); rescheduleNote(user.uid, cryptoKey, item, ctx); }}
                  onCollaborate={!ctx && !item.isSharedDoc ? ((e) => { e.stopPropagation(); collab.openCollaborateModal(item); }) : null}
                  folderCounts={folderCounts}
                  readOnly={item.isSharedDoc && item.role === 'viewer'}
                />
              ))}
            </div>
          )}
        </StandardAppLayout>
      )}

      {/* Modals */}
      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title={folderModalMode === 'create' ? "New Folder" : "Rename Folder"}>
        <form onSubmit={handleFolderAction} className="flex flex-col gap-4">
          <Input name="title" label="Folder Name" defaultValue={folderToEdit?.title || ''} autoFocus required />
          <Button type="submit" className="w-full">{folderModalMode === 'create' ? "Create" : "Save Changes"}</Button>
        </form>
      </Modal>




      <MoveToContextModal
        isOpen={!!contextMoveItem}
        onClose={() => setContextMoveItem(null)}
        item={contextMoveItem}
        collectionName="notes"
        allItems={items}
        workspaces={collab.workspaces}
        activeWorkspaceId={activeWorkspace?.id || null}
        user={user}
        privateKey={privateKey}
        cryptoKey={cryptoKey}
        ctx={ctx}
        onMoveItemToContext={handleMoveNote}
      />

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure? {deleteConfirmation?.type === 'folder' && "This deletes everything inside!"}</div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete}>Delete</Button></div>
        </div>
      </Modal>

      {/* Collaboration Modals */}
      {collab.isWorkspacePanelOpen && activeWorkspace && (
        <WorkspacePanel
          {...collab.workspacePanelProps}
          onDelete={async () => {
            await collab.deleteActiveWorkspace();
            navigate('#notes');
          }}
        />
      )}

      {collab.collaborateModalItem && (
        <CollaborateModal
          isOpen={!!collab.collaborateModalItem}
          docId={collab.collaborateModalItem.id}
          docTitle={collab.collaborateModalItem.title || 'Untitled'}
          fullDocData={collab.collaborateModalItem}
          shareId={collab.collaborateModalItem.collabShareId || null}
          docKey={collab.collaborateModalItem.docKey || null}
          publicSharedId={collab.collaborateModalItem.sharedId || null}
          publicShareUrlKey={collab.collaborateModalItem.shareUrlKey || null}
          appType="notes"
          currentUser={user}
          privateKey={privateKey}
          cryptoKey={cryptoKey}
          onClose={() => collab.closeCollaborateModal()}
          onShareCreated={async (newShareId) => {
            if (collab.collaborateModalItem) {
              await handleSaveNote({ ...collab.collaborateModalItem, collabShareId: newShareId });
            }
          }}
          onShareDeleted={async () => {
            if (collab.collaborateModalItem) {
              await handleSaveNote({ ...collab.collaborateModalItem, collabShareId: null });
            }
          }}
          onPublicLinkCreated={async (id, key) => {
            if (collab.collaborateModalItem) {
              await handleSaveNote({ ...collab.collaborateModalItem, sharedId: id, shareUrlKey: key });
            }
          }}
          onPublicLinkRevoked={async () => {
            if (collab.collaborateModalItem) {
              await handleSaveNote({ ...collab.collaborateModalItem, sharedId: null, shareUrlKey: null });
            }
          }}
        />
      )}
    </div>
  );
};

export default NotesApp;