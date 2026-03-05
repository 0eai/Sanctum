// src/components/ui/SharedDocsView.jsx
// Shows documents shared with the current user, grouped by owner
import React, { useState, useEffect } from 'react';
import { Users, FileText, FileCode, CheckSquare, ListChecks, BookmarkIcon, GraduationCap, ChevronRight, User } from 'lucide-react';

const APP_ICONS = {
    notes: FileText,
    markdown: FileCode,
    tasks: CheckSquare,
    checklists: ListChecks,
    bookmarks: BookmarkIcon,
    research: GraduationCap
};

const APP_COLORS = {
    notes: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    markdown: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
    tasks: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
    checklists: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
    bookmarks: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200' },
    research: { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200' }
};

const SharedDocsView = ({ sharedDocs, onOpenDoc, appType }) => {
    if (!sharedDocs || sharedDocs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Users size={40} className="mb-3 opacity-50" />
                <p className="text-sm font-medium">No shared documents</p>
                <p className="text-xs mt-1">Documents shared with you will appear here</p>
            </div>
        );
    }

    // Group by owner
    const grouped = {};
    sharedDocs.forEach(doc => {
        const owner = doc.ownerUid || 'unknown';
        if (!grouped[owner]) grouped[owner] = { docs: [], ownerName: null };
        grouped[owner].docs.push(doc);
    });

    const colors = APP_COLORS[appType] || APP_COLORS.notes;
    const Icon = APP_ICONS[appType] || FileText;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
                <Users size={14} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Shared with you ({sharedDocs.length})
                </span>
            </div>
            <div className="space-y-2">
                {sharedDocs.map(doc => (
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
                                        {doc.memberUids?.length || 0} members
                                    </span>
                                    {doc.isOwner && (
                                        <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">Owner</span>
                                    )}
                                </div>
                            </div>
                            <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default SharedDocsView;
