import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { decryptData } from '../lib/crypto';

/**
 * Generic hook to listen to a user's encrypted Firestore collection.
 * Reduces the boilerplate of setting up onSnapshot, querying, and decrypting items
 * across multiple domain services.
 *
 * @param {string} userId - The Firebase user ID
 * @param {CryptoKey} cryptoKey - The AES-GCM master key
 * @param {string} collectionName - E.g. "notes", "contacts", "tasks"
 * @param {Function} transformer - Optional function to map/transform the decrypted payload
 * @returns {Array|null} Array of decrypted items or null if loading
 */
export const useEncryptedCollection = (userId, cryptoKey, collectionName, transformer = null) => {
    const [data, setData] = useState(null);

    useEffect(() => {
        if (!userId || !cryptoKey || !collectionName) {
            setData(null);
            return;
        }

        const q = query(
            collection(db, 'artifacts', appId, 'users', userId, collectionName),
            orderBy('updatedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const items = await Promise.all(snapshot.docs.map(async doc => {
                const raw = doc.data();
                let decrypted = {};
                try {
                    decrypted = await decryptData(raw, cryptoKey);
                } catch (e) {
                    console.error(`Failed to decrypt item ${doc.id} in ${collectionName}`, e);
                }

                const merged = {
                    id: doc.id,
                    ...raw,
                    ...decrypted,
                    updatedAt: raw.updatedAt?.toDate() || new Date(),
                    createdAt: raw.createdAt?.toDate() || new Date()
                };

                return transformer ? transformer(merged) : merged;
            }));
            setData(items);
        });

        return () => unsubscribe();
    }, [userId, cryptoKey, collectionName, transformer]);

    return data;
};
