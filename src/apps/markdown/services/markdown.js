// src/services/markdown.js
import {
    collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
    updateDoc, doc, deleteDoc, getDocs, writeBatch, increment, deleteField, setDoc
} from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { encryptData, decryptData } from '../../../lib/crypto';
import { getNextDate } from '../../../lib/dateUtils';
import { deleteFirebaseFile, reEncryptStorageFilesForMove } from '../../../services/firebaseStorage';

// --- Workspace Context Helper ---
const getMdCol = (userId, ctx) =>
    ctx?.workspaceId
        ? collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'markdown')
        : collection(db, 'artifacts', appId, 'users', userId, 'markdown');

const getMdDoc = (userId, docId, ctx) =>
    ctx?.workspaceId
        ? doc(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'markdown', docId)
        : doc(db, 'artifacts', appId, 'users', userId, 'markdown', docId);

const getKey = (cryptoKey, ctx) => ctx?.key || cryptoKey;

// --- Decrypt Helper ---
// Handles both new field-level format (encryptedTitle, …) and legacy single-blob format.
const decryptMarkdownDoc = async (raw, key) => {
    if (raw.encryptedTitle !== undefined || raw.encryptedContent !== undefined) {
        const title = raw.encryptedTitle
            ? await decryptData(raw.encryptedTitle, key).catch(() => '') : '';
        if (raw.type === 'folder') return { title };
        const [content, tags, attachments, meta] = await Promise.all([
            raw.encryptedContent ? decryptData(raw.encryptedContent, key).catch(() => '') : '',
            raw.encryptedTags ? decryptData(raw.encryptedTags, key).catch(() => []) : [],
            raw.encryptedAttachments ? decryptData(raw.encryptedAttachments, key).catch(() => []) : [],
            raw.encryptedMeta ? decryptData(raw.encryptedMeta, key).catch(() => ({})) : {},
        ]);
        return { title, content, tags, attachments, ...(meta || {}) };
    }
    return decryptData(raw, key); // Legacy single-blob
};

// --- Listeners ---

export const listenToMarkdownDocs = (userId, cryptoKey, callback, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const q = query(
        getMdCol(userId, ctx),
        orderBy('updatedAt', 'desc')
    );
    return onSnapshot(q, async (snapshot) => {
        const data = await Promise.all(snapshot.docs.map(async docSnap => {
            const raw = docSnap.data();
            try {
                const decrypted = await decryptMarkdownDoc(raw, key);
                // Strip encrypted blobs from the spread so they don't pollute app state
                const { encryptedTitle: _et, encryptedContent: _ec, encryptedTags: _etg,
                        encryptedAttachments: _ea, encryptedMeta: _em, data: _d, iv: _iv,
                        ...rawMeta } = raw;
                return {
                    id: docSnap.id,
                    ...rawMeta,
                    ...(decrypted || {}),
                    tags: decrypted?.tags || [],
                    attachments: decrypted?.attachments || [],
                    dueDate: decrypted?.dueDate || null,
                    repeat: decrypted?.repeat || 'none',
                    type: raw.type || 'markdown',
                    parentId: raw.parentId || null,
                    updatedAt: raw.updatedAt?.toDate() || new Date()
                };
            } catch (error) {
                console.warn('Failed to decrypt markdown doc', docSnap.id, error.message || error);
                return {
                    id: docSnap.id,
                    title: 'Encrypted Data (Decryption Failed)',
                    content: '',
                    tags: [],
                    attachments: [],
                    dueDate: null,
                    repeat: 'none',
                    type: raw.type || 'markdown',
                    parentId: raw.parentId || null,
                    updatedAt: raw.updatedAt?.toDate() || new Date()
                };
            }
        }));
        callback(data);
    });
};

// --- Single-doc fetch (used by Research AI review switcher) ---
export const fetchMarkdownDocById = async (userId, cryptoKey, docId, ctx = null) => {
    const { getDoc } = await import('firebase/firestore');
    const snap = await getDoc(getMdDoc(userId, docId, ctx));
    if (!snap.exists()) return null;
    return await decryptMarkdownDoc(snap.data(), ctx?.key || cryptoKey);
};

// --- CRUD Operations ---

export const saveMarkdownDoc = async (userId, cryptoKey, docData, parentId, ctx = null) => {
    const key = getKey(cryptoKey, ctx);

    const [encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta] = await Promise.all([
        encryptData(docData.title || '', key),
        encryptData(docData.content || '', key),
        encryptData(docData.tags || [], key),
        encryptData(docData.attachments || [], key),
        encryptData({
            dueDate: docData.dueDate || null,
            repeat: docData.repeat || 'none',
            sharedId: docData.sharedId || null,
            shareUrlKey: docData.shareUrlKey || null,
            collabShareId: docData.collabShareId || null
        }, key),
    ]);

    const fieldData = { encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta };

    const meta = {
        updatedAt: serverTimestamp(),
        versionId: increment(1),
        isPinned: docData.isPinned || false,
        type: 'markdown',
        parentId: docData.parentId || parentId || null
    };

    if (docData.id) {
        await updateDoc(getMdDoc(userId, docData.id, ctx), {
            ...fieldData, ...meta,
            data: deleteField(), iv: deleteField() // clear legacy single-blob fields
        });
        return docData.id;
    } else {
        const ref = await addDoc(getMdCol(userId, ctx), { ...fieldData, ...meta, createdAt: serverTimestamp() });
        return ref.id;
    }
};

