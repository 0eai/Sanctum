import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Loader, AlertCircle } from 'lucide-react';
import { downloadPartialEncryptedFile, downloadNormalFile } from '../../../services/driveStorage';

// Constants for Chunking
// The encrypted chunk is exactly 5MB: 5,242,880 bytes.
const ENCRYPTED_CHUNK_SIZE = 5242880;

const SecureMediaPlayer = ({ file, masterKey, accessToken, onClose }) => {
    const videoRef = useRef(null);
    const mediaSourceRef = useRef(null);
    const sourceBufferRef = useRef(null);

    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);

    // Playback state
    const currentOffsetRef = useRef(0);
    const fetchLoopActive = useRef(false);

    // Calculate the true encrypted size for byte-range bounds
    const PLAINTEXT_CHUNK_SIZE = ENCRYPTED_CHUNK_SIZE - 28;
    const numChunks = Math.ceil((file.fileSize || 0) / PLAINTEXT_CHUNK_SIZE);
    const totalEncryptedSize = (file.fileSize || 0) + (numChunks * 28);
    const fileSizeRef = useRef(file.isEncrypted ? totalEncryptedSize : (file.fileSize || 0));

    const isAudio = file.mimeType.startsWith('audio/');

    useEffect(() => {
        if (!file.isEncrypted) {
            // Unencrypted fallback (Legacy blob strategy for now, as fetching range with auth header directly in <video> isn't natively supported)
            // Or we could MSE it without decryption. But let's follow the prompt's simplicity fallback.
            setIsLoading(true);
            downloadNormalFile(file.driveFileId, masterKey, accessToken)
                .then(url => {
                    if (videoRef.current) {
                        videoRef.current.src = url;
                        videoRef.current.play().catch(e => console.warn("Auto-play blocked", e));
                    }
                    setIsLoading(false);
                })
                .catch(err => {
                    setError(`Failed to load unencrypted media: ${err.message}`);
                    setIsLoading(false);
                });
            return;
        }

        // Encrypted MSE Flow
        const startMSE = async () => {
            setIsLoading(true);
            try {
                if (!window.MediaSource) {
                    throw new Error("Media Source Extensions not supported in this browser.");
                }

                mediaSourceRef.current = new MediaSource();
                const url = URL.createObjectURL(mediaSourceRef.current);
                if (videoRef.current) {
                    videoRef.current.src = url;
                }

                mediaSourceRef.current.addEventListener('sourceopen', onSourceOpen);
            } catch (err) {
                setError(`Failed to initialize player: ${err.message}`);
            }
        };

        const onSourceOpen = () => {
            try {
                // We use a generic codec but it's highly dependent on the actual container.
                // We'll use a very permissive mp4 codec string. 
                // In production, you'd extract this from the moov atom or user metadata.
                const mimeCodec = file.mimeType.includes('webm')
                    ? 'video/webm; codecs="vp8, vorbis"'
                    : file.mimeType.includes('audio')
                        ? 'audio/mp4; codecs="mp4a.40.2"'
                        : 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';

                if (!MediaSource.isTypeSupported(mimeCodec)) {
                    console.warn(`Codec ${mimeCodec} might not be supported. Attempting fallback codecs...`);
                }

                sourceBufferRef.current = mediaSourceRef.current.addSourceBuffer(mimeCodec);
                sourceBufferRef.current.mode = 'sequence'; // append in sequence

                sourceBufferRef.current.addEventListener('updateend', onUpdateEnd);

                // Start the fetch loop
                fetchLoopActive.current = true;
                currentOffsetRef.current = 0;
                fetchNextChunk();
                setIsLoading(false);

            } catch (err) {
                setError(`MSE Error: ${err.message}`);
            }
        };

        const fetchNextChunk = async () => {
            if (!fetchLoopActive.current || !sourceBufferRef.current) return;
            if (mediaSourceRef.current?.readyState !== 'open') return;
            if (sourceBufferRef.current.updating) return; // Wait until ready

            if (currentOffsetRef.current >= fileSizeRef.current) {
                // Done fetching all bytes
                try {
                    if (mediaSourceRef.current.readyState === 'open') {
                        mediaSourceRef.current.endOfStream();
                    }
                } catch (e) {
                    console.warn("endOfStream issue", e);
                }
                return;
            }

            try {
                const startByte = currentOffsetRef.current;
                const endByte = Math.min(startByte + ENCRYPTED_CHUNK_SIZE - 1, fileSizeRef.current - 1);

                // For very large files, if the buffer gets too far ahead of the current playtime,
                // we should pause fetching to save data/memory until the user watches more.
                // Assuming a bitrate, roughly 5MB = 10 seconds. We can buffer ahead.
                if (videoRef.current) {
                    const buffered = videoRef.current.buffered;
                    if (buffered.length > 0) {
                        const bufferEnd = buffered.end(buffered.length - 1);
                        const currentTime = videoRef.current.currentTime;
                        if (bufferEnd - currentTime > 30) {
                            // Buffer is 30+ seconds ahead. Wait a bit before fetching more.
                            setTimeout(fetchNextChunk, 2000);
                            return;
                        }
                    }
                }

                const decryptedChunk = await downloadPartialEncryptedFile(
                    file.driveFileId,
                    masterKey,
                    accessToken,
                    startByte,
                    endByte
                );

                currentOffsetRef.current = endByte + 1; // move offset forward

                if (mediaSourceRef.current?.readyState !== 'open') {
                    // Preemptively abandon append if the media source died (e.g., from a decode error)
                    throw new Error("MediaSource was closed before append could complete.");
                }

                if (decryptedChunk && decryptedChunk.length > 0) {
                    sourceBufferRef.current.appendBuffer(decryptedChunk);
                } else {
                    fetchNextChunk(); // Try next if empty somehow
                }

            } catch (err) {
                console.error("Chunk fetch/decrypt error:", err);
                // Pause loop on error, could retry
                fetchLoopActive.current = false;
                setError("Streaming failed or interrupted. Network issue?");
            }
        };

        const onUpdateEnd = () => {
            // Buffer finished appending, fetch next
            if (fetchLoopActive.current) {
                fetchNextChunk();
            }
        };

        startMSE();

        return () => {
            fetchLoopActive.current = false;
            if (sourceBufferRef.current) {
                sourceBufferRef.current.removeEventListener('updateend', onUpdateEnd);
                if (mediaSourceRef.current?.readyState === 'open') {
                    try {
                        sourceBufferRef.current.abort();
                    } catch (e) { }
                }
            }
            if (mediaSourceRef.current) {
                mediaSourceRef.current.removeEventListener('sourceopen', onSourceOpen);
                if (mediaSourceRef.current.readyState === 'open') {
                    try { mediaSourceRef.current.endOfStream(); } catch (e) { }
                }
            }
            if (videoRef.current?.src) {
                URL.revokeObjectURL(videoRef.current.src);
            }
        };
    }, [file, masterKey, accessToken]);

    // Handle Seeking
    const handleSeek = (e) => {
        if (!file.isEncrypted) return; // Native handles it

        const video = videoRef.current;
        if (!video || !sourceBufferRef.current || !mediaSourceRef.current) return;

        const seekTime = video.currentTime;

        // Rough estimation: byte offset = (seekTime / duration) * total_encrypted_bytes
        // Because of the 12B IV + 16B Tag per 5MB plaintext chunk, it's not a perfectly linear mapping to plaintext, 
        // but since we only fetch in 5MB boundaries, we must align the byte offset to the nearest ENCRYPTED_CHUNK_SIZE boundary!

        if (!video.duration || isNaN(video.duration)) return; // Cannot seek if duration unknown

        const rawByteOffset = (seekTime / video.duration) * fileSizeRef.current;
        const chunkIndex = Math.floor(rawByteOffset / ENCRYPTED_CHUNK_SIZE);
        const alignedByteOffset = chunkIndex * ENCRYPTED_CHUNK_SIZE;

        // Flush buffer
        fetchLoopActive.current = false; // Pause current Loop
        try {
            if (mediaSourceRef.current?.readyState === 'open' && sourceBufferRef.current) {
                if (sourceBufferRef.current.updating) {
                    sourceBufferRef.current.abort();
                }
                // Removing all buffered data to force fresh append at seek point
                if (video.buffered.length > 0) {
                    sourceBufferRef.current.remove(0, video.duration);
                }
            }
        } catch (err) {
            console.warn("Buffer clear issue during seek", err);
        }

        // Wait a tiny bit for remove operation to settle, then restart loop
        setTimeout(() => {
            currentOffsetRef.current = alignedByteOffset;
            fetchLoopActive.current = true;
            // The sourceBuffer is probably updating from the `remove()` operation, so we wait for updateend, 
            // but we can just trigger fetchNextChunk which checks `updating`. It might skip.
            // A safer hook:
            const waitForUpdate = () => {
                if (!sourceBufferRef.current.updating) {
                    currentOffsetRef.current = alignedByteOffset;
                    fetchLoopActive.current = true;
                    // Trigger it
                    const ev = new Event('updateend');
                    sourceBufferRef.current.dispatchEvent(ev);
                } else {
                    setTimeout(waitForUpdate, 50);
                }
            };
            waitForUpdate();
        }, 50);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col pt-safe animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex flex-col">
                    <h2 className="text-white font-medium text-lg drop-shadow-md truncate max-w-2xl">{file.fileName}</h2>
                    {file.isEncrypted && (
                        <span className="text-blue-400 text-xs font-semibold tracking-wider uppercase mt-1">
                            E2E Encrypted Stream
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-2.5 rounded-full bg-white/10 text-white hover:bg-white/25 transition-colors"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Main Player Area */}
            <div className="flex-1 w-full flex items-center justify-center relative px-4 pb-8">
                {error ? (
                    <div className="flex flex-col items-center bg-red-500/10 border border-red-500/20 p-8 rounded-2xl max-w-md text-center">
                        <AlertCircle className="text-red-500 mb-4" size={48} />
                        <h3 className="text-xl font-semibold text-white mb-2">Streaming Error</h3>
                        <p className="text-red-200">{error}</p>
                        <button onClick={onClose} className="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors">
                            Close Player
                        </button>
                    </div>
                ) : (
                    <div className="w-full max-w-5xl aspect-video bg-black/50 rounded-2xl overflow-hidden shadow-2xl relative border border-white/5 group">
                        {isLoading && !error && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40">
                                <Loader className="text-blue-500 animate-spin mb-4" size={48} />
                                <p className="text-blue-200 font-medium">Initializing Secure Stream...</p>
                            </div>
                        )}
                        {isAudio ? (
                            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
                                <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 animate-pulse shadow-[0_0_60px_rgba(37,99,235,0.3)] flex items-center justify-center">
                                    <Volume2 size={64} className="text-white opacity-80" />
                                </div>
                                <audio
                                    ref={videoRef}
                                    className="absolute bottom-6 left-1/2 -translate-x-1/2 w-3/4 max-w-md"
                                    controls
                                    autoPlay
                                    onPlaying={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    onSeeked={handleSeek}
                                    onError={(e) => {
                                        const err = videoRef.current?.error;
                                        console.error("Audio element error", err);
                                        if (err && err.code === 4) {
                                            setError("The browser does not support this audio format. Make sure it is encoded properly for streaming.");
                                        } else {
                                            setError("An error occurred while trying to play the audio stream.");
                                        }
                                    }}
                                />
                            </div>
                        ) : (
                            <video
                                ref={videoRef}
                                className="w-full h-full object-contain"
                                controls
                                autoPlay
                                onPlaying={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onSeeked={handleSeek}
                                onError={(e) => {
                                    const err = videoRef.current?.error;
                                    console.error("Video element error", err);
                                    if (err && err.code === 4) {
                                        setError("Browser decode error: This video is not a 'Fragmented MP4' (fMP4), which is required for secure chunked streaming. Please convert it before uploading.");
                                    } else {
                                        setError("An error occurred while trying to decode the video stream.");
                                    }
                                }}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SecureMediaPlayer;
