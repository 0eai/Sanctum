// src/apps/checklist/Checklist.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, Trash2, CheckSquare, Check, X, Plus, AlertCircle,
  Bell, Clock, RotateCcw, Edit2, RefreshCw, Settings, MoveUp, MoveDown
} from 'lucide-react';

import { Modal, Button, Input } from '../../components/ui';
import Fab from '../../components/ui/Fab';
import ImportExportModal from '../../components/ui/ImportExportModal';

import { formatDate } from '../../lib/dateUtils';
import {
  listenToChecklists, listenToItems, createChecklist,
  updateChecklistEntity, addChecklistItem, toggleChecklistItem,
  resetChecklist, deleteChecklistEntity, exportChecklists,
  importChecklists, reorderList, reorderItem
} from '../../services/checklist';

// FIXED: Accept route and navigate from props
const ChecklistApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);

  // Modals & UI State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [editingTarget, setEditingTarget] = useState(null);

  // Input State
  const [newItemText, setNewItemText] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [itemDueDate, setItemDueDate] = useState("");
  const [itemRepeatFreq, setItemRepeatFreq] = useState("none");

  // Controlled Form State
  const [formTitle, setFormTitle] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formRepeat, setFormRepeat] = useState("none");

  // State for loading indicator during import/export
  const [processing, setProcessing] = useState(false);

  // --- URL-Driven State ---
  const isSettingsOpen = route.query?.modal === 'settings';
  const currentBasePath = activeList ? `#checklist/list/${activeList.id}` : `#checklist`;

  // --- Helpers ---
  const formatForInput = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // --- 1. URL Route Sync ---
  useEffect(() => {
    // Legacy Catch: Redirect old deep links to the new RESTful format
    if (route.query?.openId) {
      window.location.replace(
        `${window.location.pathname}${window.location.search}#checklist/list/${route.query.openId}`
      );
      return;
    }

    // Sync active list based on URL
    if (route.resource === 'list' && route.resourceId) {
      const foundList = lists.find(l => l.id === route.resourceId);
      if (foundList) setActiveList(foundList);
    } else {
      setActiveList(null);
    }
  }, [route, lists]);

  // --- 2. Data Listeners ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsubscribe = listenToChecklists(user.uid, cryptoKey, setLists);
    return () => unsubscribe();
  }, [user, cryptoKey]);

  useEffect(() => {
    if (!activeList || !user || !cryptoKey) return;
    const unsubscribe = listenToItems(user.uid, activeList.id, cryptoKey, setItems);
    return () => unsubscribe();
  }, [activeList, user, cryptoKey]);

  // --- 3. Handlers ---
  const handleOpenList = (list) => {
    navigate(`#checklist/list/${list.id}`);
  };

  const handleBack = () => {
    if (activeList) navigate(`#checklist`);
    else onExit();
  };

  const openCreateModal = () => {
    setFormTitle("");
    setFormDueDate("");
    setFormRepeat("none");
    setIsCreateModalOpen(true);
  };

  const openEditModal = (target) => {
    setFormTitle(target.type === 'list' ? target.title : target.text);
    setFormDueDate(formatForInput(target.dueDate));
    setFormRepeat(target.repeat || "none");
    setEditingTarget(target);
  };

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!formTitle) return;

    await createChecklist(user.uid, cryptoKey, {
      title: formTitle,
      dueDate: formDueDate ? new Date(formDueDate).toISOString() : null,
      repeat: formRepeat || 'none'
    });
    setIsCreateModalOpen(false);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingTarget) return;

    const payload = {
      [editingTarget.type === 'list' ? 'title' : 'text']: formTitle,
      dueDate: formDueDate ? new Date(formDueDate).toISOString() : null,
      repeat: formRepeat || 'none'
    };

    const isList = editingTarget.type === 'list';
    await updateChecklistEntity(user.uid, activeList?.id || editingTarget.id, editingTarget.id, cryptoKey, payload, isList);

    if (isList && activeList?.id === editingTarget.id) {
      setActiveList(prev => ({ ...prev, ...payload }));
    }
    setEditingTarget(null);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemText.trim()) return;

    await addChecklistItem(user.uid, activeList.id, cryptoKey, {
      text: newItemText,
      dueDate: itemDueDate ? new Date(itemDueDate).toISOString() : null,
      repeat: itemRepeatFreq || 'none'
    });

    setNewItemText("");
    setItemDueDate("");
    setItemRepeatFreq("none");
    setShowOptions(false);
  };

  const handleToggleItem = async (item) => {
    await toggleChecklistItem(user.uid, activeList.id, item, cryptoKey);
  };

  const handleReorderList = async (e, list, direction) => {
    e.stopPropagation();
    await reorderList(user.uid, list.id, direction, lists);
  };

  const handleReorderItem = async (item, direction) => {
    await reorderItem(user.uid, activeList.id, item.id, direction, items);
  };

  const handleReset = async (list) => {
    if (!window.confirm("Reset this list? This will uncheck all items and move the due date.")) return;
    const nextDate = await resetChecklist(user.uid, list.id, items, list, cryptoKey);
    if (activeList?.id === list.id) {
      setActiveList(prev => ({ ...prev, dueDate: nextDate, completedCount: 0 }));
    }
  };

  const handleProceedDelete = async () => {
    if (!deleteConfirmation) return;
    const { type, data } = deleteConfirmation;

    await deleteChecklistEntity(
      user.uid,
      activeList?.id || data.id,
      type === 'item' ? data.id : null,
      data.isCompleted
    );

    // FIXED: Drop back to root URL if the active list is deleted
    if (type === 'list' && activeList?.id === data.id) {
      navigate(`#checklist`);
      setActiveList(null);
    }

    setDeleteConfirmation(null);
  };

  const toggleAlertOptions = () => {
    if (itemDueDate || itemRepeatFreq !== 'none') {
      setItemDueDate(""); setItemRepeatFreq("none"); setShowOptions(false);
    } else {
      setShowOptions(!showOptions);
    }
  };

  // Import/Export
  const handleExport = async () => {
    setProcessing(true);
    try {
      const data = await exportChecklists(user.uid, cryptoKey);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checklists_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed. Please check console.");
    }
    setProcessing(false);
    navigate(currentBasePath); // Close via URL
  };

  const handleImport = async (file) => {
    if (!file) return;
    setProcessing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const count = await importChecklists(user.uid, cryptoKey, json);
        alert(`Successfully imported ${count} checklists.`);
        navigate(currentBasePath); // Close via URL
      } catch (e) {
        alert("Import failed. Invalid file format.");
      }
      setProcessing(false);
    };
    reader.readAsText(file);
  };

  // --- 4. Render ---
  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-4xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <button onClick={handleBack} className="p-1 hover:bg-white/20 rounded-full transition-colors flex-shrink-0">
              <ChevronLeft />
            </button>
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold truncate">{activeList ? activeList.title : "My Checklists"}</h1>
                {activeList && (
                  <button onClick={() => openEditModal({ type: 'list', ...activeList })} className="opacity-50 hover:opacity-100 hover:text-white transition-opacity"><Edit2 size={14} /></button>
                )}
              </div>
              {activeList?.dueDate && (
                <div className="flex items-center gap-2 text-xs text-blue-100">
                  <span className="flex items-center gap-1"><Clock size={10} /> {formatDate(activeList.dueDate)}</span>
                  {activeList.repeat !== 'none' && <span className="flex items-center gap-1"><RotateCcw size={10} /> {activeList.repeat}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {activeList && activeList.repeat !== 'none' && (
              <button onClick={() => handleReset(activeList)} className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors font-medium"><RefreshCw size={12} /> Reset</button>
            )}
            {!activeList && (
              <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><Settings size={20} /></button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-smooth">
        <div className="max-w-3xl mx-auto p-4">
          {!activeList ? (
            <div className="grid gap-3">
              {lists.map(list => (
                <div key={list.id} onClick={() => handleOpenList(list)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative group active:scale-[0.99] transition-transform cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1 text-gray-300 -ml-1 mr-1">
                      <button onClick={(e) => handleReorderList(e, list, -1)} className="hover:text-blue-500 hover:bg-gray-50 rounded p-0.5"><MoveUp size={14} /></button>
                      <button onClick={(e) => handleReorderList(e, list, 1)} className="hover:text-blue-500 hover:bg-gray-50 rounded p-0.5"><MoveDown size={14} /></button>
                    </div>
                    <div className="flex items-center gap-3 flex-1">
                      <div className="bg-blue-100 p-2.5 rounded-lg text-[#4285f4]"><CheckSquare size={20} /></div>
                      <div>
                        <h3 className="font-bold text-gray-800">{list.title}</h3>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{list.completedCount || 0}/{list.itemCount || 0} done</span>
                          {list.dueDate && <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${new Date(list.dueDate) < new Date() ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}><Clock size={10} /> {formatDate(list.dueDate)}</span>}
                          {list.repeat !== 'none' && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"><RotateCcw size={10} /></span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); openEditModal({ type: 'list', ...list }); }} className="p-2 text-gray-300 hover:text-blue-500 rounded-full hover:bg-gray-50"><Edit2 size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmation({ type: 'list', data: list }); }} className="p-2 text-gray-300 hover:text-red-500 rounded-full hover:bg-gray-50"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
              {lists.length === 0 && <div className="text-center py-10 text-gray-400"><p>No checklists yet.</p><button onClick={openCreateModal} className="text-[#4285f4] font-medium mt-2 hover:underline">Create one</button></div>}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(item => {
                const isOverdue = item.dueDate && new Date(item.dueDate) < new Date() && !item.isCompleted;
                return (
                  <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-start gap-3 group">
                    <div className="flex flex-col gap-0.5 text-gray-300 self-center">
                      <button onClick={() => handleReorderItem(item, -1)} className="hover:text-blue-500 p-0.5"><MoveUp size={12} /></button>
                      <button onClick={() => handleReorderItem(item, 1)} className="hover:text-blue-500 p-0.5"><MoveDown size={12} /></button>
                    </div>
                    <button onClick={() => handleToggleItem(item)} className={`flex-none mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${item.isCompleted ? 'bg-[#4285f4] border-[#4285f4] text-white' : 'border-gray-300 text-transparent'}`}><Check size={14} strokeWidth={3} /></button>
                    <div className="flex-1 min-w-0">
                      <span className={`text-gray-800 break-words ${item.isCompleted ? 'line-through text-gray-400' : ''}`}>{item.text}</span>
                      {(item.dueDate || (item.repeat && item.repeat !== 'none')) && (
                        <div className="flex items-center gap-2 mt-1">
                          {item.dueDate && <div className={`flex items-center gap-1 text-[10px] font-medium w-fit px-1.5 py-0.5 rounded ${isOverdue ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'} ${item.isCompleted ? 'opacity-50 grayscale' : ''}`}><Clock size={10} /> {formatDate(item.dueDate)}</div>}
                          {item.repeat && item.repeat !== 'none' && <span className="text-[10px] text-gray-400 flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded"><RotateCcw size={10} /> {item.repeat}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditModal({ type: 'item', ...item })} className="text-gray-300 hover:text-blue-500 p-2"><Edit2 size={16} /></button>
                      <button onClick={() => setDeleteConfirmation({ type: 'item', data: item })} className="text-gray-300 hover:text-red-500 p-2"><X size={18} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main >

      {!activeList ? (
        <Fab
          onClick={openCreateModal}
          icon={<Plus size={28} />}
          maxWidth="max-w-4xl"
          ariaLabel="Create Checklist"
        />
      ) : (
        <div className="flex-none bg-white border-t border-gray-100 p-4 pb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
          <div className="max-w-3xl mx-auto">
            {showOptions && (
              <div className="mb-3 animate-in slide-in-from-bottom-2 fade-in bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col sm:flex-row gap-2">
                <div className="flex-1 w-full"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Due Date</label><input type="datetime-local" value={itemDueDate} onChange={(e) => setItemDueDate(e.target.value)} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#4285f4]" /></div>
                <div className="flex-1 w-full"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Repeat</label><select value={itemRepeatFreq} onChange={(e) => setItemRepeatFreq(e.target.value)} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#4285f4]"><option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
              </div>
            )}
            <form onSubmit={handleAddItem} className="flex gap-2 items-end">
              <button type="button" onClick={toggleAlertOptions} className={`p-3 rounded-xl transition-colors ${itemDueDate || itemRepeatFreq !== 'none' ? 'bg-blue-50 text-[#4285f4]' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>{itemDueDate || itemRepeatFreq !== 'none' ? <Clock size={20} className="text-[#4285f4]" /> : <Bell size={20} />}</button>
              <input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="Add new item..." className="flex-1 p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4285f4] outline-none shadow-sm bg-gray-50 focus:bg-white transition-colors" />
              <button type="submit" className="bg-[#4285f4] text-white p-3 rounded-xl shadow-sm hover:bg-[#3367d6] active:scale-95 transition-all"><Plus /></button>
            </form>
          </div>
        </div>
      )}

      {/* --- Modals --- */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="New Checklist">
        <form onSubmit={handleCreateList} className="flex flex-col gap-4">
          <Input
            name="title"
            label="List Title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="e.g. Groceries"
            autoFocus
            required
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 mb-1 block">Due Date</label>
              <input
                name="dueDate"
                type="datetime-local"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 mb-1 block">Repeat</label>
              <select
                name="repeat"
                value={formRepeat}
                onChange={(e) => setFormRepeat(e.target.value)}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none"
              >
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
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            autoFocus
            required
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 mb-1 block">Due Date</label>
              <input
                name="dueDate"
                type="datetime-local"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 mb-1 block">Repeat</label>
              <select
                name="repeat"
                value={formRepeat}
                onChange={(e) => setFormRepeat(e.target.value)}
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none"
              >
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

      <ImportExportModal
        isOpen={isSettingsOpen}
        onClose={() => navigate(currentBasePath)}
        onImport={handleImport}
        onExport={handleExport}
        isImporting={processing}
        title="Manage Checklists"
        accept=".json"
        importLabel="Import Data"
        exportLabel="Export Data"
      />

      <Modal isOpen={!!deleteConfirmation} onClose={() => setDeleteConfirmation(null)} title="Confirm Delete">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 bg-red-50 p-3 rounded-lg text-red-700 text-sm"><AlertCircle className="shrink-0 mt-0.5" size={18} /><div><p className="font-semibold">Are you sure?</p><p>{deleteConfirmation?.type === 'list' ? "This will permanently delete the checklist." : "This will delete this item."}</p></div></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteConfirmation(null)}>Cancel</Button><Button variant="danger" onClick={handleProceedDelete}>Delete</Button></div>
        </div>
      </Modal>
    </div >
  );
};

export default ChecklistApp;