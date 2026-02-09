import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  updateDoc, 
  doc, 
  deleteDoc,
  writeBatch 
} from 'firebase/firestore';
import { 
  ChevronLeft, 
  Trash2, 
  Plus, 
  Search, 
  ExternalLink, 
  Globe, 
  Folder, 
  FolderPlus,
  FileDown,
  FileUp,
  X,
  Home,
  MoreVertical,
  ChevronRight,
  Copy,   
  Check,
  Pencil
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input } from './components'; 
import { encryptData, decryptData } from './crypto';

// --- Helpers ---
const normalizeUrl = (url) => {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
};

const getDomain = (url) => {
  try { return new URL(normalizeUrl(url)).hostname.replace('www.', ''); } 
  catch (e) { return 'link'; }
};

const BookmarksApp = ({ user, cryptoKey, onExit }) => {
  // Data State
  const [allItems, setAllItems] = useState([]); 
  const [viewItems, setViewItems] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Navigation State
  const [currentFolderId, setCurrentFolderId] = useState(null); 
  const [folderPath, setFolderPath] = useState([{ id: null, title: 'Home' }]);
  const [searchQuery, setSearchQuery] = useState("");

  // UI State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addType, setAddType] = useState('bookmark'); 
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Copy Feedback State
  const [copiedId, setCopiedId] = useState(null);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handlePopState = (event) => {
      // If we are still in the 'bookmarks' app but the state changed
      if (event.state && event.state.appId === 'bookmarks') {
        // Restore Folder ID and Path from history state
        setCurrentFolderId(event.state.folderId || null);
        setFolderPath(event.state.path || [{ id: null, title: 'Home' }]);
        setSearchQuery(""); // Clear search on nav
      } 
      // Note: If event.state.appId is DIFFERENT (e.g. 'launcher'), 
      // App.jsx will handle unmounting this component entirely.
    };

    window.addEventListener('popstate', handlePopState);
    
    // Initial Load: Check if we landed deep via refresh
    if (window.history.state && window.history.state.folderId) {
       setCurrentFolderId(window.history.state.folderId);
       setFolderPath(window.history.state.path || [{ id: null, title: 'Home' }]);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --- 1. Fetch & Decrypt All Data ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    setLoading(true);

    const q = query(
      collection(db, 'artifacts', appId, 'users', user.uid, 'bookmarks'), 
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const decryptedData = await Promise.all(snapshot.docs.map(async doc => {
        const raw = doc.data();
        const decrypted = await decryptData(raw, cryptoKey);
        return { 
          id: doc.id, 
          ...raw, 
          ...decrypted, 
          type: raw.type || 'bookmark', 
          parentId: raw.parentId || null 
        };
      }));
      setAllItems(decryptedData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, cryptoKey]);

  // --- 2. Filtering Logic ---
  useEffect(() => {
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      setViewItems(allItems.filter(item => 
        (item.title && item.title.toLowerCase().includes(lowerQ)) || 
        (item.url && item.url.toLowerCase().includes(lowerQ))
      ));
    } else {
      const currentItems = allItems.filter(item => item.parentId === currentFolderId);
      currentItems.sort((a, b) => {
        if (a.type === b.type) return 0; 
        return a.type === 'folder' ? -1 : 1; 
      });
      setViewItems(currentItems);
    }
  }, [searchQuery, currentFolderId, allItems]);

  // --- 3. Navigation Handlers ---
  const handleEnterFolder = (folder) => {
    const newPath = [...folderPath, { id: folder.id, title: folder.title }];
    
    // Update Browser History
    window.history.pushState(
      { appId: 'bookmarks', folderId: folder.id, path: newPath }, 
      '', 
      '#bookmarks' // URL fragment stays clean
    );

    // Update Local State
    setFolderPath(newPath);
    setCurrentFolderId(folder.id);
    setSearchQuery(""); 
  };

  // 3. Breadcrumb Click (Go back multiple steps)
  const handleBreadcrumbClick = (index) => {
    // We can't easily "jump" back in history stack accurately without counting.
    // Simpler approach for breadcrumbs: Push a NEW state for that location.
    const newPath = folderPath.slice(0, index + 1);
    const targetFolderId = newPath[newPath.length - 1].id;

    window.history.pushState(
      { appId: 'bookmarks', folderId: targetFolderId, path: newPath },
      '',
      '#bookmarks'
    );

    setFolderPath(newPath);
    setCurrentFolderId(targetFolderId);
  };

  // --- NEW: Smart Back Logic ---
  const handleBack = () => {
    if (searchQuery) {
        setSearchQuery("");
    } else {
        // This triggers 'popstate', which our useEffect catches
        // If at root, it pops to Launcher. If deep, it pops to previous folder.
        window.history.back(); 
    }
  };

  // --- 4. CRUD Handlers ---
  
  const handleSaveItem = async (e) => {
    e.preventDefault();
    let title = e.target.title.value.trim(); 
    const url = e.target.url?.value;
    
    const type = editingItem ? editingItem.type : addType;

    if (type === 'bookmark' && !title && url) {
        title = getDomain(url); 
    }
    
    if (!title) return;

    const payload = { title, type };
    payload.parentId = editingItem ? editingItem.parentId : currentFolderId;
    
    if (type === 'bookmark') payload.url = normalizeUrl(url);

    const encryptedPayload = await encryptData(payload, cryptoKey);

    if (editingItem) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'bookmarks', editingItem.id), {
        ...encryptedPayload,
        updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookmarks'), {
        ...encryptedPayload,
        type, 
        parentId: currentFolderId, 
        createdAt: serverTimestamp()
      });
    }

    closeModal();
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    
    if (deleteConfirmation.type === 'folder') {
      const batch = writeBatch(db);
      const children = allItems.filter(i => i.parentId === deleteConfirmation.id);
      children.forEach(child => {
        batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'bookmarks', child.id));
      });
      batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'bookmarks', deleteConfirmation.id));
      await batch.commit();
    } else {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'bookmarks', deleteConfirmation.id));
    }
    
    setDeleteConfirmation(null);
  };

  const handleCopyUrl = (e, url, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(normalizeUrl(url));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000); 
  };

  const openEditModal = (e, item) => {
    e.stopPropagation();
    setEditingItem(item);
    setAddType(item.type); 
    setIsAddModalOpen(true);
  };

  const closeModal = () => {
    setIsAddModalOpen(false);
    setEditingItem(null); 
  };

  // --- 5. Import / Export Logic ---
  const handleExport = () => {
    setProcessing(true);
    try {
      let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`;

      const buildHtml = (parentId) => {
        const items = allItems.filter(i => i.parentId === parentId);
        let chunk = "";
        items.forEach(item => {
          if (item.type === 'folder') {
            chunk += `<DT><H3>${item.title}</H3>\n<DL><p>\n${buildHtml(item.id)}</DL><p>\n`;
          } else {
            chunk += `<DT><A HREF="${item.url}" ADD_DATE="${item.createdAt?.seconds || 0}">${item.title}</A>\n`;
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
    } catch (e) {
      console.error("Export failed", e);
      alert("Export failed.");
    }
    setProcessing(false);
    setIsSettingsOpen(false);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/html");
        
        const batchSize = 400; 
        let currentBatch = writeBatch(db);
        let opCount = 0;

        const traverse = async (element, parentId) => {
          const nodes = Array.from(element.children);
          
          for (let node of nodes) {
            if (node.tagName === 'DT') {
              const h3 = node.querySelector('h3');
              const a = node.querySelector('a');
              let dl = node.querySelector('dl');

              if (h3) {
                const title = h3.textContent;
                const encrypted = await encryptData({ title, parentId, type: 'folder' }, cryptoKey);
                const ref = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookmarks'));
                currentBatch.set(ref, { ...encrypted, type: 'folder', parentId, createdAt: serverTimestamp() });
                opCount++;
                if (opCount >= batchSize) { await currentBatch.commit(); currentBatch = writeBatch(db); opCount = 0; }
                
                if (!dl && node.nextElementSibling?.tagName === 'DL') dl = node.nextElementSibling;
                
                if (dl) await traverse(dl, ref.id); 
              } else if (a) {
                const title = a.textContent;
                const url = a.getAttribute('href');
                const encrypted = await encryptData({ title, url: normalizeUrl(url), parentId, type: 'bookmark' }, cryptoKey);
                const ref = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookmarks'));
                currentBatch.set(ref, { ...encrypted, type: 'bookmark', parentId, createdAt: serverTimestamp() });

                opCount++;
                if (opCount >= batchSize) { await currentBatch.commit(); currentBatch = writeBatch(db); opCount = 0; }
              }
            }
          }
        };

        const rootDl = doc.querySelector('dl');
        if (rootDl) {
          await traverse(rootDl, currentFolderId); 
          if (opCount > 0) await currentBatch.commit();
          alert("Import successful!");
        } else {
          alert("Invalid bookmark file format.");
        }

      } catch (err) {
        console.error("Import error", err);
        alert("Import failed.");
      }
      setProcessing(false);
      setIsSettingsOpen(false);
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden relative">
      
      {/* Header */}
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 p-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* UPDATED: Button uses handleBack instead of onExit */}
              <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <ChevronLeft />
              </button>
              <h1 className="text-xl font-bold">Bookmarks</h1>
            </div>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
              <MoreVertical size={20} />
            </button>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all folders..."
              className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white">
                <X size={16} />
              </button>
            )}
          </div>

          {!searchQuery && (
            <div className="flex items-center gap-1 text-sm text-blue-100 overflow-x-auto no-scrollbar whitespace-nowrap mask-fade-right">
              {folderPath.map((folder, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <ChevronRight size={14} className="opacity-50" />}
                  <button 
                    onClick={() => handleBreadcrumbClick(index)}
                    className={`hover:text-white transition-colors flex items-center gap-1 ${index === folderPath.length - 1 ? 'font-bold text-white' : ''}`}
                  >
                    {index === 0 && <Home size={14} />}
                    {folder.title}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-4xl mx-auto pb-32">
          {loading || processing ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4285f4]"></div>
              <p>{processing ? "Processing..." : "Loading vault..."}</p>
            </div>
          ) : viewItems.length === 0 ? (
            <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
              <div className="bg-gray-100 p-4 rounded-full"><Folder size={32} className="opacity-50" /></div>
              <p>{searchQuery ? "No matching items found." : "This folder is empty."}</p>
              {!searchQuery && (
                <Button variant="ghost" onClick={() => setIsSettingsOpen(true)} className="text-[#4285f4]">
                  Import from Browser
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {viewItems.map(item => (
                <div 
                  key={item.id} 
                  className={`
                    p-4 rounded-xl shadow-sm border flex items-center justify-between group transition-all
                    ${item.type === 'folder' ? 'bg-blue-50/50 border-blue-100 hover:border-blue-300' : 'bg-white border-gray-100 hover:shadow-md'}
                  `}
                >
                  <div 
                    className="flex-1 flex items-center gap-4 cursor-pointer min-w-0" 
                    onClick={() => item.type === 'folder' ? handleEnterFolder(item) : window.open(normalizeUrl(item.url), '_blank')}
                  >
                    <div className={`h-10 w-10 relative rounded-lg flex items-center justify-center flex-shrink-0 ${item.type === 'folder' ? 'bg-blue-100 text-[#4285f4]' : 'bg-gray-50 text-gray-500'}`}>
                      {item.type === 'folder' ? (
                        <Folder size={20} fill="currentColor" className="opacity-80" />
                      ) : (
                        <>
                          <img 
                            src={`https://www.google.com/s2/favicons?sz=64&domain_url=${item.url}`} 
                            alt="" 
                            className="h-6 w-6"
                            onError={(e) => { e.target.style.display='none'; }} 
                          />
                          <Globe size={20} className="absolute opacity-0" /> 
                        </>
                      )}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <h3 className={`font-bold break-words whitespace-normal leading-tight ${item.type === 'folder' ? 'text-blue-800' : 'text-gray-800'}`}>
                        {item.title || "Untitled"}
                      </h3>
                      {item.type === 'bookmark' && (
                        <p className="text-xs text-gray-500 break-all whitespace-normal leading-tight flex items-center gap-1 mt-0.5">
                          {getDomain(item.url)}
                          <ExternalLink size={10} className="flex-shrink-0" />
                        </p>
                      )}
                      {item.type === 'folder' && (
                        <p className="text-xs text-blue-400 font-medium">Folder</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 pl-2">
                    {item.type === 'bookmark' && (
                        <button 
                            onClick={(e) => handleCopyUrl(e, item.url, item.id)}
                            className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Copy URL"
                        >
                            {copiedId === item.id ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                        </button>
                    )}

                    <button 
                        onClick={(e) => openEditModal(e, item)}
                        className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                    >
                        <Pencil size={18} />
                    </button>

                    <button 
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmation(item); }} 
                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                    >
                        <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-6 right-6 md:hidden z-20 flex flex-col gap-3">
        {isAddModalOpen ? null : (
          <div className="flex flex-col gap-3 items-end animate-in slide-in-from-bottom-4 fade-in duration-200">
             <button 
                onClick={() => { setAddType('folder'); setIsAddModalOpen(true); }}
                className="h-12 w-12 rounded-full bg-white text-gray-600 shadow-lg flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
             >
               <FolderPlus size={20} />
             </button>
             <button 
                onClick={() => { setAddType('bookmark'); setIsAddModalOpen(true); }}
                className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"
             >
               <Plus size={28} />
             </button>
          </div>
        )}
      </div>

      <div className="hidden md:flex fixed bottom-6 right-[calc(50%-20rem)] z-20 flex-col gap-3 items-end">
        {isAddModalOpen ? null : (
          <div className="flex flex-col gap-3 items-end animate-in slide-in-from-bottom-4 fade-in duration-200">
             <button 
                onClick={() => { setAddType('folder'); setIsAddModalOpen(true); }}
                style={{ backgroundColor: 'white', color: '#4285f4' }}
                className="rounded-full shadow-lg py-3 px-5 flex items-center gap-2 border border-gray-200 font-bold transition-transform active:scale-95"
             >
               <FolderPlus size={20} /> New Folder
             </button>
             
             <Button 
                onClick={() => { setAddType('bookmark'); setIsAddModalOpen(true); }}
                className="rounded-full shadow-xl py-4 px-6 text-lg flex items-center gap-2"
             >
               <Plus size={24} /> New Bookmark
             </Button>
          </div>
        )}
      </div>

      <Modal 
        isOpen={isAddModalOpen} 
        onClose={closeModal} 
        title={
            editingItem 
            ? (editingItem.type === 'folder' ? "Edit Folder" : "Edit Bookmark") 
            : (addType === 'folder' ? "New Folder" : "New Bookmark")
        }
      >
        <form onSubmit={handleSaveItem} key={editingItem ? editingItem.id : 'new'} className="flex flex-col gap-4">
          <Input 
            name="title" 
            label="Title" 
            placeholder={addType === 'folder' ? "e.g. Work" : "Leave empty to use URL"} 
            defaultValue={editingItem?.title || ''}
            autoFocus 
          />
          {((editingItem && editingItem.type === 'bookmark') || (!editingItem && addType === 'bookmark')) && (
            <Input 
                name="url" 
                label="URL" 
                placeholder="https://example.com" 
                type="url" 
                defaultValue={editingItem?.url || ''}
                required 
            />
          )}
          <Button type="submit" className="w-full">
            {editingItem ? 'Update' : (addType === 'folder' ? 'Create Folder' : 'Save Bookmark')}
          </Button>
        </form>
      </Modal>

      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Manage Bookmarks">
        <div className="flex flex-col gap-4">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <h4 className="font-bold text-[#4285f4] mb-2 flex items-center gap-2">
              <FileUp size={18} /> Import / Export
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => fileInputRef.current.click()} variant="secondary" className="flex flex-col items-center py-4 h-auto gap-2">
                <FileUp size={24} />
                <span>Import HTML</span>
              </Button>
              <Button onClick={handleExport} variant="secondary" className="flex flex-col items-center py-4 h-auto gap-2">
                <FileDown size={24} />
                <span>Export HTML</span>
              </Button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImport} accept=".html" className="hidden" />
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
            Are you sure you want to delete <b>{deleteConfirmation?.title}</b>?
            {deleteConfirmation?.type === 'folder' && <span className="block mt-1 font-bold">This deletes all contents!</span>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default BookmarksApp;