// src/services/activityLog.js
import {
    collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';

/**
 * Log a user activity event to Firestore.
 * @param {string} uid - User's Firebase UID
 * @param {string} action - Description of the action (e.g., "Vault Unlocked")
 * @param {'success'|'danger'|'info'} type - Event type for color coding
 * @param {string} icon - Lucide icon name for display
 */
export const logActivity = async (uid, action, type = 'success', icon = 'CheckCircle') => {
    if (!uid) return;
    try {
        await addDoc(collection(db, 'artifacts', appId, 'users', uid, 'activity_log'), {
            action,
            type,
            icon,
            createdAt: serverTimestamp(),
        });
    } catch (e) {
        // Silent fail — activity logging should never block the user
        console.warn('Activity log failed:', e);
    }
};

/**
 * Listen to the most recent activity events for a user.
 * @param {string} uid - User's Firebase UID
 * @param {function} callback - Called with array of activity events
 * @param {number} maxItems - Max events to fetch (default 30)
 * @returns {function} Unsubscribe function
 */
export const listenToActivityLog = (uid, callback, maxItems = 30) => {
    if (!uid) return () => { };
    const q = query(
        collection(db, 'artifacts', appId, 'users', uid, 'activity_log'),
        orderBy('createdAt', 'desc'),
        limit(maxItems)
    );
    return onSnapshot(q, (snap) => {
        const events = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
        }));
        callback(events);
    });
};
