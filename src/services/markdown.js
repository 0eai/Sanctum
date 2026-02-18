// src/services/markdown.js
import {
    collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
    updateDoc, doc, deleteDoc, getDocs, writeBatch
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';
import { getNextDate } from '../lib/dateUtils';

// --- Listeners ---

export const listenToMarkdownDocs = (userId, cryptoKey, callback) => {
    const q = query(
        collection(db, 'artifacts', appId, 'users', userId, 'markdown'),
        orderBy('updatedAt', 'desc')
    );
    return onSnapshot(q, async (snapshot) => {
        const data = await Promise.all(snapshot.docs.map(async doc => {
            const raw = doc.data();
            const decrypted = await decryptData(raw, cryptoKey);
            return {
                id: doc.id,
                ...raw,
                ...decrypted,
                // Ensure arrays and fields exist
                tags: decrypted.tags || [],
                attachments: decrypted.attachments || [],
                dueDate: decrypted.dueDate || null,
                repeat: decrypted.repeat || 'none',
                type: raw.type || 'markdown',
                parentId: raw.parentId || null,
                updatedAt: raw.updatedAt?.toDate() || new Date()
            };
        }));
        callback(data);
    });
};

// --- CRUD Operations ---

export const saveMarkdownDoc = async (userId, cryptoKey, docData, parentId) => {
    // Encrypt all sensitive content including new fields
    const payload = {
        title: docData.title,
        content: docData.content,
        tags: docData.tags || [],
        attachments: docData.attachments || [],
        dueDate: docData.dueDate || null,
        repeat: docData.repeat || 'none'
    };

    const encrypted = await encryptData(payload, cryptoKey);

    const meta = {
        updatedAt: serverTimestamp(),
        isPinned: docData.isPinned || false,
        type: 'markdown',
        parentId: docData.parentId || parentId || null
    };

    if (docData.id) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'markdown', docData.id), { ...encrypted, ...meta });
        return docData.id;
    } else {
        const ref = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'markdown'), { ...encrypted, ...meta, createdAt: serverTimestamp() });
        return ref.id;
    }
};

export const rescheduleMarkdownDoc = async (userId, cryptoKey, docData) => {
    const nextDate = getNextDate(docData.dueDate, docData.repeat);
    const payload = { ...docData, dueDate: nextDate };
    // Remove metadata fields before re-encrypting content
    delete payload.id; delete payload.updatedAt; delete payload.createdAt; delete payload.type; delete payload.isPinned; delete payload.parentId; delete payload.oldId;

    const encrypted = await encryptData(payload, cryptoKey);
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'markdown', docData.id), {
        ...encrypted, updatedAt: serverTimestamp()
    });
};

export const createFolder = async (userId, cryptoKey, title, parentId) => {
    const encrypted = await encryptData({ title }, cryptoKey);
    await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'markdown'), {
        ...encrypted,
        type: 'folder',
        parentId: parentId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
};

export const updateFolder = async (userId, cryptoKey, folderId, title, parentId = undefined) => {
    const encrypted = await encryptData({ title }, cryptoKey);
    const update = { ...encrypted, updatedAt: serverTimestamp() };
    if (parentId !== undefined) update.parentId = parentId;
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'markdown', folderId), update);
};

export const deleteMarkdownItem = async (userId, item, allItems) => {
    if (item.type === 'folder') {
        // Recursive delete for folder contents
        const batch = writeBatch(db);
        const children = allItems.filter(i => i.parentId === item.id);
        children.forEach(c => batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'markdown', c.id)));
        batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'markdown', item.id));
        await batch.commit();
    } else {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'markdown', item.id));
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