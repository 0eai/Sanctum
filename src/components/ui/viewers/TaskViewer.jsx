// src/components/ui/viewers/TaskViewer.jsx
import React from 'react';
import { X, Download, CheckSquare, Calendar, Circle, CheckCircle2, Clock } from 'lucide-react';

const TaskViewer = ({ artifact, onClose, onImport, isMe }) => {
    const data = artifact?.data || {};
    const subtasks = data.subtasks || [];
    const completedSubs = subtasks.filter(s => s.completed).length;

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start gap-3 p-4 border-b border-gray-100 shrink-0">
                    <div className="p-2 rounded-xl bg-green-50 text-green-500 shrink-0">
                        <CheckSquare size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Task</p>
                        <h2 className="text-base font-bold text-gray-900 mt-0.5 break-words">{data.title || 'Untitled Task'}</h2>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${data.completed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {data.completed ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                                {data.completed ? 'Done' : 'In Progress'}
                            </span>
                            {data.dueDate && (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                    <Calendar size={12} /> {new Date(data.dueDate).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {data.notes && (
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{data.notes}</p>
                        </div>
                    )}
                    {subtasks.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                Subtasks ({completedSubs}/{subtasks.length})
                            </p>
                            <div className="space-y-1.5">
                                {subtasks.map((st, i) => (
                                    <div key={i} className="flex items-center gap-2 text-sm">
                                        {st.completed ? (
                                            <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                                        ) : (
                                            <Circle size={16} className="text-gray-300 shrink-0" />
                                        )}
                                        <span className={st.completed ? 'line-through text-gray-400' : 'text-gray-700'}>{st.title || st.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {!data.notes && subtasks.length === 0 && (
                        <p className="text-sm text-gray-400 italic">No additional details</p>
                    )}
                </div>

                {/* Footer */}
                {!isMe && onImport && (
                    <div className="shrink-0 border-t border-gray-100 p-3">
                        <button onClick={() => { onImport(artifact); onClose(); }} className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                            <Download size={14} /> Save to Tasks
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TaskViewer;
