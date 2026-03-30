// src/apps/bookmarks/Bookmarks.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder, FolderPlus, Plus, Settings, Download, Grid, List
} from 'lucide-react';

import { Button, LoadingSpinner, Modal } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

import WorkspacePanel from '../../components/ui/WorkspacePanel';
import CollaborateModal from '../../components/ui/CollaborateModal';
import SharedDocsView from '../../components/ui/SharedDocsView';
import useCollaboration from '../../hooks/useCollaboration';

import { useClipboard } from '../../hooks/useClipboard';
import { getDomain, parseNetscapeHtml, exportBookmarksToNetscapeHtml } from '../../lib/bookmarkUtils';
import {
  listenToBookmarks, saveBookmarkItem, deleteBookmarkItem, importBookmarksFromHtml
} from './services/bookmarks';

import BookmarkCard from './components/BookmarkCard';
import AddBookmarkModal from './components/AddBookmarkModal';
import ViewBookmarkModal from './components/ViewBookmarkModal';

const MoveModal = ({ isOpen, onClose, item, allFolders, onMove }) => {
  if (!isOpen || !item) return null;

  const getDescendants = (folderId) => {
    let descendants = [];
    allFolders.filter(f => f.parentId === folderId).forEach(child => {
      descendants.push(child.id);
      descendants = descendants.concat(getDescendants(child.id));
    });
    return descendants;
  };

  const invalidIds = item.type === 'folder' ? [item.id, ...getDescendants(item.id)] : [];
  const validFolders = allFolders.filter(f => !invalidIds.includes(f.id));

  return (
    <Modal isOpen={true} title={`Move "${item.title || 'Item'}"`} onClose={onClose}>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        <div
          className={`p-3 rounded-lg border cursor-pointer hover:bg-blue-50 flex items-center gap-3 ${item.parentId === null ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'}`}
          onClick={() => { onMove(null); onClose(); }}
        >
          <Folder size={18} className="text-gray-400" />
          <span className="font-medium text-gray-800">Home</span>
        </div>
        {validFolders.map(folder => (
          <div
            key={folder.id}
            onClick={() => { onMove(folder.id); onClose(); }}
            className={`p-3 rounded-lg border cursor-pointer hover:bg-blue-50 flex items-center gap-3 ${item.parentId === folder.id ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'}`}
          >
            <Folder size={18} className="text-blue-500" />
            <span className="font-medium text-gray-800">{folder.title}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
};

// FIXED: Accept route and navigate from props
const BookmarksApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Navigation
  const [folderPath, setFolderPath] = useState([{ id: null, title: 'Home' }]);
  const [searchQuery, setSearchQuery] = useState("");

  // UI States
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [moveItem, setMoveItem] = useState(null);
  const [viewMode, setViewMode] = useState('list');

  const copyUtils = useClipboard();

  // --- URL-Driven State ---
  const currentFolderId = route.resource === 'folder' ? route.resourceId : null;
  const isSettingsOpen = route.query?.modal === 'settings';

  const addType = route.query?.modal === 'newFolder' ? 'folder' : route.query?.modal === 'newBookmark' ? 'bookmark' : null;
  const isAddModalOpen = !!addType;

  // Collaboration (all state + effects handled by the hook)
  const collab = useCollaboration(user, cryptoKey, 'bookmarks');
  const { ctx, activeWorkspace, sharedDocs, privateKey } = collab;

  // Combined item sets for editing/viewing
  const allAvailableItems = [...allItems, ...sharedDocs];

  const editingItemId = route.query?.edit;
  const editingItem = editingItemId ? allAvailableItems.find(i => i.id === editingItemId) : null;

  const viewingItemId = route.query?.view;
  const viewingItem = viewingItemId ? allAvailableItems.find(i => i.id === viewingItemId) : null;

  const currentBasePath = currentFolderId ? `#bookmarks/folder/${currentFolderId}` : `#bookmarks`;

  // --- Data Listener ---
  useEffect(() => {
    if (!user || (!cryptoKey && !collab.workspaceKey)) return;
    if (activeWorkspace && !collab.workspaceKey) return;

    const unsub = listenToBookmarks(user.uid, cryptoKey, (data) => {
      setAllItems(data);
      setLoading(false);
    }, ctx);
    return () => unsub();
  }, [user, cryptoKey, activeWorkspace, collab.workspaceKey, ctx]);

  // --- URL Sync & Breadcrumbs ---
  useEffect(() => {
    if (loading) return;

    const pathArray = [];
    let currentId = currentFolderId;
    while (currentId) {
      const parentFolder = allItems.find(i => i.id === currentId);
      if (parentFolder) {
        pathArray.unshift({ id: parentFolder.id, title: parentFolder.title });
        currentId = parentFolder.parentId;
      } else {
        break;
      }
    }
    setFolderPath([{ id: null, title: 'Home' }, ...pathArray]);
    setSearchQuery(""); // Clear search when folder changes
  }, [currentFolderId, allItems, loading]);

  // --- Derived State ---
  const viewItems = useMemo(() => {
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      return allItems.filter(item =>
        (item.title && item.title.toLowerCase().includes(lowerQ)) ||
        (item.url && item.url.toLowerCase().includes(lowerQ))
      );
    } else {
      const currentItems = allItems.filter(item => item.parentId === currentFolderId);
      currentItems.sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1));
      return currentItems;
    }
  }, [searchQuery, currentFolderId, allItems]);


  // --- Handlers ---

  const handleBreadcrumbClick = (index, folder) => {
    if (folder.id === null) navigate(`#bookmarks`);
    else navigate(`#bookmarks/folder/${folder.id}`);
  };

  const handleBack = () => {
    if (searchQuery) {
      setSearchQuery("");
    } else {
      if (folderPath.length > 1) handleBreadcrumbClick(folderPath.length - 2, folderPath[folderPath.length - 2]);
      else onExit();
    }
  };

  const handleSave = async (title, url, type) => {
    let finalTitle = title;
    if (type === 'bookmark' && !finalTitle && url) {
      finalTitle = getDomain(url);
    }
    if (!finalTitle) return;

    await saveBookmarkItem(user.uid, cryptoKey, {
      id: editingItem?.id,
      title: finalTitle,
      url,
      type,
      parentId: editingItem ? editingItem.parentId : currentFolderId
    }, ctx);

    navigate(currentBasePath); // Close Modal
  };

  const handleMoveItem = async (newParentId) => {
    if (!moveItem) return;
    await saveBookmarkItem(user.uid, cryptoKey, { ...moveItem, parentId: newParentId }, ctx);
    setMoveItem(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    await deleteBookmarkItem(user.uid, deleteConfirmation, allItems, ctx);
    setDeleteConfirmation(null);
    navigate(currentBasePath); // Ensure modals are closed if deleted from one
  };

  const fabActions = useMemo(() => [
    {
      label: "New Folder",
      icon: <FolderPlus size={20} />,
      onClick: () => navigate(`${currentBasePath}?modal=newFolder`),
      variant: 'secondary'
    },
    {
      label: "New Bookmark",
      icon: <Plus size={24} />,
      onClick: () => navigate(`${currentBasePath}?modal=newBookmark`),
      variant: 'primary'
    }
  ], [currentBasePath, navigate]);

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
      <StandardAppLayout
        headerConfig={{
          onBack: handleBack,
          workspaceConfig: {
            switcherProps: collab.switcherProps,
            activeWorkspace: activeWorkspace,
            onSelect: (ws) => {
              collab.switchWorkspace(ws);
              navigate('#bookmarks');
            },
            onOpenPanel: () => collab.setIsWorkspacePanelOpen(true),
          },
          search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search bookmarks...' },
          nav: !searchQuery ? {
            type: 'breadcrumbs',
            data: folderPath,
            onSelect: handleBreadcrumbClick,
          } : undefined,
          customActions: (
            <div className="flex items-center gap-1">
              <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white" title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}>
                {viewMode === 'grid' ? <List size={20} /> : <Grid size={20} />}
              </button>
              <button
                onClick={() => {
                  const html = exportBookmarksToNetscapeHtml(allItems);
                  const blob = new Blob([html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = 'bookmarks.html'; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white"
                title="Export bookmarks"
              >
                <Download size={20} />
              </button>
              <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
                <Settings size={20} />
              </button>
            </div>
          ),
        }}
        fabConfig={{ actions: fabActions }}
      >
        {!searchQuery && !activeWorkspace && currentFolderId === null && sharedDocs.length > 0 && (
          <div className="mb-8">
            <SharedDocsView
              sharedDocs={sharedDocs}
              appType="bookmarks"
              currentUserUid={user.uid}
              onOpenDoc={(doc) => navigate(`#bookmarks?view=${doc.id}`)}
            />
          </div>
        )}

        {!searchQuery && !activeWorkspace && currentFolderId === null && sharedDocs.length > 0 && viewItems.length > 0 && (
          <div className="flex items-center gap-2 px-1 mb-3 mt-4">
            <Folder size={14} className="text-gray-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Personal Vault
            </span>
          </div>
        )}

        {loading || processing ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2"><LoadingSpinner /><p>{processing ? "Processing..." : "Loading vault..."}</p></div>
        ) : viewItems.length === 0 ? (
          <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
            <div className="bg-gray-100 p-4 rounded-full"><Folder size={32} className="opacity-50" /></div>
            <p>{searchQuery ? "No matching items found." : "This folder is empty."}</p>
            {!searchQuery && <Button variant="ghost" onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="text-[#4285f4]">Import from Browser</Button>}
          </div>
        ) : (
          <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-3" : "grid gap-3"}>
            {viewItems.map(item => (
              <BookmarkCard
                key={item.id}
                item={item}
                onEnterFolder={(folder) => navigate(`#bookmarks/folder/${folder.id}`)}
                onViewDetails={(i) => navigate(`${currentBasePath}?view=${i.id}`)}
                copyUtils={copyUtils}
                onCollaborate={!ctx && !item.isSharedDoc ? ((i) => collab.openCollaborateModal(i)) : null}
              />
            ))}
          </div>
        )}
      </StandardAppLayout>

      {/* Modals */}
      <AddBookmarkModal
        isOpen={isAddModalOpen || !!editingItem}
        onClose={() => navigate(currentBasePath)}
        onSave={handleSave}
        editingItem={editingItem}
        addType={addType || editingItem?.type || 'bookmark'}
      />

      <ViewBookmarkModal
        item={viewingItem}
        onClose={() => navigate(currentBasePath)}
        onEdit={(item) => navigate(`${currentBasePath}?edit=${item.id}`)}
        onDelete={(item) => setDeleteConfirmation(item)}
        onMove={(item) => setMoveItem(item)}
        copyUtils={copyUtils}
        readOnly={viewingItem?.isSharedDoc && viewingItem?.role === 'viewer'}
      />

      <MoveModal
        isOpen={!!moveItem}
        item={moveItem}
        allFolders={allItems.filter(i => i.type === 'folder')}
        onClose={() => setMoveItem(null)}
        onMove={handleMoveItem}
      />

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
            Are you sure you want to delete <b>{deleteConfirmation?.title}</b>?
            {deleteConfirmation?.type === 'folder' && <span className="block mt-1 font-bold">This deletes all contents!</span>}
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete}>Delete</Button></div>
        </div>
      </Modal>

      {/* Collaboration Modals */}
      {collab.isWorkspacePanelOpen && activeWorkspace && (
        <WorkspacePanel
          {...collab.workspacePanelProps}
          onDelete={async () => {
            await collab.deleteActiveWorkspace();
            navigate('#bookmarks');
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
          appType="bookmarks"
          currentUser={user}
          privateKey={privateKey}
          cryptoKey={cryptoKey}
          onClose={() => collab.closeCollaborateModal()}
          onShareCreated={async (newShareId) => {
            if (collab.collaborateModalItem) {
              await saveBookmarkItem(user.uid, cryptoKey, { ...collab.collaborateModalItem, collabShareId: newShareId }, ctx);
            }
          }}
          onShareDeleted={async () => {
            if (collab.collaborateModalItem) {
              await saveBookmarkItem(user.uid, cryptoKey, { ...collab.collaborateModalItem, collabShareId: null }, ctx);
            }
          }}
          onPublicLinkCreated={async (id, key) => {
            if (collab.collaborateModalItem) {
              await saveBookmarkItem(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: id, shareUrlKey: key }, ctx);
            }
          }}
          onPublicLinkRevoked={async () => {
            if (collab.collaborateModalItem) {
              await saveBookmarkItem(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: null, shareUrlKey: null }, ctx);
            }
          }}
        />
      )}
    </div>
  );
};

export default BookmarksApp;