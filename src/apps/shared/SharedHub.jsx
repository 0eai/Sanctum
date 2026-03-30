// src/apps/shared/SharedHub.jsx
// Global "Shared With Me" hub — all per-doc collaborations across every app type.
// Session 13: added owner-based "By Person" grouping, owner name resolution,
// unread dot indicators, search, and a "By Person / By App" view toggle.

import { useState, useEffect, useMemo } from 'react';
import {
    ChevronLeft, FileText, CheckSquare, Bookmark, StickyNote, FlaskConical,
    AlignLeft, Clock, Users, LayoutGrid, Search, Circle,
} from 'lucide-react';
import { getDoc, doc } from 'firebase/firestore';
import { db, appId } from '../../lib/firebase';
import { listenToAllSharedDocs } from '../../services/collaboration';
import { getMyPrivateKey } from '../secureshare/services/secureshare';

// ─── Constants ────────────────────────────────────────────────────────────────

const APP_META = {
    notes:     { label: 'Notes',     Icon: StickyNote,   color: 'text-yellow-500', bg: 'bg-yellow-50',  getUrl: (id) => `#notes/doc/${id}/edit` },
    markdown:  { label: 'Markdown',  Icon: AlignLeft,    color: 'text-blue-500',   bg: 'bg-blue-50',    getUrl: (id) => `#markdown/doc/${id}` },
    research:  { label: 'Research',  Icon: FlaskConical, color: 'text-purple-500', bg: 'bg-purple-50',  getUrl: (id) => `#research/paper/${id}` },
    tasks:     { label: 'Tasks',     Icon: CheckSquare,  color: 'text-green-500',  bg: 'bg-green-50',   getUrl: (id) => `#tasks/inbox?edit=${id}` },
    bookmarks: { label: 'Bookmarks', Icon: Bookmark,     color: 'text-orange-500', bg: 'bg-orange-50',  getUrl: (id) => `#bookmarks?view=${id}` },
    checklist: { label: 'Checklist', Icon: CheckSquare,  color: 'text-teal-500',   bg: 'bg-teal-50',    getUrl: (id) => `#checklist/list/${id}` },
    default:   { label: 'Document',  Icon: FileText,     color: 'text-gray-500',   bg: 'bg-gray-50',    getUrl: ()    => null },
};

const ROLE_BADGE = {
    owner:  { label: 'Owner',  cls: 'bg-indigo-100 text-indigo-600' },
    editor: { label: 'Editor', cls: 'bg-green-100  text-green-600'  },
    viewer: { label: 'Viewer', cls: 'bg-gray-100   text-gray-500'   },
};

const LS_LAST_SEEN = 'sanctum_shared_last_seen';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toDate = (val) => {
    if (!val) return null;
    if (val?.toDate)   return val.toDate();         // Firestore Timestamp
    if (val?.toMillis) return new Date(val.toMillis());
    const d = new Date(val);
    return isNaN(d) ? null : d;
};

const relativeTime = (val) => {
    const d = toDate(val);
    if (!d) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 60_000)     return 'just now';
    if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
};

// ─── Component ────────────────────────────────────────────────────────────────

