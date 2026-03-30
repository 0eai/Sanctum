// src/hooks/usePresence.js
// Tracks which users have a shared document open and shows them as presence dots.
// Writes uid + timestamp to artifacts/{appId}/shared_docs/{shareId}/presence/{uid}.
// Cleans up on unmount. Stale records (> 5 min old) are filtered client-side.
//
// NOTE: Firestore rules must allow authenticated members to read/write
// artifacts/{appId}/shared_docs/{shareId}/presence/{uid}.
import { useState, useEffect } from 'react';
import {
    collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';

const STALE_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_MS = 2 * 60 * 1000; // 2 minutes

const usePresence = ({ shareId, uid, enabled = true }) => {
    const [presenceUsers, setPresenceUsers] = useState([]);

    useEffect(() => {
        if (!enabled || !shareId || !uid) return;

        const presenceRef = doc(db, 'artifacts', appId, 'shared_docs', shareId, 'presence', uid);

        const writePresence = () =>
            setDoc(presenceRef, { uid, openedAt: serverTimestamp() }, { merge: true }).catch(() => {});

        writePresence();
        const heartbeat = setInterval(writePresence, HEARTBEAT_MS);

        const collRef = collection(db, 'artifacts', appId, 'shared_docs', shareId, 'presence');
        const unsubscribe = onSnapshot(collRef, (snap) => {
            const now = Date.now();
            const users = snap.docs
                .map(d => ({ uid: d.id, openedAt: d.data().openedAt }))
                .filter(u => {
                    if (u.uid === uid) return false;
                    const ms = u.openedAt?.toMillis?.() ?? 0;
                    return now - ms < STALE_MS;
                });
            setPresenceUsers(users);
        }, () => {});

        return () => {
            clearInterval(heartbeat);
            unsubscribe();
            deleteDoc(presenceRef).catch(() => {});
        };
    }, [shareId, uid, enabled]);

    return presenceUsers;
};

export default usePresence;
