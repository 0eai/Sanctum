import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Plus, FolderPlus, Grid, List, Search, BookOpen, X, ChevronRight, Hash } from 'lucide-react';
import { Button, Modal, Input } from '../../components/ui';
import MultiFab from '../../components/ui/MultiFab';
import { listenToPapers, createFolder, updateFolder, deletePaper } from './services/research';
import PaperEditor from './components/PaperEditor';
import PaperCard from './components/PaperCard';

const FolderModal = ({ isOpen, onClose, onSubmit, initialName = '' }) => {
    const [name, setName] = useState(initialName);
    useEffect(() => { setName(initialName); }, [initialName, isOpen]);

    if (!isOpen) return null;
    return (
        <Modal isOpen={true} title={initialName ? "Rename Folder" : "New Folder"} onClose={onClose}>
            <div className="space-y-4">
                <Input autoFocus label="Folder Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Deep Learning" />
                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={() => { onSubmit(name); onClose(); }} disabled={!name.trim()}>
                        {initialName ? "Save" : "Create"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

const MoveModal = ({ isOpen, onClose, item, allFolders, currentFolderId, onMove }) => {
    if (!isOpen || !item) return null;

    // Filter out the item itself and its descendants to prevent circular loops
    const getDescendants = (folderId, folders) => {
        let descendants = [];
        const children = folders.filter(f => f.parentId === folderId);
        children.forEach(child => {
            descendants.push(child.id);
            descendants = descendants.concat(getDescendants(child.id, folders));
        });
        return descendants;
    };

    const invalidTargets = item.type === 'folder' ? [item.id, ...getDescendants(item.id, allFolders)] : [];
    const validFolders = allFolders.filter(f => !invalidTargets.includes(f.id));

    return (
        <Modal isOpen={true} title={`Move "${item.title || 'Item'}"`} onClose={onClose}>
            <div className="space-y-2 max-h-96 overflow-y-auto">
                <div
                    className={`p-3 rounded-lg border cursor-pointer hover:bg-blue-50 flex items-center gap-3 ${currentFolderId === null ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'}`}
                >
                    <Hash size={18} className="text-gray-400" />
                    <span className="font-medium text-gray-800">Root / Home</span>
                </div>
                {validFolders.map(folder => (
                    <div
                        key={folder.id}
                        onClick={() => { onMove(folder.id); onClose(); }}
                        className={`p-3 rounded-lg border cursor-pointer hover:bg-blue-50 flex items-center gap-3 ${currentFolderId === folder.id ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'}`}
                    >
                        <FolderPlus size={18} className="text-blue-500" />
                        <span className="font-medium text-gray-800">{folder.title}</span>
                    </div>
                ))}
            </div>
            <div className="flex justify-end pt-4">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
        </Modal>
    );
};

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, isFolder }) => {
    if (!isOpen) return null;
    return (
        <Modal isOpen={true} title="Confirm Delete" onClose={onClose}>
            <div className="space-y-4">
                <p className="text-gray-600">
                    Are you sure you want to delete this {isFolder ? 'folder and ALL its contents' : 'paper'}?
                    This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={onConfirm} className="bg-red-600 hover:bg-red-700 text-white">Delete</Button>
                </div>
            </div>
        </Modal>
    );
};

const ResearchApp = ({ user, cryptoKey, onExit, onOpenApp, route, navigate }) => {
    const [papers, setPapers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [editingPaper, setEditingPaper] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentFolder, setCurrentFolder] = useState(null);

    // Modals
    const [folderModal, setFolderModal] = useState({ isOpen: false, initialName: '', editingId: null });
    const [moveModal, setMoveModal] = useState({ isOpen: false, item: null });
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, item: null });

    useEffect(() => {
        if (!user || !cryptoKey) return;
        const unsubscribe = listenToPapers(user.uid, cryptoKey, (data) => {
            setPapers(data);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [user, cryptoKey]);

    useEffect(() => {
        if (isLoading) return;

        const { resource, resourceId, action } = (route || {});

        if (resource === 'folder' && resourceId) {
            setCurrentFolder(resourceId);
            setEditingPaper(null);
            setSearchQuery('');
        } else if (resource === 'paper' && resourceId) {
            if (resourceId === 'new') {
                setEditingPaper({ parentId: currentFolder, initialPreview: false });
            } else {
                const targetPaper = papers.find(p => p.id === resourceId);
                if (targetPaper) {
                    setEditingPaper({ ...targetPaper, initialPreview: action !== 'edit' });
                    setCurrentFolder(targetPaper.parentId || null);
                } else if (papers.length > 0) {
                    // Not found, go home
                    setCurrentFolder(null);
                    setEditingPaper(null);
                }
            }
        } else {
            setCurrentFolder(null);
            setEditingPaper(null);
        }
    }, [route, papers, isLoading]);

    const handleCreatePaper = () => {
        navigate(`#research/paper/new/edit`);
    };

    const handleEditPaper = (paper) => {
        if (paper.type === 'folder') {
            navigate(`#research/folder/${paper.id}`);
        } else {
            navigate(`#research/paper/${paper.id}`);
        }
    };

    const handleCloseEditor = () => {
        if (currentFolder) {
            navigate(`#research/folder/${currentFolder}`);
        } else {
            navigate(`#research`);
        }
    };

    // --- Actions ---
    const handleCreateFolder = async (name) => {
        if (folderModal.editingId) {
            await updateFolder(user.uid, cryptoKey, folderModal.editingId, name, undefined);
        } else {
            await createFolder(user.uid, cryptoKey, name, currentFolder);
        }
    };

    const handleMoveItem = async (newParentId) => {
        if (!moveModal.item) return;
        if (moveModal.item.type === 'folder') {
            await updateFolder(user.uid, cryptoKey, moveModal.item.id, moveModal.item.title, newParentId);
        } else {
            // we need a lightweight update utility for papers, or we can use savePaper with the item directly
            // For now, we'll re-save it with the new parentId
            const importFileKey = async () => { }; // Stub since we don't re-upload
            // To properly move a paper without re-upload/re-encrypting everything manually here,
            // we should ideally add an `updatePaperFolder` to research.js.
            // But since savePaper merges, passing the unencrypted payload works if we re-encrypt.
            // Actually, we need to pass the full unencrypted payload to `savePaper` to avoid erasing fields.
            const fullPayload = { ...moveModal.item, parentId: newParentId };
            const { savePaper } = await import('./services/research');
            await savePaper(user.uid, cryptoKey, fullPayload, newParentId);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteModal.item) return;
        const isFolder = deleteModal.item.type === 'folder';
        await deletePaper(user.uid, deleteModal.item.id, isFolder, papers);
        setDeleteModal({ isOpen: false, item: null });
    };

    // --- Data processing ---
    const allFolders = papers.filter(p => p.type === 'folder');

    // Breadcrumbs
    const getCurrentPath = () => {
        const path = [];
        let currId = currentFolder;
        while (currId) {
            const f = allFolders.find(x => x.id === currId);
            if (f) {
                path.unshift(f);
                currId = f.parentId;
            } else break;
        }
        return path;
    };

    const displayedItems = papers.filter(p => {
        const q = searchQuery.toLowerCase();
        if (q) {
            // Global search
            return (
                (p.title || '').toLowerCase().includes(q) ||
                (p.authors || '').toLowerCase().includes(q) ||
                p.tags?.some(t => t.toLowerCase().includes(q)) ||
                (p.year || '').includes(q) ||
                (p.venue || '').toLowerCase().includes(q)
            );
        }
        // Folder view
        return p.parentId === currentFolder;
    });

    // Sort: Folders first, then by date descending
    displayedItems.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;

        const timeA = a.updatedAt?.toMillis?.() || new Date(a.addedAt || 0).getTime();
        const timeB = b.updatedAt?.toMillis?.() || new Date(b.addedAt || 0).getTime();
        return timeB - timeA;
    });

    const fabActions = useMemo(() => [
        {
            label: "New Folder",
            icon: <FolderPlus size={20} />,
            onClick: () => setFolderModal({ isOpen: true, initialName: '', editingId: null }),
            variant: 'secondary'
        },
        {
            label: "Add Paper",
            icon: <Plus size={24} />,
            onClick: handleCreatePaper,
            variant: 'primary'
        }
    ], [currentFolder]);

    if (editingPaper) {
        return (
            <PaperEditor
                user={user}
                cryptoKey={cryptoKey}
                paper={editingPaper}
                papers={papers}
                onClose={handleCloseEditor}
                onOpenApp={onOpenApp}
                navigate={navigate}
            />
        );
    }

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
            <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
                <div className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button onClick={() => {
                                if (getCurrentPath().length > 0) {
                                    const path = getCurrentPath();
                                    const parent = path[path.length - 2];
                                    if (parent) navigate(`#research/folder/${parent.id}`);
                                    else navigate(`#research`);
                                }
                                else onExit();
                            }} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
                            <h1 className="text-xl font-bold">Research Vault</h1>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="p-2 hover:bg-white/20 rounded-full transition-colors" title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}>
                                {viewMode === 'grid' ? <List size={20} /> : <Grid size={20} />}
                            </button>
                        </div>
                    </div>

                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
                        <input
                            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search papers and folders..."
                            className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm"
                        />
                        {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
                    </div>

                    {!searchQuery && (
                        <div className="flex items-center gap-1 text-sm text-blue-100 overflow-x-auto no-scrollbar whitespace-nowrap">
                            <button onClick={() => navigate(`#research`)} className={`hover:text-white transition-colors flex items-center gap-1 ${getCurrentPath().length === 0 ? 'font-bold text-white' : ''}`}>
                                <BookOpen size={14} /> Home
                            </button>
                            {getCurrentPath().map((folder, index) => (
                                <React.Fragment key={folder.id}>
                                    <ChevronRight size={14} className="opacity-50" />
                                    <button
                                        onClick={() => navigate(`#research/folder/${folder.id}`)}
                                        className={`hover:text-white transition-colors flex items-center gap-1 ${index === getCurrentPath().length - 1 ? 'font-bold text-white' : ''}`}
                                    >
                                        <FolderPlus size={14} /> {folder.title}
                                    </button>
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto scroll-smooth p-4">
                <div className="max-w-3xl mx-auto pb-32">

                    {isLoading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : displayedItems.length === 0 ? (
                        <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
                            <div className="bg-white p-4 rounded-full shadow-sm">
                                <BookOpen size={32} className="opacity-50" />
                            </div>
                            <p className="max-w-md mx-auto">
                                {searchQuery ? "Try adjusting your search terms." : "Empty folder. Add a paper manually or parse BibTeX to get started."}
                            </p>
                            {!searchQuery && (
                                <div className="flex items-center justify-center gap-4 mt-6">
                                    <Button onClick={() => setFolderModal({ isOpen: true, initialName: '', editingId: null })} variant="secondary">
                                        <FolderPlus size={18} className="mr-2" /> New Folder
                                    </Button>
                                    <Button onClick={handleCreatePaper} variant="primary">
                                        <Plus size={18} className="mr-2" /> Add Paper
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" : "flex flex-col gap-2"}>
                            {displayedItems.map(item => (
                                <PaperCard
                                    key={item.id}
                                    item={item}
                                    papers={papers}
                                    viewMode={viewMode}
                                    onClick={() => handleEditPaper(item)}
                                    onMove={() => setMoveModal({ isOpen: true, item })}
                                    onDelete={() => setDeleteModal({ isOpen: true, item })}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <MultiFab actions={fabActions} maxWidth="max-w-4xl" />

            <FolderModal
                isOpen={folderModal.isOpen}
                initialName={folderModal.initialName}
                onClose={() => setFolderModal({ isOpen: false, initialName: '', editingId: null })}
                onSubmit={handleCreateFolder}
            />

            <MoveModal
                isOpen={moveModal.isOpen}
                item={moveModal.item}
                allFolders={allFolders}
                currentFolderId={moveModal.item?.parentId || null}
                onClose={() => setMoveModal({ isOpen: false, item: null })}
                onMove={handleMoveItem}
            />

            <DeleteConfirmModal
                isOpen={deleteModal.isOpen}
                isFolder={deleteModal.item?.type === 'folder'}
                onClose={() => setDeleteModal({ isOpen: false, item: null })}
                onConfirm={handleDeleteConfirm}
            />
        </div>
    );
};

export default ResearchApp;
