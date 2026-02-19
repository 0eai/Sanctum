// src/apps/notes/components/NoteEditor.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, Bell, Share2, Star, X, Tag, Paperclip, FileText, 
  Clock, RotateCcw, Calendar, PlayCircle, Music, File 
} from 'lucide-react';
import { useDebounce } from '../../../hooks/useDebounce';
import { toBase64 } from '../../../lib/fileUtils';
import FileViewer from '../../../components/ui/FileViewer'; 

const NoteEditor = ({ note, onSave, onBack, onPin, onShare, saveStatus }) => {
  const [data, setData] = useState({ 
    title: '', content: '', tags: [], attachments: [], isPinned: false, 
    dueDate: null, repeat: 'none', ...note 
  });
  
  const [isTagInputVisible, setIsTagInputVisible] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState(null); 
  const textAreaRef = useRef(null);

  // Auto-Save Trigger
  const debouncedData = useDebounce(data, 1000);
  useEffect(() => {
    if(debouncedData) onSave(debouncedData);
  }, [debouncedData]);

  useEffect(() => {
    if (note.id && !data.id) {
      setData(prev => ({ ...prev, id: note.id }));
    }
  }, [note.id, data.id]);

  // Auto-Resize Textarea
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.height = textAreaRef.current.scrollHeight + "px";
    }
  }, [data.content]);

  // Helper to format date for the pill
  const formatAlertDate = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  };

  // Helper for thumbnails
  const getThumbnailIcon = (type) => {
      if (type.startsWith('video/')) return <PlayCircle size={20} className="text-blue-400" />;
      if (type.startsWith('audio/')) return <Music size={20} className="text-purple-400" />;
      return <FileText size={20} className="text-gray-400" />;
  };

  return (
    <>
    {/* CSS Hack to make date inputs clickable on desktop */}
    <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            padding: 0;
            margin: 0;
            cursor: pointer;
            opacity: 0;
        }
    `}</style>

    <div className="flex flex-col h-[100dvh] bg-gray-50">
        <div className="max-w-3xl mx-auto w-full h-full flex flex-col bg-white shadow-xl overflow-hidden relative">
            
            {/* Toolbar - Now fixed because parent is h-full/overflow-hidden */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-20">
                <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft /></button>
                <div className="flex gap-2 items-center">
                    <span className="text-xs text-gray-400 mr-2 uppercase tracking-wider font-medium">
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Error' : 'Saved'}
                    </span>
                    <button onClick={(e) => onShare(e, data)} className={`p-2 transition-colors rounded-full ${data.sharedId ? 'text-green-500 bg-green-50' : 'text-gray-400 hover:text-[#4285f4]'}`}>
                        <Share2 size={20} />
                    </button>
                    <button onClick={() => setData(s => ({...s, isPinned: !s.isPinned}))} className={`p-2 rounded-full ${data.isPinned ? 'bg-yellow-100 text-yellow-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                        <Star size={20} fill={data.isPinned ? "currentColor" : "none"} />
                    </button>
                </div>
            </div>

            {/* Content - Scrolls independently */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-6 md:p-8 flex flex-col gap-4 min-h-full">
                    
                    {/* Title */}
                    <input 
                        value={data.title} 
                        onChange={e => setData(s => ({...s, title: e.target.value}))}
                        placeholder="Untitled Note" 
                        className="text-3xl font-bold outline-none placeholder-gray-300 bg-transparent text-gray-800"
                    />
                    
                    {/* Meta Bar: Alerts, Tags, Attachments */}
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                        
                        {/* 1. Date Pill */}
                        {data.dueDate ? (
                            <div className="bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium group relative overflow-hidden">
                                <Clock size={12} className="pointer-events-none" />
                                <span className="pointer-events-none">{formatAlertDate(data.dueDate)}</span>
                                <input 
                                    type="datetime-local" 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                                    value={data.dueDate}
                                    onChange={(e) => setData(s => ({...s, dueDate: e.target.value}))}
                                />
                                <button onClick={(e) => { e.stopPropagation(); setData(s => ({...s, dueDate: null, repeat: 'none'})) }} className="hover:text-red-500 z-20 relative"><X size={12} /></button>
                            </div>
                        ) : (
                            <div className="relative group">
                                <div className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] cursor-pointer transition-colors">
                                    <Bell size={12} /> Add Alert
                                </div>
                                <input 
                                    type="datetime-local" 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    onChange={(e) => setData(s => ({...s, dueDate: e.target.value}))}
                                />
                            </div>
                        )}

                        {/* 2. Repeat Pill */}
                        {data.dueDate && (
                            <div className={`px-2.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium relative ${data.repeat !== 'none' ? 'bg-purple-50 text-purple-600' : 'text-gray-400 border border-dashed border-gray-300 hover:border-purple-400 hover:text-purple-500'}`}>
                                <RotateCcw size={12} className="pointer-events-none" />
                                <span className="pointer-events-none">{data.repeat === 'none' ? 'Repeat' : data.repeat}</span>
                                <select 
                                    value={data.repeat} 
                                    onChange={(e) => setData(s => ({...s, repeat: e.target.value}))}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none z-10"
                                >
                                    <option value="none">No Repeat</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="yearly">Yearly</option>
                                </select>
                            </div>
                        )}

                        {/* 3. Tags */}
                        {data.tags.map((tag, i) => (
                            <span key={i} className="bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-full flex items-center gap-1 font-medium">
                                #{tag} <button onClick={() => setData(s => ({...s, tags: s.tags.filter((_, idx) => idx !== i)}))} className="hover:text-red-500"><X size={12} /></button>
                            </span>
                        ))}
                        
                        {isTagInputVisible ? (
                            <input 
                                autoFocus
                                placeholder="Tag..."
                                className="px-3 py-1.5 rounded-full border border-[#4285f4] outline-none w-20 bg-transparent"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                        setData(s => ({...s, tags: [...s.tags, e.target.value.trim()]}));
                                        setIsTagInputVisible(false);
                                    }
                                }}
                                onBlur={() => setIsTagInputVisible(false)}
                            />
                        ) : (
                            <button onClick={() => setIsTagInputVisible(true)} className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] transition-colors">
                                <Tag size={12} /> Tag
                            </button>
                        )}

                        {/* 4. Attach Button */}
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

                    {/* Compact Attachments Row */}
                    {data.attachments.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                            {data.attachments.map((att, i) => (
                                <div 
                                    key={i} 
                                    onClick={() => setViewingAttachment(att)}
                                    className="group relative flex-shrink-0 w-16 h-16 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-all"
                                >
                                    {att.type.startsWith('image/') ? (
                                        <img src={att.data} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={att.name} />
                                    ) : (
                                        getThumbnailIcon(att.type)
                                    )}
                                    
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                                    
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setData(s => ({...s, attachments: s.attachments.filter((_, idx) => idx !== i)})) }} 
                                        className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-1 shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Body Text */}
                    <textarea 
                        ref={textAreaRef}
                        value={data.content} 
                        onChange={e => setData(s => ({...s, content: e.target.value}))}
                        placeholder="Start writing..." 
                        className="w-full outline-none resize-none text-gray-700 leading-relaxed text-lg bg-transparent pb-32 overflow-hidden" 
                        style={{ minHeight: '50vh' }}
                    />
                </div>
            </div>
        </div>
    </div>

    {/* Full Screen File Viewer Overlay */}
    <FileViewer file={viewingAttachment} onClose={() => setViewingAttachment(null)} />
    </>
  );
};

export default NoteEditor;