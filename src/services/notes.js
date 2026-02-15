// src/services/notes.js
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, writeBatch, getDocs
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { 
  encryptData, decryptData, generateMasterKey, keyToUrlString 
} from '../lib/crypto';
import { getNextDate } from '../lib/dateUtils';

// --- Listeners ---

export const listenToNotes = (userId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'notes'), 
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, async (snapshot) => {
    const data = await Promise.all(snapshot.docs.map(async doc => {
      const raw = doc.data();
      const decrypted = await decryptData(raw, cryptoKey);
      return { 
        id: doc.id, 
        ...raw, 
        ...decrypted, 
        tags: decrypted?.tags || [],
        attachments: decrypted?.attachments || [],
        dueDate: decrypted?.dueDate || null,
        repeat: decrypted?.repeat || 'none',
        isPinned: raw.isPinned || false,
        type: raw.type || 'note',
        updatedAt: raw.updatedAt?.toDate() || new Date()
      };
    }));
    callback(data);
  });
};

// --- CRUD Operations ---

export const saveNote = async (userId, cryptoKey, noteData, parentId) => {
  const payload = {
    title: noteData.title,
    content: noteData.content,
    tags: noteData.tags || [],
    attachments: noteData.attachments || [],
    sharedId: noteData.sharedId || null,
    shareUrlKey: noteData.shareUrlKey || null,
    dueDate: noteData.dueDate || null,
    repeat: noteData.repeat || 'none'
  };

  const encrypted = await encryptData(payload, cryptoKey);
  const meta = {
    updatedAt: serverTimestamp(),
    isPinned: noteData.isPinned || false,
    type: 'note',
    parentId: noteData.parentId || parentId
  };

  if (noteData.id) {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'notes', noteData.id), { ...encrypted, ...meta });
    return noteData.id;
  } else {
    const ref = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'notes'), { ...encrypted, ...meta, createdAt: serverTimestamp() });
    return ref.id;
  }
};

export const createFolder = async (userId, cryptoKey, title, parentId) => {
  const encrypted = await encryptData({ title }, cryptoKey);
  await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'notes'), {
    ...encrypted, type: 'folder', parentId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
};

export const updateFolder = async (userId, cryptoKey, folderId, title) => {
  const encrypted = await encryptData({ title }, cryptoKey);
  await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'notes', folderId), {
    ...encrypted, updatedAt: serverTimestamp()
  });
};

export const deleteNoteItem = async (userId, item, allItems) => {
  if (item.type === 'folder') {
    const batch = writeBatch(db);
    const children = allItems.filter(i => i.parentId === item.id);
    children.forEach(c => batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'notes', c.id)));
    batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'notes', item.id));
    await batch.commit();
  } else {
    await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'notes', item.id));
  }
};

export const togglePin = async (userId, itemId, currentStatus) => {
  await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'notes', itemId), {
    isPinned: !currentStatus
  });
};

export const rescheduleNote = async (userId, cryptoKey, note) => {
  const nextDate = getNextDate(note.dueDate, note.repeat);
  const payload = { ...note, dueDate: nextDate };
  // Clean metadata before re-encrypting
  delete payload.id; delete payload.updatedAt; delete payload.createdAt; delete payload.type; delete payload.isPinned;
  
  const encrypted = await encryptData(payload, cryptoKey);
  await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'notes', note.id), {
      ...encrypted, updatedAt: serverTimestamp()
  });
};

// --- Sharing ---

export const shareNote = async (userId, cryptoKey, note) => {
  const shareKey = await generateMasterKey();
  const payload = {
    title: note.title,
    content: note.content,
    tags: note.tags || [],
    attachments: note.attachments || [],
    date: new Date().toISOString()
  };
  const encryptedBlob = await encryptData(payload, shareKey);
  
  const docRef = await addDoc(collection(db, 'shared_notes'), { data: encryptedBlob, createdAt: serverTimestamp() });
  const keyString = await keyToUrlString(shareKey);
  
  const privatePayload = { ...note, sharedId: docRef.id, shareUrlKey: keyString };
  delete privatePayload.id; delete privatePayload.updatedAt; delete privatePayload.createdAt; delete privatePayload.type; delete privatePayload.isPinned;
  
  const encryptedPrivate = await encryptData(privatePayload, cryptoKey);
  await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'notes', note.id), { ...encryptedPrivate });

  return { sharedId: docRef.id, shareUrlKey: keyString };
};

export const stopSharingNote = async (userId, cryptoKey, note) => {
  try { await deleteDoc(doc(db, 'shared_notes', note.sharedId)); } catch(e) { console.warn("Cleanup error", e); }

  const privatePayload = { ...note, sharedId: null, shareUrlKey: null };
  delete privatePayload.id; delete privatePayload.updatedAt; delete privatePayload.createdAt; delete privatePayload.type; delete privatePayload.isPinned;
  
  const encryptedPrivate = await encryptData(privatePayload, cryptoKey);
  await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'notes', note.id), { ...encryptedPrivate });
};

export const exportNotes = async (userId, cryptoKey) => {
  const q = query(collection(db, 'artifacts', appId, 'users', userId, 'notes'));
  const snapshot = await getDocs(q);
  
  return Promise.all(snapshot.docs.map(async (doc) => {
    const raw = doc.data();
    const decrypted = await decryptData(raw, cryptoKey);
    return {
      ...raw,
      ...decrypted,
      // Store the original ID to reconstruct hierarchy on import
      oldId: doc.id,
      createdAt: raw.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: raw.updatedAt?.toDate?.()?.toISOString() || null,
      dueDate: decrypted.dueDate || null 
    };
  }));
};

export const importNotes = async (userId, cryptoKey, data) => {
  if (!Array.isArray(data)) throw new Error("Invalid format");

  // Sort: Process Folders FIRST, then Notes. 
  // This ensures folders exist before we try to put notes inside them.
  const sortedData = data.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return 0;
  });

  const idMap = {}; // Map { oldId: newId }
  let count = 0;

  for (const item of sortedData) {
    const { oldId, title, content, tags, attachments, parentId, type, isPinned, ...rest } = item;

    // 1. Encrypt Content
    // We only encrypt the specific fields, not metadata like 'type' or 'isPinned'
    const payload = {
      title,
      content,
      tags: tags || [],
      attachments: attachments || [],
      dueDate: rest.dueDate || null,
      repeat: rest.repeat || 'none'
    };
    const encrypted = await encryptData(payload, cryptoKey);

    // 2. Resolve Parent ID
    // If the item had a parent, check if we've already imported that folder (new ID).
    // If not found (e.g., parent deleted or root), default to null.
    const newParentId = parentId && idMap[parentId] ? idMap[parentId] : null;

    // 3. Save to Firestore
    const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'notes'), {
      ...encrypted,
      type: type || 'note',
      parentId: newParentId,
      isPinned: isPinned || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // 4. Update Map
    if (oldId) {
      idMap[oldId] = docRef.id;
    }
    count++;
  }
  return count;
};