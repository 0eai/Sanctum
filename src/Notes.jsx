import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { 
  ChevronLeft, Plus, Search, Folder, FileText, X, 
  Star, Tag, Paperclip, Share2, FolderPlus, 
  ArrowRightLeft, Trash2, Home, ChevronRight, LayoutGrid, List,
  Edit2, Link, CloudOff, Check, Loader, Globe
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input } from './components'; 
import { encryptData, decryptData, generateMasterKey, keyToUrlString } from './crypto';

// --- Helper Hook: Debounce ---
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// --- Helpers ---
const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

const NotesApp = ({ user, cryptoKey, onExit }) => {
  // --- State ---
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('saved'); 
  
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
  const [folderModalMode, setFolderModalMode] = useState('create'); 
  const [folderToEdit, setFolderToEdit] = useState(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [shareModal, setShareModal] = useState(null); 
  
  // UI State
  const [isTagInputVisible, setIsTagInputVisible] = useState(false);
  
  // Refs
  const textAreaRef = useRef(null);

  // Debounced Editor State for Auto-Save
  const debouncedEditorData = useDebounce(editorState, 1000);

  // --- Auto-Resize Logic for Text Area ---
  useEffect(() => {
    if (textAreaRef.current) {
      // Reset height to auto to shrink if text was deleted, then set to scrollHeight
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.height = textAreaRef.current.scrollHeight + "px";
    }
  }, [editorState?.content]);

  // --- History API ---
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state?.appId === 'notes') {
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

  // --- Auto-Save Logic ---
  useEffect(() => {
    if (!debouncedEditorData) return;
    
    const saveData = async () => {
      // 1. If empty, delete note
      if (!debouncedEditorData.title.trim() && !debouncedEditorData.content.trim() && debouncedEditorData.attachments.length === 0) {
        if (debouncedEditorData.id) {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', debouncedEditorData.id));
        }
        return;
      }

      setSaveStatus('saving');
      try {
        const payload = {
            title: debouncedEditorData.title,
            content: debouncedEditorData.content,
            tags: debouncedEditorData.tags || [],
            attachments: debouncedEditorData.attachments || [],
            sharedId: debouncedEditorData.sharedId || null,
            shareUrlKey: debouncedEditorData.shareUrlKey || null 
        };

        const encrypted = await encryptData(payload, cryptoKey);
        const meta = {
            updatedAt: serverTimestamp(),
            isPinned: debouncedEditorData.isPinned || false,
            type: 'note',
            parentId: debouncedEditorData.parentId || currentFolderId
        };

        if (debouncedEditorData.id) {
            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', debouncedEditorData.id), { ...encrypted, ...meta });
        } else {
            const ref = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), { ...encrypted, ...meta, createdAt: serverTimestamp() });
            setEditorState(prev => ({ ...prev, id: ref.id }));
        }
        setSaveStatus('saved');
      } catch (error) {
        console.error("Auto-save failed", error);
        setSaveStatus('error');
      }
    };

    saveData();
  }, [debouncedEditorData, user, cryptoKey, currentFolderId]);


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
          sharedId: decrypted?.sharedId || null,
          shareUrlKey: decrypted?.shareUrlKey || null,
          isPinned: raw.isPinned || false,
          type: raw.type || 'note',
          updatedAt: raw.updatedAt?.toDate() || new Date()
        };
      }));
      setItems(decryptedData);
      setLoading(false);
    });
  }, [user, cryptoKey]);

  // --- Computed Data ---
  const folderCounts = useMemo(() => {
    const counts = {};
    items.forEach(item => {
        if (item.parentId) {
            counts[item.parentId] = (counts[item.parentId] || 0) + 1;
        }
    });
    return counts;
  }, [items]);

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

  // --- Handlers ---

  const handleFolderAction = async (e) => {
    e.preventDefault();
    const title = e.target.title.value;
    if (!title) return;

    const encrypted = await encryptData({ title }, cryptoKey);

    if (folderModalMode === 'create') {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), {
            ...encrypted, type: 'folder', parentId: currentFolderId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
    } else if (folderModalMode === 'edit' && folderToEdit) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', folderToEdit.id), {
            ...encrypted, updatedAt: serverTimestamp()
        });
    }
    setIsFolderModalOpen(false);
    setFolderToEdit(null);
  };

  const handleCreateNewShare = async (note) => {
    try {
      const shareKey = await generateMasterKey();
      const payload = {
        title: note.title,
        content: note.content,
        tags: note.tags || [],
        attachments: note.attachments || [],
        date: new Date().toISOString()
      };
      const encryptedBlob = await encryptData(payload, shareKey);
      
      const docRef = await addDoc(collection(db, 'shared_notes'), { data: encryptedBlob, createdAt: serverTimestamp() });
      const keyString = await keyToUrlString(shareKey);
      
      const privatePayload = { ...note, sharedId: docRef.id, shareUrlKey: keyString };
      delete privatePayload.id; delete privatePayload.updatedAt; delete privatePayload.createdAt; delete privatePayload.type; delete privatePayload.isPinned;
      
      const encryptedPrivate = await encryptData(privatePayload, cryptoKey);
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', note.id), { ...encryptedPrivate });

      if (editorState && editorState.id === note.id) {
          setEditorState(prev => ({ ...prev, sharedId: docRef.id, shareUrlKey: keyString }));
      }

      const url = `${window.location.origin}/#view?id=${docRef.id}&k=${keyString}`;
      setShareModal({ isOpen: true, note: { ...note, sharedId: docRef.id, shareUrlKey: keyString }, link: url });

    } catch (e) { console.error(e); alert("Sharing failed."); }
  };

  const handleStopSharing = async (note) => {
    if (!note.sharedId) return;
    if (!window.confirm("Stop sharing? Public link will stop working.")) return;

    try {
        try { await deleteDoc(doc(db, 'shared_notes', note.sharedId)); } catch(e) { console.warn("Public note cleanup:", e.code); }

        const privatePayload = { ...note, sharedId: null, shareUrlKey: null };
        delete privatePayload.id; delete privatePayload.updatedAt; delete privatePayload.createdAt; delete privatePayload.type; delete privatePayload.isPinned;
        
        const encryptedPrivate = await encryptData(privatePayload, cryptoKey);
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', note.id), { ...encryptedPrivate });

        if (editorState && editorState.id === note.id) {
            setEditorState(prev => ({ ...prev, sharedId: null, shareUrlKey: null }));
        }

        setShareModal(null);
    } catch (e) {
        console.error(e);
        alert("Failed to update note status.");
    }
  };

  const openShareMenu = (e, note) => {
    e.stopPropagation();
    const url = (note.sharedId && note.shareUrlKey)
        ? `${window.location.origin}/#view?id=${note.sharedId}&k=${note.shareUrlKey}`
        : null;
    
    setShareModal({ isOpen: true, note: note, link: url }); 
  };

  // --- Fixed: TogglePin Definition ---
  const togglePin = async (e, item) => {
    e.stopPropagation();
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', item.id), {
        isPinned: !item.isPinned
    });
  };

  // --- View Switching ---
  const openEditor = (note = null) => {
    const newState = note 
        ? { ...note }
        : { title: '', content: '', tags: [], attachments: [], isPinned: false, parentId: currentFolderId, sharedId: null, shareUrlKey: null };
    setEditorState(newState);
    pushState(currentFolderId, folderPath, true);
  };

  const handleBack = () => {
    if (editorState) {
        window.history.back(); 
    } else if (searchQuery) {
        setSearchQuery("");
    } else {
        if (folderPath.length > 1) window.history.back();
        else onExit();
    }
  };

  const handleEnterFolder = (folder) => {
    const newPath = [...folderPath, { id: folder.id, title: folder.title }];
    pushState(folder.id, newPath);
    setCurrentFolderId(folder.id);
    setFolderPath(newPath);
    setSearchQuery("");
  };

  // --- RENDER HELPERS ---

  const renderEditor = () => (
    <div className="max-w-3xl mx-auto w-full h-full flex flex-col bg-white shadow-xl md:my-6 md:rounded-2xl md:h-[calc(100vh-3rem)] overflow-hidden relative">
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-20">
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft /></button>
            <div className="flex gap-2 items-center">
                <span className="text-xs text-gray-400 mr-2 uppercase tracking-wider font-medium">
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Error' : 'Saved'}
                </span>
                <button onClick={(e) => openShareMenu(e, editorState)} className={`p-2 transition-colors rounded-full ${editorState.sharedId ? 'text-green-500 bg-green-50' : 'text-gray-400 hover:text-[#4285f4]'}`}>
                    <Share2 size={20} />
                </button>
                <button onClick={() => setEditorState(s => ({...s, isPinned: !s.isPinned}))} className={`p-2 rounded-full ${editorState.isPinned ? 'bg-yellow-100 text-yellow-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <Star size={20} fill={editorState.isPinned ? "currentColor" : "none"} />
                </button>
            </div>
        </div>

        {/* UNIFIED SCROLL CONTAINER */}
        <div className="flex-1 overflow-y-auto">
            <div className="p-6 md:p-8 flex flex-col gap-6 min-h-full">
                {/* Header Section (Inline) */}
                <div className="flex flex-col gap-4">
                    <input 
                        value={editorState.title} 
                        onChange={e => setEditorState(s => ({...s, title: e.target.value}))}
                        placeholder="Untitled Note" 
                        className="text-3xl font-bold outline-none placeholder-gray-300 bg-transparent text-gray-800"
                    />
                    
                    <div className="flex flex-wrap gap-2 items-center">
                        {editorState.tags.map((tag, i) => (
                            <span key={i} className="bg-blue-50 text-[#4285f4] text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
                                #{tag} <button onClick={() => setEditorState(s => ({...s, tags: s.tags.filter((_, idx) => idx !== i)}))}><X size={12} /></button>
                            </span>
                        ))}
                        
                        {isTagInputVisible ? (
                            <input 
                                autoFocus
                                placeholder="Tag..."
                                className="text-xs px-3 py-1 rounded-full border border-[#4285f4] outline-none w-20"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                        setEditorState(s => ({...s, tags: [...s.tags, e.target.value.trim()]}));
                                        setIsTagInputVisible(false);
                                    }
                                }}
                                onBlur={() => setIsTagInputVisible(false)}
                            />
                        ) : (
                            <button onClick={() => setIsTagInputVisible(true)} className="flex items-center gap-1 text-gray-400 text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] transition-colors">
                                <Tag size={12} /> Add Tag
                            </button>
                        )}

                        <label className="flex items-center gap-1 text-gray-400 text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] cursor-pointer transition-colors">
                            <Paperclip size={12} /> Attach
                            <input type="file" className="hidden" onChange={async (e) => {
                                const file = e.target.files[0];
                                if (!file || file.size > 300000) return alert("File too large");
                                const base64 = await toBase64(file);
                                setEditorState(prev => ({ ...prev, attachments: [...prev.attachments, { name: file.name, type: file.type, data: base64 }] }));
                            }} />
                        </label>
                    </div>

                    {editorState.attachments.length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pt-2">
                            {editorState.attachments.map((att, i) => (
                                <div key={i} className="group relative aspect-square bg-gray-100 rounded-lg border flex items-center justify-center overflow-hidden">
                                    {att.type.startsWith('image/') ? <img src={att.data} className="w-full h-full object-cover" alt="" /> : <FileText size={24} className="text-gray-400" />}
                                    <button onClick={() => setEditorState(s => ({...s, attachments: s.attachments.filter((_, idx) => idx !== i)}))} className="absolute top-1 right-1 bg-white text-red-500 rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100"><X size={12} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Text Area (Auto-Growing) */}
                <textarea 
                    ref={textAreaRef}
                    value={editorState.content} 
                    onChange={e => setEditorState(s => ({...s, content: e.target.value}))}
                    placeholder="Start writing..." 
                    className="w-full outline-none resize-none text-gray-700 leading-relaxed text-lg bg-transparent pb-32 overflow-hidden" 
                    style={{ minHeight: '60vh' }}
                />
            </div>
        </div>
    </div>
  );

  const renderList = () => (
    <>
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-3xl mx-auto p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
              <h1 className="text-xl font-bold">Notes</h1>
            </div>
            <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
            </button>
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
        <div className="max-w-3xl mx-auto pb-32">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2"><Loader className="animate-spin" /> <p>Loading...</p></div>
          ) : displayedItems.length === 0 ? (
            <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4"><div className="bg-white p-4 rounded-full shadow-sm"><FileText size={32} className="opacity-50" /></div><p>Empty folder.</p></div>
          ) : (
            <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-3" : "flex flex-col gap-2"}>
              {displayedItems.map(item => (
                <div 
                    key={item.id} 
                    onClick={() => item.type === 'folder' ? handleEnterFolder(item) : openEditor(item)}
                    className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative group cursor-pointer active:scale-[0.99] transition-all flex ${viewMode === 'list' ? 'flex-row items-center p-3 gap-3' : 'flex-col p-4 h-48'}`}
                >
                    <div className={`flex-shrink-0 flex items-center justify-center rounded-lg ${viewMode === 'list' ? 'w-10 h-10' : 'w-8 h-8 mb-2'} ${item.type === 'folder' ? 'bg-blue-50 text-[#4285f4]' : 'bg-yellow-50 text-yellow-600'}`}>
                        {item.type === 'folder' ? <Folder size={20} /> : <FileText size={20} />}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col h-full">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className={`font-bold text-gray-800 truncate ${item.isPinned && item.type !== 'folder' ? 'text-blue-600' : ''}`}>{item.title}</h3>
                            <div className="flex items-center gap-1">
                                {item.sharedId && <Globe size={12} className="text-green-500" />}
                                {item.isPinned && <Star size={12} fill="currentColor" className="text-yellow-400 flex-shrink-0" />}
                            </div>
                        </div>
                        
                        {item.type === 'folder' ? (
                            <p className="text-xs text-blue-400 font-medium mt-1">{folderCounts[item.id] || 0} items</p>
                        ) : (
                            <>
                                <p className="text-xs text-gray-400 mt-1 line-clamp-3">{item.content || "No content"}</p>
                                <div className="mt-auto flex gap-1 pt-2 flex-wrap">
                                    {item.tags.slice(0, 3).map((t, i) => <span key={i} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>)}
                                    {item.attachments.length > 0 && <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Paperclip size={8} /> {item.attachments.length}</span>}
                                </div>
                            </>
                        )}
                    </div>

                    <div className={`absolute top-2 right-2 flex flex-col gap-1 transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100 ${viewMode === 'list' ? 'relative top-auto right-auto flex-row' : ''}`}>
                        {item.type === 'note' ? (
                            <>
                                <button onClick={(e) => openShareMenu(e, item)} className={`p-1.5 bg-white shadow-sm border border-gray-100 rounded-full ${item.sharedId ? 'text-green-500' : 'text-gray-400'} hover:text-blue-500 active:scale-95`}><Share2 size={14} /></button>
                                <button onClick={(e) => togglePin(e, item)} className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 hover:text-yellow-500 active:scale-95"><Star size={14} fill={item.isPinned ? "currentColor" : "none"} /></button>
                                <button onClick={(e) => { e.stopPropagation(); setItemToMove(item); setIsMoveModalOpen(true); }} className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 hover:text-green-500 active:scale-95"><ArrowRightLeft size={14} /></button>
                            </>
                        ) : (
                            <button onClick={(e) => { e.stopPropagation(); setFolderToEdit(item); setFolderModalMode('edit'); setIsFolderModalOpen(true); }} className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 hover:text-blue-500 active:scale-95"><Edit2 size={14} /></button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmation(item); }} className="p-1.5 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 hover:text-red-500 active:scale-95"><Trash2 size={14} /></button>
                    </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* FABs */}
      <div className="fixed inset-x-0 bottom-6 z-30 pointer-events-none">
          <div className="max-w-3xl mx-auto px-6 flex justify-end gap-3 pointer-events-auto">
             <button onClick={() => { setFolderModalMode('create'); setIsFolderModalOpen(true); }} className="h-12 w-12 rounded-full bg-white text-gray-600 shadow-lg flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"><FolderPlus size={20} /></button>
             <button onClick={() => openEditor()} className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"><Plus size={28} /></button>
          </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50 relative">
      {editorState ? renderEditor() : renderList()}

      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title={folderModalMode === 'create' ? "New Folder" : "Rename Folder"}>
        <form onSubmit={handleFolderAction} className="flex flex-col gap-4">
          <Input name="title" label="Folder Name" defaultValue={folderToEdit?.title || ''} placeholder="e.g. Ideas" autoFocus required />
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

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure? {deleteConfirmation?.type === 'folder' && "This deletes everything inside!"}</div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button><Button variant="danger" onClick={() => { if(deleteConfirmation.type === 'folder') { const batch = writeBatch(db); items.filter(i => i.parentId === deleteConfirmation.id).forEach(c => batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', c.id))); batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', deleteConfirmation.id)); batch.commit(); } else { deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', deleteConfirmation.id)); } setDeleteConfirmation(null); }}>Delete</Button></div>
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
                    <Button onClick={() => handleCreateNewShare(shareModal.note)} className="w-full flex items-center justify-center gap-2 bg-blue-100 text-blue-600 hover:bg-blue-200"><Globe size={16} /> Generate New Link</Button>
                )}
                <Button variant="danger" onClick={() => handleStopSharing(shareModal.note)} className="w-full flex items-center justify-center gap-2"><CloudOff size={16} /> Stop Sharing</Button>
            </div>
        </div>
      </Modal>

    </div>
  );
};

export default NotesApp;