const SharedHub = ({ user, cryptoKey, onExit, navigate }) => {
    const [docs,        setDocs]        = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [filter,      setFilter]      = useState('all');       // appType filter pill
    const [groupMode,   setGroupMode]   = useState('person');    // 'person' | 'app'
    const [searchQuery, setSearchQuery] = useState('');
    const [ownerNames,  setOwnerNames]  = useState({});          // uid → display name
    const [lastSeenAt,  setLastSeenAt]  = useState(null);        // Date | null

    // ── Side effects ──────────────────────────────────────────────────────────

    // Clear the new-share launcher badge; record last-seen timestamp on leave
    useEffect(() => {
        localStorage.removeItem('sanctum_new_shares');
        window.dispatchEvent(new CustomEvent('sanctum_new_shares'));

        const ts = localStorage.getItem(LS_LAST_SEEN);
        setLastSeenAt(ts ? new Date(ts) : null);

        return () => {
            localStorage.setItem(LS_LAST_SEEN, new Date().toISOString());
        };
    }, []);

    // Subscribe to all shared docs
    useEffect(() => {
        if (!user || !cryptoKey) return;
        let unsub;
        getMyPrivateKey(user.uid, cryptoKey).then(privateKey => {
            if (!privateKey) { setLoading(false); return; }
            unsub = listenToAllSharedDocs(user.uid, privateKey, (incoming) => {
                setDocs(incoming);
                setLoading(false);
            });
        });
        return () => unsub?.();
    }, [user, cryptoKey]);

    // Resolve owner display names from public_keys
    useEffect(() => {
        if (!docs.length) return;
        const uids = [...new Set(docs.map(d => d.ownerUid).filter(u => u && u !== user?.uid))];
        const missing = uids.filter(uid => !(uid in ownerNames));
        if (!missing.length) return;

        Promise.all(missing.map(async uid => {
            try {
                const snap = await getDoc(doc(db, 'artifacts', appId, 'public_keys', uid));
                return [uid, snap.exists()
                    ? (snap.data().displayName || snap.data().email || null)
                    : null];
            } catch {
                return [uid, null];
            }
        })).then(pairs => setOwnerNames(prev => {
            const next = { ...prev };
            pairs.forEach(([uid, name]) => { next[uid] = name; });
            return next;
        }));
    }, [docs, user?.uid]);

    // ── Derived data ──────────────────────────────────────────────────────────

    const appTypeFilter = filter === 'all' ? docs : docs.filter(d => d.appType === filter);

    const q = searchQuery.trim().toLowerCase();
    const searched = q
        ? appTypeFilter.filter(d =>
            (d.title || '').toLowerCase().includes(q) ||
            (ownerNames[d.ownerUid] || '').toLowerCase().includes(q))
        : appTypeFilter;

    // "By Person" — primary key ownerUid, groups sorted by most-recent doc
    const groupsByPerson = useMemo(() => {
        const map = {};
        searched.forEach(d => {
            const key = d.ownerUid || 'unknown';
            if (!map[key]) map[key] = [];
            map[key].push(d);
        });
        Object.values(map).forEach(arr =>
            arr.sort((a, b) => (toDate(b.updatedAt) ?? 0) - (toDate(a.updatedAt) ?? 0))
        );
        return Object.entries(map).sort(([, a], [, b]) =>
            (toDate(b[0]?.updatedAt) ?? 0) - (toDate(a[0]?.updatedAt) ?? 0)
        );
    }, [searched]);

    // "By App" — existing behaviour, sorted alphabetically by appType
    const groupsByApp = useMemo(() => {
        const map = {};
        searched.forEach(d => {
            const key = d.appType || 'default';
            if (!map[key]) map[key] = [];
            map[key].push(d);
        });
        return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    }, [searched]);

    const filterOptions = useMemo(() =>
        ['all', ...new Set(docs.map(d => d.appType || 'default'))].filter(Boolean),
    [docs]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleOpen = (item) => {
        const meta = APP_META[item.appType] || APP_META.default;
        const url  = meta.getUrl(item.id);
        if (url) navigate(url);
    };

    const ownerLabel = (ownerUid) => {
        if (!ownerUid || ownerUid === user?.uid) return 'Shared by you';
        const name = ownerNames[ownerUid];
        return name ? `From ${name}` : `From ${ownerUid.slice(0, 8)}…`;
    };

    const isNew = (item) =>
        !!lastSeenAt && !!toDate(item.updatedAt) && toDate(item.updatedAt) > lastSeenAt;

    // ── Sub-components ────────────────────────────────────────────────────────

    const DocRow = ({ item }) => {
        const meta  = APP_META[item.appType] || APP_META.default;
        const role  = item.role || 'editor';
        const badge = ROLE_BADGE[role] || ROLE_BADGE.editor;
        const canOpen = !!(APP_META[item.appType]?.getUrl(item.id));
        const fresh = isNew(item);

        return (
            <div
                onClick={() => canOpen && handleOpen(item)}
                className={`bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm transition-all ${canOpen ? 'cursor-pointer hover:border-indigo-200 hover:shadow-md active:scale-[0.99]' : ''}`}
            >
                <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                    <meta.Icon size={14} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        {fresh && <Circle size={6} className="fill-blue-500 text-blue-500 flex-shrink-0" />}
                        <p className="font-medium text-gray-800 truncate text-sm">
                            {item.title || 'Untitled'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <Clock size={10} className="text-gray-300" />
                        <span className="text-[10px] text-gray-400">{relativeTime(item.updatedAt)}</span>
                        {/* Show appType label in By Person mode */}
                        {groupMode === 'person' && (
                            <span className={`text-[10px] font-medium ${meta.color}`}>
                                {meta.label}
                            </span>
                        )}
                    </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>
                    {badge.label}
                </span>
            </div>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const totalNew = docs.filter(isNew).length;

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50">

            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 sticky top-0 z-10">
                <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
                    <ChevronLeft size={20} />
                </button>
                <Users size={20} className="text-indigo-500" />
                <h1 className="text-lg font-bold text-gray-800 flex-1">Shared With Me</h1>
                {totalNew > 0 && (
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {totalNew} new
                    </span>
                )}
                <span className="text-xs text-gray-400">{docs.length} item{docs.length !== 1 ? 's' : ''}</span>

                {/* View toggle */}
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg ml-1">
                    <button
                        onClick={() => setGroupMode('person')}
                        title="Group by person"
                        className={`p-1.5 rounded-md transition-colors ${groupMode === 'person' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <Users size={14} />
                    </button>
                    <button
                        onClick={() => setGroupMode('app')}
                        title="Group by app"
                        className={`p-1.5 rounded-md transition-colors ${groupMode === 'app' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <LayoutGrid size={14} />
                    </button>
                </div>
            </div>

            {/* Filter pills + search */}
            <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-3 space-y-2">
                {filterOptions.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto scrollbar-none">
                        {filterOptions.map(type => {
                            const meta = APP_META[type] || APP_META.default;
                            return (
                                <button
                                    key={type}
                                    onClick={() => setFilter(type)}
                                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                        filter === type
                                            ? `${meta.bg} ${meta.color} border border-current`
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                >
                                    <meta.Icon size={12} />
                                    {type === 'all' ? 'All' : meta.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by title or person…"
                        className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-300 focus:bg-white transition-colors"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                        Loading shared documents…
                    </div>

                ) : docs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-60 gap-3 text-gray-400">
                        <Users size={40} className="opacity-30" />
                        <p className="text-sm font-medium">No shared documents yet</p>
                        <p className="text-xs text-center max-w-xs">
                            When someone shares a note, task, or document with you, it will appear here.
                        </p>
                    </div>

                ) : searched.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
                        <Search size={28} className="opacity-30" />
                        <p className="text-sm">No results for <strong>"{searchQuery}"</strong></p>
                    </div>

                ) : groupMode === 'person' ? (
                    /* ── By Person ── */
                    <div className="p-4 space-y-6 max-w-2xl mx-auto">
                        {groupsByPerson.map(([ownerUid, items]) => (
                            <section key={ownerUid}>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                        <Users size={11} className="text-indigo-500" />
                                    </div>
                                    <span className="text-xs font-bold text-gray-600">
                                        {ownerLabel(ownerUid)}
                                    </span>
                                    <span className="text-xs text-gray-400">({items.length})</span>
                                    {items.some(isNew) && (
                                        <Circle size={6} className="fill-blue-500 text-blue-500 ml-0.5" />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {items.map(item => <DocRow key={item.id} item={item} />)}
                                </div>
                            </section>
                        ))}
                    </div>

                ) : (
                    /* ── By App ── */
                    <div className="p-4 space-y-6 max-w-2xl mx-auto">
                        {groupsByApp.map(([type, items]) => {
                            const meta = APP_META[type] || APP_META.default;
                            return (
                                <section key={type}>
                                    <div className={`flex items-center gap-2 mb-2 ${meta.color}`}>
                                        <meta.Icon size={14} />
                                        <span className="text-xs font-bold uppercase tracking-wider">
                                            {meta.label}
                                        </span>
                                        <span className="text-xs opacity-60">({items.length})</span>
                                        {items.some(isNew) && (
                                            <Circle size={6} className="fill-blue-500 text-blue-500 ml-0.5" />
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {items.map(item => <DocRow key={item.id} item={item} />)}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SharedHub;
