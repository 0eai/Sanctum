import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { 
  ChevronLeft, Plus, Search, Folder, CheckSquare, Square, X, 
  Star, Calendar, GripVertical, Trash2, Home, ChevronRight, LayoutGrid, List,
  Clock, FileText, FolderPlus, MoreVertical, Edit2, Check
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input, LoadingSpinner } from './components'; 
import { encryptData, decryptData } from './crypto';

// --- Helpers ---
// Simple DnD helper to reorder array locally before saving
const reorder = (list, startIndex, endIndex) => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

const TasksApp = ({ user, cryptoKey, onExit }) => {
  // --- State ---
  const [folders, setFolders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation & View
  const [currentFolderId, setCurrentFolderId] = useState(null); // null = Root
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState('grid');
  
  // Editor & Modals
  const [editorTask, setEditorTask] = useState(null); // If set, shows Editor
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type, id, title }
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);

  // --- Data Fetching ---

  // 1. Fetch Folders
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'task_folders'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, async (snapshot) => {
      const decrypted = await Promise.all(snapshot.docs.map(async d => {
        const data = await decryptData(d.data(), cryptoKey);
        return { id: d.id, ...data };
      }));
      setFolders(decrypted);
    });
  }, [user, cryptoKey]);

  // 2. Fetch Tasks
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), orderBy('order', 'desc'));
    return onSnapshot(q, async (snapshot) => {
      const decrypted = await Promise.all(snapshot.docs.map(async d => {
        const data = await decryptData(d.data(), cryptoKey);
        return { 
          id: d.id, 
          ...data, 
          subtasks: data.subtasks || [],
          order: d.data().order || 0
        };
      }));
      setTasks(decrypted);
      setLoading(false);
    });
  }, [user, cryptoKey]);

  // --- Computed Data ---
  
  const currentFolderName = useMemo(() => {
    if (!currentFolderId) return "My Tasks";
    return folders.find(f => f.id === currentFolderId)?.name || "Folder";
  }, [currentFolderId, folders]);

  const displayedItems = useMemo(() => {
    let filteredTasks = tasks;
    let visibleFolders = [];

    if (searchQuery.trim()) {
      // Search Mode: Show matching tasks from ANY folder
      const q = searchQuery.toLowerCase();
      filteredTasks = tasks.filter(t => t.title.toLowerCase().includes(q));
    } else {
      // Normal Mode: Show items in current folder
      if (currentFolderId === null) {
        // Root: Show all folders + tasks with no folder
        visibleFolders = folders; 
        filteredTasks = tasks.filter(t => !t.folderId);
      } else {
        // Inside Folder: Show tasks with matching folderId
        filteredTasks = tasks.filter(t => t.folderId === currentFolderId);
      }
    }

    // Sort: Pinned first, then by Order
    filteredTasks.sort((a, b) => (b.isPinned === a.isPinned ? 0 : b.isPinned ? 1 : -1));

    return { folders: visibleFolders, tasks: filteredTasks };
  }, [tasks, folders, currentFolderId, searchQuery]);

  // --- Actions ---

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    const encrypted = await encryptData({ name }, cryptoKey);
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'task_folders'), {
      ...encrypted, createdAt: serverTimestamp()
    });
    setIsFolderModalOpen(false);
  };

  const handleSaveTask = async (taskData) => {
    try {
      const order = taskData.order || Date.now();
      const payload = {
        title: taskData.title || "Untitled Task",
        folderId: currentFolderId, // Always save to current view
        completed: taskData.completed || false,
        isPinned: taskData.isPinned || false,
        dueDate: taskData.dueDate || "",
        notes: taskData.notes || "",
        subtasks: taskData.subtasks || []
      };

      const encrypted = await encryptData(payload, cryptoKey);
      
      if (taskData.id) {
        // Update
        const { id, ...rest } = payload; // Don't encrypt ID inside data
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskData.id), { ...encrypted });
      } else {
        // Create
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), {
          ...encrypted, order, createdAt: serverTimestamp()
        });
      }
    } catch (e) { console.error("Save failed", e); }
  };

  const handleToggleTask = async (task) => {
    const newStatus = !task.completed;
    // Optimistic Update handled by snapshot, but we can just fire and forget
    const encrypted = await encryptData({ ...task, completed: newStatus }, cryptoKey);
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), { ...encrypted });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'folder') {
      // Cascade delete tasks
      const batch = writeBatch(db);
      const folderTasks = tasks.filter(t => t.folderId === deleteConfirm.id);
      folderTasks.forEach(t => batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', t.id)));
      batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'task_folders', deleteConfirm.id));
      await batch.commit();
    } else {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', deleteConfirm.id));
    }
    setDeleteConfirm(null);
    if (editorTask?.id === deleteConfirm.id) setEditorTask(null);
  };

  // --- Drag & Drop (Tasks Only) ---
  const onDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e) => e.preventDefault();

  const onDrop = async (e, dropIndex) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;
    
    // Swap logic
    const list = displayedItems.tasks;
    const dragged = list[draggedItemIndex];
    const target = list[dropIndex];

    const batch = writeBatch(db);
    // Swap 'order' fields
    batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', dragged.id), { order: target.order });
    batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', target.id), { order: dragged.order });
    
    await batch.commit();
    setDraggedItemIndex(null);
  };

  // --- Subcomponents ---

  // 1. Task Card (List Item)
  const TaskCard = ({ task, index }) => (
    <div 
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
      onClick={() => setEditorTask(task)}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-start gap-3 group active:scale-[0.99] transition-all cursor-pointer ${task.completed ? 'opacity-60' : ''}`}
    >
      <div className="mt-1 text-gray-300 cursor-grab active:cursor-grabbing hover:text-gray-500 touch-none" onClick={e => e.stopPropagation()}>
        <GripVertical size={16} />
      </div>
      
      <button 
        onClick={(e) => { e.stopPropagation(); handleToggleTask(task); }}
        className={`mt-0.5 ${task.completed ? 'text-green-500' : 'text-gray-300 hover:text-blue-500'}`}
      >
        {task.completed ? <CheckSquare size={20} /> : <Square size={20} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium text-gray-800 truncate ${task.completed ? 'line-through text-gray-400' : ''}`}>
            {task.title}
          </span>
          {task.isPinned && <Star size={12} fill="currentColor" className="text-yellow-400 flex-shrink-0" />}
        </div>
        
        {/* Meta Row */}
        <div className="flex flex-wrap gap-2 mt-1.5">
          {task.dueDate && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${new Date(task.dueDate) < new Date() ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
              <Calendar size={10} /> {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-1">
              <CheckSquare size={10} /> {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
            </span>
          )}
          {task.notes && <FileText size={12} className="text-gray-400" />}
        </div>
      </div>

      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'task', id: task.id, title: task.title }); }} className="p-1.5 text-gray-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <Trash2 size={16} />
      </button>
    </div>
  );

  // 2. Folder Card
  const FolderCard = ({ folder }) => (
    <div 
      onClick={() => { setCurrentFolderId(folder.id); setSearchQuery(""); }}
      className="bg-blue-50/50 hover:bg-blue-50 rounded-xl border border-blue-100 p-4 flex flex-col justify-center items-center gap-2 cursor-pointer transition-all active:scale-95 group relative h-32"
    >
      <Folder size={32} className="text-[#4285f4] opacity-80" fill="currentColor" />
      <span className="font-semibold text-gray-700 text-sm truncate w-full text-center">{folder.name}</span>
      <span className="text-[10px] bg-white/50 text-blue-400 px-2 py-0.5 rounded-full">
        {tasks.filter(t => t.folderId === folder.id).length} tasks
      </span>
      
      <button 
        onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'folder', id: folder.id, title: folder.name }); }}
        className="absolute top-2 right-2 text-blue-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  // 3. Task Editor View
  if (editorTask) {
    // Local state for editor (only saves on back/close)
    const Editor = () => {
      const [data, setData] = useState({ ...editorTask });
      
      // Auto-save on unmount is tricky with closures, so we save on specific actions or debounce
      // For simplicity in this structure, we'll save on "Back" or "Enter" in inputs
      
      // Real-time update wrapper
      const update = (patch) => {
        const newData = { ...data, ...patch };
        setData(newData);
        handleSaveTask(newData); // Auto-save changes immediately
      };

      return (
        <div className="flex flex-col h-screen bg-gray-50">
          <div className="max-w-3xl mx-auto w-full h-full flex flex-col bg-white shadow-xl md:my-6 md:rounded-2xl md:h-[calc(100vh-3rem)] overflow-hidden">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none">
              <button onClick={() => setEditorTask(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft /></button>
              <div className="flex gap-2">
                <button onClick={() => update({ isPinned: !data.isPinned })} className={`p-2 rounded-full ${data.isPinned ? 'text-yellow-500 bg-yellow-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                  <Star size={20} fill={data.isPinned ? "currentColor" : "none"} />
                </button>
                <button onClick={() => { setDeleteConfirm({ type: 'task', id: data.id, title: data.title }); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full">
                  <Trash2 size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              
              {/* Title Section */}
              <div className="flex items-start gap-3">
                <button onClick={() => update({ completed: !data.completed })} className={`mt-1.5 ${data.completed ? 'text-green-500' : 'text-gray-300'}`}>
                  {data.completed ? <CheckSquare size={24} /> : <Square size={24} />}
                </button>
                <input 
                  value={data.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="Task Name"
                  className={`text-2xl font-bold bg-transparent outline-none w-full ${data.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}
                />
              </div>

              {/* Date */}
              <div className="flex items-center gap-3 text-gray-500">
                <div className="p-2 bg-gray-100 rounded-lg"><Calendar size={18} /></div>
                <input 
                  type="datetime-local" 
                  value={data.dueDate}
                  onChange={(e) => update({ dueDate: e.target.value })}
                  className="bg-transparent outline-none text-sm font-medium"
                />
              </div>

              {/* Subtasks */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <CheckSquare size={12} /> Subtasks
                </h3>
                
                {data.subtasks.map((sub, i) => (
                  <div key={sub.id} className="flex items-start gap-2 group">
                    <button onClick={() => {
                      const newSubs = [...data.subtasks];
                      newSubs[i].completed = !newSubs[i].completed;
                      update({ subtasks: newSubs });
                    }} className={`mt-1 ${sub.completed ? 'text-green-500' : 'text-gray-300'}`}>
                      {sub.completed ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <input 
                      value={sub.title}
                      onChange={(e) => {
                        const newSubs = [...data.subtasks];
                        newSubs[i].title = e.target.value;
                        update({ subtasks: newSubs });
                      }}
                      className={`flex-1 bg-transparent text-sm outline-none ${sub.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}
                    />
                    <button onClick={() => {
                        const newSubs = data.subtasks.filter((_, idx) => idx !== i);
                        update({ subtasks: newSubs });
                    }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
                      <X size={16} />
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-2 text-gray-400">
                  <Plus size={16} />
                  <input 
                    placeholder="Add subtask..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        const newSub = { id: Date.now().toString(), title: e.target.value, completed: false };
                        update({ subtasks: [...data.subtasks, newSub] });
                        e.target.value = '';
                      }
                    }}
                    className="bg-transparent text-sm outline-none w-full"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="flex-1 flex flex-col gap-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <FileText size={12} /> Notes
                </h3>
                <textarea 
                  value={data.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                  placeholder="Add details..."
                  className="w-full h-full min-h-[150px] bg-gray-50 border-none rounded-xl p-4 text-sm text-gray-700 outline-none resize-none"
                />
              </div>

            </div>
          </div>
        </div>
      );
    };
    return <Editor />;
  }

  // --- Main View (List/Grid) ---
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-3xl mx-auto p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => currentFolderId ? setCurrentFolderId(null) : onExit()} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <ChevronLeft />
              </button>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <CheckSquare size={24} /> {currentFolderName}
              </h1>
            </div>
            
            {/* View Toggle */}
            {currentFolderId === null && (
               <div className="flex items-center gap-2 text-blue-100 text-sm">
                  {/* Root View only shows Grid of folders usually, but we keep structure */}
               </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              placeholder="Search tasks..." 
              className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm" 
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
          </div>

          {/* Breadcrumbs */}
          {!searchQuery && currentFolderId && (
            <div className="flex items-center gap-1 text-sm text-blue-100">
                <button onClick={() => setCurrentFolderId(null)} className="hover:text-white flex items-center gap-1">
                    <Home size={14} /> My Tasks
                </button>
                <ChevronRight size={14} className="opacity-50" />
                <span className="font-bold text-white">{currentFolderName}</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-3xl mx-auto pb-32 space-y-4">
          
          {loading && <div className="flex justify-center py-10"><LoadingSpinner /></div>}

          {!loading && displayedItems.folders.length === 0 && displayedItems.tasks.length === 0 && (
             <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
               <div className="bg-white p-4 rounded-full shadow-sm"><CheckSquare size={32} className="opacity-50" /></div>
               <p>No tasks found.</p>
             </div>
          )}

          {/* Folders Grid (Only visible at Root) */}
          {displayedItems.folders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {displayedItems.folders.map(f => <FolderCard key={f.id} folder={f} />)}
            </div>
          )}

          {/* Tasks List */}
          <div className="flex flex-col gap-2">
            {displayedItems.tasks.map((task, index) => (
              <TaskCard key={task.id} task={task} index={index} />
            ))}
          </div>

        </div>
      </main>

      {/* FABs */}
      <div className="fixed inset-x-0 bottom-6 z-30 pointer-events-none">
          <div className="max-w-3xl mx-auto px-6 flex justify-end gap-3 pointer-events-auto">
             {currentFolderId === null && (
               <button onClick={() => setIsFolderModalOpen(true)} className="h-12 w-12 rounded-full bg-white text-gray-600 shadow-lg flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"><FolderPlus size={20} /></button>
             )}
             <button onClick={() => handleSaveTask({ title: "" })} className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"><Plus size={28} /></button>
          </div>
      </div>

      {/* Folder Modal */}
      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title="New Folder">
        <form onSubmit={handleCreateFolder} className="flex flex-col gap-4">
          <Input name="name" label="Folder Name" placeholder="e.g. Work" autoFocus required />
          <Button type="submit" className="w-full">Create Folder</Button>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title={`Delete ${deleteConfirm?.type === 'folder' ? 'Folder' : 'Task'}`}>
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
            Are you sure you want to delete <b>{deleteConfirm?.title}</b>?
            {deleteConfirm?.type === 'folder' && <span className="block mt-1 font-bold text-xs">This will delete all {tasks.filter(t => t.folderId === deleteConfirm.id).length} tasks inside!</span>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default TasksApp;