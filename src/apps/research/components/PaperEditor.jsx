// src/apps/research/components/PaperEditor.jsx
import { useState, useEffect, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import FileViewer from '../../../components/ui/FileViewer';
import { savePaper, deletePaper, parseBibTeX, formatCitation } from '../services/research';
import { deleteFirebaseFile, downloadEncryptedFileBlob as downloadBlobFirebase, downloadNormalFileBlob as downloadNormalBlobFirebase } from '../../../services/firebaseStorage';
import usePaperPdf from '../hooks/usePaperPdf';
import { analyzePaperWithGeminiStream, DEFAULT_SYSTEM_INSTRUCTION } from '../../../services/gemini';
import { fetchApiIntegrations } from '../../settings/services/settings';
import { listenToNotes, saveNote, getOrCreateAiPromptsFolder } from '../../notes/services/notes';
import { saveMarkdownDoc } from '../../markdown/services/markdown';
import { useToast } from '../../../contexts/ToastContext';
import { useDebounce } from '../../../hooks/useDebounce';
import usePresence from '../../../hooks/usePresence';
import { useYjsCollab } from '../../../hooks/useYjsCollab';
import PaperEditorHeader from './PaperEditorHeader';
import PaperMetaBar from './PaperMetaBar';
import PaperMetadataForm from './PaperMetadataForm';
import PaperAiSection from './PaperAiSection';
import PaperNotesPanel from './PaperNotesPanel';
import PaperModals from './PaperModals';

const exportBibTeX = async (paper, title, authors, year, venue, url, bibtex) => {
    const content = await formatCitation({ title, authors, year, venue, url, bibtex: bibtex || paper?.bibtex }, 'BibTeX');
    const blob = new Blob([content], { type: 'text/plain' });
    const url_ = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url_;
    a.download = `${title || 'paper'}.bib`;
    a.click();
    URL.revokeObjectURL(url_);
};

const PaperEditor = ({ user, personalKey, cryptoKey, ctx, paper, papers, notesView = false, onClose, navigate, onCollaborate, onPin, readOnly }) => {
    const { showToast } = useToast();
    // Basic Meta
    const [internalPaperId, setInternalPaperId] = useState(paper?.id || null);

    // Sync if paper prop changes from outside
    const [lastSavedHash, setLastSavedHash] = useState(null);

    useEffect(() => {
        if (paper?.id) setInternalPaperId(paper.id);

        if (paper) {
            setLastSavedHash(JSON.stringify({
                title: paper.title || '', authors: paper.authors || '', year: paper.year || '',
                venue: paper.venue || '', url: paper.url || '', bibtex: paper.bibtex || '',
                tags: paper.tags || [], isPrivate: paper.isPrivate || false, status: paper.status || 'unread',
                hasPdf: paper.hasPdf || false,
                pdfPath: paper.pdfPath || null, pdfWrappingKey: paper.pdfWrappingKey || null,
                pdfHash: paper.pdfHash || null, driveFileId: paper.driveFileId || null,
                isEncrypted: paper.isEncrypted || false, aiSummary: paper.aiSummary || null,
                noteId: paper.noteId || null,
                markdownIds: paper.markdownIds || (paper.markdownId ? [paper.markdownId] : [])
            }));
        } else {
            setLastSavedHash(JSON.stringify({
                title: '', authors: '', year: '', venue: '', url: '', bibtex: '', tags: [],
                isPrivate: false, status: 'unread', hasPdf: false, pdfPath: null, pdfWrappingKey: null, pdfHash: null,
                driveFileId: null, isEncrypted: false, aiSummary: null, noteId: null, markdownIds: []
            }));
        }
    }, [paper?.id]);

    const [title, setTitle] = useState(paper?.title || '');
    const [authors, setAuthors] = useState(paper?.authors || '');
    const [year, setYear] = useState(paper?.year || '');
    const [venue, setVenue] = useState(paper?.venue || '');
    const [url, setUrl] = useState(paper?.url || '');
    const [bibtex, setBibtex] = useState(paper?.bibtex || '');
    const [isPrivate, setIsPrivate] = useState(paper?.isPrivate || false);
    const [status, setStatus] = useState(paper?.status || 'unread');
    const [tags, setTags] = useState(paper?.tags || []);
    const [isTagInputVisible, setIsTagInputVisible] = useState(false);

    // View/Edit Toggle
    const [isPreviewMode, setIsPreviewMode] = useState(paper?.initialPreview || false);
    const [, setIsMetadataExpanded] = useState(!paper?.initialPreview);

    useEffect(() => {
        setIsPreviewMode(paper?.initialPreview || false);
        setIsMetadataExpanded(!paper?.initialPreview);
    }, [paper?.initialPreview]);

    // PDF state + handlers extracted into usePaperPdf
    const {
        hasPdf, setHasPdf,
        pdfHash,
        isUploading,
        uploadProgress,
        driveFileId,
        isEncrypted, setIsEncrypted,
        tempPdfPath, setTempPdfPath,
        tempWrappingKey,
        pdfBlob, setPdfBlob,
        isDecrypting,
        handlePdfUpload,
        handleReadPdf,
    } = usePaperPdf({ paper, cryptoKey, user, papers, internalPaperId });

    // Presence — who else has this shared doc open
    const presenceUsers = usePresence({
        shareId: paper?.shareId || null,
        uid: user?.uid,
        displayName: user?.displayName || user?.email || null,
        enabled: !!paper?.isSharedDoc,
    });

    // Save / AI state — must be declared BEFORE the CRDT useEffect blocks that
    // reference aiSummary/setAiSummary; prevents TDZ crash in production minified
    // builds where the bundler can surface the const before its useState call.
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const [aiSummary, setAiSummary] = useState(paper?.aiSummary || null);

    // CRDT — real-time aiSummary sync for shared papers via Y.js
    const crdtEnabled = !!paper?.isSharedDoc && !!(paper?.shareId || paper?.id);
    const { ydocRef, ytextRef } = useYjsCollab({
        shareId: paper?.shareId || paper?.id || null,
        docKey: (paper?.isSharedDoc && paper?.docKey) ? paper.docKey : cryptoKey,
        uid: user?.uid,
        enabled: crdtEnabled,
        field: 'aiSummary',
    });
    const lastCrdtAiSummaryRef = useRef(null);

    // CRDT: mirror remote Y.Text changes → aiSummary state
    useEffect(() => {
        const ytext = ytextRef.current;
        if (!ytext || !crdtEnabled) return;
        const observer = (_, tx) => {
            if (tx.origin !== 'remote') return;
            const val = ytext.toString();
            lastCrdtAiSummaryRef.current = val;
            setAiSummary(val || null);
        };
        ytext.observe(observer);
        return () => ytext.unobserve(observer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crdtEnabled, ytextRef.current]);

    // CRDT: write aiSummary → Y.Text on local changes (skip if from remote)
    useEffect(() => {
        if (!crdtEnabled || !ytextRef.current || !ydocRef.current) return;
        const serialized = aiSummary || '';
        if (serialized === lastCrdtAiSummaryRef.current) return;
        const ytext = ytextRef.current;
        const old = ytext.toString();
        if (old === serialized) return;
        let s = 0;
        while (s < old.length && s < serialized.length && old[s] === serialized[s]) s++;
        let eO = old.length, eN = serialized.length;
        while (eO > s && eN > s && old[eO - 1] === serialized[eN - 1]) { eO--; eN--; }
        ydocRef.current.transact(() => {
            if (eO > s) ytext.delete(s, eO - s);
            if (eN > s) ytext.insert(s, serialized.slice(s, eN));
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiSummary, crdtEnabled]);

    // Stale-document detection
    const [remoteUpdateDetected, setRemoteUpdateDetected] = useState(false);
    const baseVersionRef = useRef(paper?.versionId ?? 0);

    useEffect(() => {
        if (!paper?.isSharedDoc) return;
        const incoming = paper?.versionId ?? 0;
        if (incoming > baseVersionRef.current && !isSaving) {
            setRemoteUpdateDetected(true);
        }
        baseVersionRef.current = incoming;
    }, [paper?.versionId]);

    useEffect(() => {
        if (isSaving) setRemoteUpdateDetected(false);
    }, [isSaving]);

    // AI Review Options
    const [integrations, setIntegrations] = useState({});
    const [aiModel, setAiModel] = useState('gemini-2.5-flash');
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);

    // AI Prompts
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [aiPrompts, setAiPrompts] = useState([]);
    const [selectedPromptId, setSelectedPromptId] = useState(null);
    const [promptsFolderId, setPromptsFolderId] = useState(null);
    const [promptsLoaded, setPromptsLoaded] = useState(false);

    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const [isSavingPrompt, setIsSavingPrompt] = useState(false);
    const [isPromptSaved, setIsPromptSaved] = useState(false);

    // Delete Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Note Auto-Sync State
    const [noteId, setNoteId] = useState(paper?.noteId || null);
    const [noteContent, setNoteContent] = useState('');
    const [isNoteLoaded, setIsNoteLoaded] = useState(false);
    const debouncedNote = useDebounce(noteContent, 1000);

    const [markdownIds, setMarkdownIds] = useState(() => {
        if (paper?.markdownIds?.length) return paper.markdownIds;
        if (paper?.markdownId) return [paper.markdownId]; // backward compat with old single-ID field
        return [];
    });
    const [noteFolderId, setNoteFolderId] = useState(null);
    const [markdownFolderId, setMarkdownFolderId] = useState(null);

    // Initialize/Find "Research" folders for Notes and Markdown
    useEffect(() => {
        if (!user || !cryptoKey) return;
        let isMounted = true;

        // Generic folder finder/creator for a given collection, key, and Firestore ref factory.
        const findOrCreateFolder = async (_collectionName, key, colRefFn, cacheKey) => {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) return cached;

            const { getDocs, collection, addDoc, serverTimestamp } = await import('firebase/firestore');
            const { db, appId } = await import('../../../lib/firebase');
            const { decryptData, encryptData } = await import('../../../lib/crypto');

            const ref = colRefFn(collection, db, appId);
            const snap = await getDocs(ref);

            for (const docSnap of snap.docs) {
                const raw = docSnap.data();
                if (raw.type === 'folder') {
                    try {
                        // Handle both new field-level format (encryptedTitle) and legacy single-blob format
                        const folderTitle = raw.encryptedTitle
                            ? await decryptData(raw.encryptedTitle, key)
                            : (await decryptData(raw, key))?.title;
                        if (folderTitle === 'Research') {
                            sessionStorage.setItem(cacheKey, docSnap.id);
                            return docSnap.id;
                        }
                    } catch (e) { }
                }
            }

            // Create folder using the same field-level format as the Markdown app
            const encryptedTitle = await encryptData('Research', key);
            const newRef = await addDoc(ref, {
                encryptedTitle, type: 'folder', parentId: null,
                createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            });
            sessionStorage.setItem(cacheKey, newRef.id);
            return newRef.id;
        };

        const setupFolders = async () => {
            try {
                // Notes folder: uses current context (workspace or personal vault)
                const notesKey = personalKey || cryptoKey;
                const nfId = await findOrCreateFolder(
                    'notes', notesKey,
                    (col, db, aid) => ctx?.workspaceId
                        ? col(db, 'artifacts', aid, 'workspaces', ctx.workspaceId, 'notes')
                        : col(db, 'artifacts', aid, 'users', user.uid, 'notes'),
                    `research_folder_notes_${ctx?.workspaceId || user.uid}`
                );

                // Markdown folder: always personal vault so reviews are accessible in the Markdown app
                const mdKey = personalKey || cryptoKey;
                const mfId = await findOrCreateFolder(
                    'markdown', mdKey,
                    (col, db, aid) => col(db, 'artifacts', aid, 'users', user.uid, 'markdown'),
                    `research_folder_markdown_${user.uid}`
                );

                if (isMounted) {
                    setNoteFolderId(nfId);
                    setMarkdownFolderId(mfId);
                }
            } catch (e) { console.error("Failed to setup folders", e); }
        };

        setupFolders();

        return () => { isMounted = false; };
    }, [user, cryptoKey, ctx]);

    useEffect(() => {
        const key = personalKey || cryptoKey;
        if (!user || !key) return;
        fetchApiIntegrations(user.uid, key).then(data => {
            setIntegrations(data);
        });
    }, [user, cryptoKey, personalKey]);

    const loadAiPrompts = async () => {
        if (promptsLoaded) return;
        const key = personalKey || cryptoKey;
        if (!user || !key) return;
        try {
            const { folderId, prompts } = await getOrCreateAiPromptsFolder(user.uid, key);
            setPromptsFolderId(folderId);
            setAiPrompts(prompts);
            if (prompts.length > 0) {
                const defaultPrompt = prompts.find(p => p.title === 'Default Research Prompt') || prompts[0];
                setSelectedPromptId(defaultPrompt.id);
            }
            setPromptsLoaded(true);
        } catch (err) {
            console.error("Failed to load AI Prompts", err);
        }
    };

    useEffect(() => {
        if (!user || !cryptoKey || !title || !isPreviewMode) return;

        const unsubscribe = listenToNotes(user.uid, cryptoKey, (docs) => {
            if (isNoteLoaded) return;
            const expectedTitle = `Review: ${title}`;
            const existingDoc = docs.find(d => d.title === expectedTitle && d.type !== 'folder');
            if (existingDoc) {
                setNoteId(existingDoc.id);
                setNoteContent(existingDoc.content || '');
            }
            setIsNoteLoaded(true);
        });

        return () => unsubscribe();
    }, [user, cryptoKey, title, isPreviewMode]);

    useEffect(() => {
        if (!isNoteLoaded || debouncedNote === undefined || !isPreviewMode || !noteFolderId) return;

        const saveLinkedDoc = async () => {
            try {
                const targetTitle = `Review: ${paper?.title || title}`;
                const newDocId = await saveNote(user.uid, cryptoKey, {
                    id: noteId,
                    title: targetTitle,
                    content: debouncedNote
                }, noteFolderId, ctx);

                if (!noteId && newDocId) {
                    setNoteId(newDocId);
                }
            } catch (error) {
                console.error("Failed to auto-save linked note doc", error);
            }
        };

        if (debouncedNote) {
            saveLinkedDoc();
        }
    }, [debouncedNote, noteId, paper?.title, title, isNoteLoaded, isPreviewMode, noteFolderId]);

    // Auto-save changes for paper properties
    useEffect(() => {
        if (!user || !cryptoKey || lastSavedHash === null) return;

        const currentPayloadObj = {
            title, authors, year, venue, url, bibtex, tags, isPrivate, status, hasPdf,
            pdfPath: tempPdfPath, pdfWrappingKey: tempWrappingKey, pdfHash,
            driveFileId, isEncrypted, aiSummary, noteId, markdownIds
        };
        const currentHash = JSON.stringify(currentPayloadObj);

        if (currentHash === lastSavedHash) {
            return; // No actual changes
        }

        let shouldSave = false;
        if (internalPaperId) {
            shouldSave = true;
        } else if (title || hasPdf) {
            shouldSave = true;
        }

        if (shouldSave) {
            const timer = setTimeout(() => {
                handleSave(currentHash);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [title, authors, year, venue, url, bibtex, tags, isPrivate, status, hasPdf, tempPdfPath, tempWrappingKey, pdfHash, driveFileId, isEncrypted, aiSummary, noteId, markdownIds, internalPaperId, lastSavedHash]);

    const handleSave = async (hashToSave) => {
        if (!user || !cryptoKey) return;

        setIsSaving(true);
        try {
            const payload = {
                title, authors, year, venue, url, bibtex, tags, isPrivate, status,
                hasPdf,
                pdfPath: tempPdfPath,
                pdfWrappingKey: tempWrappingKey,
                pdfHash,
                driveFileId,
                isEncrypted,
                aiSummary,
                noteId,
                markdownIds,
                parentId: paper?.parentId || null,
            };

            if (internalPaperId) {
                payload.id = internalPaperId;
            }

            const savedId = await savePaper(user.uid, cryptoKey, payload, null, ctx);

            if (!internalPaperId && savedId) {
                setInternalPaperId(savedId);
            }

            if (hashToSave) {
                setLastSavedHash(hashToSave);
            }
            setSaveError(false);
        } catch (error) {
            console.error('Failed to save paper:', error);
            setSaveError(true);
        }

        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!internalPaperId) return;

        try {
            // Delete linked note if exists
            if (noteId) {
                try {
                    const { doc, deleteDoc } = await import('firebase/firestore');
                    const { db, appId } = await import('../../../lib/firebase');
                    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', noteId));
                } catch (e) { console.error("Failed to delete linked note", e); }
            }

            // Delete linked markdown if exists
            for (const mdId of markdownIds) {
                try {
                    const { doc, deleteDoc } = await import('firebase/firestore');
                    const { db, appId } = await import('../../../lib/firebase');
                    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'markdown', mdId));
                } catch (e) { console.error("Failed to delete linked markdown", e); }
            }

            // Delete file if exists
            if (driveFileId) {
                await deleteFirebaseFile(driveFileId, 'research');
            }

            await deletePaper(user.uid, internalPaperId, ctx);
            onClose();
        } catch (error) {
            console.error('Failed to delete paper:', error);
            showToast('Failed to delete paper.', 'error');
        }
    };

    const handleBibtexAutoFill = async () => {
        if (!bibtex) { showToast("Please paste a BibTeX entry first.", 'error'); return; }
        const parsed = await parseBibTeX(bibtex);
        if (parsed) {
            if (!title) setTitle(parsed.title);
            if (!authors) setAuthors(parsed.authors);
            if (!year) setYear(parsed.year);
            if (!venue) setVenue(parsed.venue);
            if (!url) setUrl(parsed.url);
        } else {
            showToast("Could not parse BibTeX. Please check the format.", 'error');
        }
    };

    const handlePdfUploadWithTitle = async (e) => {
        const fileName = await handlePdfUpload(e);
        if (fileName && !title) setTitle(fileName.replace('.pdf', ''));
    };

    const handleGenerateAi = async () => {
        if (readOnly) return;
        await loadAiPrompts();
        const geminiKey = integrations?.gemini;
        if (!geminiKey) {
            showToast("Please add your Gemini API Key in Settings → Integrations.", 'error');
            return;
        }

        setIsGeneratingAi(true);
        setAiSummary('Generating AI review... this may take a moment.');

        try {
            let blobForAi;
            const fileKey = (paper?.isSharedDoc && paper?.docKey) ? paper.docKey : cryptoKey;
            if (driveFileId) {
                if (paper?.isEncrypted || paper?.isPrivate || paper?.isSharedDoc) {
                    blobForAi = await downloadBlobFirebase(driveFileId, fileKey, null, 'research');
                } else {
                    blobForAi = await downloadNormalBlobFirebase(driveFileId, fileKey, null, 'research');
                }
            } else if (tempPdfPath) {
                blobForAi = await downloadBlobFirebase(tempPdfPath, fileKey, null, 'research');
            }

            if (!blobForAi) {
                throw new Error("Could not retrieve PDF data for AI analysis.");
            }

            const promptToUse = aiPrompts.find(p => p.id === selectedPromptId)?.content || DEFAULT_SYSTEM_INSTRUCTION;

            const result = await analyzePaperWithGeminiStream(
                geminiKey,
                blobForAi,
                'application/pdf',
                promptToUse,
                (partial) => setAiSummary(partial)
            );

            setAiSummary(result);

            // Auto-save the markdown review to personal vault (same as note linking)
            // Using personalKey ensures the review is always readable in the Markdown app
            // regardless of whether the paper is a shared doc or in a workspace.
            const mdKey = personalKey || cryptoKey;
            if (markdownFolderId && result) {
                try {
                    const reviewTitle = `AI Review: ${title || 'Untitled Paper'}`;
                    const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const newMarkdownId = await saveMarkdownDoc(user.uid, mdKey, {
                        title: `${reviewTitle} — ${stamp}`,
                        content: result,
                        parentId: markdownFolderId
                    }, null, null);
                    if (newMarkdownId) {
                        setMarkdownIds(prev => [...prev, newMarkdownId]);
                    }
                } catch (e) {
                    console.error("Failed to auto-save AI review to Markdown", e);
                }
            }
        } catch (error) {
            console.error('AI review generation failed:', error);
            setAiSummary(`**Error:** ${error.message || 'Failed to generate AI review.'}`);
        }

        setIsGeneratingAi(false);
    };

    const handleSavePrompt = async (promptData) => {
        setIsSavingPrompt(true);
        try {
            await saveNote(user.uid, cryptoKey, {
                id: selectedPromptId,
                title: promptData.title,
                content: promptData.content,
                tags: promptData.tags || []
            }, promptsFolderId);

            setAiPrompts(prev => prev.map(p => p.id === selectedPromptId ? { ...p, ...promptData } : p));
            setIsPromptSaved(true);
            setTimeout(() => setIsPromptSaved(false), 3000);
        } catch (e) {
            console.error("Failed to save prompt", e);
        }
        setIsSavingPrompt(false);
    };

    if (notesView) {
        return (
            <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
                    <button
                        onClick={() => navigate(`#research/paper/${paper?.id}`)}
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
                    >
                        ← Back to Paper
                    </button>
                    <span className="text-gray-300">|</span>
                    <span className="text-sm font-semibold text-gray-700 truncate">{title || 'Untitled Paper'}</span>
                </div>
                <div className="flex-1 overflow-y-auto px-6 md:px-10 py-8">
                    <PaperNotesPanel
                        noteContent={noteContent}
                        setNoteContent={setNoteContent}
                        isNoteLoaded={isNoteLoaded}
                        readOnly={readOnly}
                        noteId={noteId}
                        navigate={navigate}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
            <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col bg-white relative">

                <PaperEditorHeader
                    saveStatus={saveError ? 'error' : isSaving ? 'saving' : 'saved'}
                    onRetry={() => handleSave(null)}
                    presenceUsers={presenceUsers}
                    isPreviewMode={isPreviewMode}
                    paper={paper}
                    navigate={navigate}
                    onClose={onClose}
                    setIsPreviewMode={setIsPreviewMode}
                    setIsMetadataExpanded={setIsMetadataExpanded}
                    setIsDeleteModalOpen={setIsDeleteModalOpen}
                    onCollaborate={onCollaborate}
                    onPin={onPin}
                    onExport={() => exportBibTeX(paper, title, authors, year, venue, url, bibtex)}
                    readOnly={readOnly}
                />

                {remoteUpdateDetected && (
                    <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
                        <span>A collaborator saved this document. Saving will overwrite their changes.</span>
                        <button onClick={() => setRemoteUpdateDetected(false)} className="ml-4 text-amber-500 hover:text-amber-700 font-medium">Dismiss</button>
                    </div>
                )}

                {/* Scrollable Content Container */}
                <div className="flex-1 w-full">
                    <div className="p-6 md:p-10 flex flex-col gap-6 min-h-full">

                        {/* Editable Title */}
                        {!isPreviewMode ? (
                            <TextareaAutosize
                                value={title}
                                minRows={1}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-transparent text-3xl sm:text-4xl font-extrabold text-gray-900 border-none outline-none placeholder-gray-300 resize-none break-words p-0"
                                placeholder="Paper Title"
                            />
                        ) : (
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight break-words">
                                {title || "Untitled Paper"}
                            </h1>
                        )}

                        {/* Meta Bar + Metadata Form */}
                        <div className="flex flex-col gap-4">
                            <PaperMetaBar
                                tags={tags} setTags={setTags}
                                isTagInputVisible={isTagInputVisible} setIsTagInputVisible={setIsTagInputVisible}
                                isPreviewMode={isPreviewMode}
                                hasPdf={hasPdf} setHasPdf={setHasPdf}
                                setTempPdfPath={setTempPdfPath} setAiSummary={setAiSummary}
                                isDecrypting={isDecrypting} handleReadPdf={handleReadPdf}
                                handlePdfUpload={handlePdfUploadWithTitle}
                                isPrivate={isPrivate} setIsPrivate={setIsPrivate}
                                isEncrypted={isEncrypted} setIsEncrypted={setIsEncrypted}
                                isUploading={isUploading} uploadProgress={uploadProgress}
                                isGeneratingAi={isGeneratingAi} handleGenerateAi={handleGenerateAi}
                                setIsPromptModalOpen={(v) => { if (v) loadAiPrompts(); setIsPromptModalOpen(v); }}
                                status={status} setStatus={!readOnly ? setStatus : undefined}
                                readOnly={readOnly}
                            />

                            <PaperMetadataForm
                                isPreviewMode={isPreviewMode}
                                readOnly={readOnly}
                                authors={authors} setAuthors={setAuthors}
                                year={year} setYear={setYear}
                                venue={venue} setVenue={setVenue}
                                url={url} setUrl={setUrl}
                                bibtex={bibtex} setBibtex={setBibtex}
                                handleBibtexAutoFill={handleBibtexAutoFill}
                            />
                        </div>

                        {/* AI Review Section */}
                        <PaperAiSection isPrivate={isPrivate} aiSummary={aiSummary} markdownIds={markdownIds} navigate={navigate} user={user} mdKey={personalKey || cryptoKey} />

                        {/* Research Notes Panel */}
                        {isPreviewMode && (
                            <PaperNotesPanel
                                noteContent={noteContent}
                                setNoteContent={setNoteContent}
                                isNoteLoaded={isNoteLoaded}
                                readOnly={readOnly}
                                noteId={noteId}
                                navigate={navigate}
                            />
                        )}

                    </div>
                </div>
            </div>

            {/* Modals & Subviewers — children of root overlay div */}
            <FileViewer
                file={pdfBlob ? { name: paper?.title + '.pdf', data: pdfBlob, type: 'application/pdf' } : null}
                onClose={() => setPdfBlob(null)}
            />

            <PaperModals
                isDeleteModalOpen={isDeleteModalOpen} setIsDeleteModalOpen={setIsDeleteModalOpen}
                handleDelete={handleDelete}
                isPromptModalOpen={isPromptModalOpen} setIsPromptModalOpen={setIsPromptModalOpen}
                aiModel={aiModel} setAiModel={setAiModel}
                aiPrompts={aiPrompts} selectedPromptId={selectedPromptId} setSelectedPromptId={setSelectedPromptId}
                isEditingPrompt={isEditingPrompt} setIsEditingPrompt={setIsEditingPrompt}
                handleSavePrompt={handleSavePrompt}
                isSavingPrompt={isSavingPrompt} isPromptSaved={isPromptSaved}
            />
        </div>
    );
};

export default PaperEditor;
