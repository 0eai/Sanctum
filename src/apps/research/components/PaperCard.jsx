import { Suspense, lazy } from 'react';
import {
    FileText, Folder, Star, X, Move, Users, ArrowRightLeft
} from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';

// Lazy-load PdfThumbnail so pdfjs-dist is not in the initial bundle
const PdfThumbnail = lazy(() => import('./PdfThumbnail'));

const PaperCard = ({ item, papers, cryptoKey, onClick, onMove, onMoveToContext, onDelete, onCollaborate, onPin }) => {
    const isFolder = item.type === 'folder';
    const { canDelete } = usePermissions(item);
    const hasThumbnail = !isFolder && item.hasPdf && item.driveFileId && cryptoKey;

    const formatDateTime = (dateVal) => {
        if (!dateVal) return '';
        const ms = typeof dateVal.toMillis === 'function' ? dateVal.toMillis() : dateVal;
        const date = new Date(ms);
        if (isNaN(date.getTime())) return '';
        return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    };

    // GRID VIEW
    return (
        <div
            onClick={onClick}
            className={`p-4 rounded-xl shadow-sm border transition-all cursor-pointer group flex flex-col h-44 relative ${isFolder ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100 hover:shadow-md'}`}
        >
            {/* PDF first-page thumbnail — absolute top-right, fades in when ready */}
            {hasThumbnail && (
                <Suspense fallback={null}>
                    <PdfThumbnail
                        driveFileId={item.driveFileId}
                        cryptoKey={cryptoKey}
                        isEncrypted={item.isEncrypted}
                        className="absolute top-3 right-3 w-10 h-14 object-cover rounded shadow-sm border border-gray-200 opacity-80"
                    />
                </Suspense>
            )}

            <div className="flex justify-between items-start mb-2">
                <div className={`flex items-center gap-2 flex-1 ${hasThumbnail ? 'pr-14' : 'pr-2'}`}>
                    {isFolder ? (
                        <Folder size={18} className="text-[#4285f4]" />
                    ) : (
                        <FileText size={18} className="text-gray-400" />
                    )}
                    <h3 className={`font-bold line-clamp-1 ${isFolder ? 'text-blue-700' : 'text-gray-800'}`}>
                        {item.title || "Untitled"}
                    </h3>
                </div>
            </div>

            {isFolder ? (
                <div className="flex-1 flex items-end">
                    <span className="text-xs text-blue-400 font-medium">
                        {papers.filter(p => p.parentId === item.id).length} items
                    </span>
                </div>
            ) : (
                <>
                    <p className={`text-xs text-gray-400 font-mono line-clamp-2 flex-1 opacity-70 mb-2 ${hasThumbnail ? 'pr-14' : ''}`}>
                        {item.authors || "Unknown Authors"}
                        <br />
                        {[item.year, item.venue].filter(Boolean).join(" • ")}
                    </p>

                    <div className="flex gap-2 mb-2">
                        {item.tags?.length > 0 && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center">
                                #{item.tags[0]} {item.tags.length > 1 && `+${item.tags.length - 1}`}
                            </span>
                        )}
                        {item.status === 'reading' && <span className="text-[10px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">Reading</span>}
                        {item.status === 'read' && <span className="text-[10px] bg-emerald-50 text-emerald-500 px-1.5 py-0.5 rounded">Read ✓</span>}
                        {item.isPrivate && <span className="text-[10px] bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded">Private</span>}
                        {item.hasPdf && <span className="text-[10px] bg-emerald-50 text-emerald-500 px-1.5 py-0.5 rounded">PDF</span>}
                        {item.aiSummary && <span className="text-[10px] bg-purple-50 text-purple-500 px-1.5 py-0.5 rounded">AI</span>}
                    </div>
                </>
            )}

            <div className="flex justify-between items-center mt-auto pt-2 border-t border-black/5">
                <span className="text-[10px] text-gray-400 font-medium">
                    {formatDateTime(item.updatedAt || item.addedAt)}
                </span>
                <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {onPin && !isFolder && (
                        <button onClick={(e) => { e.stopPropagation(); onPin(item); }} className={`p-1 ${item.isPinned ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`} title="Pin paper">
                            <Star size={14} fill={item.isPinned ? 'currentColor' : 'none'} />
                        </button>
                    )}
                    {onCollaborate && (
                        <button onClick={(e) => { e.stopPropagation(); onCollaborate(item); }} className={`p-1 ${item.memberUids?.length > 0 ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500'}`} title={isFolder ? 'Share folder' : 'Collaborate'}>
                            <Users size={14} />
                        </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onMove(item); }} className="text-gray-300 hover:text-blue-500 p-1" title="Move to folder">
                        <Move size={14} />
                    </button>
                    {onMoveToContext && (
                        <button onClick={(e) => { e.stopPropagation(); onMoveToContext(item); }} className="text-gray-300 hover:text-indigo-500 p-1" title="Move to workspace/vault">
                            <ArrowRightLeft size={14} />
                        </button>
                    )}
                    {canDelete && (
                        <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="text-gray-300 hover:text-red-500 p-1">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PaperCard;
