// src/apps/tasks/Tasks.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, X, Star, Clock, CheckSquare, ChevronDown, ChevronRight, Folder, Settings, Move, Home
} from 'lucide-react';

import { Modal, Button, Input, LoadingSpinner } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';

import {
  listenToTaskFolders, listenToTasks, saveTaskFolder, saveTask,
  toggleTaskCompletion, deleteTaskEntity, reorderTasks,
  exportTasks, importTasks
} from './services/tasks';
import WorkspaceSwitcher from '../../components/ui/WorkspaceSwitcher';
import WorkspacePanel from '../../components/ui/WorkspacePanel';
import CollaborateModal from '../../components/ui/CollaborateModal';
import SharedDocsView from '../../components/ui/SharedDocsView';
import useCollaboration from '../../hooks/useCollaboration';

import TaskCard from './components/TaskCard';
import TaskEditor from './components/TaskEditor';

const DEFAULT_TABS = [
  { id: 'starred', name: 'Starred', icon: Star },
  { id: 'reminders', name: 'Reminders', icon: Clock },
  { id: 'inbox', name: 'My Tasks', icon: CheckSquare },
];

const TasksApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [folders, setFolders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Collaboration (all state + effects handled by the hook)
  const collab = useCollaboration(user, cryptoKey, 'tasks');
  const { ctx, activeWorkspace, sharedDocs, privateKey } = collab;

  // --- URL-Driven State ---
  let currentTab = 'inbox';
  if (route.resource === 'folder' && route.resourceId) {
    currentTab = route.resourceId;
  } else if (['starred', 'reminders', 'inbox'].includes(route.resource)) {
    currentTab = route.resource;
  }

  // Modal / Editor State
  const isSettingsOpen = route.query?.modal === 'settings';
  const editTaskId = route.query?.edit;

  const editorTask = useMemo(() => {
    if (!editTaskId) return null;
    return tasks.find(t => t.id === editTaskId) || sharedDocs.find(t => t.id === editTaskId) || null;
  }, [editTaskId, tasks, sharedDocs]);

  const currentBasePath = route.resource === 'folder' ? `#tasks/folder/${currentTab}` : `#tasks/${currentTab}`;

  // Swipe State
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const MIN_SWIPE_DISTANCE = 50;

  // --- Data Listeners ---
  useEffect(() => {
    if (!user || (!cryptoKey && !collab.workspaceKey)) return;
    if (activeWorkspace && !collab.workspaceKey) return;

    const unsubFolders = listenToTaskFolders(user.uid, cryptoKey, setFolders, ctx);
    const unsubTasks = listenToTasks(user.uid, cryptoKey, (data) => {
      setTasks(data);
      setLoading(false);
    }, ctx);
    return () => { unsubFolders(); unsubTasks(); };
  }, [user, cryptoKey, activeWorkspace, collab.workspaceKey, ctx]);

  // --- UI Sync ---
  useEffect(() => {
    const tabElement = document.getElementById(`tab-${currentTab}`);
    if (tabElement) {
      tabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentTab]);

  // --- Derived State ---
  const allTabs = useMemo(() => {
    const systemTabs = DEFAULT_TABS.map(t => ({
      ...t,
      label: t.name,
    }));

    const folderTabs = folders.map(f => ({
      id: f.id,
      label: f.name,
      name: f.name,
      icon: Folder,
      truncate: true,
      onDelete: () => setDeleteConfirm({ type: 'folder', id: f.id, title: f.name }),
    }));

    return [...systemTabs, { type: 'separator' }, ...folderTabs];
  }, [folders]);

  const displayedItems = useMemo(() => {
    let filtered = tasks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q))
      );
    } else {
      switch (currentTab) {
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
    const id = await saveTaskFolder(user.uid, cryptoKey, name, ctx);
    setIsFolderModalOpen(false);
    navigate(`#tasks/folder/${id}`);
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
      const newId = await saveTask(user.uid, cryptoKey, newTask, ctx);
      navigate(`${targetPath}?edit=${newId}`);
    } catch (e) {
      console.error("Failed to create task", e);
    }
  };

  const handleSaveTask = async (taskData) => {
    await saveTask(user.uid, cryptoKey, taskData, ctx);
  };

  const handleCloseEditor = async (finalTaskData) => {
    navigate(currentBasePath);

    if (!finalTaskData || !finalTaskData.id) return;
    const title = finalTaskData.title ? finalTaskData.title.trim() : '';

    if (title === '') {
      try {
        await deleteTaskEntity(user.uid, { type: 'task', id: finalTaskData.id }, tasks, ctx);
      } catch (error) {
        console.error("Cleanup failed", error);
      }
    }
  };

  const handleToggleTask = async (task) => {
    const didRepeat = await toggleTaskCompletion(user.uid, cryptoKey, task, ctx);
    if (didRepeat) alert("Task repeated!");
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteTaskEntity(user.uid, deleteConfirm, tasks, ctx);

    if (deleteConfirm.type === 'folder' && currentTab === deleteConfirm.id) {
      navigate(`#tasks/inbox`);
    }

    setDeleteConfirm(null);
  };

  const handleItemMove = async (targetFolderId) => {
    if (!itemToMove) return;
    await saveTask(user.uid, cryptoKey, { ...itemToMove, folderId: targetFolderId }, ctx);
    setIsMoveModalOpen(false);
    setItemToMove(null);
  };

  const handleReorderTask = async (index, direction) => {
    const list = displayedItems.active;
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= list.length) return;

    await reorderTasks(user.uid, list[index], list[targetIndex], ctx);
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
      // filter out the separator for swipe navigation
      const swipeTabs = allTabs.filter(t => t.type !== 'separator');
      const currentIndex = swipeTabs.findIndex(t => t.id === currentTab);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;

      if (isLeftSwipe && currentIndex < swipeTabs.length - 1) {
        nextIndex = currentIndex + 1;
      } else if (isRightSwipe && currentIndex > 0) {
        nextIndex = currentIndex - 1;
      }

      if (nextIndex !== currentIndex) {
        const nextTab = swipeTabs[nextIndex];
        const isSystem = ['starred', 'reminders', 'inbox'].includes(nextTab.id);
        navigate(isSystem ? `#tasks/${nextTab.id}` : `#tasks/folder/${nextTab.id}`);
      }
    }
  };

  const handleTabSelect = (tabId) => {
    const isSystem = ['starred', 'reminders', 'inbox'].includes(tabId);
    navigate(isSystem ? `#tasks/${tabId}` : `#tasks/folder/${tabId}`);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative">

      {/* EDITOR VIEW */}
      {editTaskId && editorTask ? (
        <TaskEditor
          task={editorTask}
          onSave={handleSaveTask}
          onClose={handleCloseEditor}
          onDelete={(item) => {
            setDeleteConfirm(item);
            navigate(currentBasePath);
          }}
          onMove={(item) => {
            setItemToMove(item);
            setIsMoveModalOpen(true);
          }}
          onCollaborate={!ctx && !editorTask.isSharedDoc ? ((task) => collab.openCollaborateModal(task)) : null}
          cryptoKey={editorTask.isSharedDoc && !activeWorkspace ? editorTask.docKey : (ctx?.key || cryptoKey)}
          readOnly={editorTask.isSharedDoc && editorTask.role === 'viewer'}
          user={user}
        />
      ) : (
        /* LIST VIEW */
        <StandardAppLayout
          headerConfig={{
            onBack: () => currentTab === 'inbox' ? onExit() : navigate('#tasks/inbox'),
            workspaceConfig: {
              switcherProps: collab.switcherProps,
              activeWorkspace: activeWorkspace,
              onSelect: (ws) => {
                collab.switchWorkspace(ws);
                navigate('#tasks/inbox');
              },
              onOpenPanel: () => collab.setIsWorkspacePanelOpen(true),
            },
            search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search tasks...' },
            nav: {
              type: 'tabs',
              activeId: currentTab,
              data: allTabs.filter(t => t.type !== 'separator'),
              onSelect: handleTabSelect,
              extraNode: (
                <>
                  <div className="w-px h-6 bg-blue-400/50 mx-1 flex-shrink-0" />
                  <button onClick={() => setIsFolderModalOpen(true)} className="px-3 py-2.5 text-blue-200 hover:text-white">
                    <Plus size={16} />
                  </button>
                </>
              ),
            },
            customActions: (
              <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
                <Settings size={20} />
              </button>
            ),
          }}
          mainProps={{
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd,
          }}
          fabConfig={{
            onClick: handleCreateNew,
            icon: <Plus size={28} />,
            ariaLabel: "Create Task",
          }}
        >
          {!searchQuery && !activeWorkspace && currentTab === 'inbox' && sharedDocs.length > 0 && (
            <div className="mb-8">
              <SharedDocsView
                sharedDocs={sharedDocs}
                appType="tasks"
                currentUserUid={user.uid}
                onOpenDoc={(doc) => navigate(`${currentBasePath}?edit=${doc.id}`)}
              />
            </div>
          )}

          {!searchQuery && !activeWorkspace && currentTab === 'inbox' && sharedDocs.length > 0 && (displayedItems.active.length > 0 || displayedItems.completed.length > 0) && (
            <div className="flex items-center gap-2 px-1 mb-2">
              <Folder size={14} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Personal Vault
              </span>
            </div>
          )}

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
                totalActiveCount={displayedItems.active.length}
                onToggle={handleToggleTask}
                onOpen={() => navigate(`${currentBasePath}?edit=${task.id}`)}
                setDeleteConfirm={setDeleteConfirm}
                onMove={(item) => { setItemToMove(item); setIsMoveModalOpen(true); }}
                onReorder={handleReorderTask}
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
                      onOpen={() => navigate(`${currentBasePath}?edit=${task.id}`)}
                      setDeleteConfirm={setDeleteConfirm}
                      onMove={(item) => { setItemToMove(item); setIsMoveModalOpen(true); }}
                      isDraggable={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </StandardAppLayout>
      )}

      {/* --- MODALS --- */}
      <Modal isOpen={isFolderModalOpen} onClose={() => setIsFolderModalOpen(false)} title="New Folder">
        <form onSubmit={handleCreateFolder} className="flex flex-col gap-4">
          <Input name="name" label="Folder Name" placeholder="e.g. Work" autoFocus required />
          <Button type="submit" className="w-full">Create Folder</Button>
        </form>
      </Modal>

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

      <Modal isOpen={isMoveModalOpen} onClose={() => { setIsMoveModalOpen(false); setItemToMove(null); }} title="Move to Folder">
        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
          <button onClick={() => handleItemMove(null)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2"><Home size={16} /> Inbox / No Folder</button>
          {folders.filter(f => f.id !== itemToMove?.id).map(f => (
            <button key={f.id} onClick={() => handleItemMove(f.id)} className="p-3 text-left hover:bg-blue-50 rounded-lg text-sm font-medium text-gray-700 border border-transparent hover:border-blue-100 flex items-center gap-2"><Folder size={16} /> {f.name}</button>
          ))}
        </div>
      </Modal>

      {/* Collaboration Modals */}
      {collab.isWorkspacePanelOpen && activeWorkspace && (
        <WorkspacePanel
          {...collab.workspacePanelProps}
          onDelete={async () => {
            await collab.deleteActiveWorkspace();
            navigate('#tasks');
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
          appType="tasks"
          currentUser={user}
          privateKey={privateKey}
          cryptoKey={cryptoKey}
          onClose={() => collab.closeCollaborateModal()}
          onShareCreated={async (newShareId) => {
            if (collab.collaborateModalItem) {
              await saveTask(user.uid, cryptoKey, { ...collab.collaborateModalItem, collabShareId: newShareId }, ctx);
            }
          }}
          onShareDeleted={async () => {
            if (collab.collaborateModalItem) {
              await saveTask(user.uid, cryptoKey, { ...collab.collaborateModalItem, collabShareId: null }, ctx);
            }
          }}
          onPublicLinkCreated={async (id, key) => {
            if (collab.collaborateModalItem) {
              await saveTask(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: id, shareUrlKey: key }, ctx);
            }
          }}
          onPublicLinkRevoked={async () => {
            if (collab.collaborateModalItem) {
              await saveTask(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: null, shareUrlKey: null }, ctx);
            }
          }}
        />
      )}

    </div>
  );
};

export default TasksApp;