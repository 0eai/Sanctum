// src/services/transfer.js
import { doc, setDoc, getDoc, collection, onSnapshot, addDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, appId } from '../lib/firebase';

export const rtcConfiguration = {
    iceServers: [
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

export const generateRoomCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- Device Presence & Auto-Discovery ---

export const getLocalDeviceId = () => {
    let id = localStorage.getItem('daypulse_device_id');
    if (!id) {
        id = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('daypulse_device_id', id);
    }
    return id;
};

export const getDeviceName = () => {
    const ua = navigator.userAgent;
    let browser = "Browser";
    if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("Chrome/")) browser = "Chrome";
    else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";

    let os = "Device";
    if (ua.includes("Mac OS X")) os = ua.includes("iPhone") ? "iPhone" : ua.includes("iPad") ? "iPad" : "Mac";
    else if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("Linux")) os = "Linux";

    return `${browser} on ${os}`;
};

export const registerDevice = async (uid, deviceId, deviceName) => {
    const ref = doc(db, 'artifacts', appId, 'users', uid, 'transfer_devices', deviceId);
    await setDoc(ref, { deviceName, lastActive: Date.now(), incomingRoomId: null }, { merge: true });
};

export const unregisterDevice = async (uid, deviceId) => {
    const ref = doc(db, 'artifacts', appId, 'users', uid, 'transfer_devices', deviceId);
    await deleteDoc(ref);
};

export const listenToActiveDevices = (uid, myDeviceId, callback) => {
    const ref = collection(db, 'artifacts', appId, 'users', uid, 'transfer_devices');
    return onSnapshot(ref, (snap) => {
        const now = Date.now();
        const devices = [];
        snap.forEach(d => {
            const data = d.data();
            // Filter out self and any device that hasn't pinged in the last 2 minutes
            if (d.id !== myDeviceId && (now - data.lastActive < 120000)) {
                devices.push({ id: d.id, ...data });
            }
        });
        callback(devices);
    });
};

export const listenToIncomingInvites = (uid, myDeviceId, callback) => {
    const ref = doc(db, 'artifacts', appId, 'users', uid, 'transfer_devices', myDeviceId);
    return onSnapshot(ref, (snap) => {
        if (snap.exists() && snap.data().incomingRoomId) {
            callback(snap.data().incomingRoomId);
        }
    });
};

export const sendTransferInvite = async (uid, targetDeviceId, roomId) => {
    const ref = doc(db, 'artifacts', appId, 'users', uid, 'transfer_devices', targetDeviceId);
    await setDoc(ref, { incomingRoomId: roomId }, { merge: true });
};

export const clearIncomingInvite = async (uid, myDeviceId) => {
    const ref = doc(db, 'artifacts', appId, 'users', uid, 'transfer_devices', myDeviceId);
    await setDoc(ref, { incomingRoomId: null }, { merge: true });
};


// --- WebRTC Signaling ---

export const setRoomData = async (uid, roomId, data) => {
    const roomRef = doc(db, 'artifacts', appId, 'users', uid, 'transfers', roomId);
    await setDoc(roomRef, data, { merge: true });
};

export const getRoomData = async (uid, roomId) => {
    const roomRef = doc(db, 'artifacts', appId, 'users', uid, 'transfers', roomId);
    const snap = await getDoc(roomRef);
    return snap.exists() ? snap.data() : null;
};

export const listenToRoom = (uid, roomId, callback) => {
    const roomRef = doc(db, 'artifacts', appId, 'users', uid, 'transfers', roomId);
    return onSnapshot(roomRef, (snap) => {
        if (snap.exists()) callback(snap.data());
    });
};

export const addIceCandidate = async (uid, roomId, collectionName, candidate) => {
    const candidateRef = collection(db, 'artifacts', appId, 'users', uid, 'transfers', roomId, collectionName);
    await addDoc(candidateRef, candidate.toJSON());
};

export const listenToIceCandidates = (uid, roomId, collectionName, callback) => {
    const candidateRef = collection(db, 'artifacts', appId, 'users', uid, 'transfers', roomId, collectionName);
    return onSnapshot(candidateRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') callback(change.doc.data());
        });
    });
};

export const cleanupRoom = async (uid, roomId) => {
    try {
        const roomRef = doc(db, 'artifacts', appId, 'users', uid, 'transfers', roomId);
        const callerQuery = await getDocs(collection(roomRef, 'callerCandidates'));
        callerQuery.forEach(d => deleteDoc(d.ref));
        
        const calleeQuery = await getDocs(collection(roomRef, 'calleeCandidates'));
        calleeQuery.forEach(d => deleteDoc(d.ref));

        await deleteDoc(roomRef);
    } catch (e) {
        console.error("Cleanup failed:", e);
    }
};