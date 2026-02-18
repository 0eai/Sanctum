import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, File, CheckCircle2, Loader2, UploadCloud, HardDrive } from 'lucide-react';
import streamSaver from 'streamsaver';
import { Button } from '../../../components/ui';
import { formatBytes } from '../../../lib/fileUtils';
import {
    rtcConfiguration, setRoomData, listenToRoom,
    addIceCandidate, listenToIceCandidates, cleanupRoom
} from '../../../services/transfer';

streamSaver.mitm = '/mitm.html';
// 50MB threshold: files larger than this stream to disk instead of RAM
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

const TransferRoom = ({ user, roomId, mode, onLeave }) => {
    const [status, setStatus] = useState('Initializing...');
    const [progress, setProgress] = useState(0);
    const [isConnected, setIsConnected] = useState(false);

    // Sender States
    const [filesToSend, setFilesToSend] = useState([]);
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [isSending, setIsSending] = useState(false);

    // Receiver States
    const [incomingMeta, setIncomingMeta] = useState(null);
    const [isReceiving, setIsReceiving] = useState(false);

    // Transfer Log
    const [logs, setLogs] = useState([]);
    const logEndRef = useRef(null);

    const addLog = (message, type = 'info') => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => [...prev, { time, message, type }]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    // WebRTC & Transfer Refs
    const pcRef = useRef(null);
    const channelRef = useRef(null);
    const receiveBufferRef = useRef([]);
    const receivedBytesRef = useRef(0);
    const incomingMetaRef = useRef(null);
    const wakeLockRef = useRef(null);

    // Large file streaming writer (StreamSaver or File System Access API)
    const streamWriterRef = useRef(null);
    // Sequential write queue for File System Access API path
    const writeQueueRef = useRef(Promise.resolve());
    // ACK flow control: sender waits for ack from receiver every N chunks
    const ackResolverRef = useRef(null);
    // Guard to prevent double-calling cleanupRoom
    const roomCleanedUpRef = useRef(false);

    // Track which streaming method is active: 'fsa' | 'streamsaver' | 'ram'
    const streamModeRef = useRef('ram');

    // --- WAKE LOCK LOGIC ---
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
            }
        } catch (err) { }
    };

    const releaseWakeLock = () => {
        if (wakeLockRef.current) {
            wakeLockRef.current.release();
            wakeLockRef.current = null;
        }
    };

    useEffect(() => {
        return () => releaseWakeLock();
    }, []);

    // --- WebRTC Signaling Flow ---
    useEffect(() => {
        let roomUnsub = null;
        let iceUnsub = null;

        const initializeWebRTC = async () => {
            try {
                setStatus('Opening local sockets...');
                const pc = new RTCPeerConnection(rtcConfiguration);
                pcRef.current = pc;

                pc.oniceconnectionstatechange = () => {
                    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                        setIsConnected(true);
                        setStatus('Connected securely!');
                        addLog('Devices connected securely via WebRTC.', 'success');
                        // Delay cleanup by 5s so the peer finishes processing ICE candidates
                        if (!roomCleanedUpRef.current) {
                            roomCleanedUpRef.current = true;
                            setTimeout(() => cleanupRoom(user.uid, roomId), 5000);
                        }
                    } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                        setIsConnected(false);
                        setStatus('Connection lost.');
                        addLog('Connection lost or peer disconnected.', 'error');
                        releaseWakeLock();
                        if (streamWriterRef.current) { try { streamWriterRef.current.abort(); } catch (e) { } streamWriterRef.current = null; } // Cancel stream if dropped
                    }
                };

                if (mode === 'host') {
                    const dataChannel = pc.createDataChannel('fileTransfer');
                    dataChannel.binaryType = 'arraybuffer';
                    setupDataChannel(dataChannel);

                    pc.onicecandidate = (event) => {
                        if (event.candidate) addIceCandidate(user.uid, roomId, 'callerCandidates', event.candidate);
                    };

                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    await setRoomData(user.uid, roomId, { offer: { type: offer.type, sdp: offer.sdp } });
                    setStatus('Waiting for peer to join...');

                    roomUnsub = listenToRoom(user.uid, roomId, async (data) => {
                        if (!pc.currentRemoteDescription && data && data.answer) {
                            const answer = new RTCSessionDescription(data.answer);
                            await pc.setRemoteDescription(answer);
                        }
                    });

                    iceUnsub = listenToIceCandidates(user.uid, roomId, 'calleeCandidates', (candidate) => {
                        pc.addIceCandidate(new RTCIceCandidate(candidate));
                    });

                } else if (mode === 'peer') {
                    pc.ondatachannel = (event) => {
                        setupDataChannel(event.channel);
                    };

                    pc.onicecandidate = (event) => {
                        if (event.candidate) addIceCandidate(user.uid, roomId, 'calleeCandidates', event.candidate);
                    };

                    // Wait for the host's offer to appear (up to 30s) instead of a one-shot read
                    // This fixes the race where the peer joins before the host finishes writing the offer.
                    setStatus('Waiting for host offer...');
                    const offerData = await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            unsub();
                            reject(new Error('Timed out waiting for host offer.'));
                        }, 30000);

                        const unsub = listenToRoom(user.uid, roomId, (data) => {
                            if (data?.offer) {
                                clearTimeout(timeout);
                                unsub();
                                resolve(data);
                            }
                        });
                    });

                    const offer = new RTCSessionDescription(offerData.offer);
                    await pc.setRemoteDescription(offer);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    await setRoomData(user.uid, roomId, { answer: { type: answer.type, sdp: answer.sdp } });
                    setStatus('Connecting to host...');

                    iceUnsub = listenToIceCandidates(user.uid, roomId, 'callerCandidates', (candidate) => {
                        pc.addIceCandidate(new RTCIceCandidate(candidate));
                    });
                }
            } catch (err) {
                setStatus('Failed to establish connection.');
            }
        };

        initializeWebRTC();

        return () => {
            if (roomUnsub) roomUnsub();
            if (iceUnsub) iceUnsub();
            if (pcRef.current) pcRef.current.close();
            // Only cleanup if not already done on connect
            if (!roomCleanedUpRef.current) cleanupRoom(user.uid, roomId);
        };
    }, [roomId, mode, user]);

    // --- Data Channel Handlers ---
    // ACK_EVERY: receiver sends an ack to the sender every N chunks.
    // Sender pauses until ack received. This is the only reliable cross-platform
    // backpressure mechanism — it works on Safari/iPad where the data channel
    // buffer can't be controlled from the receiver side.
    const ACK_EVERY = 64;

    const setupDataChannel = (channel) => {
        channelRef.current = channel;
        channel.binaryType = 'arraybuffer';
        channel.bufferedAmountLowThreshold = 65535;

        let chunksReceived = 0;

        // Keep onmessage SYNCHRONOUS — async handlers don't block WebRTC delivery.
        // Instead, queue disk writes onto a sequential promise chain.
        channel.onmessage = (event) => {
            if (typeof event.data === 'string') {
                const msg = JSON.parse(event.data);

                if (msg.type === 'meta') {
                    setIncomingMeta(msg);
                    incomingMetaRef.current = msg;
                    setIsReceiving(true);
                    setProgress(0);
                    receivedBytesRef.current = 0;
                    receiveBufferRef.current = [];
                    chunksReceived = 0;
                    setStatus(`Receiving: ${msg.name}`);
                    addLog(`Receiving: ${msg.name} (${formatBytes(msg.size)})`, 'info');
                    requestWakeLock();

                    if (msg.size > LARGE_FILE_THRESHOLD && 'showSaveFilePicker' in window) {
                        // Chrome/Edge: File System Access API — true streaming to disk, no SW needed
                        streamModeRef.current = 'fsa';
                        writeQueueRef.current = writeQueueRef.current.then(async () => {
                            try {
                                const fileHandle = await window.showSaveFilePicker({ suggestedName: msg.name });
                                streamWriterRef.current = await fileHandle.createWritable();
                            } catch (err) {
                                // User cancelled — fall back to StreamSaver
                                console.warn('showSaveFilePicker cancelled, falling back to StreamSaver.', err);
                                streamModeRef.current = 'streamsaver';
                                const fileStream = streamSaver.createWriteStream(msg.name, { size: msg.size });
                                streamWriterRef.current = fileStream.getWriter();
                            }
                        });
                    } else if (msg.size > LARGE_FILE_THRESHOLD) {
                        // Safari/Firefox: StreamSaver (service worker based streaming to disk)
                        streamModeRef.current = 'streamsaver';
                        writeQueueRef.current = Promise.resolve();
                        const fileStream = streamSaver.createWriteStream(msg.name, { size: msg.size });
                        streamWriterRef.current = fileStream.getWriter();
                    } else {
                        // Small files: RAM buffer
                        streamModeRef.current = 'ram';
                        streamWriterRef.current = null;
                        writeQueueRef.current = Promise.resolve();
                    }

                } else if (msg.type === 'ack') {
                    // Sender is waiting for this — resolve the pause
                    if (ackResolverRef.current) {
                        ackResolverRef.current();
                        ackResolverRef.current = null;
                    }

                } else if (msg.type === 'eof') {
                    const meta = incomingMetaRef.current;

                    writeQueueRef.current = writeQueueRef.current.then(async () => {
                        if (streamWriterRef.current) {
                            // Close the streaming writer (FSA or StreamSaver)
                            await streamWriterRef.current.close();
                            streamWriterRef.current = null;
                            const label = streamModeRef.current === 'fsa' ? 'via File System API' : 'via StreamSaver';
                            addLog(`Saved: ${meta?.name} ${label}.`, 'success');
                        } else {
                            // RAM buffer — create Blob and trigger download
                            const blob = new Blob(receiveBufferRef.current, { type: meta?.mimeType || 'application/octet-stream' });
                            const downloadUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = downloadUrl;
                            a.download = meta?.name || 'shared_file';
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(downloadUrl); }, 250);
                            receiveBufferRef.current = [];
                            addLog(`Downloaded: ${meta?.name}.`, 'success');
                        }
                        setProgress(100);
                        setTimeout(() => { setIsReceiving(false); setProgress(0); }, 1000);
                    });

                } else if (msg.type === 'done_all') {
                    writeQueueRef.current = writeQueueRef.current.then(() => {
                        setIsReceiving(false);
                        setStatus('All files received! Disconnecting...');
                        addLog('All files received.', 'success');
                        releaseWakeLock();
                        setTimeout(() => onLeave(), 2500);
                    });
                }
            } else {
                // --- INCOMING FILE CHUNK ---
                const data = event.data;

                if (streamModeRef.current === 'streamsaver' && streamWriterRef.current) {
                    // StreamSaver: write synchronously (the writer handles backpressure internally)
                    streamWriterRef.current.write(new Uint8Array(data));
                } else if (streamModeRef.current === 'fsa') {
                    // File System Access API: queue writes to maintain order
                    writeQueueRef.current = writeQueueRef.current.then(async () => {
                        if (streamWriterRef.current) await streamWriterRef.current.write(data);
                    });
                } else {
                    // RAM buffer
                    receiveBufferRef.current.push(data);
                }

                receivedBytesRef.current += event.data.byteLength;
                const meta = incomingMetaRef.current;
                if (meta?.size) setProgress(Math.round((receivedBytesRef.current / meta.size) * 100));

                // ACK flow control: tell sender it can send more
                chunksReceived++;
                if (chunksReceived % ACK_EVERY === 0) {
                    channel.send(JSON.stringify({ type: 'ack' }));
                }
            }
        };
    };

    // --- Send Logic ---
    const handleSendFile = async () => {
        if (filesToSend.length === 0 || !channelRef.current) return;

        setIsSending(true);
        await requestWakeLock();
        const channel = channelRef.current;
        const CHUNK_SIZE = 16384; // 16KB chunks
        const ACK_EVERY_SEND = 64; // Must match receiver's ACK_EVERY

        const readSlice = (file, o) => new Promise((resolve, reject) => {
            const slice = file.slice(o, o + CHUNK_SIZE);
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(slice);
        });

        for (let i = 0; i < filesToSend.length; i++) {
            const file = filesToSend[i];
            setCurrentFileIndex(i);
            setProgress(0);
            setStatus(`Sending file ${i + 1} of ${filesToSend.length}...`);

            channel.send(JSON.stringify({ type: 'meta', name: file.name, size: file.size, mimeType: file.type }));
            addLog(`Sending: ${file.name} (${formatBytes(file.size)})`, 'info');

            let offset = 0;
            let chunksSent = 0;

            while (offset < file.size) {
                // 1. Pause if the sender-side buffer is full (standard WebRTC backpressure)
                if (channel.bufferedAmount > 65535) {
                    await new Promise(resolve => {
                        channel.onbufferedamountlow = () => { channel.onbufferedamountlow = null; resolve(); };
                    });
                }

                const buffer = await readSlice(file, offset);
                channel.send(buffer);
                offset += buffer.byteLength;
                chunksSent++;

                setProgress(Math.round((offset / file.size) * 100));

                // 2. ACK flow control: pause every ACK_EVERY chunks and wait for receiver ack
                // This prevents flooding the receiver's memory on slow devices (iPad/Safari)
                if (chunksSent % ACK_EVERY_SEND === 0) {
                    // 15s timeout: if ack never arrives, continue anyway to avoid stalling
                    await new Promise(resolve => {
                        const timer = setTimeout(() => {
                            ackResolverRef.current = null;
                            resolve();
                        }, 15000);
                        ackResolverRef.current = () => { clearTimeout(timer); resolve(); };
                    });
                }
            }

            channel.send(JSON.stringify({ type: 'eof' }));
            addLog(`Sent: ${file.name}.`, 'success');
            await new Promise(res => setTimeout(res, 500));
        }

        channel.send(JSON.stringify({ type: 'done_all' }));
        setIsSending(false);
        setStatus('All files sent! Disconnecting...');
        addLog('All files sent.', 'success');

        releaseWakeLock();
        setTimeout(() => onLeave(), 2500);
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
                                        <div className="text-xs text-gray-400">Any file type, any size</div>
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
                                            <Button onClick={handleSendFile} className="w-full">
                                                Send {filesToSend.length > 1 ? 'All' : 'Now'}
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between text-sm font-bold">
                                        <span className="text-gray-600">File {currentFileIndex + 1} of {filesToSend.length}</span>
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
                                        <File size={24} className="text-[#4285f4] flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-bold text-gray-800 truncate">{incomingMeta?.name}</div>
                                            <div className="text-xs text-blue-600 font-medium">Incoming Transfer...</div>
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