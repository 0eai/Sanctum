import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  updateDoc, 
  doc, 
  increment, 
  deleteDoc 
} from 'firebase/firestore';
import { 
  ChevronLeft, 
  Trash2, 
  CheckSquare, 
  Check, 
  X, 
  Plus,
  AlertCircle 
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input } from './components'; 
import { encryptData, decryptData } from './crypto';

const ChecklistApp = ({ user, cryptoKey, onExit }) => {
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [newItemText, setNewItemText] = useState("");

  // --- 1. HISTORY API INTEGRATION ---
  useEffect(() => {
    const handlePopState = (event) => {
        if (event.state?.appId === 'checklist') {
            // Restore the view based on history
            const listId = event.state.listId;
            if (listId) {
                const list = lists.find(l => l.id === listId);
                setActiveList(list || null);
            } else {
                setActiveList(null);
            }
        }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [lists]);

  // NEW: Push state when opening a list
  const handleOpenList = (list) => {
    window.history.pushState(
        { appId: 'checklist', listId: list.id }, 
        '', 
        '#checklist'
    );
    setActiveList(list);
  };

  // NEW: Handle Back Button
  const handleBack = () => {
    if (activeList) {
        window.history.back(); // Goes back to list view
    } else {
        onExit(); // Exits app
    }
  };

  // --- Fetch Lists ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'checklists'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, async (snap) => {
      const decryptedLists = await Promise.all(
        snap.docs.map(async (d) => {
          const raw = d.data();
          const decrypted = await decryptData(raw, cryptoKey);
          return { id: d.id, ...raw, ...decrypted }; 
        })
      );
      setLists(decryptedLists);
    });
  }, [user, cryptoKey]);

  // --- Fetch Items ---
  useEffect(() => {
    if (!activeList || !user || !cryptoKey) return; 
    
    const q = query(
        collection(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id, 'items'), 
        orderBy('createdAt', 'asc')
    );

    return onSnapshot(q, async (snap) => {
      const decryptedItems = await Promise.all(
        snap.docs.map(async (d) => {
          const rawData = d.data();
          const decrypted = await decryptData(rawData, cryptoKey);
          
          return { 
            id: d.id, 
            ...decrypted,
            isCompleted: rawData.isCompleted ?? decrypted.isCompleted ?? false 
          };
        })
      );
      setItems(decryptedItems);
    });
  }, [activeList, user, cryptoKey]);

  // --- Handlers ---

  const handleCreateList = async (e) => {
    e.preventDefault();
    const title = e.target.title.value;
    if (!title) return;
    const encryptedTitle = await encryptData({ title: title }, cryptoKey);
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'checklists'), {
      ...encryptedTitle,
      createdAt: serverTimestamp(), 
      itemCount: 0, 
      completedCount: 0
    });
    setIsCreateModalOpen(false);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemText.trim()) return;

    const encryptedContent = await encryptData({ text: newItemText }, cryptoKey);

    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id, 'items'), {
      ...encryptedContent,
      isCompleted: false, 
      createdAt: serverTimestamp() 
    });
    
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id), { 
      itemCount: increment(1) 
    });

    setNewItemText("");
  };

  const toggleItem = async (item) => {
    const newStatus = !item.isCompleted;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id, 'items', item.id), {
      isCompleted: newStatus
    });
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id), { 
      completedCount: increment(newStatus ? 1 : -1) 
    });
  };

  const confirmDelete = (type, data) => {
    setDeleteConfirmation({ type, data });
  };

  const proceedWithDelete = async () => {
    if (!deleteConfirmation) return;
    const { type, data } = deleteConfirmation;

    if (type === 'item') {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id, 'items', data.id));
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id), { 
            itemCount: increment(-1),
            completedCount: increment(data.isCompleted ? -1 : 0)
        });
    } else if (type === 'list') {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', data.id));
        if (activeList?.id === data.id) setActiveList(null);
    }
    
    setDeleteConfirmation(null);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      
      {/* Header */}
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-3xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            {/* UPDATED: Uses handleBack logic */}
            <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors flex-shrink-0">
              <ChevronLeft />
            </button>
            <div className="flex items-baseline gap-2 overflow-hidden">
                <h1 className="text-lg font-bold truncate">
                    {activeList ? activeList.title : "My Checklists"}
                </h1>
                {activeList && (
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium text-blue-50">
                        {items.length} items
                    </span>
                )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scroll-smooth">
        <div className="max-w-3xl mx-auto p-4">
          {!activeList ? (
            <div className="grid gap-3">
              {lists.map(list => (
                <div 
                    key={list.id} 
                    onClick={() => handleOpenList(list)} // UPDATED: Calls handleOpenList
                    className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between active:scale-[0.99] transition-transform cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2.5 rounded-lg text-[#4285f4]"><CheckSquare size={20} /></div>
                    <div>
                      <h3 className="font-bold text-gray-800">{list.title}</h3>
                      <p className="text-xs text-gray-500">{list.completedCount || 0}/{list.itemCount || 0} completed</p>
                    </div>
                  </div>
                  <button onClick={(e) => {e.stopPropagation(); confirmDelete('list', list);}} className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-gray-50">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              {lists.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <p>No checklists yet.</p>
                  <button onClick={() => setIsCreateModalOpen(true)} className="text-[#4285f4] font-medium mt-2 hover:underline">Create one</button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                  <button onClick={() => toggleItem(item)} className={`flex-none w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${item.isCompleted ? 'bg-[#4285f4] border-[#4285f4] text-white' : 'border-gray-300 text-transparent'}`}>
                    <Check size={14} strokeWidth={3} />
                  </button>
                  <span className={`flex-1 text-gray-800 ${item.isCompleted ? 'line-through text-gray-400' : ''}`}>{item.text}</span>
                  <button onClick={() => confirmDelete('item', item)} className="text-gray-300 hover:text-red-500 p-2">
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer / Floating Action */}
      {!activeList && (
        <>
            <div className="fixed bottom-6 right-6 md:hidden z-20">
                <button onClick={() => setIsCreateModalOpen(true)} className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform">
                <Plus size={28} />
                </button>
            </div>
            <div className="hidden md:block fixed bottom-6 right-[calc(50%-20rem)] z-20">
                <Button onClick={() => setIsCreateModalOpen(true)} className="rounded-full shadow-xl py-4 px-6 text-lg flex items-center gap-2">
                <Plus size={24} /> New Checklist
                </Button>
            </div>
        </>
      )}

      {/* Docked Input */}
      {activeList && (
        <div className="flex-none bg-white border-t border-gray-100 p-4 pb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
            <div className="max-w-3xl mx-auto">
                <form onSubmit={handleAddItem} className="flex gap-2">
                    <input 
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        placeholder="Add new item..." 
                        className="flex-1 p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4285f4] outline-none shadow-sm bg-gray-50 focus:bg-white transition-colors"
                        autoFocus={false} 
                    />
                    <button type="submit" className="bg-[#4285f4] text-white p-3 rounded-xl shadow-sm hover:bg-[#3367d6] active:scale-95 transition-all">
                        <Plus />
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Modals */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="New Checklist">
        <form onSubmit={handleCreateList} className="flex flex-col gap-4">
          <Input name="title" label="List Title" placeholder="e.g. Groceries, Packing List" autoFocus required />
          <Button type="submit" className="w-full">Create List</Button>
        </form>
      </Modal>

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Confirm Delete">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 bg-red-50 p-3 rounded-lg text-red-700 text-sm">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-semibold">Are you sure?</p>
              <p>{deleteConfirmation?.type === 'list' ? "This will permanently delete the checklist and all its items." : "This will permanently delete this item."}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button>
            <Button variant="danger" onClick={proceedWithDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default ChecklistApp;