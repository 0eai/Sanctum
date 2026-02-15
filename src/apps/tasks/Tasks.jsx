// src/apps/tasks/Tasks.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronLeft, Search, Plus, X, Star, Clock, CheckSquare, ChevronDown, ChevronRight, Folder, Settings 
} from 'lucide-react';

import { Modal, Button, Input, LoadingSpinner } from '../../components/ui'; 
import Fab from '../../components/ui/Fab'; 
import ImportExportModal from '../../components/ui/ImportExportModal'; 

import { 
  listenToTaskFolders, listenToTasks, saveTaskFolder, saveTask, 
  toggleTaskCompletion, deleteTaskEntity, reorderTasks,
  exportTasks, importTasks 
} from '../../services/tasks';

import TaskCard from './components/TaskCard';
import TaskEditor from './components/TaskEditor';

const DEFAULT_TABS = [
  { id: 'starred', name: 'Starred', icon: Star },
  { id: 'reminders', name: 'Reminders', icon: Clock },
  { id: 'inbox', name: 'My Tasks', icon: CheckSquare },
];

// FIXED: Added route and navigate props
const TasksApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [folders, setFolders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isCompletedOpen, setIsCompletedOpen] = useState(false); 
  
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); 
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [processing, setProcessing] = useState(false);

  // --- URL-Driven State ---
  // Determine current tab based on the URL path
  let currentTab = 'inbox';
  if (route.resource === 'folder' && route.resourceId) {
      currentTab = route.resourceId;
  } else if (['starred', 'reminders', 'inbox'].includes(route.resource)) {
      currentTab = route.resource;
  }
  
  // Modal / Editor State
  const isSettingsOpen = route.query?.modal === 'settings';
  const editTaskId = route.query?.edit;
  
  // If the URL has ?edit=id, find the task in our loaded data
  const editorTask = useMemo(() => {
      if (!editTaskId) return null;
      return tasks.find(t => t.id === editTaskId) || null;
  }, [editTaskId, tasks]);

  // Helper for generating the current base path
  const currentBasePath = route.resource === 'folder' ? `#tasks/folder/${currentTab}` : `#tasks/${currentTab}`;

  // Swipe State
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const MIN_SWIPE_DISTANCE = 50;

  // --- Listeners ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsubFolders = listenToTaskFolders(user.uid, cryptoKey, setFolders);
    const unsubTasks = listenToTasks(user.uid, cryptoKey, (data) => {
        setTasks(data);
        setLoading(false);
    });
    return () => { unsubFolders(); unsubTasks(); };
  }, [user, cryptoKey]);

  // --- UI Sync ---
  // Scroll tab bar automatically
  useEffect(() => {
    const tabElement = document.getElementById(`tab-${currentTab}`);
    if (tabElement) {
        tabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentTab]);

  // --- Derived State ---
  const allTabs = useMemo(() => {
      return [...DEFAULT_TABS, ...folders];
  }, [folders]);

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
          filtered = tasks.filter(t => t.dueDate || t.deadline)
            .sort((a, b) => new Date(a.dueDate || a.deadline) - new Date(b.dueDate || b.deadline)); 
          break;
        case 'inbox': 
          filtered = tasks.filter(t => !t.folderId); 
          break;
        default: 
          filtered = tasks.filter(t => t.folderId === currentTab); 
          break;
      }
    }
    
    const active = filtered.filter(t => !t.completed);
    const completed = filtered.filter(t => t.completed);

    if (currentTab !== 'starred' && currentTab !== 'reminders') {
        active.sort((a, b) => (b.isPinned === a.isPinned ? 0 : b.isPinned ? 1 : -1));
    }

    return { active, completed };
  }, [tasks, currentTab, searchQuery, folders]);

  // --- Handlers ---

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    const id = await saveTaskFolder(user.uid, cryptoKey, name);
    setIsFolderModalOpen(false);
    navigate(`#tasks/folder/${id}`); // FIXED: Push to new folder
  };

  const handleCreateNew = async () => {
      const isSystemTab = ['starred', 'reminders', 'inbox'].includes(currentTab);
      const targetFolderId = isSystemTab ? null : currentTab;
      
      const targetTab = isSystemTab ? 'inbox' : currentTab;
      const targetPath = targetFolderId ? `#tasks/folder/${targetTab}` : `#tasks/${targetTab}`;

      const newTask = {
          title: '',
          folderId: targetFolderId,
          completed: false,
          isPinned: false,
          createdAt: new Date().toISOString()
      };

      try {
          // Immediately save the ghost task and push its ID to the URL so the editor opens
          const newId = await saveTask(user.uid, cryptoKey, newTask);
          navigate(`${targetPath}?edit=${newId}`);
      } catch (e) {
          console.error("Failed to create task", e);
      }
  };

  const handleSaveTask = async (taskData) => {
    await saveTask(user.uid, cryptoKey, taskData);
  };

  const handleCloseEditor = async (finalTaskData) => {
      // Close the editor by stripping the query parameter
      navigate(currentBasePath);

      if (!finalTaskData || !finalTaskData.id) return;
      const title = finalTaskData.title ? finalTaskData.title.trim() : '';
      
      if (title === '') {
          try {
              await deleteTaskEntity(user.uid, { type: 'task', id: finalTaskData.id }, tasks);
          } catch (error) {
              console.error("Cleanup failed", error);
          }
      }
  };

  const handleToggleTask = async (task) => {
    const didRepeat = await toggleTaskCompletion(user.uid, cryptoKey, task);
    if (didRepeat) alert("Task repeated!");
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteTaskEntity(user.uid, deleteConfirm, tasks);
    
    // If we just deleted the folder we are currently viewing, go to Inbox
    if (deleteConfirm.type === 'folder' && currentTab === deleteConfirm.id) {
        navigate(`#tasks/inbox`);
    }
    
    setDeleteConfirm(null);
  };

  // --- Import / Export Handlers ---
  const handleExport = async () => {
    setProcessing(true);
    try {
      const data = await exportTasks(user.uid, cryptoKey);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasks_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed.");
    }
    setProcessing(false);
    navigate(currentBasePath);
  };

  const handleImport = async (file) => {
    if (!file) return;
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const count = await importTasks(user.uid, cryptoKey, json);
        alert(`Successfully imported ${count} tasks.`);
        navigate(currentBasePath);
      } catch (e) {
        alert("Import failed. Invalid file format.");
      }
      setProcessing(false);
    };
    reader.readAsText(file);
  };

  const onDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = async (e, dropIndex) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;
    
    const list = displayedItems.active;
    await reorderTasks(user.uid, list[draggedItemIndex], list[dropIndex]);
    setDraggedItemIndex(null);
  };

  // --- Swipe Logic ---
  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > MIN_SWIPE_DISTANCE;
    const isRightSwipe = distance < -MIN_SWIPE_DISTANCE;

    if (isLeftSwipe || isRightSwipe) {
        const currentIndex = allTabs.findIndex(t => t.id === currentTab);
        if (currentIndex === -1) return; 

        let nextIndex = currentIndex;

        if (isLeftSwipe && currentIndex < allTabs.length - 1) {
            nextIndex = currentIndex + 1;
        } else if (isRightSwipe && currentIndex > 0) {
            nextIndex = currentIndex - 1;
        }

        if (nextIndex !== currentIndex) {
            const nextTab = allTabs[nextIndex];
            const isSystem = ['starred', 'reminders', 'inbox'].includes(nextTab.id);
            navigate(isSystem ? `#tasks/${nextTab.id}` : `#tasks/folder/${nextTab.id}`);
        }
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
      
      {/* EDITOR VIEW */}
      {/* FIXED: We only render the editor if we successfully found the task AND the URL has ?edit= */}
      {editTaskId && editorTask ? (
        <TaskEditor 
          task={editorTask} 
          onSave={handleSaveTask} 
          onClose={handleCloseEditor}
          onDelete={(item) => { 
              setDeleteConfirm(item); 
              navigate(currentBasePath); // Close editor immediately on delete request
          }} 
        />
      ) : (
        /* LIST VIEW */
        <>
          <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
            <div className="max-w-4xl mx-auto px-4 pt-4 pb-0 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* FIXED: Back button logic */}
                  <button onClick={() => currentTab === 'inbox' ? onExit() : navigate('#tasks/inbox')} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
                  <h1 className="text-xl font-bold flex items-center gap-2">Tasks</h1>
                </div>
                {/* FIXED: Push ?modal=settings to URL */}
                <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
                    <Settings size={20} />
                </button>
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
                <input 
                  type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." 
                  className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm" 
                />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
              </div>

              {/* TAB BAR */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0 mt-1">
                {DEFAULT_TABS.map(tab => (
                  <button 
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    onClick={() => navigate(`#tasks/${tab.id}`)} // FIXED: Drive by URL
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap ${currentTab === tab.id ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
                  >
                    <tab.icon size={14} fill={tab.id === 'starred' && currentTab === 'starred' ? "currentColor" : "none"} /> {tab.name}
                  </button>
                ))}
                <div className="w-px h-6 bg-blue-400/50 mx-1 flex-shrink-0" />
                {folders.map(folder => (
                    <button
                        key={folder.id}
                        id={`tab-${folder.id}`}
                        onClick={() => navigate(`#tasks/folder/${folder.id}`)} // FIXED: Drive by URL
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

          <main 
            className="flex-1 overflow-y-auto scroll-smooth p-4"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="max-w-3xl mx-auto pb-32 space-y-4">
              
              {loading && <div className="flex justify-center py-10"><LoadingSpinner /></div>}

              {!loading && displayedItems.active.length === 0 && displayedItems.completed.length === 0 && (
                 <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
                   <div className="bg-white p-4 rounded-full shadow-sm"><CheckSquare size={32} className="opacity-50" /></div>
                   <p>No tasks.</p>
                 </div>
              )}

              {/* ACTIVE TASKS */}
              <div className="flex flex-col gap-2">
                {displayedItems.active.map((task, index) => (
                  <TaskCard 
                    key={task.id} task={task} index={index} 
                    onToggle={handleToggleTask}
                    onOpen={() => navigate(`${currentBasePath}?edit=${task.id}`)} // FIXED: Push edit to URL
                    setDeleteConfirm={setDeleteConfirm}
                    onDragStart={onDragStart} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
                    isDraggable={true} 
                  />
                ))}
              </div>

              {/* COMPLETED SECTION */}
              {displayedItems.completed.length > 0 && (
                <div className="mt-6">
                    <button onClick={() => setIsCompletedOpen(!isCompletedOpen)} className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-wider mb-3 select-none">
                        {isCompletedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Completed ({displayedItems.completed.length})
                    </button>
                    
                    {isCompletedOpen && (
                        <div className="flex flex-col gap-2 opacity-70">
                            {displayedItems.completed.map((task) => (
                                <TaskCard 
                                    key={task.id} task={task} 
                                    onToggle={handleToggleTask}
                                    onOpen={() => navigate(`${currentBasePath}?edit=${task.id}`)} // FIXED: Push edit to URL
                                    setDeleteConfirm={setDeleteConfirm}
                                    isDraggable={false} 
                                />
                            ))}
                        </div>
                    )}
                </div>
              )}
            </div>
          </main>

          {/* REUSABLE FAB COMPONENT */}
          <Fab 
            onClick={handleCreateNew} 
            icon={<Plus size={28} />}
            maxWidth="max-w-4xl" // Align with header
            ariaLabel="Create Task"
          />
        </>
      )}

      {/* --- MODALS --- */}
      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title="New Folder">
        <form onSubmit={handleCreateFolder} className="flex flex-col gap-4">
          <Input name="name" label="Folder Name" placeholder="e.g. Work" autoFocus required />
          <Button type="submit" className="w-full">Create Folder</Button>
        </form>
      </Modal>

      <ImportExportModal 
        isOpen={isSettingsOpen}
        onClose={() => navigate(currentBasePath)}
        onImport={handleImport}
        onExport={handleExport}
        isImporting={processing}
        title="Manage Tasks"
        accept=".json"
        importLabel="Import Data"
        exportLabel="Export Data"
      />

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title={`Delete ${deleteConfirm?.type === 'folder' ? 'Folder' : 'Task'}`} zIndex={100}>
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