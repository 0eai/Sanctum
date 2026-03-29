// src/services/deviceTracker.js
import {
    doc, setDoc, deleteDoc, collection, getDocs, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

const DEVICE_ID_KEY = 'sanctum_device_id';

/**
 * Get or create a unique device ID for this browser.
 */
const getDeviceId = () => {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
};

/**
 * Detect OS, browser, and device type from userAgent.
 */
const detectDeviceInfo = () => {
    const ua = navigator.userAgent;
    let os = 'Unknown OS';
    let browser = 'Unknown Browser';
    let deviceType = 'desktop'; // desktop | mobile | embedded

    // OS detection
    if (/Linux.*Android/.test(ua)) {
        os = 'Android';
        deviceType = 'mobile';
    } else if (/iPhone|iPad|iPod/.test(ua)) {
        os = 'iOS';
        deviceType = 'mobile';
    } else if (/Mac OS X/.test(ua)) {
        const match = ua.match(/Mac OS X (\d+[._]\d+)/);
        os = match ? `macOS ${match[1].replace('_', '.')}` : 'macOS';
    } else if (/Windows NT/.test(ua)) {
        os = 'Windows';
    } else if (/CrOS/.test(ua)) {
        os = 'ChromeOS';
    } else if (/Linux/.test(ua)) {
        os = 'Linux';
    }

    // Browser detection
    if (/Edg\//.test(ua)) {
        const match = ua.match(/Edg\/(\d+)/);
        browser = `Edge ${match?.[1] || ''}`;
    } else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
        const match = ua.match(/Chrome\/(\d+)/);
        browser = `Chrome ${match?.[1] || ''}`;
    } else if (/Firefox\//.test(ua)) {
        const match = ua.match(/Firefox\/(\d+)/);
        browser = `Firefox ${match?.[1] || ''}`;
    } else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) {
        const match = ua.match(/Version\/(\d+)/);
        browser = `Safari ${match?.[1] || ''}`;
    } else if (/Chromium\//.test(ua)) {
        const match = ua.match(/Chromium\/(\d+)/);
        browser = `Chromium ${match?.[1] || ''}`;
    }

    // Generate a friendly name
    let deviceName = 'Unknown Device';
    if (os === 'Linux') deviceName = 'Linux Desktop';
    else if (os.startsWith('macOS')) deviceName = 'Mac';
    else if (os === 'Windows') deviceName = 'Windows PC';
    else if (os === 'Android') deviceName = 'Android Device';
    else if (os === 'iOS') deviceName = 'iPhone / iPad';
    else if (os === 'ChromeOS') deviceName = 'Chromebook';

    return { os, browser, deviceType, deviceName };
};

/**
 * Register or update the current device session in Firestore.
 * Encrypts identifying metadata when cryptoKey is provided.
 * Called on every vault unlock.
 */
export const registerDevice = async (uid, cryptoKey = null) => {
    if (!uid) return;
    const deviceId = getDeviceId();
    const info = detectDeviceInfo();

    try {
        const metadata = {
            deviceName: info.deviceName,
            os: info.os,
            browser: info.browser,
            deviceType: info.deviceType,
            userAgent: navigator.userAgent.slice(0, 200),
        };
        const stored = cryptoKey ? await encryptData(metadata, cryptoKey) : metadata;
        await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'devices', deviceId), {
            deviceId,
            ...stored,
            lastActive: serverTimestamp(),
        }, { merge: true });
    } catch (e) {
        console.warn('Device registration failed:', e);
    }
};

/**
 * Update the "last active" timestamp for the current device.
 * Called periodically while the vault is open.
 */
export const updateDeviceActivity = async (uid) => {
    if (!uid) return;
    const deviceId = getDeviceId();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'devices', deviceId), {
            lastActive: serverTimestamp(),
        }, { merge: true });
    } catch (e) {
        // Silent fail
    }
};

/**
 * Listen to all registered devices for a user.
 * Decrypts metadata when cryptoKey is provided; handles mixed plaintext/encrypted entries.
 */
export const listenToDevices = (uid, callback, cryptoKey = null) => {
    if (!uid) return () => { };
    return onSnapshot(
        collection(db, 'artifacts', appId, 'users', uid, 'devices'),
        async (snap) => {
            const currentId = getDeviceId();
            const devices = [];
            for (const d of snap.docs) {
                const raw = d.data();
                // Encrypted entries have { iv, data, deviceId, lastActive }
                if (cryptoKey && raw.iv && raw.data) {
                    try {
                        const decrypted = await decryptData(raw, cryptoKey);
                        if (decrypted) {
                            devices.push({ id: d.id, deviceId: raw.deviceId, lastActive: raw.lastActive, ...decrypted });
                            continue;
                        }
                    } catch (_) { /* fall through to raw */ }
                }
                devices.push({ id: d.id, ...raw });
            }
            devices.sort((a, b) => {
                if (a.deviceId === currentId) return -1;
                if (b.deviceId === currentId) return 1;
                const aTime = a.lastActive?.toDate?.()?.getTime() || 0;
                const bTime = b.lastActive?.toDate?.()?.getTime() || 0;
                return bTime - aTime;
            });
            callback(devices, currentId);
        }
    );
};

/**
 * Remove a specific device session.
 */
export const removeDevice = async (uid, deviceId) => {
    if (!uid || !deviceId) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'devices', deviceId));
};

/**
 * Remove all device sessions except the current one.
 */
export const removeAllOtherDevices = async (uid) => {
    if (!uid) return;
    const currentId = getDeviceId();
    const snap = await getDocs(collection(db, 'artifacts', appId, 'users', uid, 'devices'));
    const promises = [];
    for (const d of snap.docs) {
        if (d.id !== currentId) {
            promises.push(deleteDoc(d.ref));
        }
    }
    await Promise.all(promises);
};

/**
 * Get the current device's ID (for comparison).
 */
export const getCurrentDeviceId = () => getDeviceId();
