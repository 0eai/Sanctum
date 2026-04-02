// src/apps/notes/components/NoteEditor.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ChevronLeft, Bell, Share2, Star, X, Tag, Paperclip, FileText,
    Clock, RotateCcw, Calendar, PlayCircle, Music, File, Printer, Users, Download, AlertCircle, RefreshCw
} from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { useDebounce } from '../../../hooks/useDebounce';
import { toBase64 } from '../../../lib/fileUtils';
import FileViewer from '../../../components/ui/FileViewer';
import { uploadEncryptedFile as uploadToFirebase, downloadEncryptedFile as downloadFromFirebase } from '../../../services/firebaseStorage';
import TextareaAutosize from 'react-textarea-autosize';
import { usePermissions } from '../../../hooks/usePermissions';
import usePresence from '../../../hooks/usePresence';
import PresenceDots from '../../../components/ui/PresenceDots';
import { useYjsCollab } from '../../../hooks/useYjsCollab';

const NoteEditor = ({ note, cryptoKey, onSave, onBack, onPin, onShare, saveStatus, user, navigate, onCollaborate, readOnly }) => {
    const { showToast } = useToast();
    const { canShare } = usePermissions(note);
    const presenceUsers = usePresence({
        shareId: note?.shareId || null,
        uid: user?.uid,
        displayName: user?.displayName || user?.email || null,
        enabled: !!note?.isSharedDoc,
    });

    // CRDT — only active for shared docs with a collabShareId
    const crdtEnabled = !!note?.isSharedDoc && !!note?.collabShareId;
    const { ydocRef, ytextRef } = useYjsCollab({
        shareId: note?.collabShareId,
        docKey:  (note?.isSharedDoc && note?.docKey) ? note.docKey : cryptoKey,
        uid:     user?.uid,
        enabled: crdtEnabled,
    });
    const [data, setData] = useState({
        title: '', content: '', tags: [], attachments: [], isPinned: false,
        dueDate: null, repeat: 'none', ...note
    });

    const [isTagInputVisible, setIsTagInputVisible] = useState(false);
    const [viewingAttachment, setViewingAttachment] = useState(null);
    const [lastSavedHash, setLastSavedHash] = useState(null);
    const [remoteUpdateDetected, setRemoteUpdateDetected] = useState(false);
    const baseVersionRef = useRef(note?.versionId ?? 0);

    // Detect remote saves on shared docs
    useEffect(() => {
        if (!note?.isSharedDoc) return;
        const incoming = note?.versionId ?? 0;
        if (incoming > baseVersionRef.current && saveStatus !== 'saving') {
            setRemoteUpdateDetected(true);
        }
        baseVersionRef.current = incoming;
    }, [note?.versionId]);

    // Clear banner while we are saving (our own snapshot will arrive after)
    useEffect(() => {
        if (saveStatus === 'saving') setRemoteUpdateDetected(false);
    }, [saveStatus]);

    const textAreaRef = useRef(null);
    const scrollRef = useRef(null);
    const isCreatingRef = useRef(false);

    useEffect(() => {
        if (note) {
            setData(prev => ({ ...prev, id: note.id }));
            isCreatingRef.current = false;

            setLastSavedHash(JSON.stringify({
                title: note.title || '', content: note.content || '', tags: note.tags || [],
                attachments: (note.attachments || []).map(a => { const { url, ...rest } = a; return rest; }),
                isPinned: note.isPinned || false, dueDate: note.dueDate || null, repeat: note.repeat || 'none'
            }));
        }
    }, [note?.id]);

    // Sync collaboration metadata silently without overwriting user edits
    useEffect(() => {
        if (note && (note.sharedId !== data.sharedId || note.memberUids?.length !== data.memberUids?.length)) {
            setData(prev => ({
                ...prev,
                sharedId: note.sharedId,
                docKey: note.docKey || prev.docKey,
                memberUids: note.memberUids || prev.memberUids
            }));
        }
    }, [note?.sharedId, note?.docKey, note?.memberUids?.length]);

    // CRDT: mirror remote Y.Text changes → React state
    useEffect(() => {
        const ytext = ytextRef.current;
        if (!ytext || !crdtEnabled) return;
        const observer = (_, tx) => {
            if (tx.origin !== 'remote') return;
            setData(prev => ({ ...prev, content: ytext.toString() }));
        };
        ytext.observe(observer);
        return () => ytext.unobserve(observer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crdtEnabled, ytextRef.current]);

    // CRDT: flush Y.Doc content to Firestore every 30 s so non-CRDT readers stay in sync
    useEffect(() => {
        if (!crdtEnabled) return;
        const id = setInterval(() => {
            const content = ytextRef.current?.toString();
            if (content !== undefined) onSave({ ...data, content });
        }, 30_000);
        return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crdtEnabled]);

    // CRDT: apply minimal delta to Y.Doc on user edits, then update React state
    const handleContentChange = useCallback((newVal) => {
        if (crdtEnabled && ytextRef.current && ydocRef.current) {
            const ytext = ytextRef.current;
            const old   = ytext.toString();
            if (old !== newVal) {
                let s = 0;
                while (s < old.length && s < newVal.length && old[s] === newVal[s]) s++;
                let eO = old.length, eN = newVal.length;
                while (eO > s && eN > s && old[eO - 1] === newVal[eN - 1]) { eO--; eN--; }
                ydocRef.current.transact(() => {
                    if (eO > s) ytext.delete(s, eO - s);
                    if (eN > s) ytext.insert(s, newVal.slice(s, eN));
                });
            }
        }
        setData(prev => ({ ...prev, content: newVal }));
    }, [crdtEnabled, ytextRef, ydocRef]);

    // Auto-Save Trigger
    const debouncedData = useDebounce(data, 1000);
    useEffect(() => {
        if (debouncedData && lastSavedHash !== null) {
            const cleanAttachments = debouncedData.attachments.map(att => {
                const { url, ...cleanAtt } = att;
                return cleanAtt;
            });
            const currentPayloadObj = {
                title: debouncedData.title, content: debouncedData.content, tags: debouncedData.tags,
                attachments: cleanAttachments, isPinned: debouncedData.isPinned,
                dueDate: debouncedData.dueDate, repeat: debouncedData.repeat
            };
            const currentHash = JSON.stringify(currentPayloadObj);

            if (currentHash !== lastSavedHash) {
                const activeId = data.id || debouncedData.id || note?.id;
                // Prevent duplicate creations while waiting for the first ID to be returned
                if (!activeId && isCreatingRef.current) return;

                if (!activeId) {
                    isCreatingRef.current = true;
                }

                // When CRDT is active, suppress content from auto-save — Y.Doc 30 s flush handles it
                const savePayload = crdtEnabled
                    ? { ...debouncedData, id: activeId, attachments: cleanAttachments, content: undefined, title: undefined }
                    : { ...debouncedData, id: activeId, attachments: cleanAttachments };
                // Call onSave which in NotesApp is an async handleSaveNote function
                Promise.resolve(onSave(savePayload)).then(() => {
                    setLastSavedHash(currentHash);
                }).catch(e => {
                    console.error("Auto-save failed", e);
                    isCreatingRef.current = false;
                });
            }
        }
    }, [debouncedData, lastSavedHash, onSave]);

    // Auto-Resize Textarea
    useEffect(() => {
        const textarea = textAreaRef.current;
        if (textarea) {
            const scrollContainer = scrollRef.current;
            const scrollPos = scrollContainer ? scrollContainer.scrollTop : 0;

            textarea.style.height = "auto";
            let nextHeight = textarea.scrollHeight;

            // Fix for trailing newline: browsers don't account for the final '\n' in scrollHeight.
            // Instead of mutating textarea.value (which breaks React controlled input),
            // just add one line-height worth of space.
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

    // Helper to format date for the pill
    const handleRetry = () => {
        const cleanAttachments = data.attachments.map(({ url, ...rest }) => rest);
        onSave({ ...data, attachments: cleanAttachments });
    };

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

            <div ref={scrollRef} className="h-[100dvh] bg-gray-50 overflow-y-auto">
                <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col bg-white relative">

                    {/* Toolbar - Now fixed because parent is h-full/overflow-hidden */}
                    <div className="no-print sticky top-0 flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-30">
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft /></button>
                        <div className="flex gap-2 items-center">
                            <PresenceDots users={presenceUsers} />
                            {saveStatus === 'error' ? (
                                <button onClick={handleRetry} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium mr-2 transition-colors">
                                    <AlertCircle size={13} /> Error · <RefreshCw size={11} /> Retry
                                </button>
                            ) : (
                                <span className="text-xs text-gray-400 mr-2 uppercase tracking-wider font-medium">
                                    {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
                                </span>
                            )}
                            <button onClick={() => window.print()} className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors" title="Print note">
                                <Printer size={20} />
                            </button>
                            <button
                                onClick={() => {
                                    const content = data.title ? `# ${data.title}\n\n${data.content || ''}` : (data.content || '');
                                    const blob = new Blob([content], { type: 'text/markdown' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `${data.title || 'Untitled'}.md`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                                title="Export as Markdown"
                            >
                                <Download size={20} />
                            </button>
                            {onCollaborate && (
                                <button onClick={(e) => onCollaborate(e, data)} className={`p-2 transition-colors rounded-full ${data.memberUids?.length > 0 ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-blue-500'}`} title="Collaborators">
                                    <Users size={20} />
                                </button>
                            )}
                            {canShare && onShare && (
                                <button onClick={(e) => onShare(e, data)} className={`p-2 transition-colors rounded-full ${data.sharedId ? 'text-green-500 bg-green-50' : 'text-gray-400 hover:text-[#4285f4]'}`} title="Public Link">
                                    <Share2 size={20} />
                                </button>
                            )}
                            <button onClick={() => setData(s => ({ ...s, isPinned: !s.isPinned }))} className={`p-2 rounded-full ${data.isPinned ? 'bg-yellow-100 text-yellow-600' : 'text-gray-400 hover:bg-gray-100'}`} disabled={readOnly}>
                                <Star size={20} fill={data.isPinned ? "currentColor" : "none"} />
                            </button>
                        </div>
                    </div>

                    {remoteUpdateDetected && (
                        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
                            <span>A collaborator saved this document. Saving will overwrite their changes.</span>
                            <button onClick={() => setRemoteUpdateDetected(false)} className="ml-4 text-amber-500 hover:text-amber-700 font-medium">Dismiss</button>
                        </div>
                    )}

                    {/* Content - Scrolls independently */}
                    <div className="flex-1 w-full">
                        <div className="p-6 md:p-8 flex flex-col gap-4 min-h-full">

                            {/* Title */}
                            <TextareaAutosize
                                value={data.title}
                                onChange={e => setData(s => ({ ...s, title: e.target.value }))}
                                placeholder="Untitled Note"
                                disabled={readOnly}
                                className="text-3xl font-bold outline-none placeholder-gray-300 bg-transparent text-gray-800 w-full resize-none overflow-hidden break-words mb-2 break-all disabled:opacity-80"
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
                                            value={data.dueDate ? data.dueDate.slice(0, 16) : ''}
                                            onChange={(e) => setData(s => ({ ...s, dueDate: e.target.value }))}
                                        />
                                        <button onClick={(e) => { e.stopPropagation(); setData(s => ({ ...s, dueDate: null, repeat: 'none' })) }} className="hover:text-red-500 z-20 relative"><X size={12} /></button>
                                    </div>
                                ) : (
                                    <div className="relative group">
                                        <div className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] cursor-pointer transition-colors">
                                            <Bell size={12} /> Add Alert
                                        </div>
                                        <input
                                            type="datetime-local"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            onChange={(e) => setData(s => ({ ...s, dueDate: e.target.value }))}
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
                                            onChange={(e) => setData(s => ({ ...s, repeat: e.target.value }))}
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
                                        #{tag} <button onClick={() => setData(s => ({ ...s, tags: s.tags.filter((_, idx) => idx !== i) }))} className="hover:text-red-500"><X size={12} /></button>
                                    </span>
                                ))}

                                {isTagInputVisible && !readOnly ? (
                                    <input
                                        autoFocus
                                        placeholder="Tag..."
                                        className="px-3 py-1.5 rounded-full border border-[#4285f4] outline-none w-20 bg-transparent"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && e.target.value.trim()) {
                                                setData(s => ({ ...s, tags: [...s.tags, e.target.value.trim()] }));
                                                setIsTagInputVisible(false);
                                            }
                                        }}
                                        onBlur={() => setIsTagInputVisible(false)}
                                    />
                                ) : !readOnly && (
                                    <button onClick={() => setIsTagInputVisible(true)} className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] transition-colors">
                                        <Tag size={12} /> Tag
                                    </button>
                                )}

                                {/* 4. Attach Button */}
                                {!readOnly && (
                                    <label className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] cursor-pointer transition-colors">
                                        <Paperclip size={12} /> Attach
                                        <input type="file" className="hidden" onChange={async (e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;

                                            if (file.size > 50 * 1024 * 1024) {
                                                showToast("File is too large. Maximum size is 50MB.", 'error');
                                                e.target.value = null;
                                                return;
                                            }

                                            try {
                                                const scope = data.sharedId ? `shared_docs/${data.sharedId}` : (note.workspaceId ? `workspaces/${note.workspaceId}/notes` : `users/${user.uid}/notes`);
                                                const res = await uploadToFirebase(file, cryptoKey, null, scope);
                                                const driveFileId = res.id;

                                                setData(prev => ({
                                                    ...prev,
                                                    attachments: [...prev.attachments, {
                                                        name: file.name,
                                                        type: file.type,
                                                        driveFileId,
                                                        provider: 'firebase',
                                                        size: file.size
                                                    }]
                                                }));
                                            } catch (e) {
                                                console.error("Upload failed", e);
                                                showToast(e.message || 'Upload failed.', 'error');
                                            }

                                            // Reset input so the same file can be selected again
                                            e.target.value = null;
                                        }} />
                                    </label>
                                )}
                            </div>

                            {/* Compact Attachments Row */}
                            {data.attachments.length > 0 && (
                                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                                    {data.attachments.map((att, i) => (
                                        <div
                                            key={i}
                                            onClick={async () => {
                                                if (att.data) {
                                                    setViewingAttachment(att); // Legacy Base64
                                                } else if (att.driveFileId) {
                                                    try {
                                                        const key = (data.isShared && data.docKey) ? data.docKey : cryptoKey;
                                                        const url = await downloadFromFirebase(att.driveFileId, key, null, 'notes');
                                                        setViewingAttachment({ ...att, data: url });
                                                    } catch (e) {
                                                        showToast("Failed to decrypt file.", 'error');
                                                    }
                                                }
                                            }}
                                            className="group relative flex-shrink-0 w-16 h-16 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-all"
                                        >
                                            {att.data && att.type.startsWith('image/') ? (
                                                <img src={att.data} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={att.name} />
                                            ) : (
                                                getThumbnailIcon(att.type)
                                            )}

                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />

                                            <button
                                                onClick={(e) => { e.stopPropagation(); setData(s => ({ ...s, attachments: s.attachments.filter((_, idx) => idx !== i) })) }}
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
                                onChange={e => handleContentChange(e.target.value)}
                                placeholder="Start writing..."
                                disabled={readOnly}
                                className="w-full outline-none resize-none text-gray-700 leading-relaxed text-lg bg-transparent pb-32 overflow-hidden disabled:opacity-80"
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