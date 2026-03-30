import React, { useState, useEffect, useRef } from 'react';
import { Cpu, ExternalLink, ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import MarkdownViewer from '../../../components/ui/MarkdownViewer';
import { fetchMarkdownDocById } from '../../markdown/services/markdown';

const PaperAiSection = ({ isPrivate, aiSummary, markdownIds, navigate, user, mdKey }) => {
    const ids = markdownIds || [];
    // Default to the latest review (last in array)
    const [selectedIndex, setSelectedIndex] = useState(ids.length > 0 ? ids.length - 1 : 0);
    const [contentCache, setContentCache] = useState({}); // { [id]: content string }
    const [loadingId, setLoadingId] = useState(null);
    const prevIdsRef = useRef(ids);

    // When a new review is generated, jump to it automatically
    useEffect(() => {
        if (ids.length > prevIdsRef.current.length) {
            setSelectedIndex(ids.length - 1);
        }
        prevIdsRef.current = ids;
    }, [ids.length]);

    // Reset selectedIndex if it goes out of bounds (e.g. ids changed)
    useEffect(() => {
        if (ids.length > 0 && selectedIndex >= ids.length) {
            setSelectedIndex(ids.length - 1);
        }
    }, [ids.length, selectedIndex]);

    const selectedId = ids[selectedIndex];
    const isLatest = selectedIndex === ids.length - 1;

    // Determine which content to show
    const getDisplayContent = () => {
        if (isLatest) return aiSummary; // always fresh from state
        return contentCache[selectedId] ?? null;
    };

    // Fetch older review content on demand
    useEffect(() => {
        if (!selectedId || isLatest) return;
        if (contentCache[selectedId] !== undefined) return;
        if (!user || !mdKey) return;

        let cancelled = false;
        const load = async () => {
            setLoadingId(selectedId);
            try {
                const doc = await fetchMarkdownDocById(user.uid, mdKey, selectedId);
                if (!cancelled) {
                    setContentCache(prev => ({ ...prev, [selectedId]: doc?.content ?? '' }));
                }
            } catch (e) {
                if (!cancelled) {
                    setContentCache(prev => ({ ...prev, [selectedId]: '' }));
                    console.warn('Failed to load review', selectedId, e);
                }
            } finally {
                if (!cancelled) setLoadingId(null);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selectedId, isLatest, user, mdKey]);

    const displayContent = getDisplayContent();
    const total = ids.length;
    const humanIndex = selectedIndex + 1;

    return (
        <div className="mt-8 border-t border-gray-100 pt-8">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-indigo-900 flex items-center gap-2">
                    <Cpu size={18} className="text-indigo-600" />
                    AI Review
                </h2>

                {total > 0 && (
                    <div className="flex items-center gap-2">
                        {/* Prev / counter / next — only show when more than one review */}
                        {total > 1 && (
                            <div className="flex items-center gap-0.5">
                                <button
                                    onClick={() => setSelectedIndex(i => Math.max(0, i - 1))}
                                    disabled={selectedIndex === 0}
                                    className="p-0.5 rounded hover:bg-indigo-50 text-indigo-400 disabled:opacity-30 transition-colors"
                                    title="Previous review"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-xs text-indigo-500 font-medium w-12 text-center select-none">
                                    {humanIndex} / {total}
                                </span>
                                <button
                                    onClick={() => setSelectedIndex(i => Math.min(total - 1, i + 1))}
                                    disabled={selectedIndex === total - 1}
                                    className="p-0.5 rounded hover:bg-indigo-50 text-indigo-400 disabled:opacity-30 transition-colors"
                                    title="Next review"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}

                        {navigate && selectedId && (
                            <button
                                onClick={() => navigate(`#markdown/doc/${selectedId}`)}
                                className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                                title="Open in Markdown"
                            >
                                <ExternalLink size={12} /> Open
                            </button>
                        )}
                    </div>
                )}
            </div>

            {isPrivate ? (
                <div className="text-sm text-rose-800 p-4 bg-rose-50 rounded-lg">
                    AI processing is disabled for private drafts to ensure zero-knowledge local encryption.
                </div>
            ) : loadingId === selectedId ? (
                <div className="flex items-center justify-center py-10">
                    <Loader size={20} className="text-indigo-400 animate-spin" />
                </div>
            ) : typeof displayContent === 'string' ? (
                <div className="space-y-4">
                    <div className="text-sm text-gray-800 leading-relaxed prose prose-indigo max-w-none">
                        <MarkdownViewer content={displayContent} />
                    </div>
                </div>
            ) : (
                <div className="text-sm text-gray-500 text-center py-10 italic">
                    No AI analysis generated yet. Upload a PDF and generate insights using the Meta bar.
                </div>
            )}
        </div>
    );
};

export default PaperAiSection;
