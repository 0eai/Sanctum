import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, FolderPlus, Grid, List, BookOpen, Folder, Download, Upload } from 'lucide-react';
import { Button, Modal, Input } from '../../components/ui';
import StandardAppLayout from '../../components/ui/StandardAppLayout';
import { listenToPapers, createFolder, updateFolder, deletePaper, savePaper, formatCitation, parseMultiBibTeX } from './services/research';
import { fetchMarkdownDocById, moveMarkdownDoc } from '../markdown/services/markdown';
import { fetchNoteById, moveNoteDoc } from '../notes/services/notes';
import useCollaboration from '../../hooks/useCollaboration';

import WorkspacePanel from '../../components/ui/WorkspacePanel';
import CollaborateModal from '../../components/ui/CollaborateModal';
import MoveToContextModal from '../../components/ui/MoveToContextModal';

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
    const [notesView, setNotesView] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentFolder, setCurrentFolder] = useState(null);

    // Modals
    const [folderModal, setFolderModal] = useState({ isOpen: false, initialName: '', editingId: null });
    const [moveModal, setMoveModal] = useState({ isOpen: false, item: null });
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, item: null });
    const [contextMoveItem, setContextMoveItem] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [importModal, setImportModal] = useState({ isOpen: false, text: '', isImporting: false, result: null });

    // Collaboration (all state + effects handled by the hook)
    const collab = useCollaboration(user, cryptoKey, 'research', route);
    const { ctx, activeWorkspace, sharedDocs, privateKey, wsLink } = collab;

    // When moving a research paper, also move its linked markdown (AI reviews) and note
    // docs to the same destination context so they remain accessible there.
    const handleMovePaperToContext = useCallback(async (item, collectionName, destCtx, personalKey) => {
        // Move the paper (or folder child) via the standard hook function
        await collab.moveItemToContext(item, collectionName, destCtx, personalKey);

        if (collectionName !== 'research' || item.type === 'folder') return;

        const mdKey = personalKey || cryptoKey;
        const sourceCtx = ctx; // source context for linked docs = Research app's current context

        const moveLinkedMarkdown = async (docId) => {
            try {
                const decrypted = await fetchMarkdownDocById(user.uid, mdKey, docId, sourceCtx);
                if (!decrypted) return;
                await moveMarkdownDoc(user.uid, mdKey, { ...decrypted, id: docId, parentId: null }, sourceCtx, destCtx);
            } catch (e) {
                console.warn(`[movePaper] Failed to move linked markdown doc ${docId}:`, e);
            }
        };

        const moveLinkedNote = async (docId) => {
            try {
                const decrypted = await fetchNoteById(user.uid, mdKey, docId, sourceCtx);
                if (!decrypted) return;
                await moveNoteDoc(user.uid, mdKey, { ...decrypted, id: docId, parentId: null }, sourceCtx, destCtx);
            } catch (e) {
                console.warn(`[movePaper] Failed to move linked note doc ${docId}:`, e);
            }
        };

        await Promise.all([
            ...(item.markdownIds || []).map(id => moveLinkedMarkdown(id)),
            ...(item.noteId ? [moveLinkedNote(item.noteId)] : []),
        ]);
    }, [collab, ctx, user, cryptoKey]);

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
            setNotesView(false);
            setSearchQuery('');
            setStatusFilter('all');
        } else if (resource === 'paper' && resourceId) {
            if (resourceId === 'new') {
                setEditingPaper({ parentId: currentFolder, initialPreview: false });
                setNotesView(false);
            } else {
                const targetPaper = papers.find(p => p.id === resourceId) || sharedDocs.find(p => p.id === resourceId);
                if (targetPaper) {
                    const isNotesRoute = action === 'notes';
                    setEditingPaper({ ...targetPaper, initialPreview: action !== 'edit' });
                    setNotesView(isNotesRoute);
                    setCurrentFolder(targetPaper.parentId || null);
                } else if (papers.length > 0 || sharedDocs.length > 0) {
                    setCurrentFolder(null);
                    setEditingPaper(null);
                    setNotesView(false);
                }
            }
        } else {
            setCurrentFolder(null);
            setEditingPaper(null);
            setNotesView(false);
        }
    }, [route, papers, isLoading]);

    const handleCreatePaper = () => {
        navigate(wsLink(`#research/paper/new/edit`));
    };

    const handleEditPaper = (paper) => {
        if (paper.type === 'folder') {
            navigate(wsLink(`#research/folder/${paper.id}`));
        } else {
            navigate(wsLink(`#research/paper/${paper.id}`));
        }
    };

    const handleCloseEditor = () => {
        if (currentFolder) {
            navigate(wsLink(`#research/folder/${currentFolder}`));
        } else {
            navigate(wsLink(`#research`));
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

    const handleBibTexImport = async () => {
        const entries = await parseMultiBibTeX(importModal.text);
        if (!entries.length) return;
        setImportModal(s => ({ ...s, isImporting: true }));
        let imported = 0;
        for (const entry of entries) {
            try {
                await savePaper(user.uid, cryptoKey, {
                    ...entry,
                    tags: [],
                    isPrivate: false,
                    status: 'unread',
                    hasPdf: false,
                    parentId: currentFolder || null,
                }, currentFolder || null, ctx);
                imported++;
            } catch (e) {
                console.error('Failed to import entry', entry.title, e);
            }
        }
        setImportModal({ isOpen: false, text: '', isImporting: false, result: `Imported ${imported} of ${entries.length} papers.` });
    };

    const handleBulkExport = async () => {
        const papersToExport = displayedItems.filter(p => p.type !== 'folder');
        if (papersToExport.length === 0) return;
        const citations = await Promise.all(papersToExport.map(p => formatCitation(p, 'BibTeX')));
        const bibtexEntries = citations.filter(Boolean).join('\n\n');
        const blob = new Blob([bibtexEntries], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `research_export_${papersToExport.length}_papers.bib`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handlePinPaper = async (paper) => {
        await savePaper(user.uid, cryptoKey, { ...paper, isPinned: !paper.isPinned }, paper.parentId, ctx);
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
        if (p.parentId !== currentFolder) return false;
        if (statusFilter !== 'all' && p.type !== 'folder') {
            return (p.status || 'unread') === statusFilter;
        }
        return true;
    });

    displayedItems.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

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
            label: "Import BibTeX",
            icon: <Upload size={20} />,
            onClick: () => setImportModal({ isOpen: true, text: '', isImporting: false, result: null }),
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
                notesView={notesView}
                onClose={handleCloseEditor}
                onOpenApp={onOpenApp}
                navigate={navigate}
                onCollaborate={!ctx && !editingPaper.isSharedDoc ? ((p) => collab.openCollaborateModal(p)) : null}
                onPin={!editingPaper.isSharedDoc ? handlePinPaper : null}
                readOnly={editingPaper.isSharedDoc && editingPaper.role === 'viewer'}
            />
        );
    }

    const breadcrumbPath = getCurrentPath();

    const handleBreadcrumbClick = (index, folder) => {
        if (folder.id === null) navigate(wsLink(`#research`));
        else navigate(wsLink(`#research/folder/${folder.id}`));
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
                        <>
                            {displayedItems.some(p => p.type !== 'folder') && (
                                <button onClick={handleBulkExport} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white" title="Export all as BibTeX">
                                    <Download size={20} />
                                </button>
                            )}
                            <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white" title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}>
                                {viewMode === 'grid' ? <List size={20} /> : <Grid size={20} />}
                            </button>
                        </>
                    ),
                }}
                fabConfig={{ actions: fabActions }}
            >

                {!searchQuery && !!activeWorkspace && (
                    <p className="text-xs text-gray-400 px-1 mb-4">
                        Shared items are not visible in workspace mode. Switch to Personal Vault to view them.
                    </p>
                )}

                {!searchQuery && !activeWorkspace && currentFolder === null && sharedDocs.length > 0 && displayedItems.length > 0 && (
                    <div className="flex items-center gap-2 px-1 mb-3">
                        <Folder size={14} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Personal Vault
                        </span>
                    </div>
                )}

                {!searchQuery && (
                    <div className="flex gap-2 px-1 mb-3 flex-wrap">
                        {['all', 'unread', 'reading', 'read'].map(s => {
                            const count = s === 'all' ? null : papers.filter(p => p.type !== 'folder' && p.parentId === currentFolder && (p.status || 'unread') === s).length;
                            return (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${statusFilter === s ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                >
                                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                                    {count != null && count > 0 && <span className="ml-1 opacity-80">{count}</span>}
                                </button>
                            );
                        })}
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
                                cryptoKey={ctx?.key || cryptoKey}
                                viewMode={viewMode}
                                onClick={() => handleEditPaper(item)}
                                onMove={() => setMoveModal({ isOpen: true, item })}
                                onMoveToContext={!item.isSharedDoc ? () => setContextMoveItem(item) : null}
                                onDelete={() => setDeleteModal({ isOpen: true, item })}
                                onCollaborate={!ctx && !item.isSharedDoc ? ((p) => collab.openCollaborateModal(p)) : null}
                                onPin={!item.isSharedDoc ? handlePinPaper : null}
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

            <MoveToContextModal
                isOpen={!!contextMoveItem}
                onClose={() => setContextMoveItem(null)}
                item={contextMoveItem}
                collectionName="research"
                allItems={papers}
                workspaces={collab.workspaces}
                activeWorkspaceId={activeWorkspace?.id || null}
                user={user}
                privateKey={privateKey}
                cryptoKey={cryptoKey}
                ctx={ctx}
                onMoveItemToContext={handleMovePaperToContext}
            />

            {importModal.isOpen && (
                <Modal isOpen={true} title="Import BibTeX" onClose={() => setImportModal({ isOpen: false, text: '', isImporting: false, result: null })}>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500">Paste a BibTeX file with one or more entries, or upload a <code>.bib</code> file. Each entry will become a separate paper.</p>
                        <label className="flex items-center gap-2 text-sm text-indigo-600 font-medium cursor-pointer">
                            <Upload size={14} />
                            Upload .bib file
                            <input type="file" accept=".bib,.txt" className="hidden" onChange={e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = ev => setImportModal(s => ({ ...s, text: ev.target.result }));
                                reader.readAsText(file);
                            }} />
                        </label>
                        <textarea
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-gray-50"
                            rows={8}
                            placeholder={"@article{key,\n  title = {Paper Title},\n  author = {Smith, John},\n  year = {2024},\n  journal = {Nature}\n}\n\n@inproceedings{...}"}
                            value={importModal.text}
                            onChange={e => setImportModal(s => ({ ...s, text: e.target.value }))}
                        />
                        {importModal.text.trim() && (
                            <p className="text-xs text-gray-400">
                                {(() => { const n = (importModal.text.match(/@\w+\s*\{/g) || []).length; return `${n} entr${n === 1 ? 'y' : 'ies'} detected`; })()}
                            </p>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setImportModal({ isOpen: false, text: '', isImporting: false, result: null })}>Cancel</Button>
                            <Button
                                variant="primary"
                                onClick={handleBibTexImport}
                                disabled={importModal.isImporting || !importModal.text.trim()}
                            >
                                {importModal.isImporting ? 'Importing...' : 'Import'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

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
                    shareId={collab.collaborateModalItem.collabShareId || null}
                    docKey={collab.collaborateModalItem.docKey || null}
                    publicSharedId={collab.collaborateModalItem.sharedId || null}
                    publicShareUrlKey={collab.collaborateModalItem.shareUrlKey || null}
                    appType="research"
                    currentUser={user}
                    privateKey={privateKey}
                    cryptoKey={cryptoKey}
                    onClose={() => collab.closeCollaborateModal()}
                    onShareCreated={async (newShareId) => {
                        if (collab.collaborateModalItem) {
                            await savePaper(user.uid, cryptoKey, { ...collab.collaborateModalItem, collabShareId: newShareId }, null, ctx);
                        }
                    }}
                    onShareDeleted={async () => {
                        if (collab.collaborateModalItem) {
                            await savePaper(user.uid, cryptoKey, { ...collab.collaborateModalItem, collabShareId: null }, null, ctx);
                        }
                    }}
                    onPublicLinkCreated={async (id, key) => {
                        if (collab.collaborateModalItem) {
                            await savePaper(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: id, shareUrlKey: key }, null, ctx);
                        }
                    }}
                    onPublicLinkRevoked={async () => {
                        if (collab.collaborateModalItem) {
                            await savePaper(user.uid, cryptoKey, { ...collab.collaborateModalItem, sharedId: null, shareUrlKey: null }, null, ctx);
                        }
                    }}
                />
            )}
        </div>
    );
};

export default ResearchApp;