export const rescheduleMarkdownDoc = async (userId, cryptoKey, docData, ctx = null) => {
    const nextDate = getNextDate(docData.dueDate, docData.repeat);
    await saveMarkdownDoc(userId, cryptoKey, { ...docData, dueDate: nextDate }, docData.parentId, ctx);
};

export const createFolder = async (userId, cryptoKey, title, parentId, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const encryptedTitle = await encryptData(title, key);
    await addDoc(getMdCol(userId, ctx), {
        encryptedTitle,
        type: 'folder',
        parentId: parentId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
};

export const updateFolder = async (userId, cryptoKey, folderId, title, parentId = undefined, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const encryptedTitle = await encryptData(title, key);
    const update = {
        encryptedTitle, updatedAt: serverTimestamp(),
        data: deleteField(), iv: deleteField()
    };
    if (parentId !== undefined) update.parentId = parentId;
    await updateDoc(getMdDoc(userId, folderId, ctx), update);
};

export const deleteMarkdownItem = async (userId, item, allItems, ctx = null) => {
    if (item.type === 'folder') {
        const batch = writeBatch(db);
        const children = allItems.filter(i => i.parentId === item.id);

        for (const c of children) {
            if (c.attachments && c.attachments.length > 0) {
                for (const att of c.attachments) {
                    if (att.driveFileId) await deleteFirebaseFile(att.driveFileId, 'markdown');
                }
            }
            batch.delete(getMdDoc(userId, c.id, ctx));
        }

        batch.delete(getMdDoc(userId, item.id, ctx));
        await batch.commit();
    } else {
        if (item.attachments && item.attachments.length > 0) {
            for (const att of item.attachments) {
                if (att.driveFileId) await deleteFirebaseFile(att.driveFileId, 'markdown');
            }
        }
        await deleteDoc(getMdDoc(userId, item.id, ctx));
    }
};

// --- Import / Export ---

export const exportMarkdownDocs = async (userId, cryptoKey) => {
    const q = query(collection(db, 'artifacts', appId, 'users', userId, 'markdown'));
    const snapshot = await getDocs(q);

    return Promise.all(snapshot.docs.map(async (docSnap) => {
        const raw = docSnap.data();
        const decrypted = await decryptMarkdownDoc(raw, cryptoKey);
        return {
            ...raw,
            ...decrypted,
            oldId: docSnap.id,
            createdAt: raw.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: raw.updatedAt?.toDate?.()?.toISOString() || null
        };
    }));
};

// --- Move (cross-context) ---
// Writes in field-level encrypted format so the listener can decrypt with the
// standard field-level path instead of the legacy single-blob path.
export const moveMarkdownDoc = async (userId, cryptoKey, item, sourceCtx, destCtx) => {
    const sourceKey = sourceCtx?.key ?? cryptoKey;
    const destKey   = destCtx?.key  ?? cryptoKey;

    if (item.type === 'folder') {
        const encryptedTitle = await encryptData(item.title || '', destKey);
        await setDoc(getMdDoc(userId, item.id, destCtx), {
            encryptedTitle,
            type: 'folder',
            parentId: item.parentId || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } else {
        const [encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta] = await Promise.all([
            encryptData(item.title || '', destKey),
            encryptData(item.content || '', destKey),
            encryptData(item.tags || [], destKey),
            encryptData(item.attachments || [], destKey),
            encryptData({
                dueDate: item.dueDate || null,
                repeat: item.repeat || 'none',
                sharedId: item.sharedId || null,
                shareUrlKey: item.shareUrlKey || null,
                collabShareId: item.collabShareId || null,
            }, destKey),
        ]);
        await setDoc(getMdDoc(userId, item.id, destCtx), {
            encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta,
            isPinned: item.isPinned || false,
            type: 'markdown',
            parentId: item.parentId || null,
            versionId: item.versionId || 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        await reEncryptStorageFilesForMove(item, sourceKey, destKey, 'markdown');
    }

    await deleteDoc(getMdDoc(userId, item.id, sourceCtx));
};

export const importMarkdownDocs = async (userId, cryptoKey, data) => {
    if (!Array.isArray(data)) throw new Error("Invalid format");
    const sortedData = data.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return 0;
    });
    const idMap = {};
    let count = 0;
    for (const item of sortedData) {
        const { oldId, title, content, tags, attachments, dueDate, repeat, parentId, type, isPinned } = item;
        const newParentId = parentId && idMap[parentId] ? idMap[parentId] : null;

        let fieldData;
        if (type === 'folder') {
            fieldData = { encryptedTitle: await encryptData(title || '', cryptoKey) };
        } else {
            const [encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta] = await Promise.all([
                encryptData(title || '', cryptoKey),
                encryptData(content || '', cryptoKey),
                encryptData(tags || [], cryptoKey),
                encryptData(attachments || [], cryptoKey),
                encryptData({ dueDate: dueDate || null, repeat: repeat || 'none' }, cryptoKey),
            ]);
            fieldData = { encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta };
        }

        const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'markdown'), {
            ...fieldData, type: type || 'markdown', parentId: newParentId,
            isPinned: isPinned || false, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        if (oldId) idMap[oldId] = docRef.id;
        count++;
    }
    return count;
};
