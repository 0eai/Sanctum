// src/services/yjsCollab.js
// Encrypted Y.js ↔ Firestore sync layer.
// Only activated for shared docs (isSharedDoc=true, collabShareId set).
import * as Y from 'yjs';
import {
    collection, doc, addDoc, onSnapshot, getDoc, setDoc,
    deleteDoc, getDocs, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';

const encryptUpdate = async (update, docKey) => {
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, docKey, update);
    const out = new Uint8Array(12 + enc.byteLength);
    out.set(iv);
    out.set(new Uint8Array(enc), 12);
    return btoa(String.fromCharCode(...out));
};

const decryptUpdate = async (b64, docKey) => {
    const raw   = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: raw.slice(0, 12) }, docKey, raw.slice(12));
    return new Uint8Array(plain);
};

export const createYjsProvider = (ydoc, shareId, docKey, uid) => {
    const updatesCol = collection(db, 'artifacts', appId,
        'shared_docs', shareId, 'crdt_updates');
    const stateRef = doc(db, 'artifacts', appId,
        'shared_docs', shareId, 'crdt_state', 'v1');
    let localCount = 0;
    let destroyed  = false;

    const compact = async () => {
        const enc = await encryptUpdate(Y.encodeStateAsUpdate(ydoc), docKey);
        await setDoc(stateRef, { enc, at: serverTimestamp(), updateCount: localCount });
        const all = await getDocs(updatesCol);
        await Promise.all(all.docs.map(d => deleteDoc(d.ref)));
        localCount = 0;
    };

    const init = async () => {
        // 1. Apply base snapshot if exists
        const stateSnap = await getDoc(stateRef);
        if (stateSnap.exists()) {
            Y.applyUpdate(ydoc, await decryptUpdate(stateSnap.data().enc, docKey), 'remote');
        }

        // 2. Apply pending updates in order
        const pending = await getDocs(query(updatesCol, orderBy('at')));
        for (const d of pending.docs) {
            Y.applyUpdate(ydoc, await decryptUpdate(d.data().enc, docKey), 'remote');
        }

        // 3. Subscribe to subsequent remote updates
        const unsub = onSnapshot(query(updatesCol, orderBy('at')), async snap => {
            for (const change of snap.docChanges()) {
                if (change.type !== 'added') continue;
                if (change.doc.data().uid === uid) continue; // skip own echoes
                Y.applyUpdate(ydoc,
                    await decryptUpdate(change.doc.data().enc, docKey), 'remote');
            }
        });

        // 4. Push local updates to Firestore
        ydoc.on('update', async (update, origin) => {
            if (destroyed || origin === 'remote') return;
            const enc = await encryptUpdate(update, docKey);
            await addDoc(updatesCol, { enc, uid, at: serverTimestamp() });
            if (++localCount >= 50) await compact();
        });

        return unsub;
    };

    return {
        init,
        destroy: () => { destroyed = true; },
    };
};
