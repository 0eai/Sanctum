// src/components/ui/SharedDocsView.jsx
// Shows documents shared with the current user, grouped by owner, with role badges.
import { useState, useEffect } from 'react';
import { Users, FileText, FileCode, CheckSquare, ListChecks, BookmarkIcon, GraduationCap, ChevronRight } from 'lucide-react';
import { getDoc, doc } from 'firebase/firestore';
import { db, appId } from '../../lib/firebase';

const APP_ICONS = {
    notes: FileText,
    markdown: FileCode,
    tasks: CheckSquare,
    checklist: ListChecks,
    bookmarks: BookmarkIcon,
    research: GraduationCap
};

const APP_COLORS = {
    notes:     { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200' },
    markdown:  { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
    tasks:     { bg: 'bg-green-50',  text: 'text-green-600',  border: 'border-green-200' },
    checklist: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
    bookmarks: { bg: 'bg-pink-50',   text: 'text-pink-600',   border: 'border-pink-200' },
    research:  { bg: 'bg-teal-50',   text: 'text-teal-600',   border: 'border-teal-200' },
};

const ROLE_BADGE = {
    owner:  { label: 'Owner',  cls: 'bg-amber-100 text-amber-600' },
    editor: { label: 'Editor', cls: 'bg-green-100 text-green-600' },
    viewer: { label: 'Viewer', cls: 'bg-gray-100 text-gray-500' },
};

const SharedDocsView = ({ sharedDocs, onOpenDoc, appType, currentUserUid }) => {
    const [ownerNames, setOwnerNames] = useState({});

    useEffect(() => {
        if (!sharedDocs?.length) return;
        const uids = [...new Set(sharedDocs.map(d => d.ownerUid).filter(Boolean))];
        const missing = uids.filter(uid => uid !== currentUserUid && !(uid in ownerNames));
        if (!missing.length) return;

        Promise.all(missing.map(async uid => {
            try {
                const snap = await getDoc(doc(db, 'artifacts', appId, 'public_keys', uid));
                return [uid, snap.exists() ? (snap.data().displayName || snap.data().email || null) : null];
            } catch {
                return [uid, null];
            }
        })).then(results => {
            setOwnerNames(prev => {
                const next = { ...prev };
                results.forEach(([uid, name]) => { next[uid] = name; });
                return next;
            });
        });
    }, [sharedDocs, currentUserUid]);

    if (!sharedDocs || sharedDocs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Users size={40} className="mb-3 opacity-50" />
                <p className="text-sm font-medium">No shared documents</p>
                <p className="text-xs mt-1">Documents shared with you will appear here</p>
            </div>
        );
    }

    const colors = APP_COLORS[appType] || APP_COLORS.notes;
    const Icon = APP_ICONS[appType] || FileText;

    // Group by ownerUid
    const grouped = {};
    sharedDocs.forEach(doc => {
        const owner = doc.ownerUid || 'unknown';
        if (!grouped[owner]) grouped[owner] = [];
        grouped[owner].push(doc);
    });

    const ownerKeys = Object.keys(grouped);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
                <Users size={14} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Shared with you ({sharedDocs.length})
                </span>
            </div>

            {ownerKeys.map(ownerUid => {
                const docs = grouped[ownerUid];
                const isYou = ownerUid === currentUserUid;
                const resolvedName = ownerNames[ownerUid];
                const ownerLabel = isYou
                    ? 'Shared by you'
                    : resolvedName
                        ? `From ${resolvedName}`
                        : `From ${ownerUid.slice(0, 8)}…`;

                return (
                    <div key={ownerUid} className="space-y-2">
                        {ownerKeys.length > 1 && (
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                                {ownerLabel}
                            </p>
                        )}
                        {docs.map(doc => {
                            const role = doc.role || (doc.isOwner ? 'owner' : 'editor');
                            const badge = ROLE_BADGE[role] || ROLE_BADGE.editor;
                            return (
                                <button
                                    key={doc.id}
                                    onClick={() => onOpenDoc(doc)}
                                    className={`w-full text-left p-3 rounded-xl border ${colors.border} ${colors.bg} hover:shadow-md transition-all group`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-1.5 rounded-lg bg-white/60 ${colors.text}`}>
                                            <Icon size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-800 truncate">
                                                {doc.title || doc.name || 'Untitled'}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs text-gray-400">
                                                    {doc.memberUids?.length || 0} member{doc.memberUids?.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>
                                            {badge.label}
                                        </span>
                                        <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
};

export default SharedDocsView;
