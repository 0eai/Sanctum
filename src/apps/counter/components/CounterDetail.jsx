// src/apps/counter/components/CounterDetail.jsx
import React, { useMemo } from 'react';
import { Clock, RotateCcw, Play, Square, MapPin, StickyNote, Tag, Pencil, X } from 'lucide-react';
import { Button } from '../../../components/ui';
import { formatDate, formatTime, formatDuration } from '../../../lib/dateUtils';
import StatsView from './StatsView';

const CounterDetail = ({ 
  counter, 
  entries, 
  activeTab, 
  user, 
  cryptoKey, 
  onStartTimer, 
  onStopTimer, 
  onEditEntry, 
  onDeleteEntry,
  onViewEntry
}) => {
  
  // Derived State: Active Running Timer
  const activeEntry = useMemo(() => 
    entries.find(e => !e.endTimestamp && counter?.mode === 'range'), 
  [entries, counter]);

  // Derived State: Grouped History
  const historyGroups = useMemo(() => {
    if (!counter || !entries.length) return [];
    const groupBy = counter.groupBy || 'none';
    
    if (groupBy === 'none') return [{ title: 'All History', entries }];

    const groups = [];
    entries.forEach(entry => {
      if (!entry.timestamp) return;
      let key = '';
      const date = entry.timestamp;
      
      if (groupBy === 'date') key = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      else if (groupBy === 'week') {
         const d = new Date(date);
         const day = d.getDay(); 
         const startOfWeek = new Date(d);
         startOfWeek.setDate(d.getDate() - day);
         key = `Week of ${startOfWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      } else if (groupBy === 'month') key = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      else if (groupBy === 'year') key = date.getFullYear().toString();

      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.title === key) {
          lastGroup.entries.push(entry);
      } else {
          groups.push({ title: key, entries: [entry] });
      }
    });
    return groups;
  }, [entries, counter]);

  return (
    <div className="space-y-4">
      
      {/* Meta Info Bar */}
      {(counter.dueDate || (counter.repeat && counter.repeat !== 'none')) && (
          <div className="flex gap-2 mb-2">
            {counter.dueDate && (
                <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-lg text-gray-500 flex items-center gap-1">
                    <Clock size={12} /> {formatDate(counter.dueDate)}
                </span>
            )}
            {counter.repeat && counter.repeat !== 'none' && (
                <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-lg text-gray-500 flex items-center gap-1">
                    <RotateCcw size={12} /> {counter.repeat}
                </span>
            )}
         </div>
      )}

      {/* Timer Controls */}
      {counter.mode === 'range' && !activeEntry && activeTab === 'history' && (
        <Button onClick={() => onStartTimer(user.uid, counter.id)} variant="success" className="w-full py-4 text-lg shadow-lg mb-2">
            <Play size={24} fill="currentColor" /> Start Timer
        </Button>
      )}

      {activeEntry && (
        <div className="bg-green-50 border border-green-200 p-4 rounded-xl flex items-center justify-between shadow-sm animate-pulse mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-full text-green-600"><Clock size={20} /></div>
            <div><p className="text-green-800 font-bold text-lg">Active Session</p><p className="text-green-600 text-sm">Started {formatTime(activeEntry.timestamp)}</p></div>
          </div>
          <Button onClick={() => onStopTimer(user.uid, counter.id, activeEntry.id, counter, cryptoKey)} className="bg-red-500 hover:bg-red-600 text-white border-0">
            <Square size={18} fill="currentColor" /> Stop
          </Button>
        </div>
      )}

      {/* Content */}
      {activeTab === 'stats' ? (
        <StatsView entries={entries} mode={counter.mode} />
      ) : (
        <div className="space-y-6">
            {historyGroups.map((group, groupIndex) => (
                <div key={groupIndex} className="space-y-2">
                    {counter.groupBy !== 'none' && (
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-2 sticky top-0 bg-gray-50 py-1 z-10 backdrop-blur-sm">
                            {group.title}
                        </h3>
                    )}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {group.entries.map((entry, index) => (
                            <div 
                                key={entry.id} 
                                className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${index !== group.entries.length - 1 ? 'border-b border-gray-100' : ''}`} 
                                onClick={() => onViewEntry(entry)}
                            >
                                <div className="flex flex-col">
                                    <span className="font-semibold text-gray-800 text-lg">{formatDate(entry.timestamp)}</span>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                            <span>{formatTime(entry.timestamp)}</span>
                                            {counter.mode === 'range' && (
                                                <>
                                                    <span className="text-gray-300">•</span>
                                                    {entry.endTimestamp ? (
                                                        <>
                                                            <span>{formatTime(entry.endTimestamp)}</span>
                                                            <span className="text-[#4285f4] font-medium bg-blue-50 px-1.5 rounded ml-1 text-xs">
                                                                {formatDuration(entry.endTimestamp - entry.timestamp)}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="text-green-600 font-bold text-xs bg-green-100 px-2 py-0.5 rounded-full animate-pulse">Running</span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2 items-center">
                                            {entry.location && <div className="flex items-center gap-1.5 text-xs text-gray-400"><MapPin size={12} /><span className="truncate max-w-[150px]">{entry.location.address}</span></div>}
                                            {entry.note && <div className="group relative"><StickyNote size={12} className="text-yellow-500" /></div>}
                                            {entry.tags && entry.tags.map((tag, tIdx) => <span key={tIdx} className="text-[9px] bg-blue-50 text-[#4285f4] px-1.5 py-0.5 rounded-full font-medium">#{tag}</span>)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); onEditEntry(entry); }} className="p-2 text-gray-400 hover:text-[#4285f4] transition-colors"><Pencil size={18} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); onDeleteEntry(entry.id); }} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={18} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default CounterDetail;