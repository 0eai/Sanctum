import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { 
  ChevronLeft, Plus, Search, Folder, FileText, X, 
  Star, Tag, Paperclip, Share2, FolderPlus, 
  ArrowRightLeft, Trash2, Home, ChevronRight, Save, LayoutGrid, List,
  Image as ImageIcon
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input } from './components'; 
import { encryptData, decryptData } from './crypto';

// --- Helpers ---
const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

const NotesApp = ({ user, cryptoKey, onExit }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderPath, setFolderPath] = useState([{ id: null, title: 'Notes' }]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState('grid'); 

  // Editor / Modals
  const [editorState, setEditorState] = useState(null); 
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  
  // UI State for Tags
  const [isTagInputVisible, setIsTagInputVisible] = useState(false);

  // --- History API Integration ---
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state?.appId === 'notes') {
        // If popping back from editor, close it
        if (event.state.mode !== 'editor') {
           setEditorState(null);
           setCurrentFolderId(event.state.folderId || null);
           setFolderPath(event.state.path || [{ id: null, title: 'Notes' }]);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    
    if (window.history.state?.appId === 'notes' && window.history.state.folderId) {
       setCurrentFolderId(window.history.state.folderId);
       setFolderPath(window.history.state.path || [{ id: null, title: 'Notes' }]);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const pushState = (folderId, path, editor = false) => {
    window.history.pushState(
        { appId: 'notes', folderId, path, mode: editor ? 'editor' : 'list' }, 
        '', 
        '#notes'
    );
  };

  const handleEnterFolder = (folder) => {
    const newPath = [...folderPath, { id: folder.id, title: folder.title }];
    pushState(folder.id, newPath);
    setCurrentFolderId(folder.id);
    setFolderPath(newPath);
    setSearchQuery("");
  };

  const handleBack = () => {
    if (editorState) {
        window.history.back(); // Close editor
    } else if (searchQuery) {
        setSearchQuery("");
    } else {
        if (folderPath.length > 1) window.history.back();
        else onExit();
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    setLoading(true);
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), orderBy('updatedAt', 'desc'));
    
    return onSnapshot(q, async (snapshot) => {
      const decryptedData = await Promise.all(snapshot.docs.map(async doc => {
        const raw = doc.data();
        const decrypted = await decryptData(raw, cryptoKey);
        return { 
          id: doc.id, 
          ...raw, 
          ...decrypted, 
          tags: decrypted?.tags || [],
          attachments: decrypted?.attachments || [],
          isPinned: raw.isPinned || false,
          type: raw.type || 'note',
          updatedAt: raw.updatedAt?.toDate() || new Date()
        };
      }));
      setItems(decryptedData);
      setLoading(false);
    });
  }, [user, cryptoKey]);

  // --- Filtering & Sorting ---
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

  // --- Actions ---

  const handleSaveNote = async () => {
    if (!editorState.title.trim() && !editorState.content.trim()) return;

    try {
        const payload = {
            title: editorState.title || "Untitled Note",
            content: editorState.content || "",
            tags: editorState.tags || [],
            attachments: editorState.attachments || []
        };

        const encrypted = await encryptData(payload, cryptoKey);
        const meta = {
            updatedAt: serverTimestamp(),
            isPinned: editorState.isPinned || false,
            type: 'note',
            parentId: editorState.parentId || currentFolderId
        };

        if (editorState.id) {
            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', editorState.id), { ...encrypted, ...meta });
        } else {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), { ...encrypted, ...meta, createdAt: serverTimestamp() });
        }
        
        // Success - Go back
        if(window.history.state?.mode === 'editor') window.history.back();
        else setEditorState(null);

    } catch (error) {
        console.error("Save Error:", error);
        alert("Failed to save. If you have large attachments, they might exceed the limit.");
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const title = e.target.title.value;
    if (!title) return;
    
    const encrypted = await encryptData({ title }, cryptoKey);
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), {
        ...encrypted,
        type: 'folder',
        parentId: currentFolderId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    setIsFolderModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirmation) return;
    const { id, type } = deleteConfirmation;
    if (type === 'folder') {
        const batch = writeBatch(db);
        const children = items.filter(i => i.parentId === id);
        children.forEach(child => batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', child.id)));
        batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id));
        await batch.commit();
    } else {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id));
    }
    if (editorState?.id === id) setEditorState(null);
    setDeleteConfirmation(null);
  };

  const handleMove = async (targetFolderId) => {
    if (!itemToMove) return;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', itemToMove.id), {
        parentId: targetFolderId,
        updatedAt: serverTimestamp()
    });
    setIsMoveModalOpen(false);
    setItemToMove(null);
  };

  const togglePin = async (e, item) => {
    e.stopPropagation();
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', item.id), { isPinned: !item.isPinned });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Limit file size to 300KB to prevent Firestore document limit issues
    if (file.size > 300000) { alert("File too large. Max 300KB allowed."); return; }

    try {
        const base64 = await toBase64(file);
        setEditorState(prev => ({
            ...prev,
            attachments: [...prev.attachments, { name: file.name, type: file.type, data: base64 }]
        }));
    } catch (err) {
        alert("Upload failed.");
    }
  };

  const handleAddTag = (e) => {
    if (e.key === 'Enter') {
        const val = e.target.value.trim();
        if (val) {
            setEditorState(s => ({...s, tags: [...s.tags, val]}));
            setIsTagInputVisible(false);
        }
    }
  };

  const openEditor = (note = null) => {
    const newState = note 
        ? { ...note }
        : { title: '', content: '', tags: [], attachments: [], isPinned: false, parentId: currentFolderId };
    
    setEditorState(newState);
    pushState(currentFolderId, folderPath, true);
  };

  // --- Editor View ---
  if (editorState) {
    return (
        <div className="flex flex-col h-[100dvh] bg-white">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft className="text-gray-600" /></button>
                <div className="flex gap-2">
                    <button onClick={() => setEditorState(s => ({...s, isPinned: !s.isPinned}))} className={`p-2 rounded-full ${editorState.isPinned ? 'bg-yellow-100 text-yellow-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                        <Star size={20} fill={editorState.isPinned ? "currentColor" : "none"} />
                    </button>
                    <button onClick={handleSaveNote} className="p-2 bg-[#4285f4] text-white rounded-full shadow-md active:scale-95 transition-transform"><Save size={20} /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                <input 
                    value={editorState.title} 
                    onChange={e => setEditorState(s => ({...s, title: e.target.value}))}
                    placeholder="Title" 
                    className="text-2xl font-bold outline-none placeholder-gray-300"
                />
                
                <div className="flex flex-wrap gap-2 items-center">
                    {editorState.tags.map((tag, i) => (
                        <span key={i} className="bg-blue-50 text-[#4285f4] text-xs px-2 py-1 rounded-full flex items-center gap-1">
                            #{tag} <button onClick={() => setEditorState(s => ({...s, tags: s.tags.filter((_, idx) => idx !== i)}))}><X size={10} /></button>
                        </span>
                    ))}
                    
                    {/* Fixed Tag Input UI */}
                    {isTagInputVisible ? (
                        <input 
                            autoFocus
                            placeholder="Type tag & Enter"
                            className="text-xs px-2 py-1 rounded-full border border-[#4285f4] outline-none min-w-[80px]"
                            onKeyDown={handleAddTag}
                            onBlur={() => setIsTagInputVisible(false)}
                        />
                    ) : (
                        <button onClick={() => setIsTagInputVisible(true)} className="flex items-center gap-1 text-gray-400 text-xs px-2 py-1 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4]">
                            <Tag size={10} /> Add Tag
                        </button>
                    )}

                    <label className="flex items-center gap-1 text-gray-400 text-xs px-2 py-1 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] cursor-pointer">
                        <Paperclip size={10} /> Attach
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>

                {editorState.attachments.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto py-2">
                        {editorState.attachments.map((att, i) => (
                            <div key={i} className="flex-shrink-0 w-24 h-24 bg-gray-50 rounded-lg border relative flex flex-col items-center justify-center p-2 group overflow-hidden">
                                {att.type.startsWith('image/') ? (
                                    <img src={att.data} className="w-full h-full object-cover rounded" alt="" />
                                ) : (
                                    <div className="text-center p-1">
                                        <FileText size={24} className="mx-auto text-gray-400" />
                                        <p className="text-[9px] text-gray-500 mt-1 w-full truncate">{att.name}</p>
                                    </div>
                                )}
                                <button 
                                    onClick={() => setEditorState(s => ({...s, attachments: s.attachments.filter((_, idx) => idx !== i)}))}
                                    className="absolute top-1 right-1 bg-white/90 text-red-500 rounded-full p-1 shadow hover:bg-white"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <textarea 
                    value={editorState.content} 
                    onChange={e => setEditorState(s => ({...s, content: e.target.value}))}
                    placeholder="Start typing..." 
                    className="flex-1 w-full outline-none resize-none text-gray-700 leading-relaxed min-h-[300px]" 
                />
            </div>
        </div>
    );
  }

  // --- List View ---
  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden relative">
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 p-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
              <h1 className="text-xl font-bold">Notes</h1>
            </div>
            <div className="flex gap-2">
                <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                    {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
                </button>
            </div>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
          </div>

          {!searchQuery && (
            <div className="flex items-center gap-1 text-sm text-blue-100 overflow-x-auto no-scrollbar whitespace-nowrap mask-fade-right">
              {folderPath.map((folder, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <ChevronRight size={14} className="opacity-50" />}
                  <button onClick={() => {
                      const newPath = folderPath.slice(0, index + 1);
                      pushState(newPath[newPath.length-1].id, newPath);
                      setFolderPath(newPath);
                      setCurrentFolderId(newPath[newPath.length-1].id);
                  }} className={`hover:text-white transition-colors flex items-center gap-1 ${index === folderPath.length - 1 ? 'font-bold text-white' : ''}`}>
                    {index === 0 && <Home size={14} />} {folder.title}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-4xl mx-auto pb-32">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4285f4]"></div>
                <p>Loading vault...</p>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
              <div className="bg-gray-100 p-4 rounded-full"><FileText size={32} className="opacity-50" /></div>
              <p>Empty folder.</p>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-3" : "flex flex-col gap-2"}>
              {displayedItems.map(item => (
                <div 
                    key={item.id} 
                    onClick={() => item.type === 'folder' ? handleEnterFolder(item) : openEditor(item)}
                    className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative group cursor-pointer active:scale-[0.98] transition-all flex ${viewMode === 'list' ? 'flex-row items-center p-3 gap-3' : 'flex-col p-4 h-40'}`}
                >
                    <div className={`flex-shrink-0 flex items-center justify-center rounded-lg ${viewMode === 'list' ? 'w-10 h-10' : 'w-8 h-8 mb-2'} ${item.type === 'folder' ? 'bg-blue-50 text-[#4285f4]' : 'bg-yellow-50 text-yellow-600'}`}>
                        {item.type === 'folder' ? <Folder size={20} fill="currentColor" className="opacity-80" /> : <FileText size={20} />}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className={`font-bold text-gray-800 truncate ${item.isPinned && item.type !== 'folder' ? 'text-blue-600' : ''}`}>{item.title}</h3>
                            {item.isPinned && <Star size={10} fill="currentColor" className="text-yellow-400 flex-shrink-0" />}
                        </div>
                        {item.type === 'note' && (
                            <div className="text-xs text-gray-400 mt-1 flex flex-col gap-0.5">
                                <span className="truncate">{item.content ? item.content.slice(0, viewMode === 'grid' ? 50 : 100) : "No content"}</span>
                                <div className="flex gap-2 items-center mt-1">
                                    {item.attachments.length > 0 && <span className="flex items-center gap-0.5"><Paperclip size={10} /> {item.attachments.length}</span>}
                                    {item.tags.length > 0 && <span className="flex items-center gap-0.5"><Tag size={10} /> {item.tags.length}</span>}
                                </div>
                            </div>
                        )}
                        {item.type === 'folder' && <p className="text-xs text-blue-400 font-medium">Folder</p>}
                    </div>

                    <div className={`absolute top-2 right-2 flex flex-col gap-1 transition-opacity ${viewMode === 'list' ? 'opacity-0 group-hover:opacity-100 relative top-auto right-auto flex-row' : 'opacity-0 group-hover:opacity-100'}`}>
                        {item.type === 'note' && (
                            <>
                                <button onClick={(e) => togglePin(e, item)} className="p-1.5 bg-white shadow rounded-full text-gray-400 hover:text-yellow-500"><Star size={14} /></button>
                                <button onClick={(e) => { e.stopPropagation(); setItemToMove(item); setIsMoveModalOpen(true); }} className="p-1.5 bg-white shadow rounded-full text-gray-400 hover:text-green-500"><ArrowRightLeft size={14} /></button>
                            </>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmation(item); }} className="p-1.5 bg-white shadow rounded-full text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-6 right-6 z-20 flex flex-col gap-3 items-end">
         <button onClick={() => setIsFolderModalOpen(true)} className="h-12 w-12 rounded-full bg-white text-gray-600 shadow-lg flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"><FolderPlus size={20} /></button>
         <button onClick={() => openEditor()} className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"><Plus size={28} /></button>
      </div>

      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title="New Folder">
        <form onSubmit={handleCreateFolder} className="flex flex-col gap-4">
          <Input name="title" label="Folder Name" placeholder="e.g. Work, Ideas" autoFocus required />
          <Button type="submit" className="w-full">Create Folder</Button>
        </form>
      </Modal>

      <Modal isOpen={isMoveModalOpen} onClose={() => { setIsMoveModalOpen(false); setItemToMove(null); }} title="Move to Folder">
        <div className="flex flex-col gap-2">
            <button onClick={() => handleMove(null)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2"><Home size={16} /> Home (Root)</button>
            {items.filter(i => i.type === 'folder' && i.id !== itemToMove?.id).map(folder => (
                <button key={folder.id} onClick={() => handleMove(folder.id)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2">
                    <Folder size={16} className="text-[#4285f4]" /> {folder.title}
                </button>
            ))}
        </div>
      </Modal>

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
            Are you sure you want to delete <b>{deleteConfirmation?.title}</b>?
            {deleteConfirmation?.type === 'folder' && <span className="block mt-1 font-bold">This deletes all notes inside!</span>}
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

export default NotesApp;