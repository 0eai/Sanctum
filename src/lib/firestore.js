// src/lib/firestore.js — Shared Firestore utility helpers

import { writeBatch } from 'firebase/firestore';
import { db } from './firebase';

const CHUNK_SIZE = 500;

/**
 * Delete an array of Firestore DocumentReferences in batches of ≤500.
 * Firestore batches are capped at 500 operations; this helper handles chunking automatically.
 * @param {import('firebase/firestore').DocumentReference[]} docRefs
 */
export const deleteInChunks = async (docRefs) => {
    for (let i = 0; i < docRefs.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        docRefs.slice(i, i + CHUNK_SIZE).forEach(ref => batch.delete(ref));
        await batch.commit();
    }
};
