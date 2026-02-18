// src/apps/counter/components/CounterList.jsx
import React from 'react';
import { Calendar, Clock, RotateCcw, MoveUp, MoveDown } from 'lucide-react';
import { Button } from '../../../components/ui';
import { formatDate } from '../../../lib/dateUtils';

const CounterList = ({ counters, onOpen, onCreate, loading, onReorder }) => {
    if (counters.length === 0 && !loading) {
        return (
            <div className="text-center py-20 text-gray-400">
                <p className="mb-4">No counters yet</p>
                <Button onClick={onCreate}>Create your first</Button>
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            {counters.map(counter => (
                <div
                    key={counter.id}
                    onClick={() => onOpen(counter)}
                    className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between active:scale-[0.99] transition-transform cursor-pointer relative"
                >
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-1 text-gray-300 -ml-2">
                            <button onClick={(e) => { e.stopPropagation(); onReorder(counter.id, -1); }} className="hover:text-blue-500 hover:bg-gray-50 rounded p-0.5"><MoveUp size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); onReorder(counter.id, 1); }} className="hover:text-blue-500 hover:bg-gray-50 rounded p-0.5"><MoveDown size={14} /></button>
                        </div>
                        <div className={`p-3 rounded-xl ${counter.mode === 'range' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-[#4285f4]'}`}>
                            {counter.mode === 'range' ? <Clock size={20} /> : <Calendar size={20} />}
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">{counter.title}</h3>
                            <div className="flex gap-2 mt-1">
                                {counter.dueDate && (
                                    <span className="text-[10px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                                        <Clock size={10} /> {formatDate(counter.dueDate)}
                                    </span>
                                )}
                                {counter.repeat && counter.repeat !== 'none' && (
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                                        <RotateCcw size={10} />
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <span className="text-2xl font-bold text-gray-800">{counter.count || 0}</span>
                </div>
            ))}
        </div>
    );
};

export default CounterList;