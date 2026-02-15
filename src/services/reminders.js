// src/services/reminders.js
import { collection, doc, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

export const listenToReminders = (uid, cryptoKey, callback) => {
    // FIXED: Removed orderBy('createdAt', 'desc') so Firestore doesn't filter out the encrypted docs!
    const q = query(collection(db, 'artifacts', appId, 'users', uid, 'reminders'));
    
    return onSnapshot(q, async (snapshot) => {
        const data = await Promise.all(snapshot.docs.map(async d => {
            const raw = d.data();
            const decrypted = await decryptData(raw, cryptoKey);
            return { id: d.id, ...raw, ...decrypted };
        }));
        callback(data);
    });
};

export const saveReminder = async (uid, cryptoKey, reminderData) => {
    const id = reminderData.id || doc(collection(db, 'artifacts', appId, 'users', uid, 'reminders')).id;
    
    const payload = { ...reminderData };
    delete payload.id;
    
    const now = new Date().toISOString();
    if (!reminderData.id) payload.createdAt = now;
    payload.updatedAt = now;

    const encrypted = await encryptData(payload, cryptoKey);
    
    // FIXED: Save the timestamps in plaintext alongside the encrypted blob just in case
    await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'reminders', id), {
        ...encrypted,
        updatedAt: now,
        createdAt: payload.createdAt || now
    });
    
    return id;
};

export const deleteReminder = async (uid, id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'reminders', id));
};

export const exportReminders = async (uid, cryptoKey) => {
    return new Promise((resolve) => {
        listenToReminders(uid, cryptoKey, (data) => resolve(data))();
    });
};

export const importReminders = async (uid, cryptoKey, jsonData) => {
    let count = 0;
    if (!Array.isArray(jsonData)) return count;
    for (const item of jsonData) {
        if (item.title) {
            await saveReminder(uid, cryptoKey, { ...item, id: null });
            count++;
        }
    }
    return count;
};