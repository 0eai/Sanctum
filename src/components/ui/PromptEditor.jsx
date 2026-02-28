import React, { useState, useEffect, useRef } from 'react';
import {
    ChevronLeft, Share2, Star, X, Tag, Printer, Copy, Check
} from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';

const PromptEditor = ({ prompt, onSave, onBack, saveStatus, onShare }) => {
    const [data, setData] = useState({
        title: '', content: '', tags: [], isPinned: false, ...prompt
    });

    const [isTagInputVisible, setIsTagInputVisible] = useState(false);
    const [copied, setCopied] = useState(false);
    const textAreaRef = useRef(null);
    const scrollRef = useRef(null);

    // Auto-Save Trigger
    const debouncedData = useDebounce(data, 1000);
    useEffect(() => {
        if (debouncedData) {
            onSave(debouncedData);
        }
    }, [debouncedData]);

    useEffect(() => {
        if (prompt?.id && !data.id) {
            setData(prev => ({ ...prev, id: prompt.id }));
        }
    }, [prompt?.id, data.id]);

    // Auto-Resize Textarea
    useEffect(() => {
        const textarea = textAreaRef.current;
        if (textarea) {
            const scrollContainer = scrollRef.current;
            const scrollPos = scrollContainer ? scrollContainer.scrollTop : 0;

            textarea.style.height = "auto";
            let nextHeight = textarea.scrollHeight;

            // Fix for trailing newline
            if (data.content.endsWith('\n') || data.content.endsWith('\n\n')) {
                const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 28;
                nextHeight += lineHeight;
            }

            textarea.style.height = nextHeight + "px";

            if (scrollContainer) {
                scrollContainer.scrollTop = scrollPos;
            }
        }
    }, [data.content]);

    const handleCopy = () => {
        navigator.clipboard.writeText(data.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div ref={scrollRef} className="h-[100dvh] bg-gray-50 overflow-y-auto">
            <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col bg-white relative shadow-sm">

                {/* Toolbar */}
                <div className="no-print sticky top-0 flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-30">
                    <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors">
                        <ChevronLeft />
                    </button>
                    <div className="flex gap-2 items-center">
                        <span className="text-xs text-gray-400 mr-2 uppercase tracking-wider font-medium">
                            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Error' : 'Saved'}
                        </span>

                        <button onClick={handleCopy} className="p-2 text-gray-400 hover:text-[#4285f4] hover:bg-blue-50 rounded-full transition-colors" title="Copy Prompt">
                            {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                        </button>

                        <button onClick={() => window.print()} className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors" title="Print prompt">
                            <Printer size={20} />
                        </button>

                        {onShare && (
                            <button onClick={(e) => onShare(e, data)} className={`p-2 transition-colors rounded-full ${data.sharedId ? 'text-green-500 bg-green-50' : 'text-gray-400 hover:text-[#4285f4] hover:bg-blue-50'}`}>
                                <Share2 size={20} />
                            </button>
                        )}

                        <button onClick={() => setData(s => ({ ...s, isPinned: !s.isPinned }))} className={`p-2 rounded-full transition-colors ${data.isPinned ? 'bg-yellow-100 text-yellow-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                            <Star size={20} fill={data.isPinned ? "currentColor" : "none"} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 w-full">
                    <div className="p-6 md:p-8 flex flex-col gap-4 min-h-full">

                        {/* Title */}
                        <textarea
                            value={data.title}
                            onChange={e => {
                                setData(s => ({ ...s, title: e.target.value }));
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                            }}
                            placeholder="Prompt Title..."
                            rows={1}
                            className="text-3xl font-bold outline-none placeholder-gray-300 bg-transparent text-gray-800 w-full resize-none overflow-hidden break-words"
                        />

                        {/* Meta Bar: Tags */}
                        <div className="flex flex-wrap gap-2 items-center text-xs border-b border-gray-100 pb-4 mb-2">
                            {data.tags.map((tag, i) => (
                                <span key={i} className="bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-full flex items-center gap-1 font-medium hover:bg-gray-200 transition-colors">
                                    #{tag} <button onClick={() => setData(s => ({ ...s, tags: s.tags.filter((_, idx) => idx !== i) }))} className="hover:text-red-500 rounded-full p-0.5"><X size={12} /></button>
                                </span>
                            ))}

                            {isTagInputVisible ? (
                                <input
                                    autoFocus
                                    placeholder="Add tag..."
                                    className="px-3 py-1.5 rounded-full border border-[#4285f4] outline-none w-24 bg-transparent focus:ring-2 focus:ring-blue-100 transition-all text-gray-700 font-medium"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.target.value.trim()) {
                                            const newTag = e.target.value.trim().toLowerCase();
                                            if (!data.tags.includes(newTag)) {
                                                setData(s => ({ ...s, tags: [...s.tags, newTag] }));
                                            }
                                            setIsTagInputVisible(false);
                                        }
                                        if (e.key === 'Escape') {
                                            setIsTagInputVisible(false);
                                        }
                                    }}
                                    onBlur={() => setIsTagInputVisible(false)}
                                />
                            ) : (
                                <button onClick={() => setIsTagInputVisible(true)} className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-100">
                                    <Tag size={12} /> Add Tag
                                </button>
                            )}
                        </div>

                        {/* Body Text */}
                        <div className="relative flex-1">
                            <textarea
                                ref={textAreaRef}
                                value={data.content}
                                onChange={e => setData(s => ({ ...s, content: e.target.value }))}
                                placeholder="Type your AI prompt here..."
                                className="w-full h-full min-h-[50vh] outline-none resize-none text-gray-700 leading-relaxed text-lg bg-transparent pb-32 overflow-hidden placeholder-gray-300 selection:bg-blue-100"
                                spellCheck="false"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PromptEditor;
