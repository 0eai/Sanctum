
// src/apps/markdown/Markdown.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, Plus, Search, FileText, Settings, X, Star, FileCode,
  FolderPlus, Folder, ChevronRight, Home, Link, Globe, Check, CloudOff, Users
} from 'lucide-react';

import { Modal, Button, LoadingSpinner, Input } from '../../components/ui';
import MultiFab from '../../components/ui/MultiFab';

import {
  listenToMarkdownDocs, saveMarkdownDoc, deleteMarkdownItem, createFolder, updateFolder,
  exportMarkdownDocs, importMarkdownDocs
} from './services/markdown';
import { shareItem, unshareItem, buildShareUrl } from '../../services/sharing';

import WorkspaceSwitcher from '../../components/ui/WorkspaceSwitcher';
import WorkspacePanel from '../../components/ui/WorkspacePanel';
import CollaborateModal from '../../components/ui/CollaborateModal';
import SharedDocsView from '../../components/ui/SharedDocsView';
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
  const collab = useCollaboration(user, cryptoKey, 'markdown');
  const { ctx, activeWorkspace, sharedDocs, privateKey } = collab;

  // Editor State
  const [editorDoc, setEditorDoc] = useState(null);

  // Modals
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState('create');
  const [folderToEdit, setFolderToEdit] = useState(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [shareModal, setShareModal] = useState(null);

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
      // --- NEW DOC CREATION ---
      if (resourceId === 'new') {
        setEditorDoc({ title: '', content: '', isPinned: false, parentId: currentFolderId, initialPreview: false });
        return; // Skip the rest
      }

      // --- EXISTING DOC ---
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
      if (docData.id) await deleteMarkdownItem(user.uid, docData, docs, ctx);
      return;
    }

    setSaveStatus('saving');
    try {
      const id = await saveMarkdownDoc(user.uid, cryptoKey, docData, currentFolderId, ctx);

      if (!docData.id) {
        setEditorDoc(prev => ({ ...prev, id }));
        // Silently update the URL from 'new' to the actual ID so refreshes work safely
        window.history.replaceState(null, '', `#markdown/doc/${id}/edit`);
        // Dispatch event so useHashRoute hook catches the new ID and stops treating it as 'new'
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

  const handleMove = async (targetFolderId) => {
    if (itemToMove.type === 'folder') {
      // Move folder: update its parentId via updateFolder
      await updateFolder(user.uid, cryptoKey, itemToMove.id, itemToMove.title, targetFolderId, ctx);
    } else {
      // Move doc: re-save with new parentId (saveMarkdownDoc handles encryption)
      await saveMarkdownDoc(user.uid, cryptoKey, { ...itemToMove, parentId: targetFolderId }, currentFolderId, ctx);
    }

    setIsMoveModalOpen(false);
    setItemToMove(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteMarkdownItem(user.uid, deleteConfirm, docs, ctx);
    setDeleteConfirm(null);
  };

  // --- Sharing Handlers ---
  const handleShare = async (item) => {
    try {
      const payload = {
        sharedType: 'markdown',
        title: item.title,
        content: item.content,
        tags: item.tags || [],
        attachments: item.attachments || [],
        date: new Date().toISOString()
      };
      const { sharedId, shareUrlKey } = await shareItem(payload, shareTTL);
      // Save sharedId back to the doc
      await saveMarkdownDoc(user.uid, cryptoKey, { ...item, sharedId, shareUrlKey }, currentFolderId);
      const url = buildShareUrl(sharedId, shareUrlKey);
      setShareModal({ isOpen: true, item: { ...item, sharedId, shareUrlKey }, link: url });
    } catch (e) { alert('Sharing failed.'); }
  };

  const handleStopShare = async (item) => {
    await unshareItem(item.sharedId);
    await saveMarkdownDoc(user.uid, cryptoKey, { ...item, sharedId: null, shareUrlKey: null }, currentFolderId);
    setShareModal(null);
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
        navigate={navigate}
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
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => {
                if (folderPath.length > 1) handleBreadcrumbClick(folderPath.length - 2);
                else onExit();
              }} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
              <WorkspaceSwitcher
                {...collab.switcherProps}
                onSelect={(ws) => {
                  collab.switchWorkspace(ws);
                  navigate('#markdown');
                }}
              />
            </div>
            <div className="flex gap-1">
              {activeWorkspace && (
                <button onClick={() => collab.setIsWorkspacePanelOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <Users size={20} />
                </button>
              )}
              <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <Settings size={20} />
              </button>
            </div>
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

          {!searchQuery && !activeWorkspace && !currentFolderId && sharedDocs.length > 0 && (
            <div className="mb-8">
              <SharedDocsView
                sharedDocs={sharedDocs}
                appType="markdown"
                onOpenDoc={(doc) => navigate(`#markdown/doc/${doc.id}`)}
              />
            </div>
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
                    ? navigate(`#markdown/folder/${item.id}`)
                    : navigate(`#markdown/doc/${item.id}`) // Defaults to view
                  }
                  onMove={(i) => { setItemToMove(i); setIsMoveModalOpen(true); }}
                  onDelete={(i) => setDeleteConfirm(i)}
                  onShare={!ctx ? ((i) => {
                    if (i.sharedId) {
                      setShareModal({ isOpen: true, item: i, link: buildShareUrl(i.sharedId, i.shareUrlKey) });
                    } else {
                      handleShare(i);
                    }
                  }) : null}
                  onCollaborate={!ctx ? ((i) => collab.openCollaborateModal(i)) : null}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <MultiFab actions={fabActions} maxWidth="max-w-4xl" />

      {/* --- MODALS --- */}

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

      <Modal isOpen={!!shareModal} onClose={() => setShareModal(null)} title="Share Document" zIndex={100}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 text-green-600 text-sm font-bold"><Check size={16} /> Public Link Active</div>
            <div className="text-xs text-gray-500 break-all">{shareModal?.link || 'Link not generated yet.'}</div>
          </div>
          <div className="flex flex-col gap-2">
            {shareModal?.link ? (
              <Button onClick={() => { navigator.clipboard.writeText(shareModal.link); alert('Copied!'); }} className="w-full flex items-center justify-center gap-2"><Link size={16} /> Copy Link</Button>
            ) : (
              <Button onClick={() => handleShare(shareModal.item)} className="w-full flex items-center justify-center gap-2 bg-blue-100 text-blue-600 hover:bg-blue-200"><Globe size={16} /> Generate Link</Button>
            )}
            <Button variant="danger" onClick={() => handleStopShare(shareModal.item)} className="w-full flex items-center justify-center gap-2"><CloudOff size={16} /> Stop Sharing</Button>
          </div>
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
          shareId={collab.collaborateModalItem.sharedId || null}
          docKey={collab.collaborateModalItem.docKey || null}
          appType="markdown"
          currentUser={user}
          privateKey={privateKey}
          cryptoKey={cryptoKey}
          onClose={() => collab.closeCollaborateModal()}
          onShareCreated={async (newShareId) => {
            if (collab.collaborateModalItem) {
              await saveMarkdownDoc(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: newShareId }, null, ctx);
              setDocs(docs.map(i => i.id === collab.collaborateModalItem.id ? { ...i, sharedId: newShareId } : i));
            }
          }}
          onShareDeleted={async () => {
            if (collab.collaborateModalItem) {
              await saveMarkdownDoc(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: null }, null, ctx);
              setDocs(docs.map(i => i.id === collab.collaborateModalItem.id ? { ...i, sharedId: null } : i));
            }
          }}
        />
      )}
    </div>
  );
};

export default MarkdownApp;