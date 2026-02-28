import React from 'react';
import { Edit2 } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';

const PaperNotesPanel = ({ noteContent, setNoteContent, isNoteLoaded }) => (
    <div className="mt-8 border-t border-gray-100 pt-8 flex flex-col min-h-[50vh]">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Edit2 size={18} className="text-blue-500" />
                Research Notes
            </h2>
            <span className="text-xs text-gray-400 font-medium">Auto-syncs to Notes app</span>
        </div>

        <div className="flex-1 w-full p-0">
            <TextareaAutosize
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Type your notes here... They will be automatically synced directly into the 'Research' folder of your Notes app securely."
                minRows={10}
                className="w-full bg-transparent resize-none outline-none text-gray-800 leading-relaxed disabled:opacity-50 overflow-hidden"
                disabled={!isNoteLoaded}
            />
        </div>
    </div>
);

export default PaperNotesPanel;
