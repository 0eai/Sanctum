import {
    collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, onSnapshot, query,
    orderBy, serverTimestamp, where, writeBatch, updateDoc, increment
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import {
    generateRSAKeyPair,
    exportRSAPublicKey,
    exportRSAPrivateKey,
    importRSAPublicKey,
    importRSAPrivateKey,
    encryptData,
    decryptData,
    encryptRSA,
    decryptRSA
} from '../lib/crypto';

// =============================================
// 1:1 CHAT HELPERS
// =============================================

export const getChatId = (uid1, uid2) => {
    return [uid1, uid2].sort().join('_');
};

// =============================================
// IDENTITY & KEY MANAGEMENT
// =============================================

export const initRSAKeys = async (user, cryptoKey) => {
    if (!user || !cryptoKey) return;

    const uid = user.uid;
    const pubKeyRef = doc(db, 'artifacts', appId, 'public_keys', uid);
    const privKeyRef = doc(db, 'artifacts', appId, 'users', uid, 'secureshare', 'private_key');

    const pubKeySnap = await getDoc(pubKeyRef);
    const privKeySnap = await getDoc(privKeyRef);

    if (pubKeySnap.exists() && privKeySnap.exists()) {
        return; // Already initialized
    }

    const keyPair = await generateRSAKeyPair();
    const pubBase64 = await exportRSAPublicKey(keyPair.publicKey);
    const privBase64 = await exportRSAPrivateKey(keyPair.privateKey);

    // Write private key first — if this fails, we don't want a dangling public key
    const encryptedPrivKey = await encryptData({ key: privBase64 }, cryptoKey);
    await setDoc(privKeyRef, encryptedPrivKey);

    // Only publish the public key after private key is safely stored
    await setDoc(pubKeyRef, {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'Unknown User',
        publicKey: pubBase64,
        updatedAt: serverTimestamp()
    });
};

export const getMyPrivateKey = async (uid, cryptoKey) => {
    const privKeyRef = doc(db, 'artifacts', appId, 'users', uid, 'secureshare', 'private_key');
    const snap = await getDoc(privKeyRef);
    if (!snap.exists()) return null;

    const decrypted = await decryptData(snap.data(), cryptoKey);
    if (!decrypted || !decrypted.key) return null;

    return await importRSAPrivateKey(decrypted.key);
};

export const getRecipientPublicKey = async (recipientUid) => {
    const pubKeyRef = doc(db, 'artifacts', appId, 'public_keys', recipientUid);
    const snap = await getDoc(pubKeyRef);
    if (!snap.exists() || !snap.data().publicKey) return null;

    return await importRSAPublicKey(snap.data().publicKey);
};

export const listenToContacts = (currentUid, callback) => {
    const q = query(collection(db, 'artifacts', appId, 'public_keys'));
    return onSnapshot(q, (snapshot) => {
        const contacts = [];
        snapshot.forEach(doc => {
            if (doc.id !== currentUid) {
                contacts.push({ id: doc.id, ...doc.data() });
            }
        });
        contacts.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        callback(contacts);
    });
};

/**
 * Delete expired self-destruct messages from a chat or group to free DB space.
 * Called client-side as a best-effort cleanup.
 */
export const deleteExpiredMessages = async (collectionPath) => {
    try {
        const q = query(
            collection(db, ...collectionPath),
            orderBy('expiresAt', 'asc')
        );
        const snap = await getDocs(q);
        const now = new Date();
        const batch = writeBatch(db);
        let count = 0;
        for (const d of snap.docs) {
            const data = d.data();
            if (data.expiresAt && data.expiresAt.toDate() < now) {
                batch.delete(d.ref);
                count++;
            }
        }
        if (count > 0) await batch.commit();
    } catch (e) {
        // Silent fail — cleanup is best-effort
    }
};

// =============================================
// 1:1 MESSAGING
// =============================================

export const listenToMessages = (chatId, currentUid, privateKey, cryptoKey, callback) => {
    if (!chatId || !privateKey || !cryptoKey) return () => { };

    const q = query(
        collection(db, 'artifacts', appId, 'chats', chatId, 'messages'),
        orderBy('createdAt', 'asc')
    );

    return onSnapshot(q, async (snapshot) => {
        const messages = [];
        const unreadIds = [];
        for (const d of snapshot.docs) {
            const raw = d.data();

            if (raw.expiresAt && new Date() > raw.expiresAt.toDate()) {
                // Delete expired message to save DB space
                deleteDoc(doc(db, 'artifacts', appId, 'chats', chatId, 'messages', d.id)).catch(() => { });
                continue;
            }

            let text = "Decryption failed";
            let isDecrypted = false;
            let artifact = null;

            try {
                const encryptedSessionKeyBase64 = raw.keys?.[currentUid];
                if (encryptedSessionKeyBase64) {
                    const sessionKeyJsonText = await decryptRSA(encryptedSessionKeyBase64, privateKey);
                    if (sessionKeyJsonText) {
                        const sessionKey = await crypto.subtle.importKey(
                            "raw",
                            new Uint8Array(JSON.parse(sessionKeyJsonText)).buffer,
                            { name: "AES-GCM", length: 256 },
                            false,
                            ["decrypt"]
                        );
                        const decryptedMsg = await decryptData(raw.encryptedPayload, sessionKey);
                        if (decryptedMsg) {
                            text = decryptedMsg.text || '';
                            artifact = decryptedMsg.artifact || null;
                            isDecrypted = true;
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to decrypt message", e);
            }

            // Track unread messages from others
            if (raw.senderId !== currentUid && !raw.readBy?.[currentUid]) {
                unreadIds.push(d.id);
            }

            messages.push({
                id: d.id,
                senderId: raw.senderId,
                createdAt: raw.createdAt,
                expiresAt: raw.expiresAt || null,
                readBy: raw.readBy || {},
                text,
                artifact,
                isDecrypted,
                type: raw.type || 'text'
            });
        }

        callback(messages);
    });
};

export const sendMessage = async (chatId, senderUid, recipientUid, myPublicKey, recipientPublicKey, text, expireMinutes = null, artifact = null) => {
    const sessionKey = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const payload = { text };
    if (artifact) payload.artifact = artifact;

    const encryptedPayload = await encryptData(payload, sessionKey);

    const exportedSessionKey = await window.crypto.subtle.exportKey("raw", sessionKey);
    const sessionKeyArray = Array.from(new Uint8Array(exportedSessionKey));
    const sessionKeyJson = JSON.stringify(sessionKeyArray);

    const keys = {};
    keys[recipientUid] = await encryptRSA(sessionKeyJson, recipientPublicKey);
    keys[senderUid] = await encryptRSA(sessionKeyJson, myPublicKey);

    const messageDoc = {
        senderId: senderUid,
        keys: keys,
        encryptedPayload: encryptedPayload,
        createdAt: serverTimestamp(),
        type: artifact ? 'shared_artifact' : 'text',
    };

    if (expireMinutes) {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + expireMinutes);
        messageDoc.expiresAt = expiresAt;
    }

    await addDoc(collection(db, 'artifacts', appId, 'chats', chatId, 'messages'), messageDoc);
};

/**
 * Listen to unread message count for a specific DM chat.
 * Counts messages from others where readBy[currentUid] doesn't exist.
 */
export const listenToChatUnreadCount = (collectionPath, currentUid, callback) => {
    if (!currentUid) return () => { };
    const q = query(
        collection(db, ...collectionPath),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
        let count = 0;
        for (const d of snap.docs) {
            const raw = d.data();
            if (raw.expiresAt && new Date() > raw.expiresAt.toDate()) continue;
            if (raw.senderId !== currentUid && !raw.readBy?.[currentUid]) {
                count++;
            }
        }
        callback(count);
    });
};

/**
 * Mark all unread messages as read in a chat/group.
 * Called when user opens a chat.
 */
export const markChatMessagesAsRead = async (collectionPath, currentUid) => {
    if (!currentUid) return;
    try {
        const q = query(collection(db, ...collectionPath), orderBy('createdAt', 'asc'));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        let count = 0;
        for (const d of snap.docs) {
            const raw = d.data();
            if (raw.senderId !== currentUid && !raw.readBy?.[currentUid]) {
                batch.update(d.ref, {
                    [`readBy.${currentUid}`]: new Date().toISOString()
                });
                count++;
            }
        }
        if (count > 0) await batch.commit();
    } catch (e) {
        // Silent fail
    }
};

// =============================================
// GROUP CHAT
// =============================================

/**
 * Generate a random AES-256-GCM key, encrypt it for each member via RSA,
 * and store the group document in Firestore.
 */
export const createGroup = async (name, memberUids, creatorUid) => {
    // Generate Group AES Key
    const groupKey = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const exportedKey = await window.crypto.subtle.exportKey("raw", groupKey);
    const keyArray = Array.from(new Uint8Array(exportedKey));
    const keyJson = JSON.stringify(keyArray);

    // Create the group doc
    const groupRef = await addDoc(collection(db, 'artifacts', appId, 'groups'), {
        name,
        createdBy: creatorUid,
        createdAt: serverTimestamp(),
        memberUids: memberUids, // quick lookup
    });

    // Encrypt group key for each member
    for (const uid of memberUids) {
        const pubKey = await getRecipientPublicKey(uid);
        if (!pubKey) continue;
        const encryptedGroupKey = await encryptRSA(keyJson, pubKey);
        await setDoc(doc(db, 'artifacts', appId, 'groups', groupRef.id, 'group_members', uid), {
            uid,
            encryptedGroupKey,
            joinedAt: serverTimestamp()
        });
    }

    return groupRef.id;
};

/**
 * Listen to all groups where the current user is a member.
 */
export const listenToGroups = (currentUid, callback) => {
    const q = query(
        collection(db, 'artifacts', appId, 'groups'),
        where('memberUids', 'array-contains', currentUid)
    );
    return onSnapshot(q, (snapshot) => {
        const groups = [];
        snapshot.forEach(d => {
            groups.push({ id: d.id, ...d.data(), isGroup: true });
        });
        groups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        callback(groups);
    });
};

/**
 * Decrypt the group AES key for the current user.
 */
export const getGroupKey = async (groupId, currentUid, privateKey) => {
    const memberRef = doc(db, 'artifacts', appId, 'groups', groupId, 'group_members', currentUid);
    const snap = await getDoc(memberRef);
    if (!snap.exists()) return null;

    const { encryptedGroupKey } = snap.data();
    const keyJson = await decryptRSA(encryptedGroupKey, privateKey);
    if (!keyJson) return null;

    return await crypto.subtle.importKey(
        "raw",
        new Uint8Array(JSON.parse(keyJson)).buffer,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};

/**
 * Send a message encrypted with the group's shared AES key.
 */
export const sendGroupMessage = async (groupId, senderUid, groupKey, text, expireMinutes = null, artifact = null) => {
    const payload = { text };
    if (artifact) payload.artifact = artifact;

    const encryptedPayload = await encryptData(payload, groupKey);

    const messageDoc = {
        senderId: senderUid,
        encryptedPayload,
        createdAt: serverTimestamp(),
        type: artifact ? 'shared_artifact' : 'text',
    };

    if (expireMinutes) {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + expireMinutes);
        messageDoc.expiresAt = expiresAt;
    }

    await addDoc(collection(db, 'artifacts', appId, 'groups', groupId, 'messages'), messageDoc);
};

/**
 * Listen to group messages, decrypting with the shared group key.
 */
export const listenToGroupMessages = (groupId, groupKey, currentUid, callback) => {
    if (!groupId || !groupKey) return () => { };

    const q = query(
        collection(db, 'artifacts', appId, 'groups', groupId, 'messages'),
        orderBy('createdAt', 'asc')
    );

    return onSnapshot(q, async (snapshot) => {
        const messages = [];
        const unreadIds = [];
        for (const d of snapshot.docs) {
            const raw = d.data();

            if (raw.expiresAt && new Date() > raw.expiresAt.toDate()) {
                // Delete expired message to save DB space
                deleteDoc(doc(db, 'artifacts', appId, 'groups', groupId, 'messages', d.id)).catch(() => { });
                continue;
            }

            let text = "Decryption failed";
            let isDecrypted = false;
            let artifact = null;

            try {
                const decryptedMsg = await decryptData(raw.encryptedPayload, groupKey);
                if (decryptedMsg) {
                    text = decryptedMsg.text || '';
                    artifact = decryptedMsg.artifact || null;
                    isDecrypted = true;
                }
            } catch (e) {
                console.warn("Failed to decrypt group message", e);
            }

            // Track unread messages from others
            if (currentUid && raw.senderId !== currentUid && !raw.readBy?.[currentUid]) {
                unreadIds.push(d.id);
            }

            messages.push({
                id: d.id,
                senderId: raw.senderId,
                createdAt: raw.createdAt,
                expiresAt: raw.expiresAt || null,
                readBy: raw.readBy || {},
                text,
                artifact,
                isDecrypted,
                type: raw.type || 'text'
            });
        }

        callback(messages);
    });
};

/**
 * Add a new member: encrypt current group key with their RSA public key.
 */
export const addGroupMember = async (groupId, newUid, groupKey) => {
    const pubKey = await getRecipientPublicKey(newUid);
    if (!pubKey) throw new Error("Could not find user's public key");

    const exportedKey = await window.crypto.subtle.exportKey("raw", groupKey);
    const keyArray = Array.from(new Uint8Array(exportedKey));
    const keyJson = JSON.stringify(keyArray);
    const encryptedGroupKey = await encryptRSA(keyJson, pubKey);

    await setDoc(doc(db, 'artifacts', appId, 'groups', groupId, 'group_members', newUid), {
        uid: newUid,
        encryptedGroupKey,
        joinedAt: serverTimestamp()
    });

    // Update the memberUids array on the group doc
    const groupRef = doc(db, 'artifacts', appId, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
        const existing = groupSnap.data().memberUids || [];
        if (!existing.includes(newUid)) {
            await setDoc(groupRef, { memberUids: [...existing, newUid] }, { merge: true });
        }
    }
};

/**
 * Remove a member from the group and rotate the group key.
 * After removal, a new AES key is generated and re-encrypted for all remaining members.
 * This ensures the removed member cannot decrypt future messages.
 */
export const removeGroupMember = async (groupId, uid) => {
    // 1. Remove the member's encrypted key doc
    await deleteDoc(doc(db, 'artifacts', appId, 'groups', groupId, 'group_members', uid));

    // 2. Update memberUids array on the group doc
    const groupRef = doc(db, 'artifacts', appId, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    if (!groupSnap.exists()) return;

    const existing = groupSnap.data().memberUids || [];
    const remainingUids = existing.filter(u => u !== uid);
    await setDoc(groupRef, { memberUids: remainingUids }, { merge: true });

    // 3. Rotate group key — generate new AES key for remaining members
    if (remainingUids.length === 0) return;

    const newGroupKey = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const exportedKey = await window.crypto.subtle.exportKey("raw", newGroupKey);
    const keyArray = Array.from(new Uint8Array(exportedKey));
    const keyJson = JSON.stringify(keyArray);

    // Re-encrypt the new key for each remaining member
    for (const memberUid of remainingUids) {
        try {
            const pubKey = await getRecipientPublicKey(memberUid);
            if (!pubKey) continue;
            const encryptedGroupKey = await encryptRSA(keyJson, pubKey);
            await setDoc(doc(db, 'artifacts', appId, 'groups', groupId, 'group_members', memberUid), {
                uid: memberUid,
                encryptedGroupKey,
                rotatedAt: serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.warn(`Key rotation failed for member ${memberUid}:`, e);
        }
    }
};

/**
 * Get the members of a group.
 */
export const getGroupMembers = async (groupId) => {
    const snap = await getDocs(collection(db, 'artifacts', appId, 'groups', groupId, 'group_members'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// =============================================
// ARTIFACT IMPORT
// =============================================

/**
 * Build the correct plaintext metadata that each app expects alongside
 * the encrypted blob. Without this, imported items won't appear in the
 * target app because listeners filter on / require these fields.
 */
const getAppMetadata = (appType, data) => {
    switch (appType) {
        case 'notes':
            return {
                type: 'note',
                isPinned: false,
                parentId: null,
            };
        case 'markdown':
            return {
                type: 'markdown',
                isPinned: false,
                parentId: null,
            };
        case 'tasks':
            return {
                order: Date.now(),
            };
        case 'bookmarks':
            return {
                type: 'bookmark',
                parentId: null,
            };
        case 'passwords':
            // passwords.js stores type inside encrypted payload, no plaintext meta needed
            return {};
        case 'banking':
            // banking.js stores type inside encrypted payload, no plaintext meta needed
            return {};
        case 'checklists':
            // checklists use subcollections for items — we store the list header only
            return {
                itemCount: 0,
                completedCount: 0,
                order: Date.now(),
            };
        case 'reminders':
            // reminders store timestamps as ISO strings inside encrypted payload
            return {
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            };
        case 'contacts':
            // contacts store timestamps as ISO strings, not serverTimestamp
            return {
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            };
        default:
            return {};
    }
};

/**
 * Build the correct encrypted payload for each app.
 * Some apps store metadata inside the encrypted blob (e.g. passwords with `type`),
 * others only encrypt content fields.
 */
const buildEncryptedPayload = (appType, cleanData) => {
    switch (appType) {
        case 'notes':
            return {
                title: cleanData.title || '',
                content: cleanData.content || '',
                tags: cleanData.tags || [],
                attachments: cleanData.attachments || [],
                dueDate: cleanData.dueDate || null,
                repeat: cleanData.repeat || 'none',
                importedAt: new Date().toISOString(),
            };
        case 'markdown':
            return {
                title: cleanData.title || '',
                content: cleanData.content || '',
                tags: cleanData.tags || [],
                attachments: cleanData.attachments || [],
                dueDate: cleanData.dueDate || null,
                repeat: cleanData.repeat || 'none',
                importedAt: new Date().toISOString(),
            };
        case 'tasks':
            return {
                title: cleanData.title || '',
                folderId: null,
                completed: cleanData.completed || false,
                isPinned: false,
                dueDate: cleanData.dueDate || '',
                hasTime: cleanData.hasTime || false,
                repeat: cleanData.repeat || 'none',
                deadline: cleanData.deadline || '',
                notes: cleanData.notes || '',
                subtasks: cleanData.subtasks || [],
                importedAt: new Date().toISOString(),
            };
        case 'bookmarks':
            return {
                title: cleanData.title || '',
                url: cleanData.url || '',
                type: 'bookmark',
                parentId: null,
                importedAt: new Date().toISOString(),
            };
        case 'passwords':
            return {
                type: 'password',
                service: cleanData.service || '',
                username: cleanData.username || '',
                password: cleanData.password || '',
                url: cleanData.url || '',
                notes: cleanData.notes || '',
                history: cleanData.history || [],
                parentId: null,
                importedAt: new Date().toISOString(),
            };
        case 'banking':
            return {
                ...cleanData,
                type: cleanData.type || 'note',
                importedAt: new Date().toISOString(),
            };
        case 'checklists':
            return {
                title: cleanData.title || '',
                dueDate: cleanData.dueDate || null,
                repeat: cleanData.repeat || 'none',
                importedAt: new Date().toISOString(),
            };
        case 'reminders':
            return {
                ...cleanData,
                importedAt: new Date().toISOString(),
            };
        case 'contacts':
            return {
                ...cleanData,
                importedAt: new Date().toISOString(),
            };
        default:
            return {
                ...cleanData,
                importedAt: new Date().toISOString(),
            };
    }
};

/**
 * Import a shared artifact into the user's own collection.
 * Each app has a unique schema, so we build the correct payload
 * and metadata per app type.
 */
export const importArtifact = async (userId, cryptoKey, artifact) => {
    if (!artifact || !artifact.appType || !artifact.data) return null;

    const { appType, data } = artifact;
    const { id: _stripId, importedAt: _oldImport, items: checklistItems, ...cleanData } = data;

    const encryptPayload = buildEncryptedPayload(appType, cleanData);
    const encrypted = await encryptData(encryptPayload, cryptoKey);
    const metadata = getAppMetadata(appType, cleanData);

    const useServerTimestamp = !['contacts', 'reminders'].includes(appType);

    const docData = {
        ...encrypted,
        ...metadata,
    };

    if (useServerTimestamp) {
        docData.createdAt = serverTimestamp();
        docData.updatedAt = serverTimestamp();
    }

    const docRef = await addDoc(
        collection(db, 'artifacts', appId, 'users', userId, appType),
        docData
    );

    // For checklists, also write the subcollection items
    if (appType === 'checklists' && checklistItems?.length > 0) {
        const batch = writeBatch(db);
        let completedCount = 0;

        for (const item of checklistItems) {
            const itemRef = doc(collection(db, 'artifacts', appId, 'users', userId, 'checklists', docRef.id, 'items'));
            const itemPayload = await encryptData({
                text: item.text || '',
                dueDate: item.dueDate || null,
                repeat: item.repeat || 'none',
            }, cryptoKey);
            batch.set(itemRef, {
                ...itemPayload,
                isCompleted: item.isCompleted || false,
                createdAt: serverTimestamp(),
                order: item.order ?? Date.now(),
            });
            if (item.isCompleted) completedCount++;
        }

        // Update the list header with correct counts
        batch.update(docRef, {
            itemCount: checklistItems.length,
            completedCount: completedCount,
        });

        await batch.commit();
    }

    return docRef.id;
};
