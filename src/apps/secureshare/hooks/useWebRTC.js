import { useState, useEffect, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { getRecipientPublicKey, getMyPrivateKey } from '../services/secureshare';
import { encryptData, decryptData, encryptRSA, decryptRSA, deriveECDHSharedSecret } from '../../../lib/crypto';
import { rtdb, appId } from '../../../lib/firebase';
import { ref, push, set, onChildAdded, remove, onDisconnect, serverTimestamp } from 'firebase/database';

export const useWebRTC = (currentUid, cryptoKey) => {
    const { showToast } = useToast();
    const [callState, setCallState] = useState('IDLE'); // IDLE, INCOMING, CALLING, CONNECTED
    const [incomingCallData, setIncomingCallData] = useState(null);
    const [activeCallTarget, setActiveCallTarget] = useState(null);

    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);

    const peerConnection = useRef(null);
    const localStreamRef = useRef(null);
    const pendingCandidates = useRef([]);

    // We need refs to avoid stale closures in listeners
    const callStateRef = useRef(callState);
    const incomingCallDataRef = useRef(incomingCallData);

    useEffect(() => {
        callStateRef.current = callState;
    }, [callState]);

    useEffect(() => {
        incomingCallDataRef.current = incomingCallData;
    }, [incomingCallData]);

    const handleIncomingSignalRef = useRef(null);

    useEffect(() => {
        if (!currentUid) return;

        // Presence mechanism
        const myPresenceRef = ref(rtdb, `artifacts/${appId}/presence/${currentUid}`);
        set(myPresenceRef, true).catch(e => console.error("Presence err", e));
        onDisconnect(myPresenceRef).remove();

        // Listen for signals
        const mySignalsRef = ref(rtdb, `artifacts/${appId}/signals/${currentUid}`);

        // Clear existing stale signals on boot to prevent ghost rings
        remove(mySignalsRef).catch(() => { });

        const unsubscribe = onChildAdded(mySignalsRef, async (snapshot) => {
            const payload = snapshot.val();
            if (!payload) return;

            // Delete signal once received so it's completely consumed
            remove(snapshot.ref).catch(() => { });

            // Quick check if signal is stale (older than 60 seconds)
            if (payload.timestamp && Date.now() - payload.timestamp > 60000) return;

            if (handleIncomingSignalRef.current) {
                handleIncomingSignalRef.current(payload);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [currentUid, cryptoKey]);

    const encryptSignal = async (data, targetUid) => {
        const targetPubKey = await getRecipientPublicKey(targetUid);
        if (!targetPubKey) throw new Error("Target public key not found");

        const sessionKey = await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
        );
        const encryptedPayload = await encryptData(data, sessionKey);

        const exportedSessionKey = await window.crypto.subtle.exportKey("raw", sessionKey);
        const sessionKeyJsonText = JSON.stringify(Array.from(new Uint8Array(exportedSessionKey)));

        // Try ECDH first
        const myPrivKey = await getMyPrivateKey(currentUid, cryptoKey);
        let wrappedKey = null;
        let encryptionType = 'rsa';

        if (myPrivKey?.ecdh && targetPubKey.ecdh) {
            encryptionType = 'ecdh';
            const ephemeral = await window.crypto.subtle.generateKey(
                { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
            );
            const exportedEphemeralPub = await window.crypto.subtle.exportKey("raw", ephemeral.publicKey);

            const sharedSecret = await deriveECDHSharedSecret(ephemeral.privateKey, targetPubKey.ecdh);
            const ecdhWrapped = await encryptData({ key: sessionKeyJsonText }, sharedSecret);

            wrappedKey = {
                ephemeralPublicKeyBase64: window.btoa(String.fromCharCode(...new Uint8Array(exportedEphemeralPub))),
                encryptedKey: ecdhWrapped
            };
        } else {
            // Fallback RSA
            wrappedKey = await encryptRSA(sessionKeyJsonText, targetPubKey.rsa);
        }

        return {
            encryptedPayload,
            wrappedKey,
            encryptionType,
            senderUid: currentUid
        };
    };

    const decryptSignal = async (encryptedSignal) => {
        const { encryptedPayload, wrappedKey, encryptionType, senderUid } = encryptedSignal;
        const myPrivKey = await getMyPrivateKey(currentUid, cryptoKey);
        let sessionKeyJsonText = null;

        if (encryptionType === 'ecdh' && myPrivKey?.ecdh) {
            const senderPubRaw = new Uint8Array(window.atob(wrappedKey.ephemeralPublicKeyBase64).split('').map(c => c.charCodeAt(0)));
            const ephemeralPub = await window.crypto.subtle.importKey(
                "raw", senderPubRaw, { name: "ECDH", namedCurve: "P-256" }, true, []
            );
            const sharedSecret = await deriveECDHSharedSecret(myPrivKey.ecdh, ephemeralPub);
            const decData = await decryptData(wrappedKey.encryptedKey, sharedSecret);
            sessionKeyJsonText = decData.key;
        } else if (encryptionType === 'rsa' && myPrivKey?.rsa) {
            sessionKeyJsonText = await decryptRSA(wrappedKey, myPrivKey.rsa);
        }

        if (!sessionKeyJsonText) throw new Error("Signaling decryption failed");

        const sessionKey = await crypto.subtle.importKey(
            "raw", new Uint8Array(JSON.parse(sessionKeyJsonText)).buffer,
            { name: "AES-GCM", length: 256 }, false, ["decrypt"]
        );

        return await decryptData(encryptedPayload, sessionKey);
    };

    const sendSignal = async (to, type, data) => {
        try {
            const encryptedData = await encryptSignal(data, to);

            // Push to target's signal queue in RTDB
            const signalRef = push(ref(rtdb, `artifacts/${appId}/signals/${to}`));
            await set(signalRef, {
                from: currentUid,
                type,
                encryptedData,
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.error("Failed to send encrypted signal", e);
        }
    };

    const handleIncomingSignal = async (payload) => {
        const { from, type, encryptedData } = payload;

        let data;
        try {
            data = await decryptSignal(encryptedData);
        } catch (e) {
            console.error("Could not decrypt signal from", from, e);
            return;
        }

        if (type === 'offer') {
            if (callStateRef.current !== 'IDLE') {
                // Busy
                await sendSignal(from, 'busy', {});
                return;
            }
            setIncomingCallData({ from, offer: data.offer });
            setCallState('INCOMING');
        } else if (type === 'answer') {
            const pc = peerConnection.current;
            if (pc && pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                // Process any queued candidates
                for (const cand of pendingCandidates.current) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (_) { }
                }
                pendingCandidates.current = [];
            }
        } else if (type === 'ice-candidate') {
            const pc = peerConnection.current;
            if (pc && pc.signalingState !== 'closed' && pc.remoteDescription) {
                try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (_) { }
            } else if (pc && pc.signalingState !== 'closed') {
                pendingCandidates.current.push(data.candidate);
            }
        } else if (type === 'busy') {
            showToast('User is busy on another call.', 'error');
            endCall();
        } else if (type === 'reject') {
            showToast('Call was rejected.', 'error');
            endCall();
        } else if (type === 'end') {
            cleanupCall();
        }
    };

    useEffect(() => {
        handleIncomingSignalRef.current = handleIncomingSignal;
    });

    const setupPeerConnection = (targetUid) => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal(targetUid, 'ice-candidate', { candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                endCall();
            }
        };

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        peerConnection.current = pc;
        return pc;
    };

    const getMediaStream = async (video, audio) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
            setLocalStream(stream);
            localStreamRef.current = stream;
            return stream;
        } catch (err) {
            console.error("Failed to get media devices", err);
            throw new Error("Could not access camera/microphone.");
        }
    };

    const callUser = async (targetUid, withVideo = true) => {
        try {
            await getMediaStream(withVideo, true);
            setActiveCallTarget(targetUid);
            setCallState('CALLING');

            const pc = setupPeerConnection(targetUid);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await sendSignal(targetUid, 'offer', { offer });
        } catch (e) {
            showToast(e.message || 'Call failed.', 'error');
            cleanupCall();
        }
    };

    const acceptCall = async (withVideo = true) => {
        if (!incomingCallDataRef.current) return;
        try {
            const targetUid = incomingCallDataRef.current.from;
            await getMediaStream(withVideo, true);
            setActiveCallTarget(targetUid);
            setCallState('CONNECTED');

            const pc = setupPeerConnection(targetUid);
            await pc.setRemoteDescription(new RTCSessionDescription(incomingCallDataRef.current.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await sendSignal(targetUid, 'answer', { answer });
            setIncomingCallData(null);

            // Process any local queued candidates that came in while doing this
            pendingCandidates.current.forEach(cand => {
                pc.addIceCandidate(new RTCIceCandidate(cand));
            });
            pendingCandidates.current = [];

        } catch (e) {
            showToast(e.message || 'Call failed.', 'error');
            cleanupCall();
        }
    };

    const rejectCall = () => {
        if (incomingCallDataRef.current) {
            sendSignal(incomingCallDataRef.current.from, 'reject', {});
        }
        setIncomingCallData(null);
        setCallState('IDLE');
    };

    const endCall = () => {
        if (activeCallTarget) {
            sendSignal(activeCallTarget, 'end', {});
        }
        cleanupCall();
    };

    const cleanupCall = () => {
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
            setLocalStream(null);
        }
        setRemoteStream(null);
        setActiveCallTarget(null);
        setIncomingCallData(null);
        setCallState('IDLE');
    };

    return {
        callState,
        incomingCallData,
        localStream,
        remoteStream,
        activeCallTarget,
        callUser,
        acceptCall,
        rejectCall,
        endCall
    };
};
