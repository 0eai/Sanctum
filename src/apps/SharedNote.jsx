import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import {
    FileText, AlertCircle, Loader, Tag, Paperclip, Download, Calendar, X, ZoomIn,
    FileCode, CheckSquare, ListChecks, Check, Circle
} from 'lucide-react';
import { db } from '../lib/firebase';
import { decryptData, keyFromUrlString } from '../lib/crypto';
import MarkdownViewer from '../components/ui/MarkdownViewer';

const SharedNote = () => {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [viewingImage, setViewingImage] = useState(null);

    useEffect(() => {
        const fetchNote = async () => {
            try {
                const hash = window.location.hash;
                const queryString = hash.includes('?') ? hash.split('?')[1] : '';
                const urlParams = new URLSearchParams(queryString);

                const docId = urlParams.get('id');
                const keyString = urlParams.get('k');

                if (!docId || !keyString) throw new Error("Invalid Link Parameters");

                const docRef = doc(db, 'shared_notes', docId);
                const snapshot = await getDoc(docRef);

                if (!snapshot.exists()) throw new Error("Note not found or deleted.");
                const snapshotData = snapshot.data();

                if (snapshotData.expiresAt && snapshotData.expiresAt.toDate() < new Date()) {
                    deleteDoc(docRef).catch(() => { });
                    throw new Error("This shared link has expired.");
                }

                const shareKey = await keyFromUrlString(keyString);
                const decrypted = await decryptData(snapshotData.data, shareKey);

                if (!decrypted) throw new Error("Decryption failed. Invalid Key.");

                setData(decrypted);
            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchNote();
    }, []);

    const downloadAttachment = (e, att) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = att.data;
        link.download = att.name || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return (
        <div className="h-[100dvh] flex items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-3">
                <Loader className="animate-spin text-blue-500" size={32} />
                <p className="text-gray-400 text-sm font-medium">Decrypting...</p>
            </div>
        </div>
    );

    if (error) return (
        <div className="h-[100dvh] flex flex-col items-center justify-center bg-white text-gray-600 p-6 text-center">
            <div className="bg-red-100 p-4 rounded-full mb-4 text-red-500"><AlertCircle size={32} /></div>
            <h2 className="text-xl font-bold text-gray-800">Unable to view content</h2>
            <p className="max-w-md mt-2 text-sm">{error}</p>
        </div>
    );

    const contentType = data.sharedType || 'note';

    const typeConfig = {
        note: { icon: FileText, label: 'Note', color: '#2563eb', bg: '#eff6ff' },
        markdown: { icon: FileCode, label: 'Markdown', color: '#7c3aed', bg: '#f3e8ff' },
        task: { icon: CheckSquare, label: 'Task', color: '#16a34a', bg: '#dcfce7' },
        checklist: { icon: ListChecks, label: 'Checklist', color: '#ea580c', bg: '#fff7ed' },
    };

    const config = typeConfig[contentType] || typeConfig.note;
    const TypeIcon = config.icon;

    return (
        <div className="min-h-[100dvh] bg-white font-sans">

            {/* Lightbox */}
            {viewingImage && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewingImage(null)}>
                    <button onClick={() => setViewingImage(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"><X size={24} /></button>
                    <img src={viewingImage.data} alt={viewingImage.name} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/50 px-4 py-2 rounded-full">{viewingImage.name}</div>
                </div>
            )}

            <div className="md:max-w-4xl mx-auto">
                {/* Header */}
                <header className="border-b border-gray-100 px-6 py-6 md:px-8">
                    <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-gray-500">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium" style={{ backgroundColor: config.bg, color: config.color }}>
                            <TypeIcon size={14} />
                            {config.label}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span>Shared via Sanctum</span>
                        {data.date && (
                            <>
                                <span className="text-gray-300">·</span>
                                <span className="flex items-center gap-1.5">
                                    <Calendar size={14} />
                                    {new Date(data.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                </span >
                            </>
                        )}
                    </div>

                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                        {data.title || "Untitled"}
                    </h1>

                    {data.tags && data.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {data.tags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    <Tag size={10} /> {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </header>

                {/* Content */}
                <div className="px-6 py-6 md:px-8">
                    {contentType === 'markdown' ? (
                        <MarkdownViewer content={data.content || ''} />
                    ) : contentType === 'task' ? (
                        <div className="space-y-4">
                            {data.dueDate && (
                                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg w-fit">
                                    <Calendar size={14} /> Due: {new Date(data.dueDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                </div>
                            )}
                            {data.notes && (
                                <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">{data.notes}</div>
                            )}
                            {data.subtasks && data.subtasks.length > 0 && (
                                <div className="space-y-2 mt-4">
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Subtasks</h3>
                                    {data.subtasks.map((st, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                                            {st.completed ? (
                                                <div className="w-5 h-5 rounded-md bg-green-500 flex items-center justify-center flex-shrink-0"><Check size={12} className="text-white" /></div>
                                            ) : (
                                                <Circle size={16} className="text-gray-300 flex-shrink-0" />
                                            )}
                                            <span className={`text-sm ${st.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{st.text || st.title}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : contentType === 'checklist' ? (
                        <div className="space-y-2">
                            {data.items && data.items.length > 0 ? (
                                data.items.map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                                        {item.completed ? (
                                            <div className="w-5 h-5 rounded-md bg-green-500 flex items-center justify-center flex-shrink-0">
                                                <Check size={12} className="text-white" />
                                            </div>
                                        ) : (
                                            <div className="w-5 h-5 rounded-md border-2 border-gray-300 flex-shrink-0" />
                                        )}
                                        <span className={`text-sm ${item.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.text}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-300 italic">No items in this checklist.</p>
                            )}
                            {data.progress !== undefined && (
                                <div className="mt-4 bg-gray-100 rounded-full h-2 overflow-hidden">
                                    <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${data.progress}%` }} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="prose prose-blue max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed text-lg">
                            {data.content || <span className="text-gray-300 italic">No text content.</span>}
                        </div>
                    )}
                </div>

                {/* Attachments */}
                {data.attachments && data.attachments.length > 0 && (
                    <div className="border-t border-gray-100 px-6 py-6 md:px-8">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Paperclip size={16} /> Attachments ({data.attachments.length})
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {data.attachments.map((att, i) => {
                                const isImage = att.type && att.type.startsWith('image/');
                                return (
                                    <div
                                        key={i}
                                        className={`group relative bg-gray-50 rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all ${isImage ? 'cursor-pointer' : ''}`}
                                        onClick={() => isImage && setViewingImage(att)}
                                    >
                                        <div className="aspect-square flex items-center justify-center bg-gray-100 relative">
                                            {isImage ? (
                                                <>
                                                    <img src={att.data} alt={att.name} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-all">
                                                        <ZoomIn className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" size={24} />
                                                    </div>
                                                </>
                                            ) : (
                                                <FileText size={40} className="text-gray-300" />
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <p className="text-xs font-medium text-gray-700 truncate" title={att.name}>{att.name}</p>
                                            <button
                                                onClick={(e) => downloadAttachment(e, att)}
                                                className="mt-2 w-full flex items-center justify-center gap-2 text-xs bg-blue-50 text-blue-600 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-semibold"
                                            >
                                                <Download size={12} /> Download
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="border-t border-gray-100 px-6 py-4 text-center text-xs text-gray-400">
                    End-to-end encrypted · Sanctum
                </div>
            </div>
        </div>
    );
};

export default SharedNote;