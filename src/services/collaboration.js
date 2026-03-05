// src/services/collaboration.js
// Per-document E2EE collaboration — each shared doc gets its own AES-256 key,
// RSA-wrapped per collaborator.
import {
    collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, onSnapshot,
    query, where, orderBy, serverTimestamp, updateDoc, writeBatch
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import {
    generateMasterKey, encryptData, decryptData, exportKey, importMasterKey,
    encryptRSA, decryptRSA, importRSAPublicKey
} from '../lib/crypto';
import { ref, getBlob, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../lib/firebase';

// =============================================
// HELPERS
// =============================================

/**
 * Fetch a user's RSA public key from the public_keys collection.
 */
const getPublicKey = async (uid) => {
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public_keys', uid));
    if (!snap.exists() || !snap.data().publicKey) return null;
    return importRSAPublicKey(snap.data().publicKey);
};

/**
 * Serialize an AES CryptoKey to a JSON string of its raw byte array.
 */
const serializeKey = async (key) => {
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return JSON.stringify(Array.from(new Uint8Array(exported)));
};

/**
 * Deserialize a JSON byte-array string back to an AES CryptoKey.
 */
const deserializeKey = async (jsonStr) => {
    return window.crypto.subtle.importKey(
        'raw',
        new Uint8Array(JSON.parse(jsonStr)).buffer,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
};

/**
 * Look up a user by email in the public_keys collection.
 * Returns { uid, displayName, email, photoURL } or null.
 */
export const findUserByEmail = async (email) => {
    const q = query(
        collection(db, 'artifacts', appId, 'public_keys'),
        where('email', '==', email)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data();
    return { uid: d.id, displayName: data.displayName, email: data.email, photoURL: data.photoURL };
};

// =============================================
// SHARE A DOCUMENT
// =============================================

/**
 * Copy attachment files from owner's personal storage to shared storage.
 * Decrypts with owner's master key, re-encrypts with per-doc key.
 * Updates attachment references in the shared doc.
 */
const copyFilesForShare = async (shareId, docData, personalKey, docKey) => {
    const attachments = docData.attachments || [];
    const hasFiles = attachments.some(a => a.driveFileId);
    // Research papers store the PDF storage path in driveFileId (pdfHash is just a content hash)
    const hasDriveFile = docData.driveFileId;

    if (!hasFiles && !hasDriveFile) return;

    const updatedAttachments = [];
    const getStoragePath = (fileId) => `artifacts/${appId}/${fileId}`;

    for (const att of attachments) {
        if (!att.driveFileId) {
            updatedAttachments.push(att); // Legacy base64 — no file to copy
            continue;
        }
        try {
            // 1. Download encrypted file from owner's personal path
            const srcRef = ref(storage, getStoragePath(att.driveFileId));
            const encryptedBlob = await getBlob(srcRef);
            const buffer = await encryptedBlob.arrayBuffer();

            // 2. Decrypt with owner's master key
            const iv = new Uint8Array(buffer.slice(0, 12));
            const data = new Uint8Array(buffer.slice(12));
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv }, personalKey, data
            );

            // 3. Re-encrypt with doc key
            const newIv = crypto.getRandomValues(new Uint8Array(12));
            const reEncrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: newIv }, docKey, decryptedBuffer
            );
            const payload = new Uint8Array(newIv.length + reEncrypted.byteLength);
            payload.set(newIv, 0);
            payload.set(new Uint8Array(reEncrypted), newIv.length);
            const newBlob = new Blob([payload], { type: 'application/octet-stream' });

            // 4. Upload to shared path
            const newFileId = `shared_docs/${shareId}/${crypto.randomUUID()}`;
            const destRef = ref(storage, `artifacts/${appId}/${newFileId}`);
            await uploadBytesResumable(destRef, newBlob, { contentType: 'application/octet-stream' });

            updatedAttachments.push({ ...att, driveFileId: newFileId });
        } catch (e) {
            console.warn(`Failed to copy file ${att.driveFileId} for share:`, e);
            updatedAttachments.push(att); // Keep original reference as fallback
        }
    }

    // Handle PDF/file for research papers (stored in driveFileId, not pdfHash)
    let updatedDriveFileId = docData.driveFileId;
    if (hasDriveFile) {
        try {
            const srcRef = ref(storage, getStoragePath(docData.driveFileId));
            const srcBlob = await getBlob(srcRef);
            const buffer = await srcBlob.arrayBuffer();

            let plainBuffer;
            if (docData.isEncrypted || docData.isPrivate) {
                // File is AES-encrypted with master key — decrypt first
                const iv = new Uint8Array(buffer.slice(0, 12));
                const data = new Uint8Array(buffer.slice(12));
                plainBuffer = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv }, personalKey, data
                );
            } else {
                // File is NOT encrypted — use raw bytes directly
                plainBuffer = buffer;
            }

            // Encrypt with doc key for shared access
            const newIv = crypto.getRandomValues(new Uint8Array(12));
            const reEncrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: newIv }, docKey, plainBuffer
            );
            const payload = new Uint8Array(newIv.length + reEncrypted.byteLength);
            payload.set(newIv, 0);
            payload.set(new Uint8Array(reEncrypted), newIv.length);
            const newBlob = new Blob([payload], { type: 'application/octet-stream' });
            const newFileId = `shared_docs/${shareId}/${crypto.randomUUID()}`;
            const destRef = ref(storage, `artifacts/${appId}/${newFileId}`);
            await uploadBytesResumable(destRef, newBlob, { contentType: 'application/octet-stream' });
            updatedDriveFileId = newFileId;
        } catch (e) {
            console.warn('Failed to copy research file for share:', e);
        }
    }

    // Update the shared doc with new file references
    const needsUpdate = hasFiles || updatedDriveFileId !== docData.driveFileId;
    if (needsUpdate) {
        const updatePayload = {};
        if (hasFiles) updatePayload.attachments = updatedAttachments;
        if (updatedDriveFileId !== docData.driveFileId) updatePayload.driveFileId = updatedDriveFileId;

        // Re-encrypt the updated data and write to the shared doc
        const shareRef = doc(db, 'artifacts', appId, 'shared_docs', shareId);
        const snap = await getDoc(shareRef);
        if (snap.exists()) {
            const raw = snap.data();
            const currentDecrypted = await decryptData(raw, docKey);
            if (currentDecrypted) {
                const merged = { ...currentDecrypted, ...updatePayload };
                const reEncrypted = await encryptData(merged, docKey);
                await updateDoc(shareRef, { ...reEncrypted, updatedAt: serverTimestamp() });
            }
        }
    }
};

