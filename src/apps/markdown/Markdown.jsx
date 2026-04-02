
// src/apps/markdown/Markdown.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, FileCode, FolderPlus, Folder, Settings
} from 'lucide-react';

import { Modal, Button, LoadingSpinner, Input } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

import {
  listenToMarkdownDocs, saveMarkdownDoc, deleteMarkdownItem, createFolder, updateFolder,
  exportMarkdownDocs, importMarkdownDocs, moveMarkdownDoc
} from './services/markdown';
import WorkspaceSwitcher from '../../components/ui/WorkspaceSwitcher';
import WorkspacePanel from '../../components/ui/WorkspacePanel';
import CollaborateModal from '../../components/ui/CollaborateModal';
import MoveToContextModal from '../../components/ui/MoveToContextModal';
import useCollaboration from '../../hooks/useCollaboration';

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

  // Collaboration (all state + effects handled by the hook)
  const collab = useCollaboration(user, cryptoKey, 'markdown', route);
  const { ctx, activeWorkspace, sharedDocs, privateKey, wsLink } = collab;

  // Editor State
  const [editorDoc, setEditorDoc] = useState(null);

  // Modals
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState('create');
  const [folderToEdit, setFolderToEdit] = useState(null);
  const [contextMoveItem, setContextMoveItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // --- Data Listener ---
  useEffect(() => {
    if (!user || (!cryptoKey && !collab.workspaceKey)) return;
    if (activeWorkspace && !collab.workspaceKey) return;

    const unsub = listenToMarkdownDocs(user.uid, cryptoKey, (data) => {
      setDocs(data);
      setLoading(false);
    }, ctx);
    return () => unsub();
  }, [user, cryptoKey, activeWorkspace, collab.workspaceKey, ctx]);

  useEffect(() => {
    if (loading && docs.length === 0 && sharedDocs.length === 0) return;

    const { resource, resourceId, action } = route;

    if (resource === 'folder' && resourceId) {
      setCurrentFolderId(resourceId);
      setEditorDoc(null);
      buildBreadcrumbs(resourceId);

    } else if (resource === 'doc' && resourceId) {
      if (resourceId === 'new') {
        setEditorDoc({ title: '', content: '', isPinned: false, parentId: currentFolderId, initialPreview: false });
        return;
      }

      const targetDoc = docs.find(d => d.id === resourceId) || sharedDocs.find(d => d.id === resourceId);
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
      if (docData.id) await deleteMarkdownItem(user.uid, docData, docs, ctx);
      return;
    }

    setSaveStatus('saving');
    try {
      const id = await saveMarkdownDoc(user.uid, cryptoKey, docData, currentFolderId, ctx);

      if (!docData.id) {
        setEditorDoc(prev => ({ ...prev, id }));
        window.history.replaceState(null, '', `#markdown/doc/${id}/edit`);
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
    const title = e.target.title.value.trim();
    if (!title) return;

    if (folderModalMode === 'create') {
      await createFolder(user.uid, cryptoKey, title, currentFolderId, ctx);
    } else {
      await updateFolder(user.uid, cryptoKey, folderToEdit.id, title, ctx);
    }
    setIsFolderModalOpen(false);
    setFolderToEdit(null);
  };

  const handleMoveMarkdown = useCallback(async (item, _collectionName, destCtx, personalKey) => {
    await moveMarkdownDoc(user.uid, personalKey || cryptoKey, item, ctx, destCtx);
  }, [ctx, user, cryptoKey]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteMarkdownItem(user.uid, deleteConfirm, docs, ctx);
    setDeleteConfirm(null);
  };

  // --- Navigation Handlers ---
  const handleEnterFolder = (folder) => {
    navigate(wsLink(`#markdown/folder/${folder.id}`));
  };

  const handleBreadcrumbClick = (index, folder) => {
    if (folder.id === null) {
      navigate(wsLink(`#markdown`));
    } else {
      navigate(wsLink(`#markdown/folder/${folder.id}`));
    }
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
      onClick: () => navigate(wsLink(`#markdown/doc/new/edit`)),
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
          if (currentFolderId) {
            navigate(wsLink(`#markdown/folder/${currentFolderId}`));
          } else {
            navigate(wsLink(`#markdown`));
          }
        }}
        onExport={(d) => {
          const blob = new Blob([d.content || ''], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${d.title || 'Untitled_Document'}.md`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        saveStatus={saveStatus}
        cryptoKey={editorDoc.isSharedDoc && !activeWorkspace ? editorDoc.docKey : (ctx?.key || cryptoKey)}
        user={user}
        onCollaborate={!ctx ? ((e, item) => { e.stopPropagation(); collab.openCollaborateModal(item); }) : null}
        readOnly={editorDoc.isSharedDoc && editorDoc.role === 'viewer'}
      />
    );
  }

  // --- View: List ---
  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
      <StandardAppLayout
        headerConfig={{
          onBack: () => {
            if (folderPath.length > 1) handleBreadcrumbClick(folderPath.length - 2, folderPath[folderPath.length - 2]);
            else onExit();
          },
          workspaceConfig: {
            switcherProps: collab.switcherProps,
            activeWorkspace: activeWorkspace,
            onSelect: (ws) => {
              collab.switchWorkspace(ws);
              navigate('#markdown');
            },
            onOpenPanel: () => collab.setIsWorkspacePanelOpen(true),
          },
          search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search...' },
          nav: !searchQuery ? {
            type: 'breadcrumbs',
            data: folderPath,
            onSelect: handleBreadcrumbClick,
          } : undefined,
          customActions: (
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
              <Settings size={20} />
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
                  ? navigate(wsLink(`#markdown/folder/${item.id}`))
                  : navigate(wsLink(`#markdown/doc/${item.id}`))
                }
                onMove={(i) => setContextMoveItem(i)}
                onDelete={(i) => setDeleteConfirm(i)}
                onCollaborate={!ctx && !item.isSharedDoc ? ((i) => collab.openCollaborateModal(i)) : null}
              />
            ))}
          </div>
        )}
      </StandardAppLayout>

      {/* --- MODALS --- */}

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
        collectionName="markdown"
        allItems={docs}
        workspaces={collab.workspaces}
        activeWorkspaceId={activeWorkspace?.id || null}
        user={user}
        privateKey={privateKey}
        cryptoKey={cryptoKey}
        ctx={ctx}
        onMoveItemToContext={handleMoveMarkdown}
      />

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
            Are you sure you want to delete <b>{deleteConfirm?.title || 'this item'}</b>?
            {deleteConfirm?.type === 'folder' && <span className="block mt-1 font-bold text-xs">This will delete all documents inside!</span>}
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete}>Delete</Button></div>
        </div>
      </Modal>

      {/* Collaboration Modals */}
      {collab.isWorkspacePanelOpen && activeWorkspace && (
        <WorkspacePanel
          {...collab.workspacePanelProps}
          onDelete={async () => {
            await collab.deleteActiveWorkspace();
            navigate('#markdown');
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
          appType="markdown"
          currentUser={user}
          privateKey={privateKey}
          cryptoKey={cryptoKey}
          onClose={() => collab.closeCollaborateModal()}
          onShareCreated={async (newShareId) => {
            if (collab.collaborateModalItem) {
              await saveMarkdownDoc(user.uid, cryptoKey, { ...collab.collaborateModalItem, collabShareId: newShareId }, null, ctx);
            }
          }}
          onShareDeleted={async () => {
            if (collab.collaborateModalItem) {
              await saveMarkdownDoc(user.uid, cryptoKey, { ...collab.collaborateModalItem, collabShareId: null }, null, ctx);
            }
          }}
          onPublicLinkCreated={async (id, key) => {
            if (collab.collaborateModalItem) {
              await saveMarkdownDoc(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: id, shareUrlKey: key }, null, ctx);
            }
          }}
          onPublicLinkRevoked={async () => {
            if (collab.collaborateModalItem) {
              await saveMarkdownDoc(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: null, shareUrlKey: null }, null, ctx);
            }
          }}
        />
      )}
    </div>
  );
};

export default MarkdownApp;