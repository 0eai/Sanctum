// src/services/collaboration.js
// Per-document E2EE collaboration — each shared doc gets its own AES-256 key,
// RSA-wrapped per collaborator.
import {
    collection, doc, setDoc, getDoc, getDocs, onSnapshot,
    query, where, serverTimestamp, updateDoc, runTransaction
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { deleteInChunks } from '../lib/firestore';
import {
    generateMasterKey, encryptData, decryptData,
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
 * In-place re-encryption of shared doc Storage attachments with a new key.
 * Called after collaborator removal / key rotation. Overwrites files at the same Storage paths.
 */
const reEncryptAttachments = async (shareId, currentData, oldKey, newKey) => {
    const prefix = `shared_docs/${shareId}/`;
    const attachments = currentData.attachments || [];

    const reEncryptFile = async (storagePath) => {
        try {
            const fileRef = ref(storage, `artifacts/${appId}/${storagePath}`);
            const blob = await getBlob(fileRef);
            const buffer = await blob.arrayBuffer();
            const iv = new Uint8Array(buffer.slice(0, 12));
            const ciphertext = new Uint8Array(buffer.slice(12));
            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, oldKey, ciphertext);
            const newIv = crypto.getRandomValues(new Uint8Array(12));
            const reEnc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: newIv }, newKey, plain);
            const payload = new Uint8Array(12 + reEnc.byteLength);
            payload.set(newIv);
            payload.set(new Uint8Array(reEnc), 12);
            await uploadBytesResumable(fileRef, new Blob([payload], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream' });
        } catch (e) {
            console.warn(`[reEncryptAttachments] Failed to re-encrypt ${storagePath}:`, e);
        }
    };

    const jobs = [];
    for (const att of attachments) {
        if (att.driveFileId?.startsWith(prefix)) jobs.push(reEncryptFile(att.driveFileId));
    }
    if (currentData.driveFileId?.startsWith(prefix)) jobs.push(reEncryptFile(currentData.driveFileId));

    await Promise.all(jobs);
};

/**
 * Copy attachment files from owner's personal storage to shared storage.
 * Decrypts with sourceKey (personal master key or workspace key), re-encrypts with per-doc key.
 * Updates attachment references in the shared doc.
 */
const copyFilesForShare = async (shareId, docData, sourceKey, docKey) => {
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
            // 1. Download encrypted file from source path
            const srcRef = ref(storage, getStoragePath(att.driveFileId));
            const encryptedBlob = await getBlob(srcRef);
            const buffer = await encryptedBlob.arrayBuffer();

            // 2. Decrypt with source key (personal or workspace)
            const iv = new Uint8Array(buffer.slice(0, 12));
            const data = new Uint8Array(buffer.slice(12));
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv }, sourceKey, data
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
                // File is AES-encrypted — decrypt with source key (personal or workspace)
                const iv = new Uint8Array(buffer.slice(0, 12));
                const data = new Uint8Array(buffer.slice(12));
                plainBuffer = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv }, sourceKey, data
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
 * 3. RSA-wrap the key for each collaborator (including owner) — atomic via runTransaction
 * 4. Copy attachment files to shared storage (re-encrypted with docKey)
 *
 * @param {string} ownerUid
 * @param {CryptoKey} personalKey - owner's master key to decrypt the original doc
 * @param {object} docData - the decrypted document data
 * @param {string} appType - 'notes' | 'markdown' | 'tasks' | 'research' | 'bookmarks' | 'checklists'
 * @param {string} docType - 'note' | 'folder' | 'task' | 'paper' | 'bookmark' | 'checklist'
 * @param {string[]} collaboratorUids - UIDs to share with (owner is added automatically)
 * @param {string|null} sharedFolderId - links batch-shared folder items
 * @param {string|null} parentShareId - parent shared folder's shareId
 * @param {CryptoKey|null} sourceKey - key used to decrypt source attachments (workspace key or personalKey)
 * @returns {{ shareId: string, docKey: CryptoKey }}
 */
