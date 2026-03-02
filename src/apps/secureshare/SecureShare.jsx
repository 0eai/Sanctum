import React, { useState, useEffect, useRef } from 'react';
import {
    initRSAKeys, listenToContacts as listenToChatUsers, listenToMessages, sendMessage,
    getChatId, getMyPrivateKey, getRecipientPublicKey,
    listenToGroups, getGroupKey, sendGroupMessage, listenToGroupMessages,
    importArtifact, createGroup, deleteExpiredMessages,
    listenToChatUnreadCount, markChatMessagesAsRead, deleteMessage
} from './services/secureshare';
import { listenToContacts as listenToMyContacts } from '../contacts/services/contacts';
import { appId } from '../../lib/firebase';
import { Send, Flame, Lock, User, ShieldCheck, ArrowLeft, Home, Plus, Users, Info, X, ChevronLeft, Reply, Phone, Video, PhoneOff, VideoOff, PhoneCall } from 'lucide-react';
import MessageBubble from './components/MessageBubble';
import CreateGroupModal from './components/CreateGroupModal';
import GroupInfoPanel from './components/GroupInfoPanel';
import ShareMenu from './components/ShareMenu';
import { uploadShareableFile as uploadToFirebaseShareable, deleteFirebaseFile } from '../../services/firebaseStorage';
import { useWebRTC } from './hooks/useWebRTC';

