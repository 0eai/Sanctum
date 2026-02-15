// src/apps/tasks/components/TaskEditor.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, Star, Trash2, CheckSquare, Square, Clock, RotateCcw, 
  AlertCircle, Plus, X, FileText 
} from 'lucide-react';

const TaskEditor = ({ task, onSave, onClose, onDelete }) => {
  const [data, setData] = useState({ 
    ...task, 
    dueDate: task.dueDate || '',
    deadline: task.deadline || '',
    repeat: task.repeat || 'none',
    subtasks: task.subtasks || [],
    notes: task.notes || ''
  });

  const reminderRef = useRef(null);
  const repeatRef = useRef(null);
  const deadlineRef = useRef(null);
  const notesRef = useRef(null);

  // Auto-resize notes textarea
  useEffect(() => {
    if (notesRef.current) {
        notesRef.current.style.height = "auto";
        notesRef.current.style.height = notesRef.current.scrollHeight + "px";
    }
  }, [data.notes]);

  // Sync state if task prop changes (e.g. from a deep link)
  useEffect(() => {
      setData({ 
        ...task, 
        dueDate: task.dueDate || '',
        deadline: task.deadline || '',
        repeat: task.repeat || 'none',
        subtasks: task.subtasks || [],
        notes: task.notes || ''
      });
  }, [task]);

  const update = (patch) => {
    const newData = { ...data, ...patch };
    setData(newData);
    onSave(newData);
  };

  const handleClick = (ref) => {
    if (ref.current) {
        try {
            if (ref.current.showPicker) {
                ref.current.showPicker(); 
            } else {
                ref.current.focus();
                ref.current.click();
            }
        } catch (e) {
            console.log("Picker error", e);
        }
    }
  };

  const formatChipDate = (isoString, includeTime = true) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    
    const options = { month: 'short', day: 'numeric' };
    if (includeTime && isoString.includes('T')) {
        options.hour = 'numeric';
        options.minute = '2-digit';
    }
    return date.toLocaleString('en-US', options);
  };

  const handleBack = () => {
      onClose(data);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            padding: 0;
            margin: 0;
            cursor: pointer;
            opacity: 0;
        }
      `}</style>

      <div className="max-w-3xl mx-auto w-full h-full flex flex-col bg-white shadow-xl overflow-hidden relative">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-20">
          <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft /></button>
          <div className="flex gap-2">
            <button onClick={() => update({ isPinned: !data.isPinned })} className={`p-2 rounded-full ${data.isPinned ? 'text-yellow-500 bg-yellow-50' : 'text-gray-400 hover:bg-gray-100'}`}>
              <Star size={20} fill={data.isPinned ? "currentColor" : "none"} />
            </button>
            <button onClick={() => onDelete({ type: 'task', id: data.id, title: data.title })} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full">
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 flex flex-col gap-6 min-h-full">
            <div className="flex items-start gap-3">
              <button onClick={() => update({ completed: !data.completed })} className={`mt-1.5 flex-shrink-0 transition-colors ${data.completed ? 'text-green-500' : 'text-gray-300 hover:text-green-500'}`}>
                {data.completed ? <CheckSquare size={28} /> : <Square size={28} />}
              </button>
              <textarea 
                value={data.title}
                onChange={(e) => {
                    update({ title: e.target.value });
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                }}
                placeholder="Task Name"
                rows={1}
                className={`text-3xl font-bold bg-transparent outline-none w-full resize-none overflow-hidden break-words whitespace-pre-wrap ${data.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}
              />
            </div>

            <div className="flex flex-wrap gap-2 items-center text-xs pl-10">
                <div className="relative">
                    <button 
                        onClick={() => handleClick(reminderRef)} 
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium transition-colors ${data.dueDate ? 'bg-blue-50 text-blue-600' : 'text-gray-400 border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4]'}`}
                    >
                        <Clock size={12} />
                        <span>{data.dueDate ? formatChipDate(data.dueDate) : 'Add Reminder'}</span>
                    </button>
                    <input 
                        ref={reminderRef}
                        type="datetime-local" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        value={data.dueDate}
                        onChange={(e) => update({ dueDate: e.target.value, hasTime: true })}
                        onClick={(e) => e.stopPropagation()} 
                    />
                    {data.dueDate && (
                        <button 
                            onClick={(e) => { 
                                e.preventDefault(); e.stopPropagation(); 
                                update({ dueDate: '', repeat: 'none' }); 
                            }} 
                            className="absolute -top-1 -right-1 z-20 bg-white text-red-500 rounded-full shadow-sm border border-gray-100 p-0.5 hover:bg-red-50"
                        >
                            <X size={10} />
                        </button>
                    )}
                </div>

                {data.dueDate && (
                    <div className="relative">
                        <button 
                            onClick={() => handleClick(repeatRef)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium transition-colors ${data.repeat !== 'none' ? 'bg-purple-50 text-purple-600' : 'text-gray-400 border border-dashed border-gray-300 hover:border-purple-400 hover:text-purple-500'}`}
                        >
                            <RotateCcw size={12} />
                            <span className="capitalize">{data.repeat === 'none' ? 'Repeat' : data.repeat}</span>
                        </button>
                        <select 
                            ref={repeatRef}
                            value={data.repeat} 
                            onChange={(e) => update({ repeat: e.target.value })}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 appearance-none"
                            onClick={(e) => e.stopPropagation()} 
                        >
                            <option value="none">No Repeat</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                        </select>
                    </div>
                )}

                <div className="relative">
                    <button 
                        onClick={() => handleClick(deadlineRef)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium transition-colors ${data.deadline ? 'bg-orange-50 text-orange-600' : 'text-gray-400 border border-dashed border-gray-300 hover:border-orange-400 hover:text-orange-500'}`}
                    >
                        <AlertCircle size={12} />
                        <span>{data.deadline ? `Due: ${formatChipDate(data.deadline, false)}` : 'Add Deadline'}</span>
                    </button>
                    <input 
                        ref={deadlineRef}
                        type="date" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        value={data.deadline ? data.deadline.split('T')[0] : ''}
                        onChange={(e) => update({ deadline: e.target.value })}
                        onClick={(e) => e.stopPropagation()} 
                    />
                    {data.deadline && (
                        <button 
                            onClick={(e) => { 
                                e.preventDefault(); e.stopPropagation(); 
                                update({ deadline: '' }); 
                            }} 
                            className="absolute -top-1 -right-1 z-20 bg-white text-red-500 rounded-full shadow-sm border border-gray-100 p-0.5 hover:bg-red-50"
                        >
                            <X size={10} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2 pl-2 md:pl-10">
                {data.subtasks && data.subtasks.map((sub, i) => (
                  <div key={sub.id} className="flex items-start gap-2 group">
                    <button onClick={() => {
                      const newSubs = [...data.subtasks];
                      newSubs[i].completed = !newSubs[i].completed;
                      update({ subtasks: newSubs });
                    }} className={`mt-1 flex-shrink-0 transition-colors ${sub.completed ? 'text-green-500' : 'text-gray-300 hover:text-green-500'}`}>
                      {sub.completed ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                    <textarea 
                      rows={1} 
                      value={sub.title}
                      onChange={(e) => {
                        const newSubs = [...data.subtasks];
                        newSubs[i].title = e.target.value;
                        update({ subtasks: newSubs });
                        e.target.style.height = "auto";
                        e.target.style.height = e.target.scrollHeight + "px";
                      }}
                      className={`flex-1 bg-transparent text-sm outline-none resize-none overflow-hidden break-words whitespace-pre-wrap py-1 ${sub.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}
                    />
                    <button onClick={() => {
                        const newSubs = data.subtasks.filter((_, idx) => idx !== i);
                        update({ subtasks: newSubs });
                    }} className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 flex-shrink-0 p-1">
                      <X size={16} />
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-2 text-gray-400 mt-1">
                  <Plus size={18} className="flex-shrink-0" />
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

            <div className="flex-1 flex flex-col gap-2 pl-2 md:pl-10 mt-4 border-t border-gray-50 pt-4">
                <div className="flex items-center gap-2 text-gray-400 font-bold text-xs uppercase tracking-wider mb-1">
                    <FileText size={14} /> Notes
                </div>
                <textarea 
                    ref={notesRef}
                    value={data.notes}
                    onChange={(e) => update({ notes: e.target.value })}
                    placeholder="Add details..."
                    className="w-full outline-none resize-none text-gray-700 leading-relaxed text-base bg-transparent pb-32 overflow-hidden"
                    style={{ minHeight: '40vh' }}
                />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskEditor;