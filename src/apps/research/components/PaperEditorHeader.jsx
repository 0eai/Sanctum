import { ChevronLeft, Eye, Edit2, Trash2, Users, Star, Download, AlertCircle, RefreshCw } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import PresenceDots from '../../../components/ui/PresenceDots';

const PaperEditorHeader = ({
    saveStatus, onRetry, presenceUsers, isPreviewMode, paper, navigate, onClose,
    setIsPreviewMode, setIsMetadataExpanded, setIsDeleteModalOpen,
    onCollaborate, onPin, onExport, readOnly
}) => {
    const { canDelete } = usePermissions(paper);
    return (
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-30">
            <div className="flex items-center gap-3 overflow-hidden">
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 shrink-0">
                    <ChevronLeft size={20} />
                </button>
            </div>

            <div className="flex gap-2 items-center flex-shrink-0">
                <PresenceDots users={presenceUsers} />
                {saveStatus === 'error' ? (
                    <button onClick={onRetry} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium mr-2 transition-colors hidden sm:flex">
                        <AlertCircle size={13} /> Error · <RefreshCw size={11} /> Retry
                    </button>
                ) : (
                    <span className="text-xs text-gray-400 mr-2 uppercase tracking-wider font-medium hidden sm:block">
                        {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
                    </span>
                )}

                {onCollaborate && (
                    <button onClick={() => onCollaborate(paper)} className={`p-2 rounded-full transition-colors hidden sm:flex ${paper?.memberUids?.length > 0 ? 'text-indigo-500 hover:bg-indigo-50' : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'}`} title="Collaborators">
                        <Users size={20} />
                    </button>
                )}

                {!readOnly && onPin && (
                    <button onClick={() => onPin(paper)} className={`p-2 rounded-full transition-colors ${paper?.isPinned ? 'text-yellow-500 bg-yellow-50' : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50'}`} title="Pin paper">
                        <Star size={20} fill={paper?.isPinned ? 'currentColor' : 'none'} />
                    </button>
                )}

                {!readOnly && (
                    <button
                        onClick={() => {
                            const nextAction = isPreviewMode ? 'edit' : '';
                            if (navigate && paper?.id) {
                                navigate(`#research/paper/${paper.id}${nextAction ? `/${nextAction}` : ''}`);
                                if (nextAction === 'edit') setIsMetadataExpanded(true);
                            } else {
                                setIsPreviewMode(!isPreviewMode);
                                if (isPreviewMode) setIsMetadataExpanded(true);
                            }
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${isPreviewMode ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        {isPreviewMode ? <><Edit2 size={14} /> Edit</> : <><Eye size={14} /> View</>}
                    </button>
                )}

                {onExport && paper?.id && (
                    <button onClick={onExport} className="p-2 text-gray-400 hover:text-indigo-500 rounded-full hover:bg-indigo-50 transition-colors hidden sm:flex" title="Export as BibTeX">
                        <Download size={20} />
                    </button>
                )}

                {!readOnly && paper?.id && canDelete && (
                    <button onClick={() => setIsDeleteModalOpen(true)} className="p-2 text-gray-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors hidden sm:flex" title="Delete Paper">
                        <Trash2 size={20} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default PaperEditorHeader;