const SecureShare = ({ user, cryptoKey, onExit, route, navigate }) => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [groups, setGroups] = useState([]);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState("");
    const [isSelfDestruct, setIsSelfDestruct] = useState(true);
    const [privateKey, setPrivateKey] = useState(null);
    const [recipientPublicKey, setRecipientPublicKey] = useState(null);
    const [myPublicKey, setMyPublicKey] = useState(null);
    const [currentGroupKey, setCurrentGroupKey] = useState(null);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [sidebarTab, setSidebarTab] = useState('contacts');
    const [savedArtifactIds, setSavedArtifactIds] = useState(new Set());
    const [replyingTo, setReplyingTo] = useState(null);
    const messagesEndRef = useRef(null);
    const unreadDividerRef = useRef(null);
    const inputRef = useRef(null);
    const initialUnreadInfo = useRef(null); // { firstUnreadId, count } — snapshot when chat opens
    const [showUnreadDivider, setShowUnreadDivider] = useState(false);

    // --- WebRTC ---
    const {
        callState,
        incomingCallData,
        localStream,
        remoteStream,
        activeCallTarget,
        callUser,
        acceptCall,
        rejectCall,
        endCall
    } = useWebRTC(user?.uid, cryptoKey);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // --- URL-driven chat selection (defined after contacts) ---
    const chatType = route?.resource; // 'dm' or 'group'
    const chatTargetId = route?.resourceId;

    // --- Initialize RSA keys ---
    useEffect(() => {
        const initialize = async () => {
            if (!user || !cryptoKey) return;
            try {
                await initRSAKeys(user, cryptoKey);
                const privKey = await getMyPrivateKey(user.uid, cryptoKey);
                setPrivateKey(privKey);
                const myPub = await getRecipientPublicKey(user.uid);
                setMyPublicKey(myPub);
            } catch (err) {
                console.error("Failed to initialize keys", err);
            } finally {
                setIsInitializing(false);
            }
        };
        initialize();
    }, [user, cryptoKey]);

    // --- Listen to all chat users (public_keys) ---
    const [allChatUsers, setAllChatUsers] = useState([]);
    useEffect(() => {
        if (!user || isInitializing) return;
        return listenToChatUsers(user.uid, setAllChatUsers);
    }, [user, isInitializing]);

    // --- Listen to user's own contacts (contacts app) and filter chat users ---
    const [myContactEmails, setMyContactEmails] = useState(new Set());
    useEffect(() => {
        if (!user || !cryptoKey || isInitializing) return;
        return listenToMyContacts(user.uid, cryptoKey, (myContacts) => {
            const emails = new Set();
            myContacts.forEach(c => {
                (c.emails || []).forEach(e => {
                    if (e.value) emails.add(e.value.toLowerCase());
                });
            });
            setMyContactEmails(emails);
        });
    }, [user, cryptoKey, isInitializing]);

    // Filter: show only users whose email matches one in user's contacts
    const contacts = React.useMemo(() => {
        if (myContactEmails.size === 0) return [];
        return allChatUsers.filter(u => u.email && myContactEmails.has(u.email.toLowerCase()));
    }, [allChatUsers, myContactEmails]);

    // Now safe to use contacts — must be AFTER contacts declaration
    const selectedChat = React.useMemo(() => {
        if (!chatType || !chatTargetId) return null;
        if (chatType === 'group') {
            return groups.find(g => g.id === chatTargetId) || null;
        }
        return contacts.find(c => c.id === chatTargetId) || null;
    }, [chatType, chatTargetId, contacts, groups]);

    // --- Listen to groups ---
    useEffect(() => {
        if (!user || isInitializing) return;
        return listenToGroups(user.uid, setGroups);
    }, [user, isInitializing]);

    // --- Per-chat unread count listeners ---
    const [unreadCounts, setUnreadCounts] = useState({});
    useEffect(() => {
        if (!user || isInitializing) return;
        const unsubs = [];
        const allChats = [
            ...contacts.map(c => ({ id: c.id, path: ['artifacts', appId, 'chats', getChatId(user.uid, c.id), 'messages'], key: getChatId(user.uid, c.id) })),
            ...groups.map(g => ({ id: g.id, path: ['artifacts', appId, 'groups', g.id, 'messages'], key: g.id }))
        ];
        const counts = {};
        for (const chat of allChats) {
            const unsub = listenToChatUnreadCount(chat.path, user.uid, (count) => {
                counts[chat.key] = count;
                setUnreadCounts({ ...counts });
            });
            unsubs.push(unsub);
        }
        return () => unsubs.forEach(u => u());
    }, [user, isInitializing, contacts, groups]);

    // --- Listen to messages (1:1 or group) ---
    useEffect(() => {
        if (!user || !selectedChat) {
            setMessages([]);
            return;
        }

        let unsub = null;
        let cancelled = false;

        if (selectedChat.isGroup) {
            // Group chat
            const setupGroupChat = async () => {
                if (!privateKey) return;
                const gKey = await getGroupKey(selectedChat.id, user.uid, privateKey);
                if (cancelled) return; // Component unmounted or chat changed
                setCurrentGroupKey(gKey);
                if (gKey) {
                    unsub = listenToGroupMessages(selectedChat.id, gKey, user.uid, setMessages);
                }
            };
            setupGroupChat();
        } else {
            // 1:1 chat
            if (!privateKey) return;
            const setupDM = async () => {
                const pubKey = await getRecipientPublicKey(selectedChat.id);
                if (cancelled) return; // Component unmounted or chat changed
                setRecipientPublicKey(pubKey);
                const chatId = getChatId(user.uid, selectedChat.id);
                unsub = listenToMessages(chatId, user.uid, privateKey, cryptoKey, setMessages);
            };
            setupDM();
        }

        return () => {
            cancelled = true;
            if (unsub) unsub();
        };
    }, [user, selectedChat, privateKey, cryptoKey]);

    // --- Auto-scroll ---
    useEffect(() => {
        // Scroll to unread divider on first load, otherwise scroll to bottom
        if (unreadDividerRef.current) {
            unreadDividerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // --- Capture initial unread info when messages first load for a chat ---
    useEffect(() => {
        if (!selectedChat || messages.length === 0) return;
        // Only capture once per chat selection
        if (initialUnreadInfo.current?.chatId === (selectedChat.id)) return;

        const unread = messages.filter(m => m.senderId !== user.uid && !m.readBy?.[user.uid]);
        if (unread.length > 0) {
            initialUnreadInfo.current = {
                chatId: selectedChat.id,
                firstUnreadId: unread[0].id,
                count: unread.length
            };
            setShowUnreadDivider(true);
            // Auto-dismiss after 60 seconds
            const timer = setTimeout(() => setShowUnreadDivider(false), 60000);
            return () => clearTimeout(timer);
        } else {
            initialUnreadInfo.current = { chatId: selectedChat.id, firstUnreadId: null, count: 0 };
            setShowUnreadDivider(false);
        }
    }, [selectedChat, messages, user.uid]);

    // --- Send handler ---
    const handleSend = async (e, artifactToSend = null) => {
        e?.preventDefault?.();
        let text = inputText.trim();
        if (!text && !artifactToSend) return;
        if (!selectedChat) return;

        // Prepend reply context
        if (replyingTo) {
            const replyPreview = (replyingTo.text || replyingTo.artifact?.sharedTitle || 'Attachment').substring(0, 50);
            text = `> ${replyPreview}\n${text}`;
        }

        const expireMinutes = isSelfDestruct ? 1440 : null; // 24 hours
        setInputText("");
        setReplyingTo(null);
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }

        try {
            if (selectedChat.isGroup) {
                if (!currentGroupKey) return;
                await sendGroupMessage(selectedChat.id, user.uid, currentGroupKey, text, expireMinutes, artifactToSend);
            } else {
                if (!recipientPublicKey || !myPublicKey) return;
                const chatId = getChatId(user.uid, selectedChat.id);
                await sendMessage(chatId, user.uid, selectedChat.id, myPublicKey, recipientPublicKey, text, expireMinutes, artifactToSend);
            }
        } catch (e) {
            console.error("Failed to send message", e);
        }
    };

    // --- Select chat (navigate to URL) ---
    const handleSelectChat = (chat) => {
        setMessages([]);
        setCurrentGroupKey(null);
        setRecipientPublicKey(null);
        setIsSidebarOpen(false);
        const type = chat.isGroup ? 'group' : 'dm';
        navigate(`#secureshare/${type}/${chat.id}`);

        // Reset unread info for the new chat
        initialUnreadInfo.current = null;
        setShowUnreadDivider(false);

        // Mark messages as read after a short delay so the unread divider is visible
        const collPath = chat.isGroup
            ? ['artifacts', appId, 'groups', chat.id, 'messages']
            : ['artifacts', appId, 'chats', getChatId(user.uid, chat.id), 'messages'];
        setTimeout(() => markChatMessagesAsRead(collPath, user.uid), 1500);
    };

    const handleBack = () => {
        navigate('#secureshare');
    };

    // --- Create group ---
    const handleCreateGroup = async (name, memberUids) => {
        try {
            const allMembers = [...memberUids, user.uid];
            await createGroup(name, allMembers, user.uid);
            setShowCreateGroup(false);
        } catch (e) {
            console.error("Failed to create group:", e);
            alert("Failed to create group");
        }
    };

    // --- Import artifact (tracks saved IDs) ---
    const handleImportArtifact = async (artifact) => {
        try {
            const docId = await importArtifact(user.uid, cryptoKey, artifact);
            setSavedArtifactIds(prev => new Set(prev).add(artifact.sharedTitle + ':' + artifact.appType));
            alert("Saved to your " + (artifact.appType || "collection") + "!");
        } catch (e) {
            console.error("Failed to import artifact:", e);
            alert("Failed to save item");
        }
    };

    // --- Share artifact ---
    const handleShareArtifact = (artifact) => {
        handleSend(null, artifact);
    };

    if (isInitializing) {
        return (
            <div className="h-[100dvh] flex flex-col items-center justify-center bg-white text-gray-500 gap-3">
                <ShieldCheck size={36} className="text-blue-400 animate-pulse" />
                <p className="text-sm">Initializing E2EE Keys...</p>
            </div>
        );
    }

    const chatList = sidebarTab === 'groups' ? groups : contacts;

    return (
        <div className="flex h-[100dvh] bg-white overflow-hidden relative">

            {/* === MOBILE SIDEBAR BACKDROP === */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-30 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* === SIDEBAR / CONTACT LIST === */}
            <div className={`
                flex flex-col bg-gray-50 border-r border-gray-200 flex-shrink-0
                transition-transform duration-300
                ${!selectedChat
                    ? 'relative w-full md:w-80'
                    : `fixed inset-y-0 left-0 z-40 w-80 md:relative md:z-auto ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`
                }
            `}>
                {/* Sidebar Header */}
                <div className="p-4 border-b border-gray-200 bg-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={onExit}
                                className="p-2 -ml-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                title="Back to Launcher"
                            >
                                <ChevronLeft size={22} />
                            </button>
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <ShieldCheck size={22} className="text-blue-600" />
                                Chat
                            </h2>
                        </div>
                        <button
                            onClick={() => setShowCreateGroup(true)}
                            className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                            title="New Group"
                        >
                            <Users size={18} />
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 pl-9">
                        <Lock size={10} /> End-to-End Encrypted
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 bg-white">
                    <button
                        onClick={() => setSidebarTab('contacts')}
                        className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${sidebarTab === 'contacts' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Contacts
                    </button>
                    <button
                        onClick={() => setSidebarTab('groups')}
                        className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${sidebarTab === 'groups' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Groups {groups.length > 0 && <span className="ml-1 bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full text-[10px]">{groups.length}</span>}
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                    {chatList.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400">
                            {sidebarTab === 'groups' ? (
                                <>
                                    <Users size={32} className="mx-auto mb-2 text-gray-300" />
                                    No groups yet. Create one!
                                </>
                            ) : (
                                <>
                                    <User size={32} className="mx-auto mb-2 text-gray-300" />
                                    No other users found.
                                </>
                            )}
                        </div>
                    ) : (
                        chatList.map(c => (
                            <button
                                key={c.id}
                                onClick={() => handleSelectChat(c)}
                                className={`w-full text-left p-4 flex items-center gap-3 border-b border-gray-100 transition-colors ${selectedChat?.id === c.id
                                    ? 'bg-blue-50 border-l-4 border-l-blue-500'
                                    : 'hover:bg-gray-100 border-l-4 border-l-transparent'
                                    }`}
                            >
                                {c.isGroup ? (
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                                        <Users size={20} />
                                    </div>
                                ) : c.photoURL ? (
                                    <img src={c.photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-lg">
                                        {(c.displayName || c.name)?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                )}
                                <div className="flex-1 overflow-hidden">
                                    <h3 className="font-semibold text-gray-900 truncate">{c.displayName || c.name}</h3>
                                    <p className="text-xs text-gray-400 truncate">
                                        {c.isGroup ? `${c.memberUids?.length || 0} members` : c.email}
                                    </p>
                                </div>
                                {(() => {
                                    const chatKey = c.isGroup ? c.id : getChatId(user.uid, c.id);
                                    const count = unreadCounts[chatKey] || 0;
                                    return count > 0 ? (
                                        <span className="bg-blue-600 text-white text-[11px] font-bold min-w-[22px] h-[22px] flex items-center justify-center rounded-full px-1.5 flex-shrink-0">
                                            {count > 99 ? '99+' : count}
                                        </span>
                                    ) : null;
                                })()}
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* === MAIN CHAT AREA === */}
            <div className={`
                flex-1 flex flex-col bg-white min-w-0
                ${selectedChat ? 'flex' : 'hidden md:flex'}
            `}>
                {!selectedChat ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                        <ShieldCheck size={48} className="mb-4 text-gray-200" />
                        <p className="text-lg font-semibold text-gray-500">Chat</p>
                        <p className="text-sm mt-1">Select a contact or group to start an encrypted conversation.</p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="h-16 border-b border-gray-200 flex items-center px-4 bg-white shrink-0 gap-3">
                            <button
                                onClick={handleBack}
                                className="p-2 -ml-1 rounded-full hover:bg-gray-100 text-gray-500 transition-colors md:hidden"
                            >
                                <ArrowLeft size={22} />
                            </button>
                            {/* Desktop hamburger to toggle sidebar */}
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className="p-2 -ml-1 rounded-full hover:bg-gray-100 text-gray-500 transition-colors hidden md:block"
                            >
                                <ArrowLeft size={20} />
                            </button>

                            {selectedChat.isGroup ? (
                                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                                    <Users size={18} />
                                </div>
                            ) : selectedChat.photoURL ? (
                                <img src={selectedChat.photoURL} alt="" className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                    {(selectedChat.displayName || selectedChat.name)?.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <h2 className="font-bold text-gray-900 truncate">{selectedChat.displayName || selectedChat.name}</h2>
                                <div className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                                    <Lock size={9} />
                                    {selectedChat.isGroup ? 'AES-GCM Group Encrypted' : 'RSA-OAEP / AES-GCM Secured'}
                                </div>
                            </div>
                            {selectedChat.isGroup && (
                                <button
                                    onClick={() => setShowGroupInfo(true)}
                                    className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                                >
                                    <Info size={20} />
                                </button>
                            )}
                            {!selectedChat.isGroup && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => callUser(selectedChat.id, false)}
                                        className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                                        title="Audio Call"
                                    >
                                        <Phone size={18} />
                                    </button>
                                    <button
                                        onClick={() => callUser(selectedChat.id, true)}
                                        className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                                        title="Video Call"
                                    >
                                        <Video size={18} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-1 overflow-y-auto p-4 bg-[#f5f6f8]">
                            <div className="flex flex-col justify-end min-h-full max-w-2xl mx-auto">
                                <div className="text-center text-[11px] text-gray-400 mb-6 bg-white border border-gray-100 rounded-xl p-3 mx-auto">
                                    <Lock size={12} className="inline mb-0.5 mr-1" />
                                    {selectedChat.isGroup
                                        ? 'Messages are encrypted with a shared group key. Only members can read them.'
                                        : `Messages are end-to-end encrypted. Only you and ${selectedChat.displayName || selectedChat.name} can read them.`
                                    }
                                </div>
                                {(() => {
                                    // Build messages with date separators and unread divider
                                    const elements = [];
                                    let lastDateStr = '';
                                    let unreadDividerShown = false;

                                    const formatDateLabel = (date) => {
                                        const now = new Date();
                                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                        const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                                        const diffDays = Math.round((today - msgDate) / 86400000);

                                        if (diffDays === 0) return 'Today';
                                        if (diffDays === 1) return 'Yesterday';
                                        if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
                                        return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                                    };

                                    for (const msg of messages) {
                                        // Date separator
                                        try {
                                            const msgDate = msg.createdAt?.toDate?.();
                                            if (msgDate) {
                                                const dateStr = msgDate.toDateString();
                                                if (dateStr !== lastDateStr) {
                                                    lastDateStr = dateStr;
                                                    elements.push(
                                                        <div key={`date-${dateStr}`} className="flex items-center gap-3 my-4">
                                                            <div className="flex-1 h-px bg-gray-200" />
                                                            <span className="text-[11px] font-medium text-gray-400 bg-[#f5f6f8] px-3 py-1 rounded-full">
                                                                {formatDateLabel(msgDate)}
                                                            </span>
                                                            <div className="flex-1 h-px bg-gray-200" />
                                                        </div>
                                                    );
                                                }
                                            }
                                        } catch (e) { }

                                        // Unread divider — show before first unread message (persists for 1 minute)
                                        if (!unreadDividerShown && showUnreadDivider && initialUnreadInfo.current?.firstUnreadId && msg.id === initialUnreadInfo.current.firstUnreadId) {
                                            unreadDividerShown = true;
                                            const unreadCount = initialUnreadInfo.current.count;
                                            elements.push(
                                                <div key="unread-divider" ref={unreadDividerRef} className="flex items-center gap-3 my-3">
                                                    <div className="flex-1 h-px bg-blue-400" />
                                                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                                                        {unreadCount} Unread {unreadCount === 1 ? 'Message' : 'Messages'}
                                                    </span>
                                                    <div className="flex-1 h-px bg-blue-400" />
                                                </div>
                                            );
                                        }

                                        // Message bubble
                                        const artKey = msg.artifact ? (msg.artifact.sharedTitle + ':' + msg.artifact.appType) : null;
                                        const alreadySaved = artKey ? savedArtifactIds.has(artKey) : false;
                                        elements.push(
                                            <MessageBubble
                                                key={msg.id}
                                                message={msg}
                                                isMe={msg.senderId === user.uid}
                                                cryptoKey={cryptoKey}
                                                chatId={selectedChat.isGroup ? selectedChat.id : getChatId(user.uid, selectedChat.id)}
                                                onImportArtifact={alreadySaved ? null : handleImportArtifact}
                                                senderName={selectedChat.isGroup ? contacts.find(c => c.id === msg.senderId)?.displayName || (msg.senderId === user.uid ? 'You' : 'Unknown') : null}
                                                onReply={(msg) => {
                                                    setReplyingTo(msg);
                                                    inputRef.current?.focus();
                                                }}
                                                onDelete={async (msg) => {
                                                    if (!confirm('Delete this message?')) return;
                                                    try {
                                                        // Delete Drive file if this is a drive_file artifact
                                                        if (msg.artifact?.appType === 'drive_file' && msg.artifact?.data) {
                                                            const chatId = selectedChat.isGroup ? selectedChat.id : getChatId(user.uid, selectedChat.id);
                                                            await deleteFirebaseFile(msg.artifact.data, `secureshare/${chatId}`);
                                                        }
                                                        const chatOrGroupId = selectedChat.isGroup ? selectedChat.id : getChatId(user.uid, selectedChat.id);
                                                        await deleteMessage(chatOrGroupId, msg.id, selectedChat.isGroup);
                                                    } catch (e) {
                                                        console.error('Failed to delete message', e);
                                                        alert('Failed to delete message.');
                                                    }
                                                }}
                                            />
                                        );
                                    }
                                    return elements;
                                })()}
                                <div ref={messagesEndRef} />
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="p-3 bg-white border-t border-gray-200 shrink-0" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
                            {replyingTo && (
                                <div className="flex items-center gap-2 mb-2 px-1 max-w-2xl mx-auto">
                                    <div className="flex-1 flex items-center gap-2 bg-blue-50 border-l-3 border-blue-500 rounded-lg px-3 py-1.5 min-w-0">
                                        <Reply size={14} className="text-blue-500 flex-shrink-0" />
                                        <p className="text-xs text-gray-600 truncate">
                                            {replyingTo.text || replyingTo.artifact?.sharedTitle || 'Attachment'}
                                        </p>
                                    </div>
                                    <button onClick={() => setReplyingTo(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                            {isSelfDestruct && (
                                <div className="flex items-center gap-1.5 text-xs text-orange-500 mb-1.5 pl-1">
                                    <Flame size={12} className="animate-pulse" />
                                    Auto-deletes in 24h
                                </div>
                            )}
                            <form onSubmit={handleSend} className="flex items-end gap-1.5 max-w-2xl mx-auto">
                                {/* App Share "+" button */}
                                <button
                                    type="button"
                                    onClick={() => setShowShareMenu(true)}
                                    className="p-3 rounded-2xl bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors flex-shrink-0"
                                    title="Share from apps"
                                >
                                    <Plus size={20} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setIsSelfDestruct(!isSelfDestruct)}
                                    className={`p-3 rounded-2xl transition-colors flex-shrink-0 ${isSelfDestruct
                                        ? 'bg-orange-100 text-orange-600'
                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        }`}
                                    title="Toggle self-destruct (24h)"
                                >
                                    <Flame size={20} />
                                </button>
                                <textarea
                                    ref={inputRef}
                                    className="flex-1 bg-gray-100 rounded-2xl py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500 resize-none text-[15px] leading-relaxed"
                                    rows={1}
                                    placeholder="Message…"
                                    value={inputText}
                                    onChange={(e) => {
                                        setInputText(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend(e);
                                        }
                                    }}
                                    style={{ minHeight: '48px' }}
                                />
                                <button
                                    type="submit"
                                    disabled={!inputText.trim()}
                                    className="p-3 bg-blue-600 text-white rounded-2xl flex-shrink-0 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Send size={20} />
                                </button>
                            </form>
                        </div>
                    </>
                )}
            </div>

            {/* === MODALS === */}
            {showCreateGroup && (
                <CreateGroupModal
                    contacts={contacts}
                    onClose={() => setShowCreateGroup(false)}
                    onCreate={handleCreateGroup}
                />
            )}

            {showGroupInfo && selectedChat?.isGroup && (
                <GroupInfoPanel
                    group={selectedChat}
                    contacts={allChatUsers}
                    currentUser={user}
                    groupKey={currentGroupKey}
                    onClose={() => setShowGroupInfo(false)}
                />
            )}

            {showShareMenu && (
                <ShareMenu
                    user={user}
                    cryptoKey={cryptoKey}
                    onClose={() => setShowShareMenu(false)}
                    onShare={handleShareArtifact}
                    onFileUpload={async (file) => {
                        if (file.size > 50 * 1024 * 1024) {
                            alert("File is too large. Maximum size is 50MB.");
                            return;
                        }

                        try {
                            const chatId = selectedChat.isGroup
                                ? selectedChat.id
                                : getChatId(user.uid, selectedChat.id);

                            const res = await uploadToFirebaseShareable(file, cryptoKey, null, chatId);
                            const fileId = res.id;
                            const fileKey = res.encryptedKey;

                            const artifact = {
                                appType: 'drive_file',
                                data: fileId,
                                fileKey: fileKey,
                                provider: 'firebase',
                                sharedTitle: file.name,
                                sharedPreview: `${(file.size / 1024).toFixed(0)} KB`,
                                fileType: file.type
                            };
                            await handleSend(null, artifact);
                        } catch (e) {
                            console.error("SecureShare Upload failed", e);
                            alert(e.message);
                        }
                    }}
                />
            )}

            {/* --- WEBRTC CALL OVERLAYS --- */}
            {callState === 'INCOMING' && incomingCallData && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-sm mx-4 text-center shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                            <PhoneCall size={32} className="text-blue-600 animate-pulse" />
                            <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-20"></div>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-1">Incoming Call</h2>
                        <p className="text-sm text-gray-500 mb-8">
                            {contacts.find(c => c.id === incomingCallData.from)?.displayName || 'Someone'} is calling you.
                        </p>
                        <div className="flex justify-center gap-4">
                            <button
                                onClick={rejectCall}
                                className="flex-1 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                            >
                                <PhoneOff size={18} /> Decline
                            </button>
                            <button
                                onClick={() => acceptCall(true)}
                                className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-200"
                            >
                                <Phone size={18} className="animate-bounce" /> Accept
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(callState === 'CALLING' || callState === 'CONNECTED') && (
                <div className="fixed inset-4 md:inset-10 z-[90] bg-gray-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col pointer-events-auto border border-gray-800">
                    {/* Call Header */}
                    <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex justify-between items-start z-10">
                        <div className="text-white drop-shadow-md">
                            <h3 className="font-bold text-lg">{contacts.find(c => c.id === activeCallTarget)?.displayName || 'Contact'}</h3>
                            <p className="text-sm text-gray-200 opacity-90 tracking-wide font-medium">
                                {callState === 'CALLING' ? 'Calling...' : 'Connected • E2E Encrypted'}
                            </p>
                        </div>
                    </div>

                    {/* Video Area */}
                    <div className="flex-1 relative bg-black flex items-center justify-center">
                        {remoteStream ? (
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center">
                                <User size={48} className="text-gray-600" />
                            </div>
                        )}

                        {/* Local PIP Video */}
                        <div className="absolute bottom-24 right-4 md:bottom-20 md:right-8 w-24 h-36 md:w-32 md:h-48 bg-gray-800 rounded-xl overflow-hidden border-2 border-gray-700 shadow-xl z-20">
                            {localStream ? (
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover transform -scale-x-100"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                    <VideoOff size={24} className="text-gray-700" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Call Controls */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex justify-center items-center gap-6 z-10 pb-8 md:pb-6">
                        <button
                            onClick={endCall}
                            className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105"
                        >
                            <PhoneOff size={24} />
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default SecureShare;
