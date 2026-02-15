// src/apps/markdown/components/MarkdownEditor.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, Star, Eye, Edit2, Download, Bell, Clock, RotateCcw, X, Tag, Paperclip,
  PlayCircle, Music, FileText 
} from 'lucide-react';
import { useDebounce } from '../../../hooks/useDebounce';
import { toBase64 } from '../../../lib/fileUtils';
import MarkdownViewer from '../../../components/ui/MarkdownViewer';
import FileViewer from '../../../components/ui/FileViewer'; 

const MarkdownEditor = ({ item, onSave, onBack, onExport, saveStatus, navigate }) => {
  const [data, setData] = useState({ 
    title: '', content: '', tags: [], attachments: [], isPinned: false, 
    dueDate: null, repeat: 'none', ...item 
  });
  
  const [isPreviewMode, setIsPreviewMode] = useState(item.initialPreview || false);

  // FIXED: Sync local UI state when the URL changes the initialPreview prop
  useEffect(() => {
      setIsPreviewMode(item.initialPreview || false);
  }, [item.initialPreview]);

  const [isTagInputVisible, setIsTagInputVisible] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState(null);
  
  const textAreaRef = useRef(null);

  useEffect(() => {
    if (item.id && item.id !== data.id) {
        setData(prev => ({ ...prev, id: item.id }));
    }
  }, [item.id]);
  // Auto-Save
  const debouncedData = useDebounce(data, 1000);
  
  useEffect(() => {
    if(debouncedData) {
        onSave(debouncedData);
    }
  }, [debouncedData]);

  // Auto-Resize Textarea
  useEffect(() => {
    const textarea = textAreaRef.current;
    if (textarea && !isPreviewMode) {
      // 1. Reset height to auto to get the correct scrollHeight for shrinking
      textarea.style.height = "auto";
      
      // 2. Fix for trailing newline bug:
      // Browsers don't account for the final '\n' in scrollHeight.
      // We temporarily add a space char to force the calculation to include the new line.
      let nextHeight = textarea.scrollHeight;
      
      if (data.content.endsWith('\n')) {
          const originalValue = textarea.value;
          const { selectionStart, selectionEnd } = textarea;

          // Add dummy character to force height calculation
          textarea.value = originalValue + ' ';
          nextHeight = textarea.scrollHeight;

          // Restore original value and cursor position immediately
          textarea.value = originalValue;
          textarea.setSelectionRange(selectionStart, selectionEnd);
      }

      textarea.style.height = nextHeight + "px";
    }
  }, [data.content, isPreviewMode]);

  const formatAlertDate = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const getThumbnailIcon = (type) => {
      if (type.startsWith('video/')) return <PlayCircle size={20} className="text-blue-400" />;
      if (type.startsWith('audio/')) return <Music size={20} className="text-purple-400" />;
      return <FileText size={20} className="text-gray-400" />;
  };

  // Logic to handle content changes and auto-extract title
  const handleContentChange = (e) => {
      const newContent = e.target.value;
      
      // Parse Title: Get first line, remove markdown header syntax (# )
      const firstLine = newContent.split('\n')[0] || "";
      const derivedTitle = firstLine.replace(/^#+\s*/, '').substring(0, 80).trim(); 

      setData(prev => ({
          ...prev,
          content: newContent,
          title: derivedTitle || "Untitled Doc" // Fallback title
      }));
  };

  return (
    <>
    <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; padding: 0; margin: 0; cursor: pointer; opacity: 0;
        }
    `}</style>

    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        <div className="max-w-4xl mx-auto w-full h-full flex flex-col bg-white shadow-xl overflow-hidden relative">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-20">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 flex-shrink-0"><ChevronLeft /></button>
                    {/* Display current title in toolbar since main input is gone */}
                    <span className="font-bold text-gray-700 truncate text-sm sm:text-base max-w-[150px] sm:max-w-md">
                        {data.title || "Untitled"}
                    </span>
                </div>
                
                <div className="flex gap-2 items-center flex-shrink-0">
                    <span className="text-xs text-gray-400 mr-2 uppercase tracking-wider font-medium hidden sm:block">
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Error' : 'Saved'}
                    </span>
                    
                    {/* <button onClick={() => setIsPreviewMode(!isPreviewMode)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${isPreviewMode ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {isPreviewMode ? <><Edit2 size={14} /> Edit</> : <><Eye size={14} /> Preview</>}
                    </button> */}
                    <button 
                        onClick={() => {
                            const nextAction = isPreviewMode ? 'edit' : ''; // remove 'edit' for default preview
                            navigate(`#markdown/doc/${item.id}${nextAction ? `/${nextAction}` : ''}`);
                        }} 
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${isPreviewMode ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        {isPreviewMode ? <><Edit2 size={14} /> Edit</> : <><Eye size={14} /> Preview</>}
                    </button>

                    <button onClick={() => onExport(data)} className="p-2 text-gray-400 hover:text-blue-500 rounded-full hover:bg-gray-100">
                        <Download size={20} />
                    </button>
                    <button onClick={() => setData(s => ({...s, isPinned: !s.isPinned}))} className={`p-2 rounded-full ${data.isPinned ? 'bg-yellow-100 text-yellow-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                        <Star size={20} fill={data.isPinned ? "currentColor" : "none"} />
                    </button>
                </div>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto scroll-smooth">
                <div className="p-6 md:p-10 flex flex-col gap-6 min-h-full">
                    
                    {/* Meta Bar */}
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                        {/* Date Pill */}
                        {data.dueDate ? (
                            <div className="bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium group relative overflow-hidden">
                                <Clock size={12} className="pointer-events-none" />
                                <span className="pointer-events-none">{formatAlertDate(data.dueDate)}</span>
                                <input type="datetime-local" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" value={data.dueDate} onChange={(e) => setData(s => ({...s, dueDate: e.target.value}))} />
                                <button onClick={(e) => { e.stopPropagation(); setData(s => ({...s, dueDate: null, repeat: 'none'})) }} className="hover:text-red-500 z-20 relative"><X size={12} /></button>
                            </div>
                        ) : (
                            <div className="relative group">
                                <div className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] cursor-pointer transition-colors"><Bell size={12} /> Add Alert</div>
                                <input type="datetime-local" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={(e) => setData(s => ({...s, dueDate: e.target.value}))} />
                            </div>
                        )}

                        {/* Repeat Pill */}
                        {data.dueDate && (
                            <div className={`px-2.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium relative ${data.repeat !== 'none' ? 'bg-purple-50 text-purple-600' : 'text-gray-400 border border-dashed border-gray-300 hover:border-purple-400 hover:text-purple-500'}`}>
                                <RotateCcw size={12} className="pointer-events-none" />
                                <span className="pointer-events-none">{data.repeat === 'none' ? 'Repeat' : data.repeat}</span>
                                <select value={data.repeat} onChange={(e) => setData(s => ({...s, repeat: e.target.value}))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none z-10">
                                    <option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
                                </select>
                            </div>
                        )}

                        {/* Tags */}
                        {data.tags.map((tag, i) => (
                            <span key={i} className="bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-full flex items-center gap-1 font-medium">
                                #{tag} <button onClick={() => setData(s => ({...s, tags: s.tags.filter((_, idx) => idx !== i)}))} className="hover:text-red-500"><X size={12} /></button>
                            </span>
                        ))}
                        {isTagInputVisible ? (
                            <input autoFocus placeholder="Tag..." className="px-3 py-1.5 rounded-full border border-[#4285f4] outline-none w-20 bg-transparent"
                                onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { setData(s => ({...s, tags: [...s.tags, e.target.value.trim()]})); setIsTagInputVisible(false); } }}
                                onBlur={() => setIsTagInputVisible(false)} />
                        ) : (
                            <button onClick={() => setIsTagInputVisible(true)} className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] transition-colors"><Tag size={12} /> Tag</button>
                        )}

                        {/* Attach */}
                        <label className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] cursor-pointer transition-colors">
                            <Paperclip size={12} /> Attach
                            <input type="file" className="hidden" onChange={async (e) => {
                                const file = e.target.files[0];
                                if (!file || file.size > 5000000) return alert("File too large (Max 5MB)");
                                const base64 = await toBase64(file);
                                setData(prev => ({ ...prev, attachments: [...prev.attachments, { name: file.name, type: file.type, data: base64 }] }));
                            }} />
                        </label>
                    </div>

                    {/* Attachment Thumbnails */}
                    {data.attachments.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                            {data.attachments.map((att, i) => (
                                <div key={i} onClick={() => setViewingAttachment(att)} className="group relative flex-shrink-0 w-16 h-16 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-all">
                                    {att.type.startsWith('image/') ? <img src={att.data} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={att.name} /> : getThumbnailIcon(att.type)}
                                    <button onClick={(e) => { e.stopPropagation(); setData(s => ({...s, attachments: s.attachments.filter((_, idx) => idx !== i)})) }} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-1 shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"><X size={10} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* Editor / Preview Body */}
                    <div className="flex-1 h-full">
                        {isPreviewMode ? (
                            <div className="min-h-[50vh] pb-32 animate-in fade-in duration-200">
                                <MarkdownViewer content={data.content} />
                            </div>
                        ) : (
                            <textarea 
                                ref={textAreaRef}
                                value={data.content} 
                                onChange={handleContentChange}
                                placeholder="# Title\n\nStart typing..." 
                                className="w-full outline-none resize-none text-gray-700 leading-relaxed text-lg bg-transparent pb-32 font-mono overflow-hidden" 
                                style={{ minHeight: '60vh' }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <FileViewer file={viewingAttachment} onClose={() => setViewingAttachment(null)} />
    </>
  );
};

export default MarkdownEditor;