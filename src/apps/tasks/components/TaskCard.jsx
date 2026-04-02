// src/apps/tasks/components/TaskCard.jsx
import React from 'react';
import {
  MoveUp, MoveDown, CheckSquare, Square, Star, RotateCcw, Clock, AlertCircle, FileText, Trash2, Move, Users, ArrowRightLeft
} from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';

// FIXED: Accepts onOpen to route properly
const TaskCard = ({ task, index, totalActiveCount, onToggle, onOpen, setDeleteConfirm, onMove, onMoveContext, onReorder, isDraggable = true, onCollaborate }) => {
  const { canDelete } = usePermissions(task);
  return (
    <div
      onClick={() => onOpen()} // Trigger URL navigation
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-start gap-3 group active:scale-[0.99] transition-all cursor-pointer ${task.completed ? 'opacity-60' : ''}`}
    >
      {isDraggable && (
        <div className="flex flex-col gap-0.5 text-gray-300 self-center mr-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => onReorder(index, -1)} disabled={index === 0} className="hover:text-blue-500 p-0.5 disabled:opacity-30 disabled:hover:text-gray-300"><MoveUp size={12} /></button>
          <button onClick={() => onReorder(index, 1)} disabled={index === totalActiveCount - 1} className="hover:text-blue-500 p-0.5 disabled:opacity-30 disabled:hover:text-gray-300"><MoveDown size={12} /></button>
        </div>
      )}
      {!isDraggable && <div className="w-4" />}

      <button
        onClick={(e) => { e.stopPropagation(); onToggle(task); }}
        className={`mt-0.5 flex-shrink-0 ${task.completed ? 'text-green-500' : 'text-gray-300 hover:text-blue-500'}`}
      >
        {task.completed ? <CheckSquare size={20} /> : <Square size={20} />}
      </button>

      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-start gap-1.5 min-w-0">
          <span className={`font-medium text-gray-800 break-all whitespace-pre-wrap flex-1 min-w-0 ${task.completed ? 'line-through text-gray-400' : ''}`}>
            {task.title}
          </span>
          <div className="flex items-center gap-1 mt-0.5 flex-shrink-0">
            {task.isPinned && <Star size={12} fill="currentColor" className="text-yellow-400" />}
            {task.repeat && task.repeat !== 'none' && <RotateCcw size={10} className="text-blue-400" />}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          {task.dueDate && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${new Date(task.dueDate) < new Date() && !task.completed ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
              <Clock size={10} />
              {new Date(task.dueDate).toLocaleDateString()}
              {task.hasTime && ` ${new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
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
          {task.tags?.map(tag => (
            <span key={tag} className="text-[10px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded">#{tag}</span>
          ))}
        </div>
      </div>

      <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
        {onCollaborate && (
          <button onClick={(e) => { e.stopPropagation(); onCollaborate(task); }} className={`p-1.5 ${task.memberUids?.length > 0 ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500'}`}>
            <Users size={16} />
          </button>
        )}
        {onMoveContext && (
          <button onClick={(e) => { e.stopPropagation(); onMoveContext(task); }} className="p-1.5 text-gray-300 hover:text-green-500" title="Move to workspace">
            <ArrowRightLeft size={16} />
          </button>
        )}
        {onMove && (
          <button onClick={(e) => { e.stopPropagation(); onMove(task); }} className="p-1.5 text-gray-300 hover:text-blue-500">
            <Move size={16} />
          </button>
        )}
        {canDelete && (
          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'task', id: task.id, title: task.title }); }} className="p-1.5 text-gray-300 hover:text-red-500">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default TaskCard;