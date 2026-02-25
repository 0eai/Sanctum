// src/apps/secureshare/components/MessageBubble.jsx
import React, { useState, useEffect } from 'react';
import {
    Flame, Lock, Check, CheckCheck,
    FileText, CheckSquare, Bookmark, CreditCard, ClipboardList, FileCode, BellRing, Key, Users
} from 'lucide-react';

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

const MessageBubble = ({ message, isMe, onImportArtifact, senderName }) => {
    const [displayedText, setDisplayedText] = useState("Decrypting...");
    const [viewerOpen, setViewerOpen] = useState(false);

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
                    <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'} border ${isMe ? 'border-blue-200' : 'border-gray-200'}`}
                        onClick={() => setViewerOpen(true)}
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
                                {displayedText}
                            </div>
                        )}

                        {/* Tap hint */}
                        <div className={`text-center py-1.5 text-[10px] font-medium tracking-wide ${isMe ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'}`}>
                            TAP TO VIEW
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

                {/* Viewer overlay */}
                {viewerOpen && ViewerComponent && (
                    <ViewerComponent
                        artifact={message.artifact}
                        isMe={isMe}
                        onClose={() => setViewerOpen(false)}
                        onImport={onImportArtifact ? (art) => { onImportArtifact(art); setViewerOpen(false); } : null}
                    />
                )}
            </>
        );
    }

    // Standard Text Bubble
    return (
        <div className={`flex flex-col w-full mb-4 ${isMe ? 'items-end' : 'items-start'}`}>
            <div className={`flex flex-col max-w-[75%] px-4 py-2 rounded-2xl ${isMe
                ? 'bg-blue-500 text-white rounded-br-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                {/* Sender name for group chats */}
                {senderName && !isMe && (
                    <p className="text-xs font-semibold text-blue-600 mb-1">{senderName}</p>
                )}
                <div className="text-[15px] break-words whitespace-pre-wrap">
                    {displayedText}
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
    );
};

export default MessageBubble;
