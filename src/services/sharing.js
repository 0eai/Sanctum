// src/services/sharing.js
// Generic sharing service — encrypts any content type and stores in shared_notes collection
import {
    collection, setDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../lib/firebase';
import { encryptData, generateMasterKey, keyToUrlString } from '../lib/crypto';

/**
 * Share any item by encrypting its payload and storing it publicly.
 * @param {object} payload - The data to encrypt and share (type-specific)
 * @returns {{ sharedId: string, shareUrlKey: string }}
 */
const DEFAULT_EXPIRE_MINUTES = 30 * 24 * 60; // 30 days

export const shareItem = async (payload, expireMinutes = DEFAULT_EXPIRE_MINUTES) => {
    const shareKey = await generateMasterKey();

    // Pre-generate document ID so Storage paths can reference it before the doc is written.
    const noteRef = doc(collection(db, 'shared_notes'));
    const sharedId = noteRef.id;

    // Upload attachments to Storage (encrypted with share key) to avoid Firestore 1 MB limit.
    // Attachment data URLs are replaced with storagePath references.
    let processedPayload = payload;
    if (payload.attachments && payload.attachments.length > 0) {
        const processedAttachments = await Promise.all(
            payload.attachments.map(async (att) => {
                if (!att.data || !att.data.startsWith('data:')) return att;
                // Encrypt the data URL string with the share key
                const encryptedAtt = await encryptData({ data: att.data }, shareKey);
                const encryptedJson = JSON.stringify(encryptedAtt);
                const blob = new Blob([encryptedJson], { type: 'application/octet-stream' });
                const storagePath = `shared_notes_files/${sharedId}/${crypto.randomUUID()}`;
                await uploadBytes(ref(storage, storagePath), blob);
                return { name: att.name, type: att.type, storagePath };
            })
        );
        processedPayload = { ...payload, attachments: processedAttachments };
    }

    const encryptedBlob = await encryptData(processedPayload, shareKey);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (expireMinutes ?? DEFAULT_EXPIRE_MINUTES));

    await setDoc(noteRef, {
        data: encryptedBlob,
        createdBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt
    });

    const keyString = await keyToUrlString(shareKey);
    return { sharedId, shareUrlKey: keyString };
};

/**
 * Remove a shared item from the public collection and delete any Storage attachments.
 */
export const unshareItem = async (sharedId) => {
    if (!sharedId) return;
    try {
        // Delete Storage attachments if any
        const folderRef = ref(storage, `shared_notes_files/${sharedId}`);
        const listed = await listAll(folderRef).catch(() => null);
        if (listed) {
            await Promise.all(listed.items.map(item => deleteObject(item).catch(() => {})));
        }
    } catch {
        // Storage cleanup is best-effort
    }
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
