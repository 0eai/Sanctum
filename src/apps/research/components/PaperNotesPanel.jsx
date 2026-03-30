import React, { useState } from 'react';
import { Edit2, Eye, ExternalLink } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import MarkdownViewer from '../../../components/ui/MarkdownViewer';

const PaperNotesPanel = ({ noteContent, setNoteContent, isNoteLoaded, readOnly, noteId, navigate }) => {
    const [isPreview, setIsPreview] = useState(false);

    return (
        <div className="mt-8 border-t border-gray-100 pt-8 flex flex-col min-h-[50vh]">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Edit2 size={18} className="text-blue-500" />
                    Research Notes
                </h2>
                <div className="flex items-center gap-3">
                    {noteId && navigate && (
                        <button
                            onClick={() => navigate(`#notes/doc/${noteId}/edit`)}
                            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium"
                        >
                            <ExternalLink size={12} /> Open in Notes
                        </button>
                    )}
                    <button
                        onClick={() => setIsPreview(p => !p)}
                        className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${isPreview ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                        title={isPreview ? 'Switch to edit' : 'Preview markdown'}
                    >
                        {isPreview ? <><Edit2 size={11} /> Edit</> : <><Eye size={11} /> Preview</>}
                    </button>
                    <span className="text-xs text-gray-400 font-medium">Auto-syncs to Notes app</span>
                </div>
            </div>

            <div className="flex-1 w-full p-0">
                {isPreview ? (
                    <div className="min-h-[20vh] text-gray-800 leading-relaxed">
                        <MarkdownViewer content={noteContent || ''} />
                    </div>
                ) : (
                    <TextareaAutosize
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="Type your notes here... They will be automatically synced directly into the 'Research' folder of your Notes app securely."
                        minRows={10}
                        className="w-full bg-transparent resize-none outline-none text-gray-800 leading-relaxed disabled:opacity-50 overflow-hidden"
                        disabled={!isNoteLoaded || readOnly}
                    />
                )}
            </div>
        </div>
    );
};

export default PaperNotesPanel;
