import React, { useState, useEffect, useMemo } from 'react';
import { Plus, FolderPlus, Grid, List, BookOpen, Folder } from 'lucide-react';
import { Button, Modal, Input } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';
import { listenToPapers, createFolder, updateFolder, deletePaper, savePaper } from './services/research';
import useCollaboration from '../../hooks/useCollaboration';

import WorkspacePanel from '../../components/ui/WorkspacePanel';
import CollaborateModal from '../../components/ui/CollaborateModal';
import SharedDocsView from '../../components/ui/SharedDocsView';

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
                    onClick={() => { onMove(null); onClose(); }}
                >
                    <BookOpen size={18} className="text-gray-400" />
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
    const [viewMode, setViewMode] = useState('grid');
    const [editingPaper, setEditingPaper] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentFolder, setCurrentFolder] = useState(null);

    // Modals
    const [folderModal, setFolderModal] = useState({ isOpen: false, initialName: '', editingId: null });
    const [moveModal, setMoveModal] = useState({ isOpen: false, item: null });
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, item: null });

    // Collaboration (all state + effects handled by the hook)
    const collab = useCollaboration(user, cryptoKey, 'research');
    const { ctx, activeWorkspace, sharedDocs, privateKey } = collab;

    // Data Listener
    useEffect(() => {
        if (!user || (!cryptoKey && !collab.workspaceKey)) return;
        if (activeWorkspace && !collab.workspaceKey) return;

        const unsubscribe = listenToPapers(user.uid, cryptoKey, (data) => {
            setPapers(data);
            setIsLoading(false);
        }, ctx);
        return () => unsubscribe();
    }, [user, cryptoKey, activeWorkspace, collab.workspaceKey, ctx]);

    useEffect(() => {
        if (isLoading && papers.length === 0 && sharedDocs.length === 0) return;

        const { resource, resourceId, action } = (route || {});

        if (resource === 'folder' && resourceId) {
            setCurrentFolder(resourceId);
            setEditingPaper(null);
            setSearchQuery('');
        } else if (resource === 'paper' && resourceId) {
            if (resourceId === 'new') {
                setEditingPaper({ parentId: currentFolder, initialPreview: false });
            } else {
                const targetPaper = papers.find(p => p.id === resourceId) || sharedDocs.find(p => p.id === resourceId);
                if (targetPaper) {
                    setEditingPaper({ ...targetPaper, initialPreview: action !== 'edit' });
                    setCurrentFolder(targetPaper.parentId || null);
                } else if (papers.length > 0 || sharedDocs.length > 0) {
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
            await updateFolder(user.uid, cryptoKey, folderModal.editingId, name, undefined, ctx);
        } else {
            await createFolder(user.uid, cryptoKey, name, currentFolder, ctx);
        }
    };

    const handleMoveItem = async (newParentId) => {
        if (!moveModal.item) return;
        if (moveModal.item.type === 'folder') {
            await updateFolder(user.uid, cryptoKey, moveModal.item.id, moveModal.item.title, newParentId, ctx);
        } else {
            const fullPayload = { ...moveModal.item, parentId: newParentId };
            await savePaper(user.uid, cryptoKey, fullPayload, newParentId, ctx);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteModal.item) return;
        const isFolder = deleteModal.item.type === 'folder';
        await deletePaper(user.uid, deleteModal.item.id, isFolder, papers, ctx);
        setDeleteModal({ isOpen: false, item: null });
    };

    // --- Data processing ---
    const allFolders = papers.filter(p => p.type === 'folder');

    // Breadcrumbs
    const getCurrentPath = () => {
        const path = [{ id: null, title: 'Research' }];
        let currId = currentFolder;
        const folderTrail = [];
        while (currId) {
            const f = allFolders.find(x => x.id === currId);
            if (f) {
                folderTrail.unshift(f);
                currId = f.parentId;
            } else break;
        }
        return [...path, ...folderTrail];
    };

    const displayedItems = papers.filter(p => {
        const q = searchQuery.toLowerCase();
        if (q) {
            return (
                (p.title || '').toLowerCase().includes(q) ||
                (p.authors || '').toLowerCase().includes(q) ||
                p.tags?.some(t => t.toLowerCase().includes(q)) ||
                (p.year || '').includes(q) ||
                (p.venue || '').toLowerCase().includes(q)
            );
        }
        return p.parentId === currentFolder;
    });

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
                personalKey={cryptoKey}
                cryptoKey={editingPaper.isSharedDoc && !activeWorkspace ? editingPaper.docKey : (ctx?.key || cryptoKey)}
                ctx={editingPaper.isSharedDoc && !activeWorkspace ? null : ctx}
                paper={editingPaper}
                papers={papers}
                onClose={handleCloseEditor}
                onOpenApp={onOpenApp}
                navigate={navigate}
                onCollaborate={!ctx ? ((p) => collab.openCollaborateModal(p)) : null}
                readOnly={editingPaper.isSharedDoc && editingPaper.role === 'viewer'}
            />
        );
    }

    const breadcrumbPath = getCurrentPath();

    const handleBreadcrumbClick = (index, folder) => {
        if (folder.id === null) navigate(`#research`);
        else navigate(`#research/folder/${folder.id}`);
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
            <StandardAppLayout
                headerConfig={{
                    onBack: () => {
                        if (breadcrumbPath.length > 1) {
                            const parent = breadcrumbPath[breadcrumbPath.length - 2];
                            handleBreadcrumbClick(breadcrumbPath.length - 2, parent);
                        } else {
                            onExit();
                        }
                    },
                    workspaceConfig: {
                        switcherProps: collab.switcherProps,
                        activeWorkspace: activeWorkspace,
                        onSelect: (ws) => {
                            collab.switchWorkspace(ws);
                            navigate('#research');
                        },
                        onOpenPanel: () => collab.setIsWorkspacePanelOpen(true),
                    },
                    search: { query: searchQuery, setQuery: setSearchQuery, placeholder: 'Search papers and folders...' },
                    nav: !searchQuery ? {
                        type: 'breadcrumbs',
                        data: breadcrumbPath,
                        onSelect: handleBreadcrumbClick,
                    } : undefined,
                    customActions: (
                        <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white" title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}>
                            {viewMode === 'grid' ? <List size={20} /> : <Grid size={20} />}
                        </button>
                    ),
                }}
                fabConfig={{ actions: fabActions }}
            >
                {!searchQuery && !activeWorkspace && currentFolder === null && sharedDocs.length > 0 && (
                    <div className="mb-8">
                        <SharedDocsView
                            sharedDocs={sharedDocs}
                            appType="research"
                            onOpenDoc={(doc) => navigate(`#research/paper/${doc.id}`)}
                        />
                    </div>
                )}

                {!searchQuery && !activeWorkspace && currentFolder === null && sharedDocs.length > 0 && displayedItems.length > 0 && (
                    <div className="flex items-center gap-2 px-1 mb-3">
                        <Folder size={14} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Personal Vault
                        </span>
                    </div>
                )}

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
                                onCollaborate={!ctx ? ((p) => collab.openCollaborateModal(p)) : null}
                            />
                        ))}
                    </div>
                )}
            </StandardAppLayout>

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

            {/* Collaboration Modals */}
            {collab.isWorkspacePanelOpen && activeWorkspace && (
                <WorkspacePanel
                    {...collab.workspacePanelProps}
                    onDelete={async () => {
                        await collab.deleteActiveWorkspace();
                        navigate('#research');
                    }}
                />
            )}

            {collab.collaborateModalItem && (
                <CollaborateModal
                    isOpen={!!collab.collaborateModalItem}
                    docId={collab.collaborateModalItem.id}
                    docTitle={collab.collaborateModalItem.title || 'Untitled'}
                    fullDocData={collab.collaborateModalItem}
                    shareId={collab.collaborateModalItem.sharedId || null}
                    docKey={collab.collaborateModalItem.docKey || null}
                    appType="research"
                    currentUser={user}
                    privateKey={privateKey}
                    cryptoKey={cryptoKey}
                    onClose={() => collab.closeCollaborateModal()}
                    onShareCreated={async (newShareId) => {
                        if (collab.collaborateModalItem) {
                            await savePaper(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: newShareId }, null, ctx);
                            setPapers(papers.map(i => i.id === collab.collaborateModalItem.id ? { ...i, sharedId: newShareId } : i));
                        }
                    }}
                    onShareDeleted={async () => {
                        if (collab.collaborateModalItem) {
                            await savePaper(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: null }, null, ctx);
                            setPapers(papers.map(i => i.id === collab.collaborateModalItem.id ? { ...i, sharedId: null } : i));
                        }
                    }}
                />
            )}
        </div>
    );
};

export default ResearchApp;