/**
 * Share a document with specific users.
 * 1. Generate a per-doc AES-256 key
 * 2. Encrypt the document payload with it
 * 3. RSA-wrap the key for each collaborator (including owner)
 * 4. Store in /shared_docs/{shareId}
 *
 * @param {string} ownerUid
 * @param {CryptoKey} personalKey - owner's master key to decrypt the original doc
 * @param {object} docData - the decrypted document data
 * @param {string} appType - 'notes' | 'markdown' | 'tasks' | 'research' | 'bookmarks' | 'checklists'
 * @param {string} docType - 'note' | 'folder' | 'task' | 'paper' | 'bookmark' | 'checklist'
 * @param {string[]} collaboratorUids - UIDs to share with (owner is added automatically)
 * @param {string|null} sharedFolderId - links batch-shared folder items
 * @param {string|null} parentShareId - parent shared folder's shareId
 * @returns {{ shareId: string, docKey: CryptoKey }}
 */
export const shareDocument = async (ownerUid, personalKey, docData, appType, docType, collaboratorUids, sharedFolderId = null, parentShareId = null) => {
    // Generate per-doc key
    const docKey = await generateMasterKey();

    // Clean doc data (remove metadata fields that shouldn't be encrypted)
    const { id, updatedAt, createdAt, type, isPinned, parentId, ...cleanData } = docData;

    // Encrypt with per-doc key
    const encrypted = await encryptData(cleanData, docKey);

    // All members = owner + collaborators (deduplicated)
    const memberUids = [...new Set([ownerUid, ...collaboratorUids])];

    // Create the shared doc
    const shareRef = await addDoc(collection(db, 'artifacts', appId, 'shared_docs'), {
        ...encrypted,
        appType,
        docType,
        ownerUid,
        memberUids,
        sharedFolderId,
        parentShareId,
        isPinned: docData.isPinned || false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    // RSA-wrap the doc key for each member
    const keyJson = await serializeKey(docKey);
    for (const uid of memberUids) {
        try {
            const pubKey = await getPublicKey(uid);
            if (!pubKey) continue;
            const encryptedDocKey = await encryptRSA(keyJson, pubKey);
            await setDoc(doc(db, 'artifacts', appId, 'shared_docs', shareRef.id, 'members', uid), {
                encryptedDocKey,
                role: uid === ownerUid ? 'owner' : 'editor',
                joinedAt: serverTimestamp()
            });
        } catch (e) {
            console.warn(`Failed to wrap key for ${uid}:`, e);
        }
    }

    // Copy attachment files to shared storage (re-encrypted with docKey)
    await copyFilesForShare(shareRef.id, cleanData, personalKey, docKey);

    return { shareId: shareRef.id, docKey };
};

// =============================================
// COLLABORATOR MANAGEMENT
// =============================================

/**
 * Add a collaborator to an already-shared document.
 */
export const addDocCollaborator = async (shareId, newUid, docKey, role = 'editor') => {
    const pubKey = await getPublicKey(newUid);
    if (!pubKey) throw new Error("Could not find user's public key. They must initialize SecureShare first.");

    const keyJson = await serializeKey(docKey);
    const encryptedDocKey = await encryptRSA(keyJson, pubKey);

    await setDoc(doc(db, 'artifacts', appId, 'shared_docs', shareId, 'members', newUid), {
        encryptedDocKey,
        role,
        joinedAt: serverTimestamp()
    });

    // Update memberUids on the share doc
    const shareRef = doc(db, 'artifacts', appId, 'shared_docs', shareId);
    const snap = await getDoc(shareRef);
    if (snap.exists()) {
        const existing = snap.data().memberUids || [];
        if (!existing.includes(newUid)) {
            await updateDoc(shareRef, { memberUids: [...existing, newUid] });
        }
    }
};

/**
 * Remove a collaborator. Rotates the doc key and re-encrypts the document.
 */
export const removeDocCollaborator = async (shareId, uid, currentDocKey) => {
    // 1. Remove member's key doc
    await deleteDoc(doc(db, 'artifacts', appId, 'shared_docs', shareId, 'members', uid));

    // 2. Update memberUids
    const shareRef = doc(db, 'artifacts', appId, 'shared_docs', shareId);
    const snap = await getDoc(shareRef);
    if (!snap.exists()) return null;

    const remaining = (snap.data().memberUids || []).filter(u => u !== uid);

    // If only the owner remains (or no one), delete the shared doc entirely
    if (remaining.length <= 1) {
        // Delete all remaining member subdocs
        const membersSnap = await getDocs(collection(db, 'artifacts', appId, 'shared_docs', shareId, 'members'));
        const batch = writeBatch(db);
        membersSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(shareRef);
        await batch.commit();
        return null;
    }

    await updateDoc(shareRef, { memberUids: remaining });

    // 3. Decrypt current doc with old key
    const currentData = await decryptData(snap.data(), currentDocKey);
    if (!currentData) return null;

    // 4. Generate new key, re-encrypt doc
    const newKey = await generateMasterKey();
    const newEncrypted = await encryptData(currentData, newKey);
    await updateDoc(shareRef, { ...newEncrypted, updatedAt: serverTimestamp() });

    // 5. Re-wrap new key for remaining members
    const newKeyJson = await serializeKey(newKey);
    for (const memberUid of remaining) {
        try {
            const pubKey = await getPublicKey(memberUid);
            if (!pubKey) continue;
            const encryptedDocKey = await encryptRSA(newKeyJson, pubKey);
            await setDoc(doc(db, 'artifacts', appId, 'shared_docs', shareId, 'members', memberUid), {
                encryptedDocKey,
                rotatedAt: serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.warn(`Key rotation failed for ${memberUid}:`, e);
        }
    }

    return newKey;
};

// =============================================
// KEY RETRIEVAL
// =============================================

/**
 * Decrypt the per-doc AES key for the current user.
 */
export const getDocumentKey = async (shareId, uid, privateKey) => {
    const memberRef = doc(db, 'artifacts', appId, 'shared_docs', shareId, 'members', uid);
    const snap = await getDoc(memberRef);
    if (!snap.exists()) return null;

    const { encryptedDocKey } = snap.data();
    const keyJson = await decryptRSA(encryptedDocKey, privateKey);
    if (!keyJson) return null;

    return deserializeKey(keyJson);
};

// =============================================
// LISTENERS
// =============================================

/**
 * Listen to all shared documents where the current user is a member,
 * filtered by app type.
 */
export const listenToSharedDocs = (uid, appType, privateKey, callback) => {
    const q = query(
        collection(db, 'artifacts', appId, 'shared_docs'),
        where('memberUids', 'array-contains', uid),
        where('appType', '==', appType)
    );

    // Cache doc keys to avoid repeated RSA decryption
    const keyCache = {};

    return onSnapshot(q, async (snapshot) => {
        const docs = [];
        for (const d of snapshot.docs) {
            const raw = d.data();
            try {
                // Get or cache the doc key
                if (!keyCache[d.id]) {
                    keyCache[d.id] = await getDocumentKey(d.id, uid, privateKey);
                }
                const docKey = keyCache[d.id];
                if (!docKey) continue;

                const decrypted = await decryptData(raw, docKey);
                if (!decrypted) continue;

                docs.push({
                    id: d.id,
                    shareId: d.id,
                    ...decrypted,
                    docKey, // Pass through for file downloads in shared context
                    appType: raw.appType,
                    docType: raw.docType,
                    ownerUid: raw.ownerUid,
                    memberUids: raw.memberUids,
                    sharedFolderId: raw.sharedFolderId || null,
                    parentShareId: raw.parentShareId || null,
                    isPinned: raw.isPinned || false,
                    isShared: true,
                    isOwner: raw.ownerUid === uid,
                    updatedAt: raw.updatedAt?.toDate() || new Date(),
                    createdAt: raw.createdAt?.toDate() || new Date()
                });
            } catch (e) {
                const msg = e.message || '';
                // Silently skip stale docs where we've lost access
                if (msg.includes('permission') || msg.includes('Permission')) {
                    continue;
                }
                console.warn('Failed to decrypt shared doc', d.id, msg);
                // Return a safe fallback object to avoid crashing the whole app
                docs.push({
                    id: d.id,
                    shareId: d.id,
                    title: 'Encrypted Shared Doc (Decryption Failed)',
                    appType: raw.appType || 'misc',
                    docType: raw.docType || 'folder',
                    ownerUid: raw.ownerUid,
                    memberUids: raw.memberUids || [],
                    sharedFolderId: raw.sharedFolderId || null,
                    parentShareId: raw.parentShareId || null,
                    isPinned: raw.isPinned || false,
                    isShared: true,
                    isOwner: raw.ownerUid === uid,
                    updatedAt: raw.updatedAt?.toDate() || new Date(),
                    createdAt: raw.createdAt?.toDate() || new Date(),
                    pdfHash: null // Prevent "Cannot read properties of null (reading 'pdfHash')"
                });
            }
        }
        callback(docs);
    });
};

// =============================================
// CRUD ON SHARED DOCS
// =============================================

/**
 * Save/update a shared document (encrypt with doc key).
 */
export const saveSharedDoc = async (shareId, docKey, data) => {
    const { id, shareId: _sid, isShared, isOwner, ownerUid, memberUids,
        appType, docType, sharedFolderId, parentShareId, updatedAt, createdAt, ...cleanData } = data;

    const encrypted = await encryptData(cleanData, docKey);
    await updateDoc(doc(db, 'artifacts', appId, 'shared_docs', shareId), {
        ...encrypted,
        isPinned: data.isPinned || false,
        updatedAt: serverTimestamp()
    });
};

/**
 * Delete a shared document (owner only).
 */
export const deleteSharedDoc = async (shareId) => {
    // Delete member subdocs first
    const membersSnap = await getDocs(collection(db, 'artifacts', appId, 'shared_docs', shareId, 'members'));
    const batch = writeBatch(db);
    membersSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, 'artifacts', appId, 'shared_docs', shareId));
    await batch.commit();
};

/**
 * Stop sharing — delete from shared_docs.
 */
export const unshareDocument = async (shareId) => {
    await deleteSharedDoc(shareId);
};

// =============================================
// FOLDER SHARING
// =============================================

/**
 * Batch-share all documents in a folder.
 * Creates individual share records per doc, linked by sharedFolderId.
 *
 * @returns {{ sharedFolderId: string, shares: Array<{docId, shareId}> }}
 */
export const shareFolder = async (ownerUid, personalKey, folderId, folderData, allItems, appType, collaboratorUids) => {
    const sharedFolderId = `sf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Share the folder itself
    const folderResult = await shareDocument(
        ownerUid, personalKey, folderData, appType, 'folder',
        collaboratorUids, sharedFolderId, null
    );

    const shares = [{ docId: folderId, shareId: folderResult.shareId }];

    // Share all children of the folder
    const children = allItems.filter(i => i.parentId === folderId);
    for (const child of children) {
        const childResult = await shareDocument(
            ownerUid, personalKey, child, appType, child.type || appType,
            collaboratorUids, sharedFolderId, folderResult.shareId
        );
        shares.push({ docId: child.id, shareId: childResult.shareId });
    }

    return { sharedFolderId, shares };
};

/**
 * Get members of a shared document.
 */
export const getShareMembers = async (shareId) => {
    const membersSnap = await getDocs(collection(db, 'artifacts', appId, 'shared_docs', shareId, 'members'));
    const members = [];
    for (const d of membersSnap.docs) {
        const data = d.data();
        // Fetch display info from public_keys
        const pkSnap = await getDoc(doc(db, 'artifacts', appId, 'public_keys', d.id));
        const pkData = pkSnap.exists() ? pkSnap.data() : {};
        members.push({
            uid: d.id,
            role: data.role || 'editor',
            displayName: pkData.displayName || d.id,
            email: pkData.email || '',
            photoURL: pkData.photoURL || null,
            joinedAt: data.joinedAt
        });
    }
    return members;
};
