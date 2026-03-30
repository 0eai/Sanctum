// src/apps/markdown/components/MarkdownEditor.jsx
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
    ChevronLeft, Star, Eye, Edit2, Download, Bell, Clock, RotateCcw, X, Tag, Paperclip,
    PlayCircle, Music, FileText, Printer, Users, Columns, Type,
    Bold, Italic, Heading2, Code, Quote, List, ListOrdered, Link2, Minus,
    AlertCircle, RefreshCw
} from 'lucide-react';
import { useDebounce } from '../../../hooks/useDebounce';
import MarkdownViewer from '../../../components/ui/MarkdownViewer';
import FileViewer from '../../../components/ui/FileViewer';
import { uploadEncryptedFile as uploadToFirebase, downloadEncryptedFile as downloadFromFirebase } from '../../../services/firebaseStorage';
import { usePermissions } from '../../../hooks/usePermissions';
import usePresence from '../../../hooks/usePresence';
import PresenceDots from '../../../components/ui/PresenceDots';
import CodeMirrorEditor from './CodeMirrorEditor';
import { useYjsCollab } from '../../../hooks/useYjsCollab';

// Lazy-load WysiwygEditor so TipTap is not in the initial bundle
const WysiwygEditor = lazy(() => import('./WysiwygEditor'));

