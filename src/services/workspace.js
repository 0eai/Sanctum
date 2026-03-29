// src/services/workspace.js
// Workspace-level E2EE collaboration — one AES-256 key per workspace,
// all documents inside are encrypted with it. RSA-wrapped per member.
import {
    collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, onSnapshot,
    query, where, orderBy, serverTimestamp, updateDoc
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { deleteInChunks } from '../lib/firestore';
import {
    generateMasterKey, encryptData, decryptData,
    encryptRSA, decryptRSA, importRSAPublicKey
} from '../lib/crypto';

// =============================================
// HELPERS
// =============================================

const getPublicKey = async (uid) => {
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public_keys', uid));
    if (!snap.exists() || !snap.data().publicKey) return null;
    return importRSAPublicKey(snap.data().publicKey);
};

const serializeKey = async (key) => {
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return JSON.stringify(Array.from(new Uint8Array(exported)));
};

const deserializeKey = async (jsonStr) => {
    return window.crypto.subtle.importKey(
        'raw',
        new Uint8Array(JSON.parse(jsonStr)).buffer,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
};

// =============================================
// WORKSPACE LIFECYCLE
// =============================================

/**
 * Create a new workspace.
 * Generates a per-workspace AES-256 key, RSA-wraps it for the owner.
 *
 * @param {string} name - Workspace display name
 * @param {string} ownerUid - Creator's UID
 * @param {string} appType - 'notes' | 'markdown' | 'tasks' | 'research' | 'bookmarks' | 'checklists'
 * @returns {{ workspaceId: string, workspaceKey: CryptoKey }}
 */
export const createWorkspace = async (name, ownerUid) => {
    const wsKey = await generateMasterKey();
    const keyJson = await serializeKey(wsKey);

    const wsRef = await addDoc(collection(db, 'artifacts', appId, 'workspaces'), {
        name,
        createdBy: ownerUid,
        memberUids: [ownerUid],
        createdAt: serverTimestamp()
    });

    // Wrap key for owner
    const pubKey = await getPublicKey(ownerUid);
    if (pubKey) {
        const encryptedKey = await encryptRSA(keyJson, pubKey);
        await setDoc(doc(db, 'artifacts', appId, 'workspaces', wsRef.id, 'members', ownerUid), {
            encryptedWorkspaceKey: encryptedKey,
            role: 'owner',
            joinedAt: serverTimestamp()
        });
    }

    return { workspaceId: wsRef.id, workspaceKey: wsKey };
};

/**
 * Delete a workspace and all its contents (owner only).
 * Explicitly deletes all document subcollections since Firestore doesn't cascade.
 */
export const deleteWorkspace = async (wsId) => {
    const wsRef = doc(db, 'artifacts', appId, 'workspaces', wsId);

    // Delete all document subcollections (notes, tasks, etc.)
    const DOC_COLLECTIONS = ['notes', 'tasks', 'markdown', 'checklists', 'passwords'];
    for (const colName of DOC_COLLECTIONS) {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'workspaces', wsId, colName));
        if (!snap.empty) await deleteInChunks(snap.docs.map(d => d.ref));
    }

    // Delete members subcollection + workspace doc
    const membersSnap = await getDocs(collection(db, 'artifacts', appId, 'workspaces', wsId, 'members'));
    await deleteInChunks([...membersSnap.docs.map(d => d.ref), wsRef]);
};

// =============================================
// MEMBER MANAGEMENT
// =============================================

/**
 * Invite a new member to the workspace.
 */
export const inviteMember = async (wsId, newUid, wsKey, role = 'editor') => {
    const pubKey = await getPublicKey(newUid);
    if (!pubKey) throw new Error("User's public key not found. They must initialize SecureShare first.");

    const keyJson = await serializeKey(wsKey);
    const encryptedKey = await encryptRSA(keyJson, pubKey);

    await setDoc(doc(db, 'artifacts', appId, 'workspaces', wsId, 'members', newUid), {
        encryptedWorkspaceKey: encryptedKey,
        role,
        joinedAt: serverTimestamp()
    });

    // Update memberUids array
    const wsRef = doc(db, 'artifacts', appId, 'workspaces', wsId);
    const snap = await getDoc(wsRef);
    if (snap.exists()) {
        const existing = snap.data().memberUids || [];
        if (!existing.includes(newUid)) {
            await updateDoc(wsRef, { memberUids: [...existing, newUid] });
        }
    }
};

/**
 * Remove a member from the workspace.
 * Rotates the workspace key and re-wraps it for all remaining members.
 * Note: Existing documents are NOT re-encrypted (similar to group chat model).
 */
