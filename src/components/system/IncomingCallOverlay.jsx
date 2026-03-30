import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff, PhoneCall, Video, VideoOff, Mic, MicOff, ShieldCheck } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, appId } from '../../lib/firebase';
import { useWebRTCContext } from '../../context/WebRTCContext';

// Fetches displayName + photoURL from public_keys collection
async function fetchProfile(uid) {
    try {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public_keys', uid));
        return snap.exists() ? snap.data() : null;
    } catch {
        return null;
    }
}

export default function IncomingCallOverlay() {
    const {
        callState, incomingCallData, localStream, remoteStream,
        activeCallTarget, acceptCall, rejectCall, endCall,
    } = useWebRTCContext();

    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [callerProfile, setCallerProfile] = useState(null);
    const [calleeProfile, setCalleeProfile] = useState(null);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const notificationRef = useRef(null);

    // Sync video elements with streams
    useEffect(() => {
        if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
    }, [localStream]);
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    }, [remoteStream]);

    // Fetch caller profile when incoming call arrives
    useEffect(() => {
        if (!incomingCallData?.from) { setCallerProfile(null); return; }
        fetchProfile(incomingCallData.from).then(setCallerProfile);
    }, [incomingCallData?.from]);

    // Fetch callee profile when active call target changes
    useEffect(() => {
        if (!activeCallTarget) { setCalleeProfile(null); return; }
        fetchProfile(activeCallTarget).then(setCalleeProfile);
    }, [activeCallTarget]);

    // Call duration timer
    useEffect(() => {
        if (callState !== 'CONNECTED') { setCallDuration(0); return; }
        const id = setInterval(() => setCallDuration(d => d + 1), 1000);
        return () => clearInterval(id);
    }, [callState]);

    // Reset mute / camera state when call ends
    useEffect(() => {
        if (callState !== 'CALLING' && callState !== 'CONNECTED') {
            setIsMuted(false);
            setIsCameraOff(false);
        }
    }, [callState]);

    // Browser / OS notification for incoming call
    useEffect(() => {
        if (!('Notification' in window)) return;

        if (callState === 'INCOMING' && incomingCallData && Notification.permission === 'granted') {
            notificationRef.current?.close();
            const name = callerProfile?.displayName || callerProfile?.email || 'Someone';
            const n = new Notification('Incoming Call', {
                body: `${name} is calling you`,
                icon: '/icons/icon-192.png',
                tag: 'sanctum-incoming-call',
                requireInteraction: true,
            });
            n.onclick = () => { window.focus(); n.close(); };
            notificationRef.current = n;
        } else if (callState !== 'INCOMING') {
            notificationRef.current?.close();
            notificationRef.current = null;
        }
    }, [callState, incomingCallData, callerProfile]);

    const toggleMute = () => {
        if (!localStream) return;
        const next = !isMuted;
        localStream.getAudioTracks().forEach(t => { t.enabled = !next; });
        setIsMuted(next);
    };

    const toggleCamera = () => {
        if (!localStream) return;
        const next = !isCameraOff;
        localStream.getVideoTracks().forEach(t => { t.enabled = !next; });
        setIsCameraOff(next);
    };

    const formatDuration = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    if (callState === 'IDLE') return null;

    const callerName = callerProfile?.displayName || callerProfile?.email || 'Someone';
    const contactName = calleeProfile?.displayName || calleeProfile?.email || 'Contact';
    const contactInitial = contactName[0].toUpperCase();
    const hasRemoteVideo = !!remoteStream;
    const hasLocalVideo = !!localStream && !isCameraOff;

    return (
        <>
            {/* ── INCOMING CALL POPUP ── */}
            {callState === 'INCOMING' && incomingCallData && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-sm mx-4 text-center shadow-2xl">
                        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                            {callerProfile?.photoURL ? (
                                <img src={callerProfile.photoURL} alt={callerName} className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <PhoneCall size={32} className="text-blue-600 animate-pulse" />
                            )}
                            <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-20" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-1">Incoming Call</h2>
                        <p className="text-sm text-gray-500 mb-8">{callerName} is calling you.</p>
                        <div className="flex justify-center gap-4">
                            <button
                                onClick={rejectCall}
                                className="flex-1 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                            >
                                <PhoneOff size={18} /> Decline
                            </button>
                            <button
                                onClick={() => acceptCall(true)}
                                className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-200"
                            >
                                <Phone size={18} className="animate-bounce" /> Accept
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── ACTIVE CALL OVERLAY (CALLING / CONNECTED) ── */}
            {(callState === 'CALLING' || callState === 'CONNECTED') && createPortal(
                <div className="fixed inset-4 md:inset-10 z-[90] bg-black rounded-3xl overflow-hidden shadow-2xl pointer-events-auto border border-white/5">

                    {/* Remote video — natural dimensions, centered */}
                    <div className="absolute inset-0 bg-black flex items-center justify-center">
                        {hasRemoteVideo ? (
                            <video ref={remoteVideoRef} autoPlay playsInline className="max-w-full max-h-full" />
                        ) : (
                            <div className="flex flex-col items-center gap-5">
                                {calleeProfile?.photoURL ? (
                                    <img src={calleeProfile.photoURL} alt={contactName} className="w-28 h-28 rounded-full object-cover ring-4 ring-white/10 shadow-2xl" />
                                ) : (
                                    <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl ring-4 ring-white/10">
                                        <span className="text-4xl font-bold text-white">{contactInitial}</span>
                                    </div>
                                )}
                                {callState === 'CALLING' && (
                                    <div className="flex gap-1.5 items-center">
                                        {[0, 0.2, 0.4].map(delay => (
                                            <span key={delay} className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Top overlay: name + status */}
                    <div className="absolute top-0 left-0 right-0 pt-6 px-6 pb-16 bg-gradient-to-b from-black/70 to-transparent flex items-start justify-between pointer-events-none">
                        <div>
                            <h3 className="text-white font-bold text-xl drop-shadow">{contactName}</h3>
                            <p className="text-white/70 text-sm mt-0.5 font-medium">
                                {callState === 'CALLING' ? 'Calling…' : callDuration > 0 ? formatDuration(callDuration) : 'Connected'}
                            </p>
                        </div>
                        {callState === 'CONNECTED' && (
                            <span className="flex items-center gap-1.5 bg-green-500/20 border border-green-400/30 text-green-300 text-xs font-semibold px-2.5 py-1 rounded-full">
                                <ShieldCheck size={11} /> E2E Encrypted
                            </span>
                        )}
                    </div>

                    {/* Local PIP — above controls */}
                    <div className="absolute bottom-24 right-4 md:right-6 w-[72px] h-[108px] md:w-28 md:h-40 bg-gray-800 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl z-10">
                        {hasLocalVideo ? (
                            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gray-900">
                                <VideoOff size={20} className="text-gray-600" />
                                <span className="text-[9px] text-gray-600 font-medium">Off</span>
                            </div>
                        )}
                    </div>

                    {/* Controls — pinned to bottom */}
                    <div className="absolute bottom-0 left-0 right-0 pb-6 pt-3 bg-gradient-to-t from-black/90 to-transparent flex justify-center items-center gap-5">
                        <button
                            onClick={toggleMute}
                            className={`w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all shadow-lg ${isMuted ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
                            title={isMuted ? 'Unmute' : 'Mute'}
                        >
                            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                        </button>
                        <button
                            onClick={endCall}
                            className="w-[64px] h-[64px] bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-xl transition-all hover:scale-105 active:scale-95"
                            title="End call"
                        >
                            <PhoneOff size={26} />
                        </button>
                        <button
                            onClick={toggleCamera}
                            className={`w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all shadow-lg ${isCameraOff ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
                            title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                        >
                            {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
