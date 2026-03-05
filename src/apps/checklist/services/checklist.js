import {
    collection, query, orderBy, onSnapshot, addDoc, getDocs, serverTimestamp,
    updateDoc, doc, increment, deleteDoc, writeBatch
} from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { encryptData, decryptData } from '../../../lib/crypto';
import { getNextDate } from '../../../lib/dateUtils';

// --- Workspace Context Helper ---
const getClCol = (userId, ctx) =>
    ctx?.workspaceId
        ? collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'checklists')
        : collection(db, 'artifacts', appId, 'users', userId, 'checklists');

const getClDoc = (userId, listId, ctx) =>
    ctx?.workspaceId
        ? doc(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'checklists', listId)
        : doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId);

const getItemsCol = (userId, listId, ctx) =>
    ctx?.workspaceId
        ? collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'checklists', listId, 'items')
        : collection(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items');

const getItemDoc = (userId, listId, itemId, ctx) =>
    ctx?.workspaceId
        ? doc(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'checklists', listId, 'items', itemId)
        : doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items', itemId);

const getKey = (cryptoKey, ctx) => ctx?.key || cryptoKey;

// --- Listeners ---

export const listenToChecklists = (userId, cryptoKey, callback, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const q = query(getClCol(userId, ctx), orderBy('createdAt', 'desc'));

    return onSnapshot(q, async (snap) => {
        const lists = await Promise.all(snap.docs.map(async (d) => {
            const raw = d.data();
            try {
                const decrypted = await decryptData(raw, key);
                return {
                    id: d.id,
                    ...raw,
                    ...(decrypted || {}),
                    dueDate: decrypted?.dueDate || null,
                    repeat: decrypted?.repeat || 'none'
                };
            } catch (error) {
                console.warn('Failed to decrypt checklist', d.id, error.message || error);
                return {
                    id: d.id,
                    title: 'Encrypted Checklist (Decryption Failed)',
                    dueDate: null,
                    repeat: 'none',
                    order: raw.order || 0
                };
            }
        }));

        lists.sort((a, b) => {
            const orderA = a.order ?? 0;
            const orderB = b.order ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
        });

        callback(lists);
    });
};

export const listenToItems = (userId, listId, cryptoKey, callback, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const q = query(getItemsCol(userId, listId, ctx), orderBy('createdAt', 'asc'));

    return onSnapshot(q, async (snap) => {
        const items = await Promise.all(snap.docs.map(async (d) => {
            const rawData = d.data();
            const decrypted = await decryptData(rawData, key);
            return {
                id: d.id,
                ...decrypted,
                dueDate: decrypted.dueDate || null,
                repeat: decrypted.repeat || 'none',
                isCompleted: rawData.isCompleted ?? decrypted.isCompleted ?? false,
                order: rawData.order ?? 0
            };
        }));

        items.sort((a, b) => {
            const orderA = a.order ?? 0;
            const orderB = b.order ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
        });

        callback(items);
    });
};

// --- Actions ---

export const createChecklist = async (userId, cryptoKey, { title, dueDate, repeat }, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const encryptedData = await encryptData({ title, dueDate, repeat }, key);
    const ref = await addDoc(getClCol(userId, ctx), {
        ...encryptedData,
        createdAt: serverTimestamp(),
        itemCount: 0,
        completedCount: 0,
        order: Date.now()
    });
    return ref.id;
};

export const updateChecklistEntity = async (userId, listId, itemId, cryptoKey, payload, isList, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const encrypted = await encryptData(payload, key);
    if (isList) {
        await updateDoc(getClDoc(userId, listId, ctx), encrypted);
    } else {
        await updateDoc(getItemDoc(userId, listId, itemId, ctx), encrypted);
    }
};

export const addChecklistItem = async (userId, listId, cryptoKey, { text, dueDate, repeat }, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const encryptedContent = await encryptData({ text, dueDate, repeat }, key);

    const batch = writeBatch(db);
    const itemRef = doc(getItemsCol(userId, listId, ctx));
    const listRef = getClDoc(userId, listId, ctx);

    batch.set(itemRef, {
        ...encryptedContent,
        isCompleted: false,
        createdAt: serverTimestamp(),
        order: Date.now()
    });
    batch.update(listRef, { itemCount: increment(1) });

    await batch.commit();
};

export const toggleChecklistItem = async (userId, listId, item, cryptoKey, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    if (!item.isCompleted && item.dueDate && item.repeat && item.repeat !== 'none') {
        const nextDate = getNextDate(item.dueDate, item.repeat);
        const payload = { ...item, dueDate: nextDate };
        delete payload.id; delete payload.isCompleted;

        const encrypted = await encryptData(payload, key);
        await updateDoc(getItemDoc(userId, listId, item.id, ctx), {
            ...encrypted, isCompleted: false
        });
    } else {
        const newStatus = !item.isCompleted;
        const batch = writeBatch(db);
        const itemRef = getItemDoc(userId, listId, item.id, ctx);
        const listRef = getClDoc(userId, listId, ctx);

        batch.update(itemRef, { isCompleted: newStatus });
        batch.update(listRef, { completedCount: increment(newStatus ? 1 : -1) });

        await batch.commit();
    }
};

export const resetChecklist = async (userId, listId, items, listMeta, cryptoKey, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const batch = writeBatch(db);

    items.forEach(item => {
        if (item.isCompleted) {
            const ref = getItemDoc(userId, listId, item.id, ctx);
            batch.update(ref, { isCompleted: false });
        }
    });

    const nextDate = getNextDate(listMeta.dueDate, listMeta.repeat);
    const payload = { ...listMeta, dueDate: nextDate };
    delete payload.id; delete payload.itemCount; delete payload.completedCount; delete payload.createdAt;

    const encrypted = await encryptData(payload, key);
    const listRef = getClDoc(userId, listId, ctx);

    batch.update(listRef, { ...encrypted, completedCount: 0 });
    await batch.commit();

    return nextDate;
};

export const deleteChecklistEntity = async (userId, listId, itemId, isCompleted, ctx = null) => {
    if (itemId) {
        const batch = writeBatch(db);
        const itemRef = getItemDoc(userId, listId, itemId, ctx);
        const listRef = getClDoc(userId, listId, ctx);

        batch.delete(itemRef);
        batch.update(listRef, {
            itemCount: increment(-1),
            completedCount: increment(isCompleted ? -1 : 0)
        });
        await batch.commit();
    } else {
        await deleteDoc(getClDoc(userId, listId, ctx));
    }
};

// --- Reordering ---

export const reorderList = async (userId, listId, direction, allLists, ctx = null) => {
    const index = allLists.findIndex(l => l.id === listId);
    if (index === -1) return;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= allLists.length) return;

    const batch = writeBatch(db);
    const itemA = allLists[index];
    const itemB = allLists[targetIndex];

    const needsInitialization = (itemA.order || 0) === (itemB.order || 0);

    if (needsInitialization) {
        const BASE_SPACING = 10000;
        allLists.forEach((item, idx) => {
            let newOrder = idx * BASE_SPACING;

            if (idx === index) newOrder = targetIndex * BASE_SPACING;
            else if (idx === targetIndex) newOrder = index * BASE_SPACING;

            if (item.order !== newOrder) {
                const ref = getClDoc(userId, item.id, ctx);
                batch.update(ref, { order: newOrder });
            }
        });
    } else {
        const refA = getClDoc(userId, itemA.id, ctx);
        const refB = getClDoc(userId, itemB.id, ctx);

        batch.update(refA, { order: itemB.order });
        batch.update(refB, { order: itemA.order });
    }

    await batch.commit();
};

