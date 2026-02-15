// src/apps/counter/components/CounterEditor.jsx
import React, { useState } from 'react';
import { 
  ChevronLeft, Check, Calendar, Clock, X, Bell, 
  RotateCcw, Layers, Tag, StickyNote, ChevronDown 
} from 'lucide-react';

const CounterEditor = ({ counter, onSave, onBack }) => {
  // Local state
  const [data, setData] = useState({
    title: '',
    mode: 'date',
    groupBy: 'none',
    useTags: true,
    useNotes: true,
    dueDate: '',
    repeat: 'none',
    ...counter // Merge existing data if editing
  });

  // Helper to update state
  const update = (patch) => setData(prev => ({ ...prev, ...patch }));

  // Handle Save
  const handleSave = () => {
    if (!data.title) return;
    
    const pseudoEvent = {
        preventDefault: () => {},
        target: {
            title: { value: data.title },
            mode: { value: data.mode },
            groupBy: { value: data.groupBy },
            useTags: { checked: data.useTags },
            useNotes: { checked: data.useNotes }
        }
    };
    onSave(pseudoEvent, data.dueDate, data.repeat);
  };

  const formatChipDate = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
        
      {/* CSS Hack for Desktop Date Pickers */}
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; margin: 0; padding: 0; opacity: 0; cursor: pointer;
        }
      `}</style>

      <div className="max-w-3xl mx-auto w-full h-full flex flex-col bg-white shadow-xl overflow-hidden relative">
        
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-20">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
            <ChevronLeft />
          </button>
          <div className="flex gap-2">
             <button 
                onClick={handleSave}
                disabled={!data.title}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${data.title ? 'bg-[#4285f4] text-white shadow-md hover:shadow-lg' : 'bg-gray-100 text-gray-300'}`}
             >
                <Check size={16} /> Save
             </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 flex flex-col gap-8 min-h-full">
            
            {/* 1. Title Input */}
            <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Name</label>
                <input 
                    value={data.title}
                    onChange={(e) => update({ title: e.target.value })}
                    placeholder="e.g. Water Intake"
                    className="text-4xl font-bold text-gray-800 placeholder-gray-300 outline-none bg-transparent w-full"
                    autoFocus
                />
            </div>

            {/* 2. Tracking Mode Cards */}
            <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Tracking Type</label>
                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={() => update({ mode: 'date' })}
                        className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden group ${data.mode === 'date' ? 'border-[#4285f4] bg-blue-50/50 ring-1 ring-[#4285f4]' : 'border-gray-200 hover:border-blue-300 bg-white'}`}
                    >
                        <div className={`mb-3 p-2.5 rounded-xl inline-block ${data.mode === 'date' ? 'bg-[#4285f4] text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600'}`}>
                            <Calendar size={24} />
                        </div>
                        <div className="font-bold text-gray-900 text-lg">Date Point</div>
                        <div className="text-xs text-gray-500 mt-1 leading-relaxed">Log single events happening at a specific time.</div>
                    </button>

                    <button 
                        onClick={() => update({ mode: 'range' })}
                        className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden group ${data.mode === 'range' ? 'border-purple-500 bg-purple-50/50 ring-1 ring-purple-500' : 'border-gray-200 hover:border-purple-300 bg-white'}`}
                    >
                        <div className={`mb-3 p-2.5 rounded-xl inline-block ${data.mode === 'range' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-purple-100 group-hover:text-purple-600'}`}>
                            <Clock size={24} />
                        </div>
                        <div className="font-bold text-gray-900 text-lg">Duration</div>
                        <div className="text-xs text-gray-500 mt-1 leading-relaxed">Track time intervals (start & stop).</div>
                    </button>
                </div>
            </div>

            <div className="h-px bg-gray-100 w-full" />

            {/* 3. Detailed Configuration */}
            <div className="flex flex-col gap-6">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Settings</label>
                
                {/* Group A: Organization */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="relative p-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-gray-100 text-gray-600 rounded-xl"><Layers size={20} /></div>
                            <div>
                                <p className="font-bold text-gray-800 text-sm">History Grouping</p>
                                <p className="text-xs text-gray-500 mt-0.5">Organize entries in the list</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#4285f4] capitalize bg-blue-50 px-3 py-1 rounded-lg">
                                {data.groupBy === 'none' ? 'None' : data.groupBy}
                            </span>
                            <ChevronDown size={16} className="text-gray-400" />
                        </div>
                        <select 
                            value={data.groupBy} 
                            onChange={(e) => update({ groupBy: e.target.value })}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        >
                            <option value="none">No Grouping</option>
                            <option value="date">Group by Date</option>
                            <option value="week">Group by Week</option>
                            <option value="month">Group by Month</option>
                            <option value="year">Group by Year</option>
                        </select>
                    </div>
                </div>

                {/* Group B: Notifications */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
                    
                    {/* Reminder Row */}
                    <div className="relative p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className={`p-2.5 rounded-xl transition-colors ${data.dueDate ? 'bg-blue-100 text-[#4285f4]' : 'bg-gray-100 text-gray-600'}`}>
                                <Bell size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 text-sm">Reminder</p>
                                <p className="text-xs text-gray-500 mt-0.5">Set a due date or next alert</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 z-20">
                            {data.dueDate ? (
                                <div className="flex items-center gap-2 bg-blue-50 text-[#4285f4] pl-3 pr-1 py-1 rounded-lg text-sm font-medium border border-blue-100">
                                    {formatChipDate(data.dueDate)}
                                    <button 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); update({ dueDate: '', repeat: 'none' }); }} 
                                        className="p-1 hover:bg-blue-100 rounded-md transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <span className="text-sm text-gray-400 px-2">None</span>
                            )}
                        </div>
                        {/* Only cover the non-button area or z-index trickery */}
                        <input 
                            type="datetime-local" 
                            value={data.dueDate}
                            onChange={(e) => update({ dueDate: e.target.value })}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                    </div>

                    {/* Repeat Row (Conditional) */}
                    {data.dueDate && (
                        <div className="relative p-4 flex items-center justify-between hover:bg-gray-50 transition-colors animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-purple-100 text-purple-600 rounded-xl"><RotateCcw size={20} /></div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">Repeat</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Reset reminder automatically</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-purple-600 capitalize bg-purple-50 px-3 py-1 rounded-lg border border-purple-100">
                                    {data.repeat}
                                </span>
                                <ChevronDown size={16} className="text-gray-400" />
                            </div>
                            <select 
                                value={data.repeat} 
                                onChange={(e) => update({ repeat: e.target.value })}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            >
                                <option value="none">No Repeat</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* Group C: Features */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
                    
                    {/* Tags Toggle */}
                    <button onClick={() => update({ useTags: !data.useTags })} className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left group">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-gray-100 text-gray-600 rounded-xl group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors"><Tag size={20} /></div>
                            <div>
                                <p className="font-bold text-gray-800 text-sm">Tags</p>
                                <p className="text-xs text-gray-500 mt-0.5">Categorize entries</p>
                            </div>
                        </div>
                        <div className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${data.useTags ? 'bg-[#4285f4]' : 'bg-gray-200'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${data.useTags ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </button>

                    {/* Notes Toggle */}
                    <button onClick={() => update({ useNotes: !data.useNotes })} className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left group">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-gray-100 text-gray-600 rounded-xl group-hover:bg-yellow-50 group-hover:text-yellow-600 transition-colors"><StickyNote size={20} /></div>
                            <div>
                                <p className="font-bold text-gray-800 text-sm">Notes</p>
                                <p className="text-xs text-gray-500 mt-0.5">Add text details to entries</p>
                            </div>
                        </div>
                        <div className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${data.useNotes ? 'bg-[#4285f4]' : 'bg-gray-200'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${data.useNotes ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </button>
                </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CounterEditor;