export const shareDocument = async (ownerUid, personalKey, docData, appType, docType, collaboratorUids, sharedFolderId = null, parentShareId = null, sourceKey = null) => {
    // Generate per-doc key
    const docKey = await generateMasterKey();

    // Clean doc data (remove metadata fields that shouldn't be encrypted)
    const { id, updatedAt, createdAt, type, isPinned, parentId, ...cleanData } = docData;

    // Encrypt with per-doc key
    const encrypted = await encryptData(cleanData, docKey);

    // All members = owner + collaborators (deduplicated)
    const memberUids = [...new Set([ownerUid, ...collaboratorUids])];

    // Pre-compute RSA-wrapped keys for all members (async — must happen outside the transaction)
    const keyJson = await serializeKey(docKey);
    const memberKeyMap = {};
    for (const uid of memberUids) {
        try {
            const pubKey = await getPublicKey(uid);
            if (!pubKey) continue;
            memberKeyMap[uid] = await encryptRSA(keyJson, pubKey);
        } catch (e) {
            console.warn(`Failed to wrap key for ${uid}:`, e);
        }
    }

    // Atomically create the share doc + all member key docs in one transaction
    const shareRef = doc(collection(db, 'artifacts', appId, 'shared_docs'));
    await runTransaction(db, async (transaction) => {
        transaction.set(shareRef, {
            ...encrypted,
            appType,
            docType,
            ownerUid,
            memberUids,
            viewerUids: [],
            sharedFolderId,
            parentShareId,
            isPinned: docData.isPinned || false,
            keyVersion: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        for (const uid of memberUids) {
            if (!memberKeyMap[uid]) continue;
            transaction.set(doc(db, 'artifacts', appId, 'shared_docs', shareRef.id, 'members', uid), {
                encryptedDocKey: memberKeyMap[uid],
                role: uid === ownerUid ? 'owner' : 'editor',
                joinedAt: serverTimestamp()
            });
        }
    });

    // Copy attachment files to shared storage (re-encrypted with docKey)
    // sourceKey falls back to personalKey when not in a workspace context
    await copyFilesForShare(shareRef.id, cleanData, sourceKey ?? personalKey, docKey);

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

    // Update memberUids and viewerUids on the share doc
    const shareRef = doc(db, 'artifacts', appId, 'shared_docs', shareId);
    const snap = await getDoc(shareRef);
    if (snap.exists()) {
        const existing = snap.data().memberUids || [];
        const existingViewers = snap.data().viewerUids || [];
        const updatePayload = {};
        if (!existing.includes(newUid)) {
            updatePayload.memberUids = [...existing, newUid];
        }
        if (role === 'viewer' && !existingViewers.includes(newUid)) {
            updatePayload.viewerUids = [...existingViewers, newUid];
        } else if (role !== 'viewer' && existingViewers.includes(newUid)) {
            updatePayload.viewerUids = existingViewers.filter(u => u !== newUid);
        }
        if (Object.keys(updatePayload).length > 0) {
            await updateDoc(shareRef, updatePayload);
        }
    }
};

/**
 * Remove a collaborator. Rotates the doc key and re-encrypts the document atomically.
 */
export const removeDocCollaborator = async (shareId, uid, currentDocKey) => {
    const shareRef = doc(db, 'artifacts', appId, 'shared_docs', shareId);

    // Read current state before entering the transaction
    const snap = await getDoc(shareRef);
    if (!snap.exists()) return null;

    const remaining = (snap.data().memberUids || []).filter(u => u !== uid);

    // If only the owner remains (or no one), delete the shared doc entirely
    if (remaining.length <= 1) {
        const membersSnap = await getDocs(collection(db, 'artifacts', appId, 'shared_docs', shareId, 'members'));
        await deleteInChunks([...membersSnap.docs.map(d => d.ref), shareRef]);
        return null;
    }

    // Decrypt current doc and generate new key outside the transaction (async crypto ops)
    const currentData = await decryptData(snap.data(), currentDocKey);
    if (!currentData) return null;

    const newKey = await generateMasterKey();
    const newEncrypted = await encryptData(currentData, newKey);

    // Pre-compute new RSA-wrapped keys for remaining members (async — before transaction)
    const newKeyJson = await serializeKey(newKey);
    const memberKeyMap = {};
    for (const memberUid of remaining) {
        try {
            const pubKey = await getPublicKey(memberUid);
            if (!pubKey) continue;
            memberKeyMap[memberUid] = await encryptRSA(newKeyJson, pubKey);
        } catch (e) {
            console.warn(`Key rotation failed for ${memberUid}:`, e);
        }
    }

    // Atomically: re-encrypt doc, update memberUids, remove old member, update remaining member keys
    await runTransaction(db, async (transaction) => {
        const freshSnap = await transaction.get(shareRef);
        if (!freshSnap.exists()) return;

        transaction.update(shareRef, {
            ...newEncrypted,
            memberUids: remaining,
            viewerUids: (freshSnap.data().viewerUids || []).filter(u => u !== uid),
            keyVersion: (freshSnap.data().keyVersion || 1) + 1,
            updatedAt: serverTimestamp()
        });
        transaction.delete(doc(db, 'artifacts', appId, 'shared_docs', shareId, 'members', uid));
        for (const memberUid of remaining) {
            if (!memberKeyMap[memberUid]) continue;
            transaction.set(doc(db, 'artifacts', appId, 'shared_docs', shareId, 'members', memberUid), {
                encryptedDocKey: memberKeyMap[memberUid],
                rotatedAt: serverTimestamp()
            }, { merge: true });
        }
    });

    // Re-encrypt Storage attachments with the new key (in-place, outside transaction)
    await reEncryptAttachments(shareId, currentData, currentDocKey, newKey);

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
                // Get or cache the doc key; invalidate when keyVersion changes (key rotation)
                const currentVersion = raw.keyVersion || 1;
                if (!keyCache[d.id] || keyCache[d.id].version !== currentVersion) {
                    const fetchedKey = await getDocumentKey(d.id, uid, privateKey);
                    if (fetchedKey) keyCache[d.id] = { key: fetchedKey, version: currentVersion };
                    else delete keyCache[d.id];
                }
                const docKey = keyCache[d.id]?.key;
                if (!docKey) continue;

                const decrypted = await decryptData(raw, docKey);
                if (!decrypted) continue;

                // Fetch the current user's role from the members subcollection
                let memberRole = raw.ownerUid === uid ? 'owner' : 'editor';
                try {
                    const memberSnap = await getDoc(
                        doc(db, 'artifacts', appId, 'shared_docs', d.id, 'members', uid)
                    );
                    if (memberSnap.exists()) memberRole = memberSnap.data().role || 'editor';
                } catch (_) { /* role defaults to editor on error */ }

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
                    isSharedDoc: true,
                    isOwner: raw.ownerUid === uid,
                    role: memberRole,
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
                    isSharedDoc: true,
                    isOwner: raw.ownerUid === uid,
                    role: raw.ownerUid === uid ? 'owner' : 'editor',
                    updatedAt: raw.updatedAt?.toDate() || new Date(),
                    createdAt: raw.createdAt?.toDate() || new Date(),
                    pdfHash: null // Prevent "Cannot read properties of null (reading 'pdfHash')"
                });
            }
        }
        docs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        callback(docs);
    });
};

