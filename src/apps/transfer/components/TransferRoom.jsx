import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, File, CheckCircle2, Loader2, UploadCloud, HardDrive, CloudUpload, CloudDownload } from 'lucide-react';
import { Button } from '../../../components/ui';
import { formatBytes } from '../../../lib/fileUtils';
import { setRoomData, listenToRoom, cleanupRoom, setTransferFiles, setTransferComplete, listenToTransferFiles } from '../../../services/transfer';
import streamSaver from 'streamsaver';
import { uploadTransferFile, deleteTransferFolder, fetchWithDriveRetry } from '../../../services/driveStorage';
import { useDriveGuard } from '../../../hooks/useDriveGuard';

streamSaver.mitm = '/mitm.html';
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const TransferRoom = ({ user, cryptoKey, roomId, mode, onLeave }) => {
    const [status, setStatus] = useState('Initializing...');
    const [progress, setProgress] = useState(0);
    const [isConnected, setIsConnected] = useState(false);

    // Sender States
    const [filesToSend, setFilesToSend] = useState([]);
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [isSending, setIsSending] = useState(false);

    // Receiver States
    const [isReceiving, setIsReceiving] = useState(false);
    const [receivingFileName, setReceivingFileName] = useState('');
    const [receivedCount, setReceivedCount] = useState(0);
    const [totalFiles, setTotalFiles] = useState(0);

    // Transfer Log
    const [logs, setLogs] = useState([]);
    const logEndRef = useRef(null);
    const cleanedUpRef = useRef(false);

    // Drive Guard (ensures token is loaded into sessionStorage)
    const { isDriveConnected, requireDrive } = useDriveGuard(user.uid);

    const addLog = (message, type = 'info') => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => [...prev, { time, message, type }]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    // --- Signaling: Host creates room, Peer joins ---
    useEffect(() => {
        let unsub = null;

        const setup = async () => {
            if (mode === 'host') {
                // Host writes room doc and waits for peer
                await setRoomData(user.uid, roomId, { host: true, createdAt: Date.now() });
                setStatus('Waiting for peer to join...');
                addLog('Room created. Share the code with your other device.', 'info');

                // Listen for peer to join (they write { peer: true })
                unsub = listenToRoom(user.uid, roomId, (data) => {
                    if (data?.peer) {
                        setIsConnected(true);
                        setStatus('Connected! Select files to send.');
                        addLog('Peer connected via Google Drive relay.', 'success');
                    }
                });
            } else if (mode === 'peer') {
                // Peer writes to room doc to signal presence
                setStatus('Connecting to host...');
                await setRoomData(user.uid, roomId, { peer: true });
                setIsConnected(true);
                setStatus('Connected! Waiting for files...');
                addLog('Connected to host. Waiting for files...', 'success');

                // Listen for file metadata from host
                unsub = listenToTransferFiles(user.uid, roomId, async ({ files, status: transferStatus }) => {
                    if (transferStatus === 'complete') {
                        addLog('All files received!', 'success');
                        setStatus('All files received!');
                        // Cleanup (Peer just disconnects, Host does the actual deletion)
                        if (!cleanedUpRef.current) {
                            cleanedUpRef.current = true;
                        }
                        setTimeout(() => onLeave(), 2500);
                        return;
                    }

                    if (files.length > 0 && transferStatus === 'ready' && !isReceiving) {
                        setIsReceiving(true);
                        setTotalFiles(files.length);
                        addLog(`${files.length} file(s) ready for download.`, 'info');

                        // Download each file
                        for (let i = 0; i < files.length; i++) {
                            const f = files[i];
                            setReceivingFileName(f.name);
                            setReceivedCount(i);
                            setProgress(0);
                            setStatus(`Downloading: ${f.name} (${i + 1}/${files.length})`);
                            addLog(`Downloading: ${f.name} (${formatBytes(f.size)})`, 'info');

                            try {
                                let accessToken = sessionStorage.getItem('googleDriveAccessToken');
                                if (!accessToken) throw new Error("Google Drive not connected.");

                                // 1. Choose streaming strategy based on browser capabilities
                                if (isIOS) {
                                    // iOS Safari/Chrome: JS chunking / OPFS / StreamSaver lead to RAM limits or strict popup blocking.
                                    // Ping Drive API first to verify/refresh token before Native download.
                                    await fetchWithDriveRetry(`https://www.googleapis.com/drive/v3/files/${f.fileId}?fields=id`, { method: 'GET' }, cryptoKey, false);

                                    const refreshedToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;
                                    const directUrl = `https://www.googleapis.com/drive/v3/files/${f.fileId}?alt=media&access_token=${refreshedToken}`;

                                    // IFrames bypass the async anchor-click popup blocker on iOS mobile browsers.
                                    // They reliably trigger the native OS download dialogue.
                                    setTimeout(() => {
                                        const iframe = document.createElement('iframe');
                                        iframe.style.display = 'none';
                                        iframe.src = directUrl;
                                        document.body.appendChild(iframe);
                                        // Cleanup iframe eventually
                                        setTimeout(() => document.body.removeChild(iframe), 15000);
                                    }, i * 2000); // 2s stagger to prevent prompts swallowing each other

                                    // Fake progress since native UI handles it
                                    setProgress(100);
                                    addLog(`Download started in OS dialog: ${f.name}`, 'success');
                                    continue; // Skip the JS fetch stream completely
                                }

                                // Fetch the file from Drive (with auto token refresh if expired)
                                const response = await fetchWithDriveRetry(`https://www.googleapis.com/drive/v3/files/${f.fileId}?alt=media`, {
                                    method: 'GET',
                                    headers: { 'Authorization': 'Bearer ' + accessToken }
                                }, cryptoKey, false, true);

                                const reader = response.body.getReader();
                                const totalSize = f.size;
                                let received = 0;

                                let streamWriter = null;

                                if ('showSaveFilePicker' in window) {
                                    // Chrome/Edge: File System Access API (Zero SW/RAM)
                                    try {
                                        const fileHandle = await window.showSaveFilePicker({ suggestedName: f.name });
                                        streamWriter = await fileHandle.createWritable();
                                    } catch (err) {
                                        // User cancelled or unsupported, fallback to StreamSaver
                                        const fileStream = streamSaver.createWriteStream(f.name, { size: totalSize });
                                        streamWriter = fileStream.getWriter();
                                    }
                                } else {
                                    // Firefox / Safari without OPFS: StreamSaver (Service Worker)
                                    const fileStream = streamSaver.createWriteStream(f.name, { size: totalSize });
                                    streamWriter = fileStream.getWriter();
                                }

                                // 2. Stream chunks directly to disk
                                while (true) {
                                    const { done, value } = await reader.read();
                                    if (done) break;

                                    await streamWriter.write(value);
                                    received += value.length;
                                    setProgress(Math.round((received / totalSize) * 100));
                                }

                                await streamWriter.close();
                                addLog(`Saved: ${f.name}`, 'success');

                            } catch (e) {
                                console.error('Download failed', e);
                                addLog(`Failed: ${f.name} — ${e.message}`, 'error');
                            }
                        }

                        setReceivedCount(files.length);
                        setProgress(100);
                        setStatus('All files downloaded!');

                        // Signal completion to host
                        await setTransferComplete(user.uid, roomId);
                    }
                });
            }
        };

        setup();

        return () => {
            if (unsub) unsub();
            if (!cleanedUpRef.current) {
                cleanedUpRef.current = true;
                if (mode === 'host') {
                    cleanupRoom(user.uid, roomId);
                }
            }
        };
    }, [roomId, mode, user]);

    // --- Send Logic ---
    const handleSendFile = async () => {
        if (filesToSend.length === 0) return;
        if (!requireDrive()) return;

        const accessToken = sessionStorage.getItem('googleDriveAccessToken');
        if (!accessToken) {
            addLog('Google Drive not connected. Please sign out and sign back in.', 'error');
            return;
        }

        setIsSending(true);
        const uploadedFiles = [];

        for (let i = 0; i < filesToSend.length; i++) {
            const file = filesToSend[i];
            setCurrentFileIndex(i);
            setProgress(0);
            setStatus(`Uploading: ${file.name} (${i + 1}/${filesToSend.length})`);
            addLog(`Uploading: ${file.name} (${formatBytes(file.size)})`, 'info');

            try {
                const fileId = await uploadTransferFile(file, cryptoKey, accessToken, roomId, (p) => setProgress(p));
                uploadedFiles.push({
                    fileId,
                    name: file.name,
                    size: file.size,
                    type: file.type
                });
                addLog(`Uploaded: ${file.name}`, 'success');
            } catch (e) {
                console.error('Upload failed', e);
                addLog(`Upload failed: ${file.name} — ${e.message}`, 'error');
                setIsSending(false);
                return;
            }
        }

        // Write file metadata to Firestore so peer can download
        await setTransferFiles(user.uid, roomId, uploadedFiles);
        setProgress(100);
        setStatus('Files uploaded! Waiting for peer to download...');
        addLog(`${uploadedFiles.length} file(s) shared. Waiting for peer to download...`, 'info');

        // Listen for peer to finish downloading
        const unsub = listenToTransferFiles(user.uid, roomId, async ({ status: transferStatus }) => {
            if (transferStatus === 'complete') {
                unsub();
                addLog('Peer downloaded all files!', 'success');
                setStatus('Transfer complete!');
                // Cleanup
                if (!cleanedUpRef.current) {
                    cleanedUpRef.current = true;
                    await deleteTransferFolder(roomId, cryptoKey);
                    await cleanupRoom(user.uid, roomId);
                }
                setTimeout(() => onLeave(), 2500);
            }
        });
    };

    const totalSize = filesToSend.reduce((acc, file) => acc + file.size, 0);

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
            <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 p-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <button onClick={onLeave} className="p-1 hover:bg-white/20 rounded-full transition-colors flex items-center gap-1 text-sm font-bold">
                        <ChevronLeft /> Disconnect
                    </button>
                    {mode === 'host' && (
                        <div className="bg-white/20 px-3 py-1 rounded-full font-mono font-bold tracking-widest text-sm shadow-inner">
                            {roomId}
                        </div>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 flex flex-col items-center py-10">
                <div className="max-w-md w-full bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center text-center gap-6">

                    <div className="flex flex-col items-center gap-3 mb-2">
                        {isConnected ? (
                            <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center animate-in zoom-in">
                                <CheckCircle2 size={32} />
                            </div>
                        ) : (
                            <div className="w-16 h-16 bg-blue-50 text-[#4285f4] rounded-full flex items-center justify-center animate-pulse">
                                <Loader2 size={32} className="animate-spin" />
                            </div>
                        )}
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">
                                {isConnected ? 'Devices Connected' : 'Pairing Devices'}
                            </h2>
                            <p className={`text-sm mt-1 font-medium ${isConnected ? 'text-green-600' : 'text-gray-500'}`}>
                                {status}
                            </p>
                        </div>
                    </div>

                    {/* Sender UI */}
                    {isConnected && mode === 'host' && (
                        <div className="w-full flex flex-col gap-4 border-t border-gray-100 pt-6">
                            {!isSending && progress === 0 ? (
                                <>
                                    <label className="border-2 border-dashed border-gray-300 hover:border-[#4285f4] hover:bg-blue-50 transition-colors rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer group">
                                        <UploadCloud size={32} className="text-gray-400 group-hover:text-[#4285f4]" />
                                        <div className="text-sm font-bold text-gray-700">Select files to send</div>
                                        <div className="text-xs text-gray-400">Files are relayed via Google Drive</div>
                                        <input
                                            type="file"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => setFilesToSend(Array.from(e.target.files))}
                                        />
                                    </label>

                                    {filesToSend.length > 0 && (
                                        <div className="flex flex-col gap-3">
                                            <div className="bg-gray-50 p-3 rounded-xl flex items-center gap-3 text-left">
                                                <File size={24} className="text-[#4285f4] flex-shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-bold text-gray-800 truncate">
                                                        {filesToSend.length === 1 ? filesToSend[0].name : `${filesToSend.length} files selected`}
                                                    </div>
                                                    <div className="text-xs text-gray-500">Total size: {formatBytes(totalSize)}</div>
                                                </div>
                                            </div>
                                            <Button onClick={handleSendFile} className="w-full flex items-center justify-center gap-2">
                                                <CloudUpload size={16} /> Send {filesToSend.length > 1 ? 'All' : 'Now'}
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between text-sm font-bold">
                                        <span className="text-gray-600">
                                            {progress === 100 ? 'Waiting for peer...' : `Uploading ${currentFileIndex + 1} of ${filesToSend.length}`}
                                        </span>
                                        <span className="text-[#4285f4]">{progress}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                        <div className="bg-[#4285f4] h-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Receiver UI */}
                    {isConnected && mode === 'peer' && (
                        <div className="w-full flex flex-col gap-4 border-t border-gray-100 pt-6">
                            {!isReceiving && progress === 0 ? (
                                <div className="bg-gray-50 p-6 rounded-2xl flex flex-col items-center gap-2 text-gray-500">
                                    <HardDrive size={32} className="opacity-50 mb-2" />
                                    <p className="text-sm font-medium">Waiting for host to send files...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 text-left">
                                    <div className="bg-blue-50 p-3 rounded-xl flex items-center gap-3">
                                        <CloudDownload size={24} className="text-[#4285f4] flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-bold text-gray-800 truncate">{receivingFileName}</div>
                                            <div className="text-xs text-blue-600 font-medium">
                                                {progress === 100 ? `Downloaded ${receivedCount}/${totalFiles}` : `Downloading ${receivedCount + 1}/${totalFiles}`}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1 mt-2">
                                        <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            <span>Downloading</span>
                                            <span>{progress}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                            <div className="bg-green-500 h-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </main>

            {/* Transfer Log */}
            {logs.length > 0 && (
                <div className="flex-none border-t border-gray-200 bg-gray-900 text-gray-300 font-mono text-xs">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                            <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Transfer Log</span>
                            <button onClick={() => setLogs([])} className="text-gray-500 hover:text-gray-300 text-[10px] transition-colors">Clear</button>
                        </div>
                        <div className="overflow-y-auto max-h-36 px-4 py-2 flex flex-col gap-1">
                            {logs.map((log, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <span className="text-gray-500 flex-shrink-0">{log.time}</span>
                                    <span className={`flex-shrink-0 ${log.type === 'success' ? 'text-green-400' : log.type === 'error' ? 'text-red-400' : 'text-blue-400'}`}>
                                        {log.type === 'success' ? '✓' : log.type === 'error' ? '✗' : '›'}
                                    </span>
                                    <span className={log.type === 'error' ? 'text-red-300' : 'text-gray-300'}>{log.message}</span>
                                </div>
                            ))}
                            <div ref={logEndRef} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransferRoom;