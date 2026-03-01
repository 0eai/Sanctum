import React, { useState, useEffect, useCallback } from 'react';
import {
    FolderLock, HardDrive, UploadCloud, Download, File, FileText,
    Image as ImageIcon, Film, Music, Archive, Lock, CheckCircle2,
    Trash2, X, MoreVertical, LayoutGrid, List, Search
} from 'lucide-react';
import {
    collection, query, where, orderBy, onSnapshot,
    addDoc, deleteDoc, doc, serverTimestamp, getDocs
} from 'firebase/firestore';

import { db } from '../../lib/firebase';
import { Button, LoadingSpinner, Modal } from '../../components/ui';
import {
    uploadLargeEncryptedFile,
    uploadNormalFile,
    downloadLargeEncryptedFile,
    downloadNormalFileBlob,
    deleteDriveFile
} from '../../services/driveStorage';
import { formatBytes } from '../../lib/fileUtils';
import SecureMediaPlayer from './components/SecureMediaPlayer';

const getFileIcon = (mimeType, isEncrypted) => {
    if (isEncrypted) return <Lock size={24} className="text-yellow-500" />;
    if (!mimeType) return <File size={24} className="text-gray-400" />;

    if (mimeType.startsWith('image/')) return <ImageIcon size={24} className="text-blue-500" />;
    if (mimeType.startsWith('video/')) return <Film size={24} className="text-purple-500" />;
    if (mimeType.startsWith('audio/')) return <Music size={24} className="text-pink-500" />;
    if (mimeType.includes('pdf') || mimeType.includes('document')) return <FileText size={24} className="text-red-500" />;
    if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar')) return <Archive size={24} className="text-amber-600" />;

    return <File size={24} className="text-gray-400" />;
};

