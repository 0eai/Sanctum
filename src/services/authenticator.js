import {
    collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
    updateDoc, doc, deleteDoc, getDocs
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

export const listenToAuthenticators = (userId, cryptoKey, callback) => {
    const q = query(
        collection(db, 'artifacts', appId, 'users', userId, 'authenticator'),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, async (snapshot) => {
        const data = await Promise.all(snapshot.docs.map(async d => {
            const decrypted = await decryptData(d.data(), cryptoKey);
            return { id: d.id, ...decrypted };
        }));
        callback(data);
    });
};

export const saveAuthenticator = async (userId, cryptoKey, authData) => {
    const payload = { ...authData };
    const id = payload.id;
    delete payload.id;

    const encrypted = await encryptData(payload, cryptoKey);

    if (id) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'authenticator', id), encrypted);
    } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'authenticator'), {
            ...encrypted,
            createdAt: serverTimestamp()
        });
    }
};

export const deleteAuthenticator = async (userId, id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'authenticator', id));
};

export const exportAuthenticators = async (userId, cryptoKey) => {
    const q = query(collection(db, 'artifacts', appId, 'users', userId, 'authenticator'));
    const snapshot = await getDocs(q);
    return await Promise.all(snapshot.docs.map(async d => {
        const data = await decryptData(d.data(), cryptoKey);
        return { id: d.id, ...data };
    }));
};

export const importAuthenticators = async (userId, cryptoKey, authenticators) => {
    let count = 0;
    for (const item of authenticators) {
        const { id, ...payload } = item;
        const encrypted = await encryptData(payload, cryptoKey);
        await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'authenticator'), {
            ...encrypted,
            createdAt: serverTimestamp()
        });
        count++;
    }
    return count;
};