export const removeMember = async (wsId, uid) => {
    // 1. Remove member's key doc
    await deleteDoc(doc(db, 'artifacts', appId, 'workspaces', wsId, 'members', uid));

    // 2. Update memberUids
    const wsRef = doc(db, 'artifacts', appId, 'workspaces', wsId);
    const snap = await getDoc(wsRef);
    if (!snap.exists()) return null;

    const remaining = (snap.data().memberUids || []).filter(u => u !== uid);
    await updateDoc(wsRef, { memberUids: remaining });

    if (remaining.length === 0) return null;

    // 3. Generate new workspace key
    const newKey = await generateMasterKey();
    const newKeyJson = await serializeKey(newKey);

    // 4. Re-wrap for remaining members
    for (const memberUid of remaining) {
        try {
            const pubKey = await getPublicKey(memberUid);
            if (!pubKey) continue;
            const encryptedKey = await encryptRSA(newKeyJson, pubKey);
            await setDoc(doc(db, 'artifacts', appId, 'workspaces', wsId, 'members', memberUid), {
                encryptedWorkspaceKey: encryptedKey,
                rotatedAt: serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.warn(`Key rotation failed for ${memberUid}:`, e);
        }
    }

    return newKey;
};

/**
 * Get all members of a workspace with their display info.
 */
export const getWorkspaceMembers = async (wsId) => {
    const membersSnap = await getDocs(collection(db, 'artifacts', appId, 'workspaces', wsId, 'members'));
    const members = [];
    for (const d of membersSnap.docs) {
        const data = d.data();
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

// =============================================
// KEY RETRIEVAL
// =============================================

/**
 * Decrypt the workspace AES key for the current user.
 */
export const getWorkspaceKey = async (wsId, uid, privateKey) => {
    if (!privateKey) return null;

    const memberRef = doc(db, 'artifacts', appId, 'workspaces', wsId, 'members', uid);
    const snap = await getDoc(memberRef);
    if (!snap.exists()) return null;

    const { encryptedWorkspaceKey } = snap.data();
    if (!encryptedWorkspaceKey) return null;

    const keyJson = await decryptRSA(encryptedWorkspaceKey, privateKey);
    if (!keyJson) return null;

    return deserializeKey(keyJson);
};

// =============================================
// WORKSPACE LISTENERS
// =============================================

/**
 * Listen to all workspaces where the current user is a member.
 * Optionally filtered by appType.
 */
export const listenToWorkspaces = (uid, callback) => {
    const constraints = [where('memberUids', 'array-contains', uid)];

    const q = query(collection(db, 'artifacts', appId, 'workspaces'), ...constraints);

    return onSnapshot(q, async (snapshot) => {
        const workspaces = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data(),
            createdAt: d.data().createdAt?.toDate() || new Date()
        }));
        callback(workspaces);
    });
};

/**
 * Listen to documents within a workspace sub-collection.
 * Generic — works for any collection name (notes, tasks, markdown, etc.).
 */
export const listenToWorkspaceDocs = (wsId, collectionName, wsKey, callback, orderField = 'updatedAt', orderDir = 'desc') => {
    if (!wsId || !wsKey) return () => { };

    const q = query(
        collection(db, 'artifacts', appId, 'workspaces', wsId, collectionName),
        orderBy(orderField, orderDir)
    );

    return onSnapshot(q, async (snapshot) => {
        const docs = await Promise.all(snapshot.docs.map(async d => {
            const raw = d.data();
            // Only pick known unencrypted metadata fields — never spread ...raw to avoid
            // leaking AES artifacts (iv, data) or unknown fields into the returned object.
            const meta = {
                id: d.id,
                type: raw.type,
                isPinned: raw.isPinned || false,
                parentId: raw.parentId || null,
                order: raw.order ?? null,
                completed: raw.completed ?? null,
                itemCount: raw.itemCount ?? null,
                completedCount: raw.completedCount ?? null,
                updatedAt: raw.updatedAt?.toDate() || new Date(),
                createdAt: raw.createdAt?.toDate() || new Date()
            };
            try {
                const decrypted = await decryptData(raw, wsKey);
                return { ...meta, ...decrypted };
            } catch (e) {
                console.error(`Failed to decrypt workspace doc ${d.id}`, e);
                return { ...meta, title: 'Decryption Failed', _decryptionFailed: true };
            }
        }));
        callback(docs);
    });
};

// =============================================
// CRUD ON WORKSPACE DOCS
// =============================================

/**
 * Save/create a document inside a workspace.
 */
export const saveWorkspaceDoc = async (wsId, collectionName, wsKey, docData) => {
    const { id, updatedAt, createdAt, ...cleanData } = docData;

    const encrypted = await encryptData(cleanData, wsKey);
    const meta = { updatedAt: serverTimestamp() };

    // Carry forward unencrypted metadata
    if (docData.type) meta.type = docData.type;
    if (docData.isPinned !== undefined) meta.isPinned = docData.isPinned;
    if (docData.parentId !== undefined) meta.parentId = docData.parentId;
    if (docData.order !== undefined) meta.order = docData.order;
    if (docData.completed !== undefined) meta.completed = docData.completed;
    if (docData.itemCount !== undefined) meta.itemCount = docData.itemCount;
    if (docData.completedCount !== undefined) meta.completedCount = docData.completedCount;

    if (id) {
        await updateDoc(doc(db, 'artifacts', appId, 'workspaces', wsId, collectionName, id), {
            ...encrypted, ...meta
        });
        return id;
    } else {
        const ref = await addDoc(collection(db, 'artifacts', appId, 'workspaces', wsId, collectionName), {
            ...encrypted, ...meta, createdAt: serverTimestamp()
        });
        return ref.id;
    }
};

/**
 * Delete a document from a workspace.
 */
export const deleteWorkspaceDoc = async (wsId, collectionName, docId) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'workspaces', wsId, collectionName, docId));
};

/**
 * Batch delete multiple documents from a workspace (for folder deletion).
 * Chunked to handle more than 500 documents.
 */
export const batchDeleteWorkspaceDocs = async (wsId, collectionName, docIds) => {
    const refs = docIds.map(id => doc(db, 'artifacts', appId, 'workspaces', wsId, collectionName, id));
    await deleteInChunks(refs);
};