export default function FileVaultApp({ user, cryptoKey, onExit }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [filter, setFilter] = useState('all'); // 'all' | 'encrypted' | 'standard'
    const [searchQuery, setSearchQuery] = useState('');

    // Upload State
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploadQueue, setUploadQueue] = useState([]); // [{ file, encrypt: true/false, progress: 0, status: 'pending'|'uploading'|'done'|'error', error: '' }]
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [globalEncryptToggle, setGlobalEncryptToggle] = useState(true);

    // Download State
    const [activeDownloads, setActiveDownloads] = useState({}); // { fileId: { progress: 0, status: 'downloading'|'done'|'error' } }

    // Media Player State
    const [viewingMediaFile, setViewingMediaFile] = useState(null);

    // Load Files
    useEffect(() => {
        if (!user) return;

        setLoading(true);
        const q = query(
            collection(db, `users/${user.uid}/vaultFiles`),
            orderBy('uploadDate', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedFiles = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setFiles(loadedFiles);
            setLoading(false);
        }, (error) => {
            console.error("Error loading FileVault files:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    // --- Drag and Drop Handlers ---
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const droppedFiles = Array.from(e.dataTransfer.files).map(file => ({
                id: crypto.randomUUID(),
                file,
                encrypt: globalEncryptToggle,
                progress: 0,
                status: 'pending',
                error: null
            }));
            setUploadQueue(prev => [...prev, ...droppedFiles]);
            setShowUploadModal(true);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFiles = Array.from(e.target.files).map(file => ({
                id: crypto.randomUUID(),
                file,
                encrypt: globalEncryptToggle,
                progress: 0,
                status: 'pending',
                error: null
            }));
            setUploadQueue(prev => [...prev, ...selectedFiles]);
            setShowUploadModal(true);
        }
        // reset input
        e.target.value = null;
    };

    // --- Upload Processing ---
    const startUploads = async () => {
        const accessToken = sessionStorage.getItem('googleDriveAccessToken');
        if (!accessToken) {
            alert("Google Drive access token not found. Please re-authenticate.");
            return;
        }

        const pendingUploads = uploadQueue.filter(u => u.status === 'pending');
        if (pendingUploads.length === 0) {
            setShowUploadModal(false);
            return;
        }

        // Process sequentially to save memory
        for (const item of pendingUploads) {
            updateUploadStatus(item.id, 'uploading', 0);

            try {
                let driveFileId;

                const handleProgress = (percent) => {
                    updateUploadStatus(item.id, 'uploading', percent);
                };

                if (item.encrypt) {
                    driveFileId = await uploadLargeEncryptedFile(item.file, cryptoKey, accessToken, handleProgress);
                } else {
                    // Wrap normal upload to provide fake progress if it's very small, or it just finishes
                    // For a true implementation of progress on normal files, we'd need a separate resumable normal upload
                    driveFileId = await uploadNormalFile(item.file, cryptoKey, accessToken, 'filevault');
                    handleProgress(100);
                }

                // Save metadata to Firestore
                await addDoc(collection(db, `users/${user.uid}/vaultFiles`), {
                    fileName: item.file.name, // In a fully paranoid mode, encrypt filename too
                    fileSize: item.file.size,
                    mimeType: item.file.type || 'application/octet-stream',
                    driveFileId: driveFileId,
                    isEncrypted: item.encrypt,
                    uploadDate: serverTimestamp(),
                    appName: 'filevault'
                });

                updateUploadStatus(item.id, 'done', 100);
            } catch (error) {
                console.error("Upload failed for", item.file.name, error);
                updateUploadStatus(item.id, 'error', 0, error.message);
            }
        }

        // Auto-close if all successful
        const anyErrors = uploadQueue.some(u => u.status === 'error');
        if (!anyErrors && pendingUploads.length > 0) {
            setTimeout(() => {
                setShowUploadModal(false);
                setUploadQueue([]);
            }, 1500);
        }
    };

    const updateUploadStatus = (id, status, progress, error = null) => {
        setUploadQueue(prev => prev.map(u =>
            u.id === id ? { ...u, status, progress, error: error || u.error } : u
        ));
    };

    const removeUploadItem = (id) => {
        setUploadQueue(prev => prev.filter(u => u.id !== id));
        if (uploadQueue.length <= 1) setShowUploadModal(false);
    };

    const toggleItemEncryption = (id) => {
        setUploadQueue(prev => prev.map(u =>
            u.id === id && u.status === 'pending' ? { ...u, encrypt: !u.encrypt } : u
        ));
    };

    // --- Download Processing ---
    const handleDownload = async (fileDoc) => {
        const accessToken = sessionStorage.getItem('googleDriveAccessToken');
        if (!accessToken) {
            alert("Google Drive access token not found.");
            return;
        }

        setActiveDownloads(prev => ({ ...prev, [fileDoc.id]: { progress: 0, status: 'downloading' } }));

        try {
            const handleProgress = (percent) => {
                setActiveDownloads(prev => ({ ...prev, [fileDoc.id]: { progress: percent, status: 'downloading' } }));
            };

            if (fileDoc.isEncrypted) {
                const metadata = { name: fileDoc.fileName };
                const result = await downloadLargeEncryptedFile(fileDoc.driveFileId, cryptoKey, accessToken, metadata, handleProgress);
                if (result === null) {
                    // User cancelled
                    setActiveDownloads(prev => {
                        const updated = { ...prev };
                        delete updated[fileDoc.id];
                        return updated;
                    });
                    return;
                }
            } else {
                // Standard Blob Download Fallback
                handleProgress(20);
                const blob = await downloadNormalFileBlob(fileDoc.driveFileId, cryptoKey, accessToken);
                handleProgress(80);

                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileDoc.fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10000);

                handleProgress(100);
            }

            setActiveDownloads(prev => ({ ...prev, [fileDoc.id]: { progress: 100, status: 'done' } }));
            setTimeout(() => {
                setActiveDownloads(prev => {
                    const updated = { ...prev };
                    delete updated[fileDoc.id];
                    return updated;
                });
            }, 3000);

        } catch (error) {
            console.error("Download failed", error);
            setActiveDownloads(prev => ({ ...prev, [fileDoc.id]: { progress: 0, status: 'error', error: error.message } }));
            alert(`Download failed: ${error.message}`);
        }
    };

    const handleFileClick = (fileDoc) => {
        if (fileDoc.mimeType?.startsWith('video/') || fileDoc.mimeType?.startsWith('audio/')) {
            setViewingMediaFile(fileDoc);
        } else {
            // Option to handle non-media files later (e.g. image viewer). 
            // For now, doing nothing or triggering download. Let's trigger download.
            // handleDownload(fileDoc);
        }
    };

    // --- Deletion ---
    const handleDelete = async (fileDoc) => {
        if (!window.confirm(`Delete ${fileDoc.fileName}? This cannot be undone.`)) return;

        try {
            await deleteDriveFile(fileDoc.driveFileId, cryptoKey);
            await deleteDoc(doc(db, `users/${user.uid}/vaultFiles/${fileDoc.id}`));
        } catch (error) {
            console.error("Failed to delete", error);
            alert("Failed to delete file.");
        }
    };

    // --- Render Helpers ---
    const filteredFiles = files.filter(f => {
        if (filter === 'encrypted' && !f.isEncrypted) return false;
        if (filter === 'standard' && f.isEncrypted) return false;
        if (searchQuery && !f.fileName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="flex h-[100dvh] bg-gray-50 flex-col md:flex-row font-sans">

            {/* --- Sidebar --- */}
            <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-800 font-bold text-lg">
                        <HardDrive size={24} className="text-blue-600" />
                        <span>File Vault</span>
                    </div>
                    <button onClick={onExit} className="md:hidden text-gray-500 rounded-full p-1 hover:bg-gray-100">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4">
                    <Button
                        variant="primary"
                        className="w-full justify-center gap-2 shadow-md cursor-pointer relative"
                        onClick={() => document.getElementById('vault-file-upload').click()}
                    >
                        <UploadCloud size={20} />
                        <span>Upload File</span>
                        <input
                            type="file"
                            id="vault-file-upload"
                            multiple
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                    </Button>
                </div>

                <nav className="flex-1 px-3 py-2 space-y-1">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4 px-3">Filters</div>
                    <button
                        onClick={() => setFilter('all')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${filter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <HardDrive size={18} /> All Files
                    </button>
                    <button
                        onClick={() => setFilter('encrypted')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${filter === 'encrypted' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <Lock size={18} className={filter === 'encrypted' ? 'text-yellow-600' : 'text-gray-500'} /> End-to-End Encrypted
                    </button>
                    <button
                        onClick={() => setFilter('standard')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${filter === 'standard' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <File size={18} /> Standard Storage
                    </button>
                </nav>

                <div className="p-4 mt-auto">
                    <Button variant="ghost" onClick={onExit} className="w-full justify-center hidden md:flex">
                        Exit App
                    </Button>
                </div>
            </aside>

            {/* --- Main Content --- */}
            <main
                className={`flex-1 flex flex-col relative transition-colors ${isDragOver ? 'bg-blue-50 border-4 border-dashed border-blue-400 m-2 rounded-2xl' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isDragOver && (
                    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none bg-white/50 backdrop-blur-sm rounded-2xl">
                        <div className="text-center p-8 bg-white shadow-2xl rounded-2xl border-2 border-blue-200">
                            <UploadCloud size={64} className="mx-auto text-blue-500 mb-4 animate-bounce" />
                            <h2 className="text-2xl font-bold text-gray-800">Drop files securely</h2>
                        </div>
                    </div>
                )}

                {/* Header */}
                <header className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
                    <div className="relative flex-1 max-w-md">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search files..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <List size={18} />
                        </button>
                    </div>
                </header>

                {/* File Browser */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="h-full flex items-center justify-center"><LoadingSpinner /></div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 mt-12 md:mt-24">
                            <FolderLock size={64} className="mb-4 text-gray-300 opacity-50" />
                            <h3 className="text-lg font-medium text-gray-600 mb-2">Vault is Empty</h3>
                            <p className="max-w-xs text-center text-sm">Upload files or drag and drop here to securely encrypt and store them directly to your cloud drive.</p>
                        </div>
                    ) : (
                        <div className={viewMode === 'grid'
                            ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
                            : "space-y-2 max-w-5xl mx-auto"
                        }>
                            {filteredFiles.map(file => {
                                const dt = file.uploadDate?.toDate ? file.uploadDate.toDate() : new Date();
                                const downloadState = activeDownloads[file.id];
                                const isDownloading = downloadState && downloadState.status === 'downloading';

                                if (viewMode === 'grid') {
                                    return (
                                        <div
                                            key={file.id}
                                            className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center text-center hover:shadow-md transition-shadow group relative cursor-pointer"
                                            onClick={() => handleFileClick(file)}
                                        >
                                            {file.isEncrypted && <div className="absolute top-3 left-3"><Lock size={14} className="text-yellow-500" /></div>}
                                            <button onClick={() => handleDelete(file)} className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-red-50">
                                                <Trash2 size={16} />
                                            </button>

                                            <div className="h-16 w-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                                                {getFileIcon(file.mimeType, file.isEncrypted)}
                                            </div>
                                            <div className="w-full">
                                                <h4 className="text-sm font-medium text-gray-800 truncate" title={file.fileName}>{file.fileName}</h4>
                                                <p className="text-xs text-gray-500 mt-0.5">{formatBytes(file.fileSize)}</p>
                                            </div>

                                            {isDownloading ? (
                                                <div className="w-full mt-3">
                                                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${downloadState.progress}%` }}></div>
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 mt-1">{downloadState.progress}%</p>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                                                    className="mt-3 w-full py-1.5 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 cursor-alias"
                                                    title="Download File"
                                                >
                                                    <Download size={14} /> Download
                                                </button>
                                            )}
                                        </div>
                                    );
                                }

                                // List View
                                return (
                                    <div
                                        key={file.id}
                                        className="bg-white border border-gray-100 hover:border-blue-100 rounded-xl p-3 flex items-center gap-4 hover:shadow-sm transition-all group cursor-pointer"
                                        onClick={() => handleFileClick(file)}
                                    >
                                        <div className="h-10 w-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                                            {getFileIcon(file.mimeType, file.isEncrypted)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-medium text-gray-800 truncate">{file.fileName}</h4>
                                                {file.isEncrypted && <Lock size={12} className="text-yellow-500 shrink-0" />}
                                            </div>
                                            <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                                                <span>{formatBytes(file.fileSize)}</span>
                                                <span>•</span>
                                                <span>{dt.toLocaleDateString()}</span>
                                            </div>
                                        </div>

                                        {isDownloading ? (
                                            <div className="w-24 shrink-0 flex flex-col items-end">
                                                <span className="text-xs font-medium text-blue-600 mb-1">{downloadState.progress}%</span>
                                                <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${downloadState.progress}%` }}></div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                                                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Download"
                                                >
                                                    <Download size={18} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                                                    className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>

            {/* --- Upload Modal --- */}
            <Modal isOpen={showUploadModal} onClose={() => {
                if (uploadQueue.some(u => u.status === 'uploading')) {
                    alert("Wait for uploads to finish");
                    return;
                }
                setShowUploadModal(false);
                setUploadQueue([]);
            }} title="Upload Files">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h4 className="font-semibold text-gray-800 text-sm">End-to-End Encrypt All</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Applies zero-knowledge AES-256-GCM</p>
                    </div>
                    <button
                        onClick={() => {
                            const nu = !globalEncryptToggle;
                            setGlobalEncryptToggle(nu);
                            setUploadQueue(prev => prev.map(u => u.status === 'pending' ? { ...u, encrypt: nu } : u));
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${globalEncryptToggle ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${globalEncryptToggle ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
                    {uploadQueue.map(item => (
                        <div key={item.id} className="bg-white border text-left border-gray-200 rounded-xl p-3 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 overflow-hidden pr-2">
                                    {getFileIcon(item.file.type, item.encrypt)}
                                    <span className="text-sm font-medium text-gray-800 truncate" title={item.file.name}>{item.file.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-xs">
                                    {item.status === 'pending' && (
                                        <>
                                            <button
                                                onClick={() => toggleItemEncryption(item.id)}
                                                className={`px-2 py-1 rounded-md font-medium ${item.encrypt ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}
                                            >
                                                {item.encrypt ? 'Encrypted' : 'Standard'}
                                            </button>
                                            <button onClick={() => removeUploadItem(item.id)} className="text-gray-400 hover:text-red-500"><X size={16} /></button>
                                        </>
                                    )}
                                    {item.status === 'done' && <CheckCircle2 size={18} className="text-green-500" />}
                                    {item.status === 'error' && <span className="text-red-500 font-medium">Failed</span>}
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                <span>{formatBytes(item.file.size)}</span>
                                {item.status === 'uploading' && <span className="text-blue-600 font-medium">{item.progress}%</span>}
                            </div>

                            {item.status === 'uploading' && (
                                <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${item.progress}%` }}></div>
                                </div>
                            )}
                            {item.error && <p className="text-red-500 text-xs mt-1">{item.error}</p>}
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-white">
                    <Button variant="ghost" onClick={() => setShowUploadModal(false)} disabled={uploadQueue.some(u => u.status === 'uploading')}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={startUploads}
                        disabled={uploadQueue.filter(u => u.status === 'pending').length === 0 || uploadQueue.some(u => u.status === 'uploading')}
                    >
                        {uploadQueue.some(u => u.status === 'uploading') ? 'Uploading...' : `Start Upload`}
                    </Button>
                </div>
            </Modal>

            {/* --- Media Player --- */}
            {viewingMediaFile && (
                <SecureMediaPlayer
                    file={viewingMediaFile}
                    masterKey={cryptoKey}
                    accessToken={sessionStorage.getItem('googleDriveAccessToken')}
                    onClose={() => setViewingMediaFile(null)}
                />
            )}

        </div>
    );
}
