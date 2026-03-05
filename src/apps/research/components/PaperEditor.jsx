// src/apps/research/components/PaperEditor.jsx
import React, { useState, useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import FileViewer from '../../../components/ui/FileViewer';

import { savePaper, deletePaper, parseBibTeX, formatCitation } from '../services/research';
import { uploadEncryptedFile as uploadToFirebase, downloadEncryptedFileBlob as downloadBlobFirebase, uploadNormalFile as uploadNormalFirebase, downloadNormalFileBlob as downloadNormalBlobFirebase, deleteFirebaseFile } from '../../../services/firebaseStorage';
import { analyzePaperWithGemini, DEFAULT_SYSTEM_INSTRUCTION } from '../../../services/gemini';
import { fetchApiIntegrations } from '../../settings/services/settings';
import { saveTask } from '../../tasks/services/tasks';
import { listenToNotes, saveNote, getOrCreateAiPromptsFolder } from '../../notes/services/notes';
import { saveMarkdownDoc } from '../../markdown/services/markdown';
import { useDebounce } from '../../../hooks/useDebounce';

import PaperEditorHeader from './PaperEditorHeader';
import PaperMetaBar from './PaperMetaBar';
import PaperMetadataForm from './PaperMetadataForm';
import PaperAiSection from './PaperAiSection';
import PaperNotesPanel from './PaperNotesPanel';
import PaperModals from './PaperModals';

const PaperEditor = ({ user, personalKey, cryptoKey, ctx, paper, papers, onClose, onOpenApp, navigate, onCollaborate, readOnly }) => {
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
                tags: paper.tags || [], isPrivate: paper.isPrivate || false, hasPdf: paper.hasPdf || false,
                pdfPath: paper.pdfPath || null, pdfWrappingKey: paper.pdfWrappingKey || null,
                pdfHash: paper.pdfHash || null, driveFileId: paper.driveFileId || null,
                isEncrypted: paper.isEncrypted || false, aiSummary: paper.aiSummary || null,
                noteId: paper.noteId || null, markdownId: paper.markdownId || null
            }));
        } else {
            setLastSavedHash(JSON.stringify({
                title: '', authors: '', year: '', venue: '', url: '', bibtex: '', tags: [],
                isPrivate: false, hasPdf: false, pdfPath: null, pdfWrappingKey: null, pdfHash: null,
                driveFileId: null, isEncrypted: false, aiSummary: null, noteId: null, markdownId: null
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
    const [tags, setTags] = useState(paper?.tags || []);
    const [isTagInputVisible, setIsTagInputVisible] = useState(false);

    // View/Edit Toggle
    const [isPreviewMode, setIsPreviewMode] = useState(paper?.initialPreview || false);
    const [isMetadataExpanded, setIsMetadataExpanded] = useState(!paper?.initialPreview);

    useEffect(() => {
        setIsPreviewMode(paper?.initialPreview || false);
        setIsMetadataExpanded(!paper?.initialPreview);
    }, [paper?.initialPreview]);

    // PDF & AI State
    const [hasPdf, setHasPdf] = useState(paper?.hasPdf || false);
    const [pdfHash, setPdfHash] = useState(paper?.pdfHash || null);
    const [aiSummary, setAiSummary] = useState(paper?.aiSummary || null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Google Drive integration
    const [driveFileId, setDriveFileId] = useState(paper?.driveFileId || null);
    const [isEncrypted, setIsEncrypted] = useState(paper?.isEncrypted ?? false);

    // Temp references for new uploads before save (Legacy Firebase)
    const [tempPdfPath, setTempPdfPath] = useState(paper?.pdfPath || null);
    const [tempWrappingKey, setTempWrappingKey] = useState(paper?.pdfWrappingKey || null);

    // AI Review Options
    const [integrations, setIntegrations] = useState({});
    const [aiService, setAiService] = useState('gemini');
    const [aiModel, setAiModel] = useState('gemini-2.5-flash');
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);

    // AI Prompts
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [aiPrompts, setAiPrompts] = useState([]);
    const [selectedPromptId, setSelectedPromptId] = useState(null);
    const [promptsFolderId, setPromptsFolderId] = useState(null);

    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const [isSavingPrompt, setIsSavingPrompt] = useState(false);
    const [isPromptSaved, setIsPromptSaved] = useState(false);

    // PDF Viewer State
    const [pdfUrl, setPdfUrl] = useState(null);
    const [isDecrypting, setIsDecrypting] = useState(false);

    // Delete Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Note Auto-Sync State
    const [isNoteDocOpen, setIsNoteDocOpen] = useState(false);
    const [noteId, setNoteId] = useState(paper?.noteId || null);
    const [noteContent, setNoteContent] = useState('');
    const [isNoteLoaded, setIsNoteLoaded] = useState(false);
    const debouncedNote = useDebounce(noteContent, 1000);

    const [markdownId, setMarkdownId] = useState(paper?.markdownId || null);
    const [noteFolderId, setNoteFolderId] = useState(null);
    const [markdownFolderId, setMarkdownFolderId] = useState(null);

    // Initialize/Find "Research" folders for Notes and Markdown
    useEffect(() => {
        if (!user || !cryptoKey) return;
        let isMounted = true;

        const findOrCreateFolder = async (collectionName) => {
            const { getDocs, collection, addDoc, serverTimestamp } = await import('firebase/firestore');
            const { db, appId } = await import('../../../lib/firebase');
            const { decryptData, encryptData } = await import('../../../lib/crypto');

            const ref = ctx?.workspaceId
                ? collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, collectionName)
                : collection(db, 'artifacts', appId, 'users', user.uid, collectionName);
            const snap = await getDocs(ref);

            for (const docSnap of snap.docs) {
                const raw = docSnap.data();
                if (raw.type === 'folder') {
                    try {
                        const dec = await decryptData(raw, cryptoKey);
                        if (dec?.title === 'Research') return docSnap.id;
                    } catch (e) { }
                }
            }

            // Create folder directly in the correct collection
            const encrypted = await encryptData({ title: 'Research' }, cryptoKey);
            const newRef = await addDoc(ref, {
                ...encrypted, type: 'folder', parentId: null,
                createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            });
            return newRef.id;
        };

        const setupFolders = async () => {
            try {
                const nfId = await findOrCreateFolder('notes');
                const mfId = await findOrCreateFolder('markdown');
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

        // Fetch AI Prompts
        getOrCreateAiPromptsFolder(user.uid, key).then(({ folderId, prompts }) => {
            setPromptsFolderId(folderId);
            setAiPrompts(prompts);
            if (prompts.length > 0) {
                // Try to find default, otherwise pick first
                const defaultPrompt = prompts.find(p => p.title === 'Default Research Prompt') || prompts[0];
                setSelectedPromptId(defaultPrompt.id);
            }
        }).catch(err => console.error("Failed to load AI Prompts", err));
    }, [user, cryptoKey, personalKey]);

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
            title, authors, year, venue, url, bibtex, tags, isPrivate, hasPdf,
            pdfPath: tempPdfPath, pdfWrappingKey: tempWrappingKey, pdfHash,
            driveFileId, isEncrypted, aiSummary, noteId, markdownId
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
    }, [title, authors, year, venue, url, bibtex, tags, isPrivate, hasPdf, tempPdfPath, tempWrappingKey, pdfHash, driveFileId, isEncrypted, aiSummary, noteId, markdownId, internalPaperId, lastSavedHash]);

    const handleSave = async (hashToSave) => {
        if (!user || !cryptoKey) return;

        setIsSaving(true);
        try {
            const payload = {
                title, authors, year, venue, url, bibtex, tags, isPrivate,
                hasPdf,
                pdfPath: tempPdfPath,
                pdfWrappingKey: tempWrappingKey,
                pdfHash,
                driveFileId,
                isEncrypted,
                aiSummary,
                noteId,
                markdownId,
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
        } catch (error) {
            console.error('Failed to save paper:', error);
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
            if (markdownId) {
                try {
                    const { doc, deleteDoc } = await import('firebase/firestore');
                    const { db, appId } = await import('../../../lib/firebase');
                    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'markdown', markdownId));
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
            alert('Failed to delete paper.');
        }
    };

    const handleBibtexAutoFill = () => {
        if (!bibtex) return alert("Please paste a BibTeX entry first.");
        const parsed = parseBibTeX(bibtex);
        if (parsed) {
            if (!title) setTitle(parsed.title);
            if (!authors) setAuthors(parsed.authors);
            if (!year) setYear(parsed.year);
            if (!venue) setVenue(parsed.venue);
            if (!url) setUrl(parsed.url);
        } else {
            alert("Could not parse BibTeX. Please check the format.");
        }
    };

    const handlePdfUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || file.type !== 'application/pdf') return;

        if (file.size > 50 * 1024 * 1024) {
            alert("File is too large. Maximum size is 50MB.");
            e.target.value = null;
            return;
        }

        setIsUploading(true);
        setUploadProgress('Checking for duplicates...');

        try {
            // Check for duplicate files using content hash
            const { default: SparkMD5 } = await import('spark-md5');
            const arrayBuffer = await file.arrayBuffer();
            const hash = SparkMD5.ArrayBuffer.hash(arrayBuffer);

            const existingPaper = papers?.find(p => p?.pdfHash === hash && p?.id !== internalPaperId);
            if (existingPaper) {
                const proceed = window.confirm(`A PDF with the same content already exists in your library (in "${existingPaper.title || 'Untitled Paper'}"). Upload anyway?`);
                if (!proceed) {
                    setIsUploading(false);
                    setUploadProgress('');
                    return;
                }
            }

            setPdfHash(hash);

            setUploadProgress('Encrypting and uploading...');

            let fileId;
            const scope = paper.sharedId ? `shared_docs/${paper.sharedId}` : (paper.workspaceId ? `workspaces/${paper.workspaceId}/research` : `users/${user.uid}/research`);

            if (isEncrypted || isPrivate) {
                const res = await uploadToFirebase(file, cryptoKey, null, scope);
                fileId = res.id;
            } else {
                fileId = await uploadNormalFirebase(file, cryptoKey, null, scope);
            }

            // Re-fetch paper state here or pass provider through state
            setDriveFileId(fileId);
            setHasPdf(true);

            // Hack to save provider to paper immediately (or auto-save will catch it)
            setLastSavedHash(null); // Force save on next tick
            setTimeout(() => {
                handleSave(JSON.stringify({
                    title: title || file.name.replace('.pdf', ''), authors, year, venue, url, bibtex, tags, isPrivate, hasPdf: true,
                    pdfPath: tempPdfPath, pdfWrappingKey: tempWrappingKey, pdfHash: hash,
                    driveFileId: fileId, isEncrypted, aiSummary, noteId, markdownId
                }));
            }, 500);

            setUploadProgress('');

            if (!title) setTitle(file.name.replace('.pdf', ''));
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Upload failed. Please try again.');
        }

        setIsUploading(false);
    };

    const handleReadPdf = async () => {
        if (pdfUrl) {
            return;
        }

        setIsDecrypting(true);

        try {
            const fileKey = (paper?.isShared && paper?.docKey) ? paper.docKey : cryptoKey;
            if (driveFileId) {
                let blob;
                if (paper?.isEncrypted || paper?.isPrivate || paper?.isShared) {
                    blob = await downloadBlobFirebase(driveFileId, fileKey, null, 'research');
                } else {
                    blob = await downloadNormalBlobFirebase(driveFileId, fileKey, null, 'research');
                }
                const url = URL.createObjectURL(blob);
                setPdfUrl(url);
            } else if (tempPdfPath) {
                const blob = await downloadBlobFirebase(tempPdfPath, fileKey, null, 'research');
                const url = URL.createObjectURL(blob);
                setPdfUrl(url);
            }
        } catch (error) {
            console.error('Failed to decrypt PDF:', error);
            alert('Failed to decrypt PDF.');
        }

        setIsDecrypting(false);
    };

    const handleGenerateAi = async () => {
        const geminiKey = integrations?.gemini;
        if (!geminiKey) {
            alert("Please add your Gemini API Key in Settings → Integrations.");
            return;
        }

        setIsGeneratingAi(true);
        setAiSummary('Generating AI review... this may take a moment.');

        try {
            let blobForAi;
            const fileKey = (paper?.isShared && paper?.docKey) ? paper.docKey : cryptoKey;
            if (driveFileId) {
                if (paper?.isEncrypted || paper?.isPrivate || paper?.isShared) {
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

            const result = await analyzePaperWithGemini(
                geminiKey,
                blobForAi,
                'application/pdf',
                promptToUse
            );

            setAiSummary(result);

            // Auto-save the markdown review
            if (markdownFolderId && result) {
                try {
                    const reviewTitle = `AI Review: ${title || 'Untitled Paper'}`;
                    const newMarkdownId = await saveMarkdownDoc(user.uid, cryptoKey, {
                        id: markdownId,
                        title: reviewTitle,
                        content: result,
                        parentId: markdownFolderId
                    }, null, ctx);
                    if (!markdownId && newMarkdownId) {
                        setMarkdownId(newMarkdownId);
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

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
            <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col bg-white relative">

                <PaperEditorHeader
                    isSaving={isSaving}
                    isPreviewMode={isPreviewMode}
                    paper={paper}
                    navigate={navigate}
                    onClose={onClose}
                    setIsPreviewMode={setIsPreviewMode}
                    setIsMetadataExpanded={setIsMetadataExpanded}
                    setIsDeleteModalOpen={setIsDeleteModalOpen}
                    onCollaborate={onCollaborate}
                    readOnly={readOnly}
                />

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
                                handlePdfUpload={handlePdfUpload}
                                isPrivate={isPrivate} setIsPrivate={setIsPrivate}
                                isEncrypted={isEncrypted} setIsEncrypted={setIsEncrypted}
                                isUploading={isUploading} uploadProgress={uploadProgress}
                                isGeneratingAi={isGeneratingAi} handleGenerateAi={handleGenerateAi}
                                setIsPromptModalOpen={setIsPromptModalOpen}
                            />

                            <PaperMetadataForm
                                isPreviewMode={isPreviewMode}
                                authors={authors} setAuthors={setAuthors}
                                year={year} setYear={setYear}
                                venue={venue} setVenue={setVenue}
                                url={url} setUrl={setUrl}
                                bibtex={bibtex} setBibtex={setBibtex}
                                handleBibtexAutoFill={handleBibtexAutoFill}
                            />
                        </div>

                        {/* AI Review Section */}
                        <PaperAiSection isPrivate={isPrivate} aiSummary={aiSummary} />

                        {/* Research Notes Panel */}
                        {isPreviewMode && (
                            <PaperNotesPanel
                                noteContent={noteContent}
                                setNoteContent={setNoteContent}
                                isNoteLoaded={isNoteLoaded}
                                readOnly={readOnly}
                            />
                        )}

                    </div>
                </div>
            </div>

            {/* Modals & Subviewers — children of root overlay div */}
            <FileViewer
                file={pdfUrl ? { name: paper?.title + '.pdf', data: pdfUrl, type: 'application/pdf' } : null}
                onClose={() => { setPdfUrl(null); if (pdfUrl) URL.revokeObjectURL(pdfUrl); }}
            />

            <PaperModals
                isDeleteModalOpen={isDeleteModalOpen} setIsDeleteModalOpen={setIsDeleteModalOpen}
                handleDelete={handleDelete}
                isPromptModalOpen={isPromptModalOpen} setIsPromptModalOpen={setIsPromptModalOpen}
                aiService={aiService} setAiService={setAiService}
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