const MarkdownEditor = ({ item, cryptoKey, onSave, onBack, onExport, saveStatus, user, onCollaborate, readOnly }) => {
    const { canShare } = usePermissions(item);
    const presenceUsers = usePresence({
        shareId: item?.shareId || null,
        uid: user?.uid,
        enabled: !!item?.isSharedDoc,
    });

    // CRDT — active for shared docs that have a shareId (Firestore path: shared_docs/{shareId})
    const crdtEnabled = !!item?.isSharedDoc && !!item?.shareId;
    const { ydocRef, ytextRef } = useYjsCollab({
        shareId: item?.shareId,
        docKey:  cryptoKey,
        uid:     user?.uid,
        enabled: crdtEnabled,
    });
    const [data, setData] = useState({
        title: '', content: '', tags: [], attachments: [], isPinned: false,
        dueDate: null, repeat: 'none', ...item
    });

    const [isPreviewMode, setIsPreviewMode] = useState(item.initialPreview || false);
    const [isSplitView, setIsSplitView] = useState(false);
    // 'source' = CodeMirror, 'wysiwyg' = TipTap rich-text
    const [editorMode, setEditorMode] = useState('source');

    const togglePreview = () => {
        const scrollPos = scrollRef.current?.scrollTop ?? 0;
        setEditorMode('source');
        setIsPreviewMode(prev => !prev);
        setIsSplitView(false);
        requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollPos;
        });
    };

    const toggleSplitView = () => {
        setEditorMode('source');
        setIsSplitView(prev => !prev);
        if (!isSplitView) setIsPreviewMode(false);
    };

    const toggleWysiwyg = () => {
        if (editorMode === 'wysiwyg') {
            setEditorMode('source');
        } else {
            setEditorMode('wysiwyg');
            setIsSplitView(false);
            setIsPreviewMode(false);
        }
    };

    // Sync local UI state when the URL changes the initialPreview prop
    useEffect(() => {
        setIsPreviewMode(item.initialPreview || false);
        setEditorMode('source');
    }, [item.initialPreview]);

    const [isTagInputVisible, setIsTagInputVisible] = useState(false);
    const [viewingAttachment, setViewingAttachment] = useState(null);
    const [lastSavedHash, setLastSavedHash] = useState(null);
    const [remoteUpdateDetected, setRemoteUpdateDetected] = useState(false);
    const baseVersionRef = useRef(item?.versionId ?? 0);

    useEffect(() => {
        if (!item?.isSharedDoc) return;
        const incoming = item?.versionId ?? 0;
        // Y.js handles merges in CRDT mode — version conflict banner is irrelevant
        if (!crdtEnabled && incoming > baseVersionRef.current && saveStatus !== 'saving') {
            setRemoteUpdateDetected(true);
        }
        baseVersionRef.current = incoming;
    }, [item?.versionId]);

    useEffect(() => {
        if (saveStatus === 'saving') setRemoteUpdateDetected(false);
    }, [saveStatus]);

    useEffect(() => {
        if (item) {
            setLastSavedHash(JSON.stringify({
                title: item.title || '', content: item.content || '', tags: item.tags || [],
                attachments: (item.attachments || []).map(a => { const { url, ...rest } = a; return rest; }),
                isPinned: item.isPinned || false, dueDate: item.dueDate || null, repeat: item.repeat || 'none'
            }));
        }
    }, [item.id]);

    // Ref to CodeMirrorEditor — lets applyFormat dispatch directly into the live view
    const cmRef = useRef(null);
    const scrollRef = useRef(null);
    const isCreatingRef = useRef(false);

    useEffect(() => {
        if (item?.id && item.id !== data.id) {
            setData(prev => ({ ...prev, id: item.id }));
            isCreatingRef.current = false;
        }
    }, [item?.id]);

    // Sync collaboration metadata silently without overwriting user edits
    useEffect(() => {
        if (item && (item.sharedId !== data.sharedId || item.memberUids?.length !== data.memberUids?.length)) {
            setData(prev => ({
                ...prev,
                sharedId: item.sharedId,
                docKey: item.docKey || prev.docKey,
                memberUids: item.memberUids || prev.memberUids
            }));
        }
    }, [item?.sharedId, item?.docKey, item?.memberUids?.length]);

    // CRDT: mirror remote Y.Text changes → React state (CodeMirror source mode)
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

    // CRDT: flush Y.Text content to Firestore every 30 s for non-CRDT readers
    useEffect(() => {
        if (!crdtEnabled) return;
        const id = setInterval(() => {
            const content = ytextRef.current?.toString();
            if (content !== undefined) onSave({ ...data, content });
        }, 30_000);
        return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crdtEnabled]);

    // CRDT: minimal delta → Y.Doc on user edits in CodeMirror source mode
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

    // Auto-Save
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
                const activeId = data.id || debouncedData.id || item?.id;
                if (!activeId && isCreatingRef.current) return;
                if (!activeId) isCreatingRef.current = true;

                // When CRDT is active, suppress content from auto-save — 30 s flush handles it
                const savePayload = crdtEnabled
                    ? { ...debouncedData, id: activeId, attachments: cleanAttachments, content: undefined, title: undefined }
                    : { ...debouncedData, id: activeId, attachments: cleanAttachments };
                Promise.resolve(onSave(savePayload)).then(() => {
                    setLastSavedHash(currentHash);
                }).catch(e => {
                    console.error("Auto-save failed", e);
                    isCreatingRef.current = false;
                });
            }
        }
    }, [debouncedData, lastSavedHash, onSave]);

    const formatAlertDate = (isoString) => {
        if (!isoString) return '';
        return new Date(isoString).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    };

    const getThumbnailIcon = (type) => {
        if (type.startsWith('video/')) return <PlayCircle size={20} className="text-blue-400" />;
        if (type.startsWith('audio/')) return <Music size={20} className="text-purple-400" />;
        return <FileText size={20} className="text-gray-400" />;
    };

    const handleRetry = () => {
        const cleanAttachments = data.attachments.map(({ url, ...rest }) => rest);
        onSave({ ...data, attachments: cleanAttachments });
    };

    // --- Format helper ---
    // Dispatches text transformations directly into the live CodeMirror view.
    // Called by both the toolbar buttons and the CM keyboard shortcut callbacks.
    const applyFormat = (type) => {
        const view = cmRef.current?.getView();
        if (!view) return;

        const state = view.state;
        const { from, to } = state.selection.main;
        const docStr = state.doc.toString();
        const selected = state.sliceDoc(from, to);

        // Line range for block-level formats
        const lineStart = docStr.lastIndexOf('\n', from - 1) + 1;
        const lineEndIdx = docStr.indexOf('\n', to);
        const lineEnd = lineEndIdx === -1 ? docStr.length : lineEndIdx;
        const lineText = docStr.substring(lineStart, lineEnd);

        // Block-level formats: replace the line range and return early
        const blockFormats = {
            heading: l => `## ${l}`,
            quote:   l => `> ${l}`,
            ul:      l => `- ${l}`,
            ol:      (l, i) => `${i + 1}. ${l}`,
        };

        if (blockFormats[type]) {
            const newLines = lineText.split('\n').map(blockFormats[type]).join('\n');
            view.dispatch({ changes: { from: lineStart, to: lineEnd, insert: newLines } });
            view.focus();
            return;
        }

        // Inline / insertion formats
        let insert, selFrom, selTo;

        if (type === 'bold') {
            const inner = selected || 'bold text';
            insert = `**${inner}**`;
            selFrom = from + 2; selTo = selFrom + inner.length;
        } else if (type === 'italic') {
            const inner = selected || 'italic text';
            insert = `*${inner}*`;
            selFrom = from + 1; selTo = selFrom + inner.length;
        } else if (type === 'code') {
            const inner = selected || 'code';
            insert = `\`${inner}\``;
            selFrom = from + 1; selTo = selFrom + inner.length;
        } else if (type === 'link') {
            const inner = selected || 'link text';
            insert = `[${inner}](url)`;
            selFrom = from + 1; selTo = selFrom + inner.length;
        } else if (type === 'hr') {
            insert = '\n---\n';
            selFrom = from + insert.length; selTo = selFrom;
        }

        if (insert !== undefined) {
            view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: selFrom, head: selTo },
            });
            view.focus();
        }
    };

    const ToolbarBtn = ({ onClick, title, children }) => (
        <button type="button" onMouseDown={(e) => { e.preventDefault(); onClick(); }} title={title}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors flex items-center justify-center">
            {children}
        </button>
    );

    const FormattingToolbar = () => (
        <div className="flex items-center gap-0.5 border-b border-gray-100 pb-2 flex-wrap">
            <ToolbarBtn onClick={() => applyFormat('bold')} title="Bold (Ctrl+B)"><Bold size={14} /></ToolbarBtn>
            <ToolbarBtn onClick={() => applyFormat('italic')} title="Italic (Ctrl+I)"><Italic size={14} /></ToolbarBtn>
            <ToolbarBtn onClick={() => applyFormat('heading')} title="Heading"><Heading2 size={14} /></ToolbarBtn>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <ToolbarBtn onClick={() => applyFormat('code')} title="Inline code"><Code size={14} /></ToolbarBtn>
            <ToolbarBtn onClick={() => applyFormat('quote')} title="Blockquote"><Quote size={14} /></ToolbarBtn>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <ToolbarBtn onClick={() => applyFormat('ul')} title="Bullet list"><List size={14} /></ToolbarBtn>
            <ToolbarBtn onClick={() => applyFormat('ol')} title="Numbered list"><ListOrdered size={14} /></ToolbarBtn>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <ToolbarBtn onClick={() => applyFormat('link')} title="Link (Ctrl+K)"><Link2 size={14} /></ToolbarBtn>
            <ToolbarBtn onClick={() => applyFormat('hr')} title="Horizontal rule"><Minus size={14} /></ToolbarBtn>
        </div>
    );

    return (
        <>
            <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; padding: 0; margin: 0; cursor: pointer; opacity: 0;
        }
        /* Ensure the CM editor fills its container */
        .cm-editor { height: 100%; }
        .cm-editor.cm-focused { outline: none; }
    `}</style>

            <div ref={scrollRef} className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
                <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col bg-white relative">

                    <div className="no-print sticky top-0 flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-30">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 flex-shrink-0"><ChevronLeft /></button>
                            <span className="font-bold text-gray-700 truncate text-sm sm:text-base max-w-[150px] sm:max-w-md">
                                {data.title || "Untitled"}
                            </span>
                        </div>

                        <div className="flex gap-2 items-center flex-shrink-0">
                            <PresenceDots users={presenceUsers} />
                            {saveStatus === 'error' ? (
                                <button onClick={handleRetry} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium mr-2 transition-colors hidden sm:flex">
                                    <AlertCircle size={13} /> Error · <RefreshCw size={11} /> Retry
                                </button>
                            ) : (
                                <span className="text-xs text-gray-400 mr-2 uppercase tracking-wider font-medium hidden sm:block">
                                    {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
                                </span>
                            )}

                            <button onClick={toggleSplitView} className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${isSplitView ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} title="Split view">
                                <Columns size={14} />
                            </button>

                            <button onClick={toggleWysiwyg} className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${editorMode === 'wysiwyg' ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} title="WYSIWYG mode">
                                <Type size={14} />
                            </button>

                            <button onClick={togglePreview} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${isPreviewMode ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                {isPreviewMode ? <><Edit2 size={14} /> Edit</> : <><Eye size={14} /> Preview</>}
                            </button>

                            <button onClick={() => window.print()} className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100" title="Print document">
                                <Printer size={20} />
                            </button>
                            <button onClick={() => onExport(data)} className="p-2 text-gray-400 hover:text-blue-500 rounded-full hover:bg-gray-100" title="Export Markdown">
                                <Download size={20} />
                            </button>
                            {onCollaborate && (
                                <button onClick={(e) => onCollaborate(e, data)} className={`p-2 rounded-full ${data.memberUids?.length > 0 ? 'bg-blue-50 text-blue-500' : 'text-gray-400 hover:bg-gray-100 hover:text-blue-500'}`} title="Collaborators">
                                    <Users size={20} />
                                </button>
                            )}
                            {canShare && <></>}
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

                    {/* Scrollable Content Container */}
                    <div className="flex-1 w-full">
                        <div className="p-6 md:p-10 flex flex-col gap-6 min-h-full">

                            {/* Meta Bar */}
                            <div className="flex flex-wrap gap-2 items-center text-xs">
                                {/* Date Pill */}
                                {data.dueDate ? (
                                    <div className="bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium group relative overflow-hidden">
                                        <Clock size={12} className="pointer-events-none" />
                                        <span className="pointer-events-none">{formatAlertDate(data.dueDate)}</span>
                                        <input type="datetime-local" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" value={data.dueDate ? data.dueDate.slice(0, 16) : ''} onChange={(e) => setData(s => ({ ...s, dueDate: e.target.value }))} />
                                        <button onClick={(e) => { e.stopPropagation(); setData(s => ({ ...s, dueDate: null, repeat: 'none' })) }} className="hover:text-red-500 z-20 relative"><X size={12} /></button>
                                    </div>
                                ) : (
                                    <div className="relative group">
                                        <div className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] cursor-pointer transition-colors"><Bell size={12} /> Add Alert</div>
                                        <input type="datetime-local" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={(e) => setData(s => ({ ...s, dueDate: e.target.value }))} />
                                    </div>
                                )}

                                {/* Repeat Pill */}
                                {data.dueDate && (
                                    <div className={`px-2.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium relative ${data.repeat !== 'none' ? 'bg-purple-50 text-purple-600' : 'text-gray-400 border border-dashed border-gray-300 hover:border-purple-400 hover:text-purple-500'}`}>
                                        <RotateCcw size={12} className="pointer-events-none" />
                                        <span className="pointer-events-none">{data.repeat === 'none' ? 'Repeat' : data.repeat}</span>
                                        <select value={data.repeat} onChange={(e) => setData(s => ({ ...s, repeat: e.target.value }))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none z-10">
                                            <option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
                                        </select>
                                    </div>
                                )}

                                {/* Tags */}
                                {data.tags.map((tag, i) => (
                                    <span key={i} className="bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-full flex items-center gap-1 font-medium">
                                        #{tag} <button onClick={() => setData(s => ({ ...s, tags: s.tags.filter((_, idx) => idx !== i) }))} className="hover:text-red-500"><X size={12} /></button>
                                    </span>
                                ))}
                                {isTagInputVisible && !readOnly ? (
                                    <input autoFocus placeholder="Tag..." className="px-3 py-1.5 rounded-full border border-[#4285f4] outline-none w-20 bg-transparent"
                                        onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { setData(s => ({ ...s, tags: [...s.tags, e.target.value.trim()] })); setIsTagInputVisible(false); } }}
                                        onBlur={() => setIsTagInputVisible(false)} />
                                ) : !readOnly && (
                                    <button onClick={() => setIsTagInputVisible(true)} className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] transition-colors"><Tag size={12} /> Tag</button>
                                )}

                                {/* Attach */}
                                {!readOnly && (
                                    <label className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-[#4285f4] hover:text-[#4285f4] cursor-pointer transition-colors">
                                        <Paperclip size={12} /> Attach
                                        <input type="file" className="hidden" onChange={async (e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;

                                            if (file.size > 50 * 1024 * 1024) {
                                                alert("File is too large. Maximum size is 50MB.");
                                                e.target.value = null;
                                                return;
                                            }

                                            try {
                                                const scope = data.sharedId ? `shared_docs/${data.sharedId}` : (item.workspaceId ? `workspaces/${item.workspaceId}/markdown` : `users/${user.uid}/markdown`);
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
                                            } catch (err) {
                                                console.error("Upload failed", err);
                                                alert(err.message);
                                            }

                                            e.target.value = null;
                                        }} />
                                    </label>
                                )}
                            </div>

                            {/* Attachment Thumbnails */}
                            {data.attachments.length > 0 && (
                                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                                    {data.attachments.map((att, i) => (
                                        <div key={i} onClick={async () => {
                                            if (att.data) {
                                                setViewingAttachment(att);
                                            } else if (att.driveFileId) {
                                                try {
                                                    const key = (data.isShared && data.docKey) ? data.docKey : cryptoKey;
                                                    const url = await downloadFromFirebase(att.driveFileId, key, null, 'markdown');
                                                    setViewingAttachment({ ...att, data: url });
                                                } catch (err) {
                                                    alert("Failed to decrypt file");
                                                }
                                            }
                                        }} className="group relative flex-shrink-0 w-16 bg-gray-50 rounded-lg border border-gray-100 flex flex-col items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-all pt-2 pb-1">
                                            <div className="w-full h-10 flex items-center justify-center">
                                                {att.data && att.type.startsWith('image/') ? <img src={att.data} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={att.name} /> : getThumbnailIcon(att.type)}
                                            </div>
                                            <span className="text-[9px] text-gray-400 truncate w-full text-center px-1 leading-tight">{att.name}</span>
                                            {!readOnly && <button onClick={(e) => { e.stopPropagation(); setData(s => ({ ...s, attachments: s.attachments.filter((_, idx) => idx !== i) })) }} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-1 shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"><X size={10} /></button>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Title Input */}
                            {isPreviewMode ? (
                                <h1 className="text-3xl font-bold text-gray-900 break-words">{data.title || 'Untitled'}</h1>
                            ) : (
                                <input
                                    value={data.title}
                                    onChange={(e) => setData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="Untitled"
                                    disabled={readOnly}
                                    className="w-full text-3xl font-bold text-gray-900 outline-none bg-transparent placeholder-gray-300 border-none disabled:opacity-80"
                                />
                            )}

                            {/* Formatting Toolbar — shown in source edit mode only; WYSIWYG has its own toolbar */}
                            {!isPreviewMode && !readOnly && !isSplitView && editorMode === 'source' && (
                                <div className="-mt-2">
                                    <FormattingToolbar />
                                </div>
                            )}

                            {/* Editor / Preview Body */}
                            {isSplitView ? (
                                <div className="flex gap-4 flex-1 min-h-[60vh]">
                                    {/* Edit pane */}
                                    <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100 pr-4">
                                        {!readOnly && (
                                            <div className="mb-3">
                                                <FormattingToolbar />
                                            </div>
                                        )}
                                        <CodeMirrorEditor
                                            ref={cmRef}
                                            value={data.content}
                                            onChange={handleContentChange}
                                            onShortcut={applyFormat}
                                            readOnly={readOnly}
                                            className="flex-1 min-h-[60vh]"
                                        />
                                    </div>
                                    {/* Preview pane */}
                                    <div className="flex-1 min-w-0 overflow-y-auto pb-32">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Preview</p>
                                        <MarkdownViewer content={data.content} />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 h-full">
                                    {isPreviewMode ? (
                                        <div className="min-h-[50vh] pb-32 animate-in fade-in duration-200">
                                            <MarkdownViewer content={data.content} />
                                        </div>
                                    ) : editorMode === 'wysiwyg' ? (
                                        <Suspense fallback={
                                            <div className="min-h-[60vh] bg-gray-50 rounded animate-pulse" />
                                        }>
                                            <WysiwygEditor
                                                content={data.content}
                                                onChange={(val) => setData(prev => ({ ...prev, content: val }))}
                                                readOnly={readOnly}
                                                ydoc={crdtEnabled ? ydocRef.current : null}
                                            />
                                        </Suspense>
                                    ) : (
                                        <CodeMirrorEditor
                                            ref={cmRef}
                                            value={data.content}
                                            onChange={handleContentChange}
                                            onShortcut={applyFormat}
                                            readOnly={readOnly}
                                            className="min-h-[60vh]"
                                        />
                                    )}
                                </div>
                            )}

                            {/* Word count footer */}
                            <div className="text-[10px] text-gray-300 text-right select-none pb-8">
                                {data.content.trim() ? data.content.trim().split(/\s+/).length : 0} words
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