/**
 * Listen to all shared documents where the current user is a member,
 * across ALL app types. Used by the Global Shared Hub.
 */
export const listenToAllSharedDocs = (uid, privateKey, callback) => {
    const q = query(
        collection(db, 'artifacts', appId, 'shared_docs'),
        where('memberUids', 'array-contains', uid)
    );

    const keyCache = {};

    return onSnapshot(q, async (snapshot) => {
        const docs = [];
        for (const d of snapshot.docs) {
            const raw = d.data();
            try {
                const currentVersion = raw.keyVersion || 1;
                if (!keyCache[d.id] || keyCache[d.id].version !== currentVersion) {
                    const fetchedKey = await getDocumentKey(d.id, uid, privateKey);
                    if (fetchedKey) keyCache[d.id] = { key: fetchedKey, version: currentVersion };
                    else delete keyCache[d.id];
                }
                const docKey = keyCache[d.id]?.key;
                if (!docKey) continue;

                const decrypted = await decryptData(raw, docKey);
                if (!decrypted) continue;

                let memberRole = raw.ownerUid === uid ? 'owner' : 'editor';
                try {
                    const memberSnap = await getDoc(
                        doc(db, 'artifacts', appId, 'shared_docs', d.id, 'members', uid)
                    );
                    if (memberSnap.exists()) memberRole = memberSnap.data().role || 'editor';
                } catch (_) { /* role defaults to editor on error */ }

                docs.push({
                    id: d.id,
                    shareId: d.id,
                    ...decrypted,
                    docKey,
                    appType: raw.appType,
                    docType: raw.docType,
                    ownerUid: raw.ownerUid,
                    memberUids: raw.memberUids,
                    isSharedDoc: true,
                    isOwner: raw.ownerUid === uid,
                    role: memberRole,
                    updatedAt: raw.updatedAt?.toDate() || new Date(),
                    createdAt: raw.createdAt?.toDate() || new Date()
                });
            } catch (e) {
                const msg = e.message || '';
                if (msg.includes('permission') || msg.includes('Permission')) continue;
                console.warn('Failed to decrypt shared doc', d.id, msg);
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
    const { id, shareId: _sid, isSharedDoc, isOwner, role, ownerUid, memberUids,
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
    const membersSnap = await getDocs(collection(db, 'artifacts', appId, 'shared_docs', shareId, 'members'));
    await deleteInChunks([
        ...membersSnap.docs.map(d => d.ref),
        doc(db, 'artifacts', appId, 'shared_docs', shareId)
    ]);
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
    const sharedFolderId = `sf_${crypto.randomUUID()}`;

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
