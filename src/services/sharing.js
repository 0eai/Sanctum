// src/services/sharing.js
// Generic sharing service — encrypts any content type and stores in shared_notes collection
import {
    collection, addDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { encryptData, generateMasterKey, keyToUrlString } from '../lib/crypto';

/**
 * Share any item by encrypting its payload and storing it publicly.
 * @param {object} payload - The data to encrypt and share (type-specific)
 * @returns {{ sharedId: string, shareUrlKey: string }}
 */
const DEFAULT_EXPIRE_MINUTES = 30 * 24 * 60; // 30 days

export const shareItem = async (payload, expireMinutes = DEFAULT_EXPIRE_MINUTES) => {
    const shareKey = await generateMasterKey();
    const encryptedBlob = await encryptData(payload, shareKey);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (expireMinutes ?? DEFAULT_EXPIRE_MINUTES));
    const docRef = await addDoc(collection(db, 'shared_notes'), {
        data: encryptedBlob,
        createdBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt
    });
    const keyString = await keyToUrlString(shareKey);
    return { sharedId: docRef.id, shareUrlKey: keyString };
};

/**
 * Remove a shared item from the public collection.
 */
export const unshareItem = async (sharedId) => {
    if (!sharedId) return;
    try {
        await deleteDoc(doc(db, 'shared_notes', sharedId));
    } catch (e) {
        console.warn("Cleanup error", e);
    }
};

/**
 * Build the full share URL for a given sharedId and key.
 */
export const buildShareUrl = (sharedId, shareUrlKey) => {
    return `${window.location.origin}/#view?id=${sharedId}&k=${shareUrlKey}`;
};