export const reorderItem = async (userId, listId, itemId, direction, allItems, ctx = null) => {
    const index = allItems.findIndex(i => i.id === itemId);
    if (index === -1) return;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= allItems.length) return;

    const batch = writeBatch(db);
    const itemA = allItems[index];
    const itemB = allItems[targetIndex];

    const needsInitialization = (itemA.order || 0) === (itemB.order || 0);

    if (needsInitialization) {
        const BASE_SPACING = 10000;
        allItems.forEach((item, idx) => {
            let newOrder = idx * BASE_SPACING;

            if (idx === index) newOrder = targetIndex * BASE_SPACING;
            else if (idx === targetIndex) newOrder = index * BASE_SPACING;

            if (item.order !== newOrder) {
                const ref = getItemDoc(userId, listId, item.id, ctx);
                batch.update(ref, { order: newOrder });
            }
        });
    } else {
        const refA = getItemDoc(userId, listId, itemA.id, ctx);
        const refB = getItemDoc(userId, listId, itemB.id, ctx);

        batch.update(refA, { order: itemB.order });
        batch.update(refB, { order: itemA.order });
    }

    await batch.commit();
};

export const exportChecklists = async (userId, cryptoKey) => {
    const listsQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'checklists'));
    const listsSnapshot = await getDocs(listsQuery);

    const exportData = await Promise.all(listsSnapshot.docs.map(async (listDoc) => {
        const listRaw = listDoc.data();
        const listDecrypted = await decryptData(listRaw, cryptoKey);

        // Fetch items for this list
        const itemsQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'checklists', listDoc.id, 'items'));
        const itemsSnapshot = await getDocs(itemsQuery);

        const items = await Promise.all(itemsSnapshot.docs.map(async (itemDoc) => {
            const itemRaw = itemDoc.data();
            const itemDecrypted = await decryptData(itemRaw, cryptoKey);
            return {
                ...itemRaw,
                ...itemDecrypted,
                // Ensure dates are strings for JSON
                dueDate: itemRaw.dueDate || itemDecrypted.dueDate || null,
                createdAt: itemRaw.createdAt?.toDate?.()?.toISOString() || null
            };
        }));

        return {
            ...listRaw,
            ...listDecrypted,
            dueDate: listRaw.dueDate || listDecrypted.dueDate || null,
            items: items
        };
    }));

    return exportData;
};

// --- Sharing Helper ---
export const fetchChecklistItemsForShare = async (userId, listId, cryptoKey) => {
    const itemsQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items'));
    const itemsSnapshot = await getDocs(itemsQuery);
    return Promise.all(itemsSnapshot.docs.map(async (itemDoc) => {
        const raw = itemDoc.data();
        const decrypted = await decryptData(raw, cryptoKey);
        return { text: decrypted.text || '', completed: raw.isCompleted || false };
    }));
};

export const importChecklists = async (userId, cryptoKey, data) => {
    if (!Array.isArray(data)) throw new Error("Invalid format");

    let count = 0;
    for (const list of data) {
        // 1. Create the List
        const listId = await createChecklist(userId, cryptoKey, {
            title: list.title || "Untitled List",
            dueDate: list.dueDate,
            repeat: list.repeat
        });

        // 2. Add all items to this list
        if (list.items && Array.isArray(list.items)) {
            // We process items sequentially to maintain some order order, or Promise.all for speed
            await Promise.all(list.items.map(async (item) => {
                // We reuse addChecklistItem but need to support isCompleted override
                // If your addChecklistItem doesn't support isCompleted, we might need a direct DB call here
                // Assuming addChecklistItem allows passing extra props:
                await addChecklistItem(userId, listId, cryptoKey, {
                    text: item.text,
                    dueDate: item.dueDate,
                    repeat: item.repeat,
                    isCompleted: item.isCompleted || false
                });
            }));
        }
        count++;
    }
    return count;
};