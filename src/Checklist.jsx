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
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  ChevronLeft, 
  Trash2, 
  CheckSquare, 
  Check, 
  X, 
  Plus,
  AlertCircle,
  Bell, 
  Clock,
  RotateCcw,
  Edit2, 
  RefreshCw,
  Calendar
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input } from './components'; 
import { encryptData, decryptData } from './crypto';

// --- Helper: Format Date ---
const formatDate = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// --- Helper: Calculate Next Date ---
const getNextDate = (currentDateStr, frequency) => {
  if (!currentDateStr) return null;
  const date = new Date(currentDateStr);
  switch(frequency) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
    default: return null;
  }
  return date.toISOString();
};

const ChecklistApp = ({ user, cryptoKey, onExit }) => {
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);
  
  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [editingTarget, setEditingTarget] = useState(null);

  // Input States
  const [newItemText, setNewItemText] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [repeatFreq, setRepeatFreq] = useState("none");

  // --- HISTORY API ---
  useEffect(() => {
    const handlePopState = (event) => {
        if (event.state?.appId === 'checklist') {
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

  const handleOpenList = (list) => {
    window.history.pushState({ appId: 'checklist', listId: list.id }, '', '#checklist');
    setActiveList(list);
  };

  const handleBack = () => {
    if (activeList) {
        window.history.back();
    } else {
        onExit();
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
          return { 
              id: d.id, 
              ...raw, 
              ...decrypted,
              dueDate: decrypted.dueDate || null,
              repeat: decrypted.repeat || 'none'
          }; 
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
            dueDate: decrypted.dueDate || null,
            repeat: decrypted.repeat || 'none',
            isCompleted: rawData.isCompleted ?? decrypted.isCompleted ?? false 
          };
        })
      );
      setItems(decryptedItems);
    });
  }, [activeList, user, cryptoKey]);

  // --- Handlers ---

  const toggleAlertOptions = () => {
    // If alerts are SET (blue state), clicking clears them
    if (dueDate || repeatFreq !== 'none') {
        setDueDate("");
        setRepeatFreq("none");
        setShowOptions(false);
    } else {
        // If alerts are OFF (gray state), clicking toggles the drawer
        setShowOptions(!showOptions);
    }
  };

  const handleCreateList = async (e) => {
    e.preventDefault();
    const title = e.target.title.value;
    if (!title) return;
    
    const dDate = e.target.dueDate?.value || null;
    const rFreq = e.target.repeat?.value || 'none';

    const encryptedData = await encryptData({ title, dueDate: dDate, repeat: rFreq }, cryptoKey);
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'checklists'), {
      ...encryptedData,
      createdAt: serverTimestamp(), 
      itemCount: 0, 
      completedCount: 0
    });
    setIsCreateModalOpen(false);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingTarget) return;

    const title = e.target.title.value;
    const dDate = e.target.dueDate?.value || null;
    const rFreq = e.target.repeat?.value || 'none';

    const payload = { 
        [editingTarget.type === 'list' ? 'title' : 'text']: title, 
        dueDate: dDate, 
        repeat: rFreq 
    };
    const encrypted = await encryptData(payload, cryptoKey);

    if (editingTarget.type === 'list') {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', editingTarget.id), encrypted);
        if (activeList?.id === editingTarget.id) setActiveList(prev => ({...prev, ...payload}));
    } else {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id, 'items', editingTarget.id), encrypted);
    }
    setEditingTarget(null);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemText.trim()) return;

    const payload = { 
        text: newItemText,
        dueDate: dueDate || null,
        repeat: repeatFreq || 'none'
    };
    const encryptedContent = await encryptData(payload, cryptoKey);

    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id, 'items'), {
      ...encryptedContent,
      isCompleted: false, 
      createdAt: serverTimestamp() 
    });
    
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id), { 
      itemCount: increment(1) 
    });

    setNewItemText("");
    setDueDate("");
    setRepeatFreq("none");
    setShowOptions(false);
  };

  const toggleItem = async (item) => {
    if (!item.isCompleted && item.dueDate && item.repeat && item.repeat !== 'none') {
        const nextDate = getNextDate(item.dueDate, item.repeat);
        const payload = { ...item, dueDate: nextDate };
        delete payload.id; delete payload.isCompleted;
        const encrypted = await encryptData(payload, cryptoKey);
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id, 'items', item.id), {
            ...encrypted, isCompleted: false
        });
    } else {
        const newStatus = !item.isCompleted;
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id, 'items', item.id), {
          isCompleted: newStatus
        });
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', activeList.id), { 
          completedCount: increment(newStatus ? 1 : -1) 
        });
    }
  };

  const handleResetList = async (list) => {
      if (!window.confirm("Reset this list? This will uncheck all items and move the due date.")) return;
      
      const batch = writeBatch(db);
      items.forEach(item => {
          if (item.isCompleted) {
              const ref = doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', list.id, 'items', item.id);
              batch.update(ref, { isCompleted: false });
          }
      });

      const nextDate = getNextDate(list.dueDate, list.repeat);
      const payload = { ...list, dueDate: nextDate };
      delete payload.id; delete payload.itemCount; delete payload.completedCount; delete payload.createdAt;
      const encrypted = await encryptData(payload, cryptoKey);
      
      const listRef = doc(db, 'artifacts', appId, 'users', user.uid, 'checklists', list.id);
      batch.update(listRef, { ...encrypted, completedCount: 0 });

      await batch.commit();
      
      if (activeList?.id === list.id) {
          setActiveList(prev => ({...prev, dueDate: nextDate, completedCount: 0}));
      }
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
            <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors flex-shrink-0">
              <ChevronLeft />
            </button>
            <div className="flex flex-col overflow-hidden">
                <div className="flex items-center gap-2">
                    <h1 className="text-lg font-bold truncate">
                        {activeList ? activeList.title : "My Checklists"}
                    </h1>
                    {activeList && (
                        <button onClick={() => setEditingTarget({ type: 'list', ...activeList })} className="opacity-50 hover:opacity-100 hover:text-white transition-opacity">
                            <Edit2 size={14} />
                        </button>
                    )}
                </div>
                {activeList && activeList.dueDate && (
                    <div className="flex items-center gap-2 text-xs text-blue-100">
                        <span className="flex items-center gap-1"><Clock size={10} /> {formatDate(activeList.dueDate)}</span>
                        {activeList.repeat !== 'none' && <span className="flex items-center gap-1"><RotateCcw size={10} /> {activeList.repeat}</span>}
                    </div>
                )}
            </div>
          </div>
          
          {activeList && activeList.repeat !== 'none' && (
              <button onClick={() => handleResetList(activeList)} className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors font-medium">
                  <RefreshCw size={12} /> Reset
              </button>
          )}
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
                    onClick={() => handleOpenList(list)}
                    className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative group active:scale-[0.99] transition-transform cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2.5 rounded-lg text-[#4285f4]"><CheckSquare size={20} /></div>
                        <div>
                          <h3 className="font-bold text-gray-800">{list.title}</h3>
                          <div className="flex flex-wrap gap-2 mt-1">
                              <span className="text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{list.completedCount || 0}/{list.itemCount || 0} done</span>
                              {list.dueDate && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${new Date(list.dueDate) < new Date() ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                                      <Clock size={10} /> {formatDate(list.dueDate)}
                                  </span>
                              )}
                              {list.repeat !== 'none' && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"><RotateCcw size={10} /></span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); setEditingTarget({ type: 'list', ...list }); }} className="p-2 text-gray-300 hover:text-blue-500 rounded-full hover:bg-gray-50">
                              <Edit2 size={16} />
                          </button>
                          <button onClick={(e) => {e.stopPropagation(); confirmDelete('list', list);}} className="p-2 text-gray-300 hover:text-red-500 rounded-full hover:bg-gray-50">
                              <Trash2 size={16} />
                          </button>
                      </div>
                  </div>
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
              {items.map(item => {
                const isOverdue = item.dueDate && new Date(item.dueDate) < new Date() && !item.isCompleted;
                return (
                    <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-start gap-3 group">
                    <button onClick={() => toggleItem(item)} className={`flex-none mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${item.isCompleted ? 'bg-[#4285f4] border-[#4285f4] text-white' : 'border-gray-300 text-transparent'}`}>
                        <Check size={14} strokeWidth={3} />
                    </button>
                    
                    <div className="flex-1 min-w-0">
                        <span className={`text-gray-800 break-words ${item.isCompleted ? 'line-through text-gray-400' : ''}`}>{item.text}</span>
                        
                        {(item.dueDate || (item.repeat && item.repeat !== 'none')) && (
                            <div className="flex items-center gap-2 mt-1">
                                {item.dueDate && (
                                    <div className={`flex items-center gap-1 text-[10px] font-medium w-fit px-1.5 py-0.5 rounded ${isOverdue ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'} ${item.isCompleted ? 'opacity-50 grayscale' : ''}`}>
                                        <Clock size={10} /> {formatDate(item.dueDate)}
                                    </div>
                                )}
                                {item.repeat && item.repeat !== 'none' && (
                                    <span className="text-[10px] text-gray-400 flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                        <RotateCcw size={10} /> {item.repeat}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingTarget({ type: 'item', ...item })} className="text-gray-300 hover:text-blue-500 p-2">
                            <Edit2 size={16} />
                        </button>
                        <button onClick={() => confirmDelete('item', item)} className="text-gray-300 hover:text-red-500 p-2">
                            <X size={18} />
                        </button>
                    </div>
                    </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Floating Action (List View) */}
      {!activeList && (
        <div className="fixed inset-x-0 bottom-6 z-30 pointer-events-none">
            <div className="max-w-3xl mx-auto px-6 flex justify-end pointer-events-auto">
                <button onClick={() => setIsCreateModalOpen(true)} className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform">
                <Plus size={28} />
                </button>
            </div>
        </div>
      )}

      {/* Docked Input (Item View) */}
      {activeList && (
        <div className="flex-none bg-white border-t border-gray-100 p-4 pb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
            <div className="max-w-3xl mx-auto">
                {showOptions && (
                    // 3. FIX: Flex-col on mobile to prevent overlapping
                    <div className="mb-3 animate-in slide-in-from-bottom-2 fade-in bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 w-full">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Due Date</label>
                            <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#4285f4]" />
                        </div>
                        <div className="flex-1 w-full">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Repeat</label>
                            <select value={repeatFreq} onChange={(e) => setRepeatFreq(e.target.value)} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#4285f4]">
                                <option value="none">No Repeat</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                            </select>
                        </div>
                    </div>
                )}

                <form onSubmit={handleAddItem} className="flex gap-2 items-end">
                    <button 
                        type="button"
                        onClick={toggleAlertOptions}
                        className={`p-3 rounded-xl transition-colors ${dueDate || repeatFreq !== 'none' ? 'bg-blue-50 text-[#4285f4]' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                    >
                        {dueDate || repeatFreq !== 'none' ? <Clock size={20} className="text-[#4285f4]" /> : <Bell size={20} />}
                    </button>
                    <input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="Add new item..." className="flex-1 p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4285f4] outline-none shadow-sm bg-gray-50 focus:bg-white transition-colors" />
                    <button type="submit" className="bg-[#4285f4] text-white p-3 rounded-xl shadow-sm hover:bg-[#3367d6] active:scale-95 transition-all"><Plus /></button>
                </form>
            </div>
        </div>
      )}

      {/* Modals */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="New Checklist">
        <form onSubmit={handleCreateList} className="flex flex-col gap-4">
          <Input name="title" label="List Title" placeholder="e.g. Groceries, Packing List" autoFocus required />
          <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Due Date (Optional)</label>
                  <input name="dueDate" type="datetime-local" className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" />
              </div>
              <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Repeat</label>
                  <select name="repeat" className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none">
                        <option value="none">No Repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                  </select>
              </div>
          </div>
          <Button type="submit" className="w-full">Create List</Button>
        </form>
      </Modal>

      <Modal isOpen={!!editingTarget} onClose={() => setEditingTarget(null)} title={editingTarget?.type === 'list' ? "Edit List" : "Edit Item"}>
        <form onSubmit={handleUpdate} className="flex flex-col gap-4">
          <Input 
            name="title" 
            label={editingTarget?.type === 'list' ? "List Title" : "Item Text"} 
            defaultValue={editingTarget?.type === 'list' ? editingTarget.title : editingTarget?.text} 
            autoFocus 
            required 
          />
          <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Due Date</label>
                  <input name="dueDate" type="datetime-local" defaultValue={editingTarget?.dueDate || ''} className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none" />
              </div>
              <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Repeat</label>
                  <select name="repeat" defaultValue={editingTarget?.repeat || 'none'} className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none">
                        <option value="none">No Repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                  </select>
              </div>
          </div>
          <Button type="submit" className="w-full">Save Changes</Button>
        </form>
      </Modal>

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Confirm Delete">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 bg-red-50 p-3 rounded-lg text-red-700 text-sm">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-semibold">Are you sure?</p>
              <p>{deleteConfirmation?.type === 'list' ? "This will permanently delete the checklist." : "This will delete this item."}</p>
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