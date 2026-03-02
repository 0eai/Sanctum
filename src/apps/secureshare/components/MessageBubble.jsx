// src/apps/secureshare/components/MessageBubble.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Flame, Lock, Check, CheckCheck, MoreVertical, Reply, Trash2,
    FileText, CheckSquare, Bookmark, CreditCard, ClipboardList, FileCode, BellRing, Key, Users
} from 'lucide-react';
import FileViewer from '../../../components/ui/FileViewer';

// Viewers
import NoteViewer from '../../../components/ui/viewers/NoteViewer';
import MarkdownDocViewer from '../../../components/ui/viewers/MarkdownDocViewer';
import TaskViewer from '../../../components/ui/viewers/TaskViewer';
import ChecklistViewer from '../../../components/ui/viewers/ChecklistViewer';
import ReminderViewer from '../../../components/ui/viewers/ReminderViewer';
import BookmarkViewer from '../../../components/ui/viewers/BookmarkViewer';
import WalletViewer from '../../../components/ui/viewers/WalletViewer';
import PasswordViewer from '../../../components/ui/viewers/PasswordViewer';
import ContactViewer from '../../../components/ui/viewers/ContactViewer';

const ARTIFACT_META = {
    notes: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Note' },
    markdown: { icon: FileCode, color: 'text-cyan-500', bg: 'bg-cyan-50', label: 'Markdown' },
    tasks: { icon: CheckSquare, color: 'text-green-500', bg: 'bg-green-50', label: 'Task' },
    checklists: { icon: ClipboardList, color: 'text-teal-500', bg: 'bg-teal-50', label: 'Checklist' },
    reminders: { icon: BellRing, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Reminder' },
    bookmarks: { icon: Bookmark, color: 'text-orange-500', bg: 'bg-orange-50', label: 'Bookmark' },
    banking: { icon: CreditCard, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Wallet' },
    passwords: { icon: Key, color: 'text-red-500', bg: 'bg-red-50', label: 'Password' },
    contacts: { icon: Users, color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'Contact' },
    drive_file: { icon: FileText, color: 'text-gray-500', bg: 'bg-gray-100', label: 'Drive File' }
};

const VIEWER_MAP = {
    notes: NoteViewer,
    markdown: MarkdownDocViewer,
    tasks: TaskViewer,
    checklists: ChecklistViewer,
    reminders: ReminderViewer,
    bookmarks: BookmarkViewer,
    banking: WalletViewer,
    passwords: PasswordViewer,
    contacts: ContactViewer,
};

import { downloadEncryptedFileBlob as downloadEncryptedFileBlobFirebase, downloadShareableFileBlob as downloadShareableFileBlobFirebase } from '../../../services/firebaseStorage';

const MessageBubble = ({ message, isMe, onImportArtifact, senderName, cryptoKey, onReply, onDelete, chatId }) => {
    const [displayedText, setDisplayedText] = useState("Decrypting...");
    const [viewerOpen, setViewerOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [viewingFile, setViewingFile] = useState(null);
    const [showContextMenu, setShowContextMenu] = useState(false);
    const longPressTimer = useRef(null);
    const bubbleRef = useRef(null);

    // Close context menu on outside click
    useEffect(() => {
        if (!showContextMenu) return;
        const handler = (e) => {
            if (bubbleRef.current && !bubbleRef.current.contains(e.target)) {
                setShowContextMenu(false);
            }
        };
        document.addEventListener('pointerdown', handler);
        return () => document.removeEventListener('pointerdown', handler);
    }, [showContextMenu]);

    // Long press handlers for mobile
    const onTouchStart = useCallback((e) => {
        longPressTimer.current = setTimeout(() => {
            setShowContextMenu(true);
        }, 500);
    }, []);

    const onTouchEnd = useCallback(() => {
        clearTimeout(longPressTimer.current);
    }, []);

    const ContextMenu = () => (
        <div className={`absolute z-50 ${isMe ? 'right-0' : 'left-0'} top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden min-w-[140px] animate-in fade-in zoom-in-95 duration-150`}>
            {onReply && (
                <button
                    onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); onReply(message); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                    <Reply size={15} className="text-blue-500" /> Reply
                </button>
            )}
            {onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); onDelete(message); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                    <Trash2 size={15} /> Delete
                </button>
            )}
        </div>
    );

    useEffect(() => {
        if (message.isDecrypted) {
            setDisplayedText(message.text);
        } else {
            setDisplayedText("Failed to decrypt");
        }
    }, [message]);

    // Self-destruct timer
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        if (!message.expiresAt) return;

        const updateTimer = () => {
            const now = new Date();
            const expiry = message.expiresAt.toDate();
            const diffMs = expiry - now;

            if (diffMs <= 0) {
                setTimeLeft("Expired");
                return;
            }

            const m = Math.floor(diffMs / 60000);
            const s = Math.floor((diffMs % 60000) / 1000);
            setTimeLeft(`${m}m ${s}s`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [message.expiresAt]);

    const timeString = (() => {
        try {
            return message.createdAt?.toDate()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';
        } catch {
            return '';
        }
    })();

    // Shared Artifact Card
    if (message.type === 'shared_artifact' && message.artifact && message.isDecrypted) {
        const artMeta = ARTIFACT_META[message.artifact.appType] || ARTIFACT_META.notes;
        const ArtIcon = artMeta.icon;
        const ViewerComponent = VIEWER_MAP[message.artifact.appType];

        return (
            <>
                <div className={`flex flex-col w-full mb-4 ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="relative group max-w-[85%] sm:max-w-[75%]" ref={bubbleRef}>
                        {/* Three-dot menu - desktop hover */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowContextMenu(v => !v); }}
                            className={`absolute top-1 ${isMe ? '-left-8' : '-right-8'} p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity z-10`}
                        >
                            <MoreVertical size={16} />
                        </button>
                        {showContextMenu && <ContextMenu />}
                        <div
                            className={`rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'} border ${isMe ? 'border-blue-200' : 'border-gray-200'} ${isDownloading ? 'opacity-50' : ''}`}
                            onTouchStart={onTouchStart}
                            onTouchEnd={onTouchEnd}
                            onTouchCancel={onTouchEnd}
                            onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(true); }}
                            onClick={async () => {
                                if (message.artifact.appType === 'drive_file') {
                                    if (isDownloading) return;
                                    setIsDownloading(true);
                                    try {
                                        let blob;
                                        if (message.artifact.fileKey) {
                                            // New per-file key approach (cross-user shareable)
                                            if (message.artifact.provider === 'firebase' || message.artifact.provider === 'drive') {
                                                blob = await downloadShareableFileBlobFirebase(message.artifact.data, message.artifact.fileKey, cryptoKey, chatId);
                                            }
                                        } else {
                                            // Legacy: encrypted with user's master key
                                            if (message.artifact.provider === 'firebase' || message.artifact.provider === 'drive') {
                                                blob = await downloadEncryptedFileBlobFirebase(message.artifact.data, cryptoKey, null, 'misc');
                                            }
                                        }
                                        const fileType = message.artifact.fileType || blob.type || 'application/octet-stream';
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                            setViewingFile({
                                                data: reader.result,
                                                name: message.artifact.sharedTitle || 'file',
                                                type: fileType
                                            });
                                        };
                                        reader.readAsDataURL(blob);
                                    } catch (e) {
                                        console.error("Failed to open file", e);
                                        alert("Failed to open file: " + e.message);
                                    } finally {
                                        setIsDownloading(false);
                                    }
                                } else {
                                    setViewerOpen(true);
                                }
                            }}
                        >
                            {/* Artifact Card */}
                            <div className={`p-3 ${isMe ? 'bg-blue-50' : 'bg-gray-50'}`}>
                                {/* Sender name for group chats */}
                                {senderName && !isMe && (
                                    <p className="text-xs font-semibold text-blue-600 mb-1.5">{senderName}</p>
                                )}
                                <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-xl ${artMeta.bg} flex-shrink-0`}>
                                        <ArtIcon size={20} className={artMeta.color} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{artMeta.label}</p>
                                        <p className="font-semibold text-gray-900 text-sm mt-0.5 break-words">
                                            {message.artifact.sharedTitle || 'Shared Item'}
                                        </p>
                                        {message.artifact.sharedPreview && (
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                {message.artifact.sharedPreview}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Caption text if present */}
                            {displayedText && (
                                <div className={`px-4 py-2 text-[15px] break-words whitespace-pre-wrap ${isMe ? 'bg-blue-500 text-white' : 'bg-white text-gray-800'}`}>
                                    {displayedText.startsWith('> ') ? (() => {
                                        const lines = displayedText.split('\n');
                                        const quoteLines = [];
                                        const restLines = [];
                                        let quoteDone = false;
                                        for (const line of lines) {
                                            if (!quoteDone && line.startsWith('> ')) {
                                                quoteLines.push(line.slice(2));
                                            } else {
                                                quoteDone = true;
                                                restLines.push(line);
                                            }
                                        }
                                        return (
                                            <>
                                                <div className={`border-l-2 ${isMe ? 'border-white/50 bg-white/15' : 'border-blue-400 bg-blue-50'} rounded-r-lg px-2.5 py-1 mb-1.5 text-[13px] ${isMe ? 'text-blue-100' : 'text-gray-500'}`}>
                                                    {quoteLines.join('\n')}
                                                </div>
                                                {restLines.join('\n').trim()}
                                            </>
                                        );
                                    })() : displayedText}
                                </div>
                            )}

                            {/* Tap hint */}
                            <div className={`text-center py-1.5 text-[10px] font-medium tracking-wide ${isMe ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'}`}>
                                {isDownloading ? 'LOADING...' : 'TAP TO VIEW'}
                            </div>

                            {/* Meta */}
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] ${isMe ? 'bg-blue-500 text-blue-100' : 'bg-gray-50 text-gray-400'} border-t ${isMe ? 'border-blue-400' : 'border-gray-100'}`}>
                                <Lock size={10} />
                                <span>{timeString}</span>
                                {message.expiresAt && (
                                    <div className="flex items-center gap-0.5 ml-2 bg-black/10 px-1.5 py-0.5 rounded-full">
                                        <Flame size={10} className={isMe ? 'text-orange-200' : 'text-orange-500'} />
                                        <span className="font-mono">{timeLeft}</span>
                                    </div>
                                )}
                                {isMe && (
                                    <span className="ml-auto">
                                        {Object.keys(message.readBy || {}).length > 0
                                            ? <CheckCheck size={14} className="text-cyan-200" />
                                            : <Check size={14} className="text-blue-200" />}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Viewer overlay */}
                {viewerOpen && ViewerComponent && (
                    <ViewerComponent
                        artifact={message.artifact}
                        isMe={isMe}
                        onClose={() => setViewerOpen(false)}
                        onImport={onImportArtifact ? (art) => { onImportArtifact(art); setViewerOpen(false); } : null}
                    />
                )}
                {viewingFile && (
                    <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} />
                )}
            </>
        );
    }

    // Standard Text Bubble
    return (
        <div className={`flex flex-col w-full mb-4 ${isMe ? 'items-end' : 'items-start'}`}>
            <div className="relative group max-w-[75%]" ref={bubbleRef}>
                {/* Three-dot menu - desktop hover */}
                <button
                    onClick={(e) => { e.stopPropagation(); setShowContextMenu(v => !v); }}
                    className={`absolute top-1 ${isMe ? '-left-8' : '-right-8'} p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity z-10`}
                >
                    <MoreVertical size={16} />
                </button>
                {showContextMenu && <ContextMenu />}
                <div
                    className={`flex flex-col px-4 py-2 rounded-2xl ${isMe
                        ? 'bg-blue-500 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                        }`}
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchEnd}
                    onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(true); }}
                >
                    {/* Sender name for group chats */}
                    {senderName && !isMe && (
                        <p className="text-xs font-semibold text-blue-600 mb-1">{senderName}</p>
                    )}
                    <div className="text-[15px] break-words whitespace-pre-wrap">
                        {displayedText && displayedText.startsWith('> ') ? (() => {
                            const lines = displayedText.split('\n');
                            const quoteLines = [];
                            const restLines = [];
                            let quoteDone = false;
                            for (const line of lines) {
                                if (!quoteDone && line.startsWith('> ')) {
                                    quoteLines.push(line.slice(2));
                                } else {
                                    quoteDone = true;
                                    restLines.push(line);
                                }
                            }
                            return (
                                <>
                                    <div className={`border-l-2 ${isMe ? 'border-white/50 bg-white/15' : 'border-blue-400 bg-blue-50'} rounded-r-lg px-2.5 py-1 mb-1.5 text-[13px] ${isMe ? 'text-blue-100' : 'text-gray-500'}`}>
                                        {quoteLines.join('\n')}
                                    </div>
                                    {restLines.join('\n').trim()}
                                </>
                            );
                        })() : displayedText}
                    </div>

                    <div className={`flex items-center gap-1.5 mt-1 text-[10px] ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                        <Lock size={10} />
                        <span>{timeString}</span>

                        {message.expiresAt && (
                            <div className="flex items-center gap-0.5 ml-2 bg-black/10 px-1.5 py-0.5 rounded-full">
                                <Flame size={10} className={isMe ? 'text-orange-200' : 'text-orange-500'} />
                                <span className="font-mono">{timeLeft}</span>
                            </div>
                        )}
                        {isMe && (
                            <span className="ml-auto">
                                {Object.keys(message.readBy || {}).length > 0
                                    ? <CheckCheck size={14} className="text-cyan-200" />
                                    : <Check size={14} className="text-blue-200" />}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;
