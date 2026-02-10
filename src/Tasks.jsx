import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { 
  ChevronLeft, Plus, Search, Folder, CheckSquare, Square, X, 
  Star, Calendar, GripVertical, Trash2, Home, ChevronRight,
  Clock, FileText, FolderPlus, Edit2, RotateCcw, AlertCircle
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input, LoadingSpinner } from './components'; 
import { encryptData, decryptData } from './crypto';

// --- Helper: Date Calculation for Repeat ---
const getNextDate = (currentDateStr, frequency) => {
  if (!currentDateStr) return "";
  const date = new Date(currentDateStr);
  
  switch(frequency) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
    default: return currentDateStr;
  }
  return date.toISOString().slice(0, 16); // Keep simplistic ISO format
};

// --- SUB-COMPONENTS ---

const TaskCard = ({ task, index, onToggle, setEditorTask, setDeleteConfirm, onDragStart, onDragOver, onDrop }) => (
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
      onClick={(e) => { e.stopPropagation(); onToggle(task); }}
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
        {task.repeat && task.repeat !== 'none' && <RotateCcw size={10} className="text-blue-400" />}
      </div>
      
      <div className="flex flex-wrap gap-2 mt-1.5">
        {/* Reminder Date */}
        {task.dueDate && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${new Date(task.dueDate) < new Date() && !task.completed ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
            <Clock size={10} /> 
            {new Date(task.dueDate).toLocaleDateString()} 
            {task.hasTime && ` ${new Date(task.dueDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
          </span>
        )}
        {/* Deadline */}
        {task.deadline && (
           <span className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded flex items-center gap-1">
             <AlertCircle size={10} /> {new Date(task.deadline).toLocaleDateString()}
           </span>
        )}
        {task.subtasks && task.subtasks.length > 0 && (
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

const TaskEditor = ({ task, onSave, onClose, onDelete }) => {
  const [data, setData] = useState({ 
    ...task, 
    // Splits ISO string into date and time for inputs
    datePart: task.dueDate ? task.dueDate.split('T')[0] : '',
    timePart: task.dueDate && task.hasTime ? task.dueDate.split('T')[1]?.slice(0,5) : '',
    deadlinePart: task.deadline ? task.deadline.split('T')[0] : ''
  });

  // Consolidated update helper
  const update = (patch) => {
    const newData = { ...data, ...patch };
    
    // Reconstruct dueDate from parts
    let combinedDate = "";
    if (newData.datePart) {
      combinedDate = newData.datePart;
      if (newData.hasTime && newData.timePart) {
        combinedDate += `T${newData.timePart}`;
      } else {
        combinedDate += `T00:00`; // Default time for date objects
      }
    }

    // Reconstruct deadline
    let combinedDeadline = newData.deadlinePart ? `${newData.deadlinePart}T23:59` : "";

    // Update Local State & Save
    const finalData = { ...newData, dueDate: combinedDate, deadline: combinedDeadline };
    setData(finalData);
    onSave(finalData);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto w-full h-full flex flex-col bg-white shadow-xl md:my-6 md:rounded-2xl md:h-[calc(100vh-3rem)] overflow-hidden">
        
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft /></button>
          <div className="flex gap-2">
            <button onClick={() => update({ isPinned: !data.isPinned })} className={`p-2 rounded-full ${data.isPinned ? 'text-yellow-500 bg-yellow-50' : 'text-gray-400 hover:bg-gray-100'}`}>
              <Star size={20} fill={data.isPinned ? "currentColor" : "none"} />
            </button>
            <button onClick={() => onDelete({ type: 'task', id: data.id, title: data.title })} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full">
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          
          {/* Title - Smaller Font */}
          <div className="flex items-start gap-3">
            <button onClick={() => update({ completed: !data.completed })} className={`mt-1 ${data.completed ? 'text-green-500' : 'text-gray-300'}`}>
              {data.completed ? <CheckSquare size={24} /> : <Square size={24} />}
            </button>
            <input 
              value={data.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Task Name"
              className={`text-lg font-bold bg-transparent outline-none w-full ${data.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}
            />
          </div>

          <div className="flex flex-col gap-4 pl-9">
            
            {/* 1. Reminder Date & Time */}
            <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <Clock size={12} /> Reminder
                </label>
                <div className="flex gap-2 items-center">
                    <input 
                        type="date" 
                        value={data.datePart}
                        onChange={(e) => update({ datePart: e.target.value })}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 outline-none focus:border-blue-500"
                    />
                    {data.datePart && (
                        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={data.hasTime} 
                                onChange={(e) => update({ hasTime: e.target.checked })}
                                className="rounded text-blue-500 focus:ring-0"
                            />
                            Add Time
                        </label>
                    )}
                    {data.hasTime && data.datePart && (
                        <input 
                            type="time" 
                            value={data.timePart}
                            onChange={(e) => update({ timePart: e.target.value })}
                            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 outline-none focus:border-blue-500"
                        />
                    )}
                </div>
            </div>

            {/* 2. Repeat & Deadline Row */}
            <div className="flex gap-4">
                {/* Repeat */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <RotateCcw size={12} /> Repeat
                    </label>
                    <select 
                        value={data.repeat || 'none'}
                        onChange={(e) => update({ repeat: e.target.value })}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 outline-none focus:border-blue-500"
                    >
                        <option value="none">No Repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                </div>

                {/* Deadline */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <AlertCircle size={12} /> Deadline
                    </label>
                    <input 
                        type="date" 
                        value={data.deadlinePart}
                        onChange={(e) => update({ deadlinePart: e.target.value })}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 outline-none focus:border-blue-500"
                    />
                </div>
            </div>

          </div>

          {/* Subtasks */}
          <div className="space-y-3 mt-2 border-t border-gray-50 pt-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <CheckSquare size={12} /> Subtasks
            </h3>
            
            {data.subtasks && data.subtasks.map((sub, i) => (
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
                    update({ subtasks: [...(data.subtasks || []), newSub] });
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
              className="w-full h-full min-h-[100px] bg-gray-50 border-none rounded-xl p-4 text-sm text-gray-700 outline-none resize-none"
            />
          </div>

        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

const TasksApp = ({ user, cryptoKey, onExit }) => {
  const [folders, setFolders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Tabs: 'starred', 'reminders', 'inbox', or a folder ID
  const [currentTab, setCurrentTab] = useState('starred'); 
  const [searchQuery, setSearchQuery] = useState("");
  
  const [editorTask, setEditorTask] = useState(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); 
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);

  // --- Fetching ---
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

  // --- Logic ---
  
  const displayedItems = useMemo(() => {
    let filtered = tasks;

    if (searchQuery.trim()) {
      filtered = tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
    } else {
      switch(currentTab) {
        case 'starred':
          filtered = tasks.filter(t => t.isPinned);
          break;
        case 'reminders':
          // Show tasks with dueDate OR deadline
          filtered = tasks.filter(t => t.dueDate || t.deadline);
          // Sort by nearest date
          filtered.sort((a, b) => new Date(a.dueDate || a.deadline) - new Date(b.dueDate || b.deadline));
          break;
        case 'inbox':
          // My Tasks shows everything NOT in a specific folder (Inbox)
          filtered = tasks.filter(t => !t.folderId);
          break;
        default:
          // Specific Folder
          filtered = tasks.filter(t => t.folderId === currentTab);
          break;
      }
    }
    
    // Sort: Pinned first (unless we are in Starred tab, where everything is pinned), then Order
    if (currentTab !== 'starred' && currentTab !== 'reminders') {
        filtered.sort((a, b) => (b.isPinned === a.isPinned ? 0 : b.isPinned ? 1 : -1));
    }

    return filtered;
  }, [tasks, currentTab, searchQuery]);

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    const encrypted = await encryptData({ name }, cryptoKey);
    const ref = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'task_folders'), {
      ...encrypted, createdAt: serverTimestamp()
    });
    setIsFolderModalOpen(false);
    setCurrentTab(ref.id); // Switch to new folder
  };

  const handleSaveTask = async (taskData) => {
    try {
      const order = taskData.order || Date.now();
      // Determine folder ID based on current view
      let folderId = taskData.folderId;
      if (!taskData.id) {
          // New task: Assign to current folder if we are inside one, otherwise null (My Tasks)
          folderId = (['starred', 'reminders', 'inbox'].includes(currentTab)) ? null : currentTab;
      }

      const payload = {
        title: taskData.title || "Untitled Task",
        folderId: folderId,
        completed: taskData.completed || false,
        isPinned: taskData.isPinned || false,
        dueDate: taskData.dueDate || "",
        hasTime: taskData.hasTime || false, // New Field
        repeat: taskData.repeat || "none", // New Field
        deadline: taskData.deadline || "", // New Field
        notes: taskData.notes || "",
        subtasks: taskData.subtasks || []
      };

      const encrypted = await encryptData(payload, cryptoKey);
      
      if (taskData.id) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskData.id), { ...encrypted });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), {
          ...encrypted, order, createdAt: serverTimestamp()
        });
      }
    } catch (e) { console.error("Save failed", e); }
  };

  const handleToggleTask = async (task) => {
    // REPEAT LOGIC
    if (!task.completed && task.repeat && task.repeat !== 'none') {
        // Task is being completed, and it has a repeat schedule
        const nextDate = getNextDate(task.dueDate, task.repeat);
        
        const encrypted = await encryptData({ 
            ...task, 
            completed: false, // Keep it uncompleted
            dueDate: nextDate // Move date forward
        }, cryptoKey);
        
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), { ...encrypted });
        alert(`Task repeated! Moved to ${new Date(nextDate).toLocaleDateString()}`);
    } else {
        // Standard toggle
        const encrypted = await encryptData({ ...task, completed: !task.completed }, cryptoKey);
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), { ...encrypted });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'folder') {
      const batch = writeBatch(db);
      const folderTasks = tasks.filter(t => t.folderId === deleteConfirm.id);
      folderTasks.forEach(t => batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', t.id)));
      batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'task_folders', deleteConfirm.id));
      await batch.commit();
      if (currentTab === deleteConfirm.id) setCurrentTab('inbox');
    } else {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', deleteConfirm.id));
    }
    setDeleteConfirm(null);
    if (editorTask?.id === deleteConfirm.id) setEditorTask(null);
  };

  const onDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = async (e, dropIndex) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;
    
    const list = displayedItems;
    const dragged = list[draggedItemIndex];
    const target = list[dropIndex];

    const batch = writeBatch(db);
    batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', dragged.id), { order: target.order });
    batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', target.id), { order: dragged.order });
    
    await batch.commit();
    setDraggedItemIndex(null);
  };

  if (editorTask) {
    return (
      <TaskEditor 
        task={editorTask} 
        onSave={handleSaveTask} 
        onClose={() => setEditorTask(null)}
        onDelete={setDeleteConfirm} 
      />
    );
  }

  // --- Render Tabs ---
  const defaultTabs = [
    { id: 'starred', name: 'Starred', icon: Star },
    { id: 'reminders', name: 'Reminders', icon: Clock },
    { id: 'inbox', name: 'My Tasks', icon: CheckSquare },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-0 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <ChevronLeft />
              </button>
              <h1 className="text-xl font-bold flex items-center gap-2">Tasks</h1>
            </div>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              placeholder="Search..." 
              className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm" 
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
          </div>

          {/* TAB BAR */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0 mt-1">
            {defaultTabs.map(tab => (
               <button 
                 key={tab.id}
                 onClick={() => setCurrentTab(tab.id)}
                 className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap ${currentTab === tab.id ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
               >
                 <tab.icon size={14} fill={tab.id === 'starred' && currentTab === 'starred' ? "currentColor" : "none"} /> {tab.name}
               </button>
            ))}
            <div className="w-px h-6 bg-blue-400/50 mx-1 flex-shrink-0" />
            {folders.map(folder => (
                <button
                    key={folder.id}
                    onClick={() => setCurrentTab(folder.id)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap group ${currentTab === folder.id ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
                >
                    <Folder size={14} fill={currentTab === folder.id ? "currentColor" : "none"} /> 
                    <span className="max-w-[100px] truncate">{folder.name}</span>
                    {currentTab === folder.id && (
                        <span onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'folder', id: folder.id, title: folder.name }); }} className="opacity-50 hover:opacity-100 hover:text-red-500"><X size={12} /></span>
                    )}
                </button>
            ))}
            <button onClick={() => setIsFolderModalOpen(true)} className="px-3 py-2.5 text-blue-200 hover:text-white"><Plus size={16} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-3xl mx-auto pb-32 space-y-2">
          
          {loading && <div className="flex justify-center py-10"><LoadingSpinner /></div>}

          {!loading && displayedItems.length === 0 && (
             <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
               <div className="bg-white p-4 rounded-full shadow-sm"><CheckSquare size={32} className="opacity-50" /></div>
               <p>No tasks.</p>
             </div>
          )}

          {displayedItems.map((task, index) => (
            <TaskCard 
              key={task.id} 
              task={task} 
              index={index} 
              onToggle={handleToggleTask}
              setEditorTask={setEditorTask}
              setDeleteConfirm={setDeleteConfirm}
              onDragStart={onDragStart}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            />
          ))}

        </div>
      </main>

      {/* FAB - Only New Task (Folder is in Tab bar) */}
      <div className="fixed inset-x-0 bottom-6 z-30 pointer-events-none">
          <div className="max-w-3xl mx-auto px-6 flex justify-end gap-3 pointer-events-auto">
             <button onClick={() => handleSaveTask({ title: "" })} className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"><Plus size={28} /></button>
          </div>
      </div>

      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title="New Folder">
        <form onSubmit={handleCreateFolder} className="flex flex-col gap-4">
          <Input name="name" label="Folder Name" placeholder="e.g. Work" autoFocus required />
          <Button type="submit" className="w-full">Create Folder</Button>
        </form>
      </Modal>

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