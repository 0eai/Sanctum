// src/apps/counter/components/ViewEntryModal.jsx
import React from 'react';
import { MapPin, Tag, StickyNote, Pencil, Trash2 } from 'lucide-react';
import { Modal, Button } from '../../../components/ui';
import { formatDate, formatTime, formatDuration } from '../../../lib/dateUtils';

const ViewEntryModal = ({ entry, counter, onClose, onEdit, onDelete }) => {
  return (
    <Modal isOpen={!!entry} onClose={onClose} title="Entry Details">
      {entry && (
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Time</label>
            <div className="text-gray-900 font-medium text-lg">{formatDate(entry.timestamp)}</div>
            <div className="text-gray-600">
              {formatTime(entry.timestamp)}
              {counter.mode === 'range' && entry.endTimestamp && <> <span className="mx-2 text-gray-400">→</span> {formatTime(entry.endTimestamp)}</>}
            </div>
            {counter.mode === 'range' && entry.endTimestamp && <div className="text-[#4285f4] font-semibold">Duration: {formatDuration(entry.endTimestamp - entry.timestamp)}</div>}
          </div>
          {entry.location && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><MapPin size={12} /> Location</label>
              <p className="text-gray-800">{entry.location.address}</p>
              <p className="text-xs text-gray-400">{entry.location.lat.toFixed(5)}, {entry.location.lng.toFixed(5)}</p>
            </div>
          )}
          {entry.tags && entry.tags.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Tag size={12} /> Tags</label>
              <div className="flex flex-wrap gap-2">{entry.tags.map((tag, i) => <span key={i} className="bg-blue-50 text-[#4285f4] px-2 py-1 rounded-md text-sm font-medium">#{tag}</span>)}</div>
            </div>
          )}
          {entry.note && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><StickyNote size={12} /> Note</label>
              <div className="bg-gray-50 p-3 rounded-lg text-gray-700 text-sm whitespace-pre-wrap">{entry.note}</div>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
            <Button variant="ghost" onClick={onEdit} className="text-gray-600"><Pencil size={16} className="mr-2" /> Edit</Button>
            <Button variant="danger" onClick={onDelete}><Trash2 size={16} className="mr-2" /> Delete</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ViewEntryModal;