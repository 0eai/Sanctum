// src/components/ui/viewers/ChecklistViewer.jsx
import React from 'react';
import { X, Download, ClipboardList, Calendar, Circle, CheckCircle2 } from 'lucide-react';

const ChecklistViewer = ({ artifact, onClose, onImport, isMe }) => {
    const data = artifact?.data || {};
    const items = data.items || [];
    const total = items.length || data.itemCount || 0;
    const done = items.length > 0 ? items.filter(i => i.isCompleted).length : (data.completedCount || 0);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start gap-3 p-4 border-b border-gray-100 shrink-0">
                    <div className="p-2 rounded-xl bg-teal-50 text-teal-500 shrink-0">
                        <ClipboardList size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Checklist</p>
                        <h2 className="text-base font-bold text-gray-900 mt-0.5 break-words">{data.title || 'Untitled Checklist'}</h2>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="text-xs text-gray-500">{done}/{total} done · {pct}%</span>
                            {data.dueDate && (
                                <span className="inline-flex items-center gap-1 text-xs text-orange-500">
                                    <Calendar size={12} /> {new Date(data.dueDate).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-gray-100 shrink-0">
                    <div className="h-full bg-teal-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto p-4">
                    {items.length > 0 ? (
                        <div className="space-y-1.5">
                            {items.map((item, i) => (
                                <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg">
                                    {item.isCompleted ? (
                                        <CheckCircle2 size={18} className="text-teal-500 shrink-0" />
                                    ) : (
                                        <Circle size={18} className="text-gray-300 shrink-0" />
                                    )}
                                    <span className={`text-sm ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                        {item.text || 'Untitled item'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400 italic text-center py-4">
                            {total > 0 ? `${done} of ${total} items completed` : 'Empty checklist'}
                        </p>
                    )}
                </div>

                {/* Footer */}
                {!isMe && onImport && (
                    <div className="shrink-0 border-t border-gray-100 p-3">
                        <button onClick={() => { onImport(artifact); onClose(); }} className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                            <Download size={14} /> Save to Checklists
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChecklistViewer;
