// src/services/markdown.js
import {
    collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
    updateDoc, doc, deleteDoc, getDocs, writeBatch
} from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { encryptData, decryptData } from '../../../lib/crypto';
import { getNextDate } from '../../../lib/dateUtils';
import { deleteFirebaseFile } from '../../../services/firebaseStorage';

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

// --- Listeners ---

export const listenToMarkdownDocs = (userId, cryptoKey, callback, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const q = query(
        getMdCol(userId, ctx),
        orderBy('updatedAt', 'desc')
    );
    return onSnapshot(q, async (snapshot) => {
        const data = await Promise.all(snapshot.docs.map(async doc => {
            const raw = doc.data();
            try {
                const decrypted = await decryptData(raw, key);
                return {
                    id: doc.id,
                    ...raw,
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
                console.warn('Failed to decrypt markdown doc', doc.id, error.message || error);
                return {
                    id: doc.id,
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

// --- CRUD Operations ---

export const saveMarkdownDoc = async (userId, cryptoKey, docData, parentId, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const payload = {
        title: docData.title,
        content: docData.content,
        tags: docData.tags || [],
        attachments: docData.attachments || [],
        dueDate: docData.dueDate || null,
        repeat: docData.repeat || 'none',
        sharedId: docData.sharedId || null,
        shareUrlKey: docData.shareUrlKey || null
    };

    const encrypted = await encryptData(payload, key);

    const meta = {
        updatedAt: serverTimestamp(),
        isPinned: docData.isPinned || false,
        type: 'markdown',
        parentId: docData.parentId || parentId || null
    };

    if (docData.id) {
        await updateDoc(getMdDoc(userId, docData.id, ctx), { ...encrypted, ...meta });
        return docData.id;
    } else {
        const ref = await addDoc(getMdCol(userId, ctx), { ...encrypted, ...meta, createdAt: serverTimestamp() });
        return ref.id;
    }
};

export const rescheduleMarkdownDoc = async (userId, cryptoKey, docData, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const nextDate = getNextDate(docData.dueDate, docData.repeat);
    const payload = { ...docData, dueDate: nextDate };
    delete payload.id; delete payload.updatedAt; delete payload.createdAt; delete payload.type; delete payload.isPinned; delete payload.parentId; delete payload.oldId;

    const encrypted = await encryptData(payload, key);
    await updateDoc(getMdDoc(userId, docData.id, ctx), {
        ...encrypted, updatedAt: serverTimestamp()
    });
};

export const createFolder = async (userId, cryptoKey, title, parentId, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const encrypted = await encryptData({ title }, key);
    await addDoc(getMdCol(userId, ctx), {
        ...encrypted,
        type: 'folder',
        parentId: parentId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
};

export const updateFolder = async (userId, cryptoKey, folderId, title, parentId = undefined, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const encrypted = await encryptData({ title }, key);
    const update = { ...encrypted, updatedAt: serverTimestamp() };
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

    return Promise.all(snapshot.docs.map(async (doc) => {
        const raw = doc.data();
        const decrypted = await decryptData(raw, cryptoKey);
        return {
            ...raw,
            ...decrypted,
            oldId: doc.id, // Persist ID for hierarchy reconstruction
            createdAt: raw.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: raw.updatedAt?.toDate?.()?.toISOString() || null
        };
    }));
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
        const payload = type === 'folder' ? { title } : { title, content, tags, attachments, dueDate, repeat };
        const encrypted = await encryptData(payload, cryptoKey);
        const newParentId = parentId && idMap[parentId] ? idMap[parentId] : null;
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'markdown'), {
            ...encrypted, type: type || 'markdown', parentId: newParentId, isPinned: isPinned || false, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        if (oldId) idMap[oldId] = docRef.id;
        count++;
    }
    return count;
};