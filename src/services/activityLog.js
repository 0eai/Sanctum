// src/services/activityLog.js
import {
    collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

/**
 * Log a user activity event to Firestore.
 * Encrypts the payload when a cryptoKey is provided; falls back to plaintext otherwise.
 * @param {string} uid - User's Firebase UID
 * @param {string} action - Description of the action (e.g., "Vault Unlocked")
 * @param {'success'|'danger'|'info'} type - Event type for color coding
 * @param {string} icon - Lucide icon name for display
 * @param {CryptoKey|null} cryptoKey - Master key for encryption (optional)
 */
export const logActivity = async (uid, action, type = 'success', icon = 'CheckCircle', cryptoKey = null) => {
    if (!uid) return;
    try {
        const payload = { action, type, icon };
        const stored = cryptoKey
            ? { ...(await encryptData(payload, cryptoKey)), createdAt: serverTimestamp() }
            : { action, type, icon, createdAt: serverTimestamp() };
        await addDoc(collection(db, 'artifacts', appId, 'users', uid, 'activity_log'), stored);
    } catch (e) {
        // Silent fail — activity logging should never block the user
        console.warn('Activity log failed:', e);
    }
};

/**
 * Listen to the most recent activity events for a user.
 * Decrypts entries when a cryptoKey is provided; handles mixed plaintext/encrypted logs.
 * @param {string} uid - User's Firebase UID
 * @param {function} callback - Called with array of activity events
 * @param {number} maxItems - Max events to fetch (default 30)
 * @param {CryptoKey|null} cryptoKey - Master key for decryption (optional)
 * @returns {function} Unsubscribe function
 */
export const listenToActivityLog = (uid, callback, maxItems = 30, cryptoKey = null) => {
    if (!uid) return () => { };
    const q = query(
        collection(db, 'artifacts', appId, 'users', uid, 'activity_log'),
        orderBy('createdAt', 'desc'),
        limit(maxItems)
    );
    return onSnapshot(q, async (snap) => {
        const events = [];
        for (const d of snap.docs) {
            const raw = d.data();
            // Encrypted entries have { iv, data, createdAt }; plaintext have { action, type, icon, createdAt }
            if (cryptoKey && raw.iv && raw.data) {
                try {
                    const decrypted = await decryptData(raw, cryptoKey);
                    if (decrypted) {
                        events.push({ id: d.id, ...decrypted, createdAt: raw.createdAt });
                        continue;
                    }
                } catch (_) { /* fall through to raw */ }
            }
            events.push({ id: d.id, ...raw });
        }
        callback(events);
    });
};
