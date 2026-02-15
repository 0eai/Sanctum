// src/apps/bookmarks/Bookmarks.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, Search, Folder, FolderPlus, Plus, X, Settings, 
  ChevronRight, Home
} from 'lucide-react';

import { Button, LoadingSpinner, Modal } from '../../components/ui'; 
import MultiFab from '../../components/ui/MultiFab'; 
import ImportExportModal from '../../components/ui/ImportExportModal';

import { useClipboard } from '../../hooks/useClipboard';
import { getDomain, parseNetscapeHtml } from '../../lib/bookmarkUtils';
import { 
  listenToBookmarks, saveBookmarkItem, deleteBookmarkItem, importBookmarksFromHtml 
} from '../../services/bookmarks';

import BookmarkCard from './components/BookmarkCard';
import AddBookmarkModal from './components/AddBookmarkModal';
import ViewBookmarkModal from './components/ViewBookmarkModal';

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
  
  const copyUtils = useClipboard();

  // --- URL-Driven State ---
  const currentFolderId = route.resource === 'folder' ? route.resourceId : null;
  const isSettingsOpen = route.query?.modal === 'settings';
  
  const addType = route.query?.modal === 'newFolder' ? 'folder' : route.query?.modal === 'newBookmark' ? 'bookmark' : null;
  const isAddModalOpen = !!addType;

  const editingItemId = route.query?.edit;
  const editingItem = editingItemId ? allItems.find(i => i.id === editingItemId) : null;
  
  const viewingItemId = route.query?.view;
  const viewingItem = viewingItemId ? allItems.find(i => i.id === viewingItemId) : null;

  const currentBasePath = currentFolderId ? `#bookmarks/folder/${currentFolderId}` : `#bookmarks`;

  // --- Listeners ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsub = listenToBookmarks(user.uid, cryptoKey, (data) => {
        setAllItems(data);
        setLoading(false);
    });
    return () => unsub();
  }, [user, cryptoKey]);

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

  const handleBreadcrumbClick = (index) => {
    const targetFolder = folderPath[index];
    if (targetFolder.id === null) navigate(`#bookmarks`);
    else navigate(`#bookmarks/folder/${targetFolder.id}`);
  };

  const handleBack = () => {
    if (searchQuery) {
        setSearchQuery("");
    } else {
        if (folderPath.length > 1) handleBreadcrumbClick(folderPath.length - 2);
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
    });
    
    navigate(currentBasePath); // Close Modal
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    await deleteBookmarkItem(user.uid, deleteConfirmation, allItems);
    setDeleteConfirmation(null);
    navigate(currentBasePath); // Ensure modals are closed if deleted from one
  };

  const handleImport = async (file) => {
    if (!file) return;
    setProcessing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const root = parseNetscapeHtml(event.target.result);
        if (root) {
          await importBookmarksFromHtml(user.uid, cryptoKey, root, currentFolderId);
          alert("Import successful!");
          navigate(currentBasePath); // Close Modal
        } else {
          alert("Invalid bookmark file format.");
        }
      } catch (err) {
        alert("Import failed.");
      }
      setProcessing(false);
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    setProcessing(true);
    try {
      let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`;

      const buildHtml = (parentId) => {
        const items = allItems.filter(i => i.parentId === parentId);
        let chunk = "";
        
        items.forEach(item => {
          let addDate = 0;
          if (item.createdAt && typeof item.createdAt.seconds === 'number') {
             addDate = item.createdAt.seconds;
          } else if (item.createdAt instanceof Date) {
             addDate = Math.floor(item.createdAt.getTime() / 1000);
          } else if (typeof item.createdAt === 'string') {
             addDate = Math.floor(new Date(item.createdAt).getTime() / 1000);
          }

          if (item.type === 'folder') {
            chunk += `    <DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${addDate}">${item.title}</H3>\n    <DL><p>\n${buildHtml(item.id)}    </DL><p>\n`;
          } else {
            chunk += `    <DT><A HREF="${item.url}" ADD_DATE="${addDate}">${item.title}</A>\n`;
          }
        });
        return chunk;
      };

      html += buildHtml(null);
      html += `</DL><p>`;

      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookmarks_backup_${new Date().toISOString().slice(0,10)}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed.");
    }
    setProcessing(false);
    navigate(currentBasePath); // Close Modal
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
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden relative">
      
      {/* Header */}
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 p-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
              <h1 className="text-xl font-bold">Bookmarks</h1>
            </div>
            <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><Settings size={20} /></button>
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-3xl mx-auto pb-32">
          {loading || processing ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2"><LoadingSpinner /><p>{processing ? "Processing..." : "Loading vault..."}</p></div>
          ) : viewItems.length === 0 ? (
            <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
              <div className="bg-gray-100 p-4 rounded-full"><Folder size={32} className="opacity-50" /></div>
              <p>{searchQuery ? "No matching items found." : "This folder is empty."}</p>
              {!searchQuery && <Button variant="ghost" onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="text-[#4285f4]">Import from Browser</Button>}
            </div>
          ) : (
            <div className="grid gap-3">
              {viewItems.map(item => (
                <BookmarkCard 
                    key={item.id} 
                    item={item} 
                    onEnterFolder={(folder) => navigate(`#bookmarks/folder/${folder.id}`)}
                    onViewDetails={(i) => navigate(`${currentBasePath}?view=${i.id}`)} 
                    copyUtils={copyUtils}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <MultiFab actions={fabActions} maxWidth="max-w-4xl" />

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
        copyUtils={copyUtils}
      />

      <ImportExportModal 
        isOpen={isSettingsOpen}
        onClose={() => navigate(currentBasePath)}
        onImport={handleImport}
        onExport={handleExport}
        isImporting={processing}
        title="Manage Bookmarks"
        accept=".html"
        importLabel="Import HTML"
        exportLabel="Export HTML"
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

    </div>
  );
};

export default BookmarksApp;