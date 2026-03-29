// src/services/createEncryptedCRUD.js
//
// Generic factory for encrypted Firestore CRUD operations.
// Eliminates boilerplate across 13+ service files that repeat the same
// listen → decrypt → callback, encrypt → save, delete, export, import pattern.
//
// Usage:
//   const crud = createEncryptedCRUD('reminders');
//   // Returns: { getCol, getDocRef, listen, save, remove, exportAll, importAll }
//
// With workspace support:
//   const crud = createEncryptedCRUD('notes', { workspaceAware: true });
//
// With custom decryption transform:
//   const crud = createEncryptedCRUD('tasks', {
//     transformDecrypted: (raw, decrypted, docId) => ({
//       ...decrypted, order: raw.order || 0
//     })
//   });

import {
    collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
    updateDoc, doc, deleteDoc, getDocs, setDoc
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

/**
 * @param {string} collectionName - Firestore sub-collection name (e.g. 'reminders', 'banking')
 * @param {object} [options]
 * @param {boolean} [options.workspaceAware=false] - Support workspace context routing
 * @param {string}  [options.orderByField='createdAt'] - Default ordering field
 * @param {string}  [options.orderDir='desc'] - Default ordering direction
 * @param {Function} [options.transformDecrypted] - (raw, decrypted, docId) => mergedItem
 * @param {Function} [options.validateImport] - (item) => boolean — skip items that don't pass
 * @param {Function} [options.cleanExport] - (raw, decrypted) => exportItem
 */
export default function createEncryptedCRUD(collectionName, options = {}) {
    const {
        workspaceAware = false,
        orderByField = 'createdAt',
        orderDir = 'desc',
        transformDecrypted = null,
        validateImport = null,
        cleanExport = null
    } = options;

    // --- Path helpers ---

    /** Get the Firestore collection ref, respecting workspace context */
    const getCol = (userId, ctx = null) => {
        if (workspaceAware && ctx?.workspaceId) {
            return collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, collectionName);
        }
        return collection(db, 'artifacts', appId, 'users', userId, collectionName);
    };

    /** Get a single document ref */
    const getDocRef = (userId, docId, ctx = null) => {
        if (workspaceAware && ctx?.workspaceId) {
            return doc(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, collectionName, docId);
        }
        return doc(db, 'artifacts', appId, 'users', userId, collectionName, docId);
    };

    /** Resolve the correct encryption key */
    const getKey = (cryptoKey, ctx = null) => {
        if (workspaceAware && ctx?.key) return ctx.key;
        return cryptoKey;
    };

    // --- Core operations ---

    /**
     * Listen to the collection with real-time decryption.
     * @param {string} userId
     * @param {CryptoKey} cryptoKey
     * @param {Function} callback - receives decrypted items array
     * @param {object} [ctx] - workspace context { workspaceId, key }
     * @param {object} [queryOptions] - { orderByField, orderDir } overrides
     * @returns {Function} unsubscribe
     */
    const listen = (userId, cryptoKey, callback, ctx = null, queryOptions = {}) => {
        const key = getKey(cryptoKey, ctx);
        const field = queryOptions.orderByField || orderByField;
        const dir = queryOptions.orderDir || orderDir;
        const q = query(getCol(userId, ctx), orderBy(field, dir));

        return onSnapshot(q, async (snapshot) => {
            // Bound parallel decryption to avoid saturating the WebCrypto thread pool
            const BATCH = 20;
            const docs = snapshot.docs;
            const results = [];
            for (let i = 0; i < docs.length; i += BATCH) {
                const chunk = await Promise.all(docs.slice(i, i + BATCH).map(async (d) => {
                    const raw = d.data();
                    try {
                        const decrypted = await decryptData(raw, key);
                        if (transformDecrypted) {
                            return { id: d.id, ...transformDecrypted(raw, decrypted, d.id) };
                        }
                        return { id: d.id, ...raw, ...decrypted };
                    } catch (error) {
                        console.warn(`[${collectionName}] Decrypt failed for ${d.id}:`, error.message);
                        return { id: d.id, _decryptError: true };
                    }
                }));
                results.push(...chunk);
            }
            const failures = results.filter(d => d._decryptError).length;
            // Second arg lets UI surfaces surface a "N items could not be decrypted" notice
            callback(results.filter(d => !d._decryptError), { decryptFailures: failures });
        });
    };

    /**
     * Save (create or update) an item.
     * @param {string} userId
     * @param {CryptoKey} cryptoKey
     * @param {object} itemData - data to encrypt. If itemData.id exists, updates; else creates.
     * @param {object} [ctx] - workspace context
     * @param {object} [meta] - extra unencrypted fields to merge (e.g. { type: 'folder', parentId })
     * @returns {string} document ID
     */
    const save = async (userId, cryptoKey, itemData, ctx = null, meta = {}) => {
        const key = getKey(cryptoKey, ctx);

        // Separate id from payload
        const { id, ...payload } = itemData;
        const encrypted = await encryptData(payload, key);

        if (id) {
            await updateDoc(getDocRef(userId, id, ctx), {
                ...encrypted, ...meta, updatedAt: serverTimestamp()
            });
            return id;
        } else {
            const ref = await addDoc(getCol(userId, ctx), {
                ...encrypted, ...meta, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            });
            return ref.id;
        }
    };

    /**
     * Delete a single document.
     */
    const remove = async (userId, docId, ctx = null) => {
        await deleteDoc(getDocRef(userId, docId, ctx));
    };

    /**
     * Export all items (one-shot read + decrypt).
     */
    const exportAll = async (userId, cryptoKey, ctx = null) => {
        const key = getKey(cryptoKey, ctx);
        const q = query(getCol(userId, ctx));
        const snapshot = await getDocs(q);

        return Promise.all(snapshot.docs.map(async (d) => {
            const raw = d.data();
            const decrypted = await decryptData(raw, key);

            if (cleanExport) return cleanExport(raw, decrypted, d.id);

            return {
                ...decrypted,
                createdAt: raw.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: raw.updatedAt?.toDate?.()?.toISOString() || null
            };
        }));
    };

    /**
     * Import an array of items (encrypt + save each).
     * @param {Function} [itemPreparer] - (item) => cleaned item for encryption. Defaults to stripping id/timestamps.
     */
    const importAll = async (userId, cryptoKey, data, ctx = null, itemPreparer = null) => {
        if (!Array.isArray(data)) throw new Error(`Invalid import format for ${collectionName}`);
        let count = 0;
        for (const item of data) {
            if (validateImport && !validateImport(item)) continue;

            let cleanItem;
            if (itemPreparer) {
                cleanItem = itemPreparer(item);
            } else {
                const { id, createdAt, updatedAt, ...rest } = item;
                cleanItem = rest;
            }

            await save(userId, cryptoKey, cleanItem, ctx);
            count++;
        }
        return count;
    };

    return { getCol, getDocRef, getKey, listen, save, remove, exportAll, importAll };
}
