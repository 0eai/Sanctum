// src/services/notes.js
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  updateDoc, doc, deleteDoc, writeBatch, getDocs, increment, deleteField, setDoc
} from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import {
  encryptData, decryptData, generateMasterKey, keyToUrlString
} from '../../../lib/crypto';
import { getNextDate } from '../../../lib/dateUtils';
import { DEFAULT_SYSTEM_INSTRUCTION } from '../../../services/gemini';
import { deleteFirebaseFile, reEncryptStorageFilesForMove } from '../../../services/firebaseStorage';

// --- Workspace Context Helper ---
const getNotesCol = (userId, ctx) =>
  ctx?.workspaceId
    ? collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'notes')
    : collection(db, 'artifacts', appId, 'users', userId, 'notes');

const getNoteDoc = (userId, noteId, ctx) =>
  ctx?.workspaceId
    ? doc(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'notes', noteId)
    : doc(db, 'artifacts', appId, 'users', userId, 'notes', noteId);

const getKey = (cryptoKey, ctx) => ctx?.key || cryptoKey;

// --- Decrypt Helper ---
// Handles both new field-level format (encryptedTitle, …) and legacy single-blob format.
const decryptNoteDoc = async (raw, key) => {
  if (raw.encryptedTitle !== undefined || raw.encryptedContent !== undefined) {
    const title = raw.encryptedTitle
      ? await decryptData(raw.encryptedTitle, key).catch(() => '') : '';
    if (raw.type === 'folder') return { title };
    const [content, tags, attachments, meta] = await Promise.all([
      raw.encryptedContent ? decryptData(raw.encryptedContent, key).catch(() => '') : '',
      raw.encryptedTags ? decryptData(raw.encryptedTags, key).catch(() => []) : [],
      raw.encryptedAttachments ? decryptData(raw.encryptedAttachments, key).catch(() => []) : [],
      raw.encryptedMeta ? decryptData(raw.encryptedMeta, key).catch(() => ({})) : {},
    ]);
    return { title, content, tags, attachments, ...(meta || {}) };
  }
  return decryptData(raw, key); // Legacy single-blob
};

// --- Listeners ---

export const listenToNotes = (userId, cryptoKey, callback, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  const q = query(
    getNotesCol(userId, ctx),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, async (snapshot) => {
    const data = await Promise.all(snapshot.docs.map(async docSnap => {
      const raw = docSnap.data();
      try {
        const decrypted = await decryptNoteDoc(raw, key);
        // Strip encrypted blobs from the spread so they don't pollute app state
        const { encryptedTitle: _et, encryptedContent: _ec, encryptedTags: _etg,
                encryptedAttachments: _ea, encryptedMeta: _em, data: _d, iv: _iv,
                ...rawMeta } = raw;
        return {
          id: docSnap.id,
          ...rawMeta,
          ...(decrypted || {}),
          tags: decrypted?.tags || [],
          attachments: decrypted?.attachments || [],
          dueDate: decrypted?.dueDate || null,
          repeat: decrypted?.repeat || 'none',
          isPinned: raw.isPinned || false,
          type: raw.type || 'note',
          updatedAt: raw.updatedAt?.toDate() || new Date()
        };
      } catch (error) {
        console.warn('Failed to decrypt note doc', docSnap.id, error.message || error);
        return {
          id: docSnap.id,
          title: 'Encrypted Data (Decryption Failed)',
          content: '',
          tags: [],
          attachments: [],
          dueDate: null,
          repeat: 'none',
          isPinned: raw.isPinned || false,
          type: raw.type || 'note',
          updatedAt: raw.updatedAt?.toDate() || new Date()
        };
      }
    }));
    callback(data);
  });
};

// --- Single-doc fetch (used by Research linked-doc move) ---
export const fetchNoteById = async (userId, cryptoKey, noteId, ctx = null) => {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(getNoteDoc(userId, noteId, ctx));
  if (!snap.exists()) return null;
  return await decryptNoteDoc(snap.data(), ctx?.key || cryptoKey);
};

export const getOrCreateAiPromptsFolder = async (userId, cryptoKey) => {
  const q = query(collection(db, 'artifacts', appId, 'users', userId, 'notes'));
  const snap = await getDocs(q);

  let folderId = null;
  const decodedItems = [];

  for (const docSnap of snap.docs) {
    const raw = docSnap.data();
    try {
      const dec = await decryptNoteDoc(raw, cryptoKey);
      decodedItems.push({ id: docSnap.id, ...raw, ...dec, type: raw.type || 'note' });
      if (raw.type === 'folder' && dec?.title === 'AI Prompts') {
        folderId = docSnap.id;
      }
    } catch (e) { }
  }

  if (!folderId) {
    const encryptedTitle = await encryptData('AI Prompts', cryptoKey);
    const folderRef = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'notes'), {
      encryptedTitle, type: 'folder', parentId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    folderId = folderRef.id;
  }

  let prompts = decodedItems.filter(i => i.type !== 'folder' && i.parentId === folderId);

  if (prompts.length === 0) {
    const defaultId = await saveNote(userId, cryptoKey, {
      title: 'Default Research Prompt',
      content: DEFAULT_SYSTEM_INSTRUCTION,
      tags: ['system', 'ai']
    }, folderId);
    prompts = [{
      id: defaultId,
      title: 'Default Research Prompt',
      content: DEFAULT_SYSTEM_INSTRUCTION,
      tags: ['system', 'ai']
    }];
  }

  return { folderId, prompts };
};

// --- CRUD Operations ---

export const saveNote = async (userId, cryptoKey, noteData, parentId, ctx = null) => {
  const key = getKey(cryptoKey, ctx);

  const [encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta] = await Promise.all([
    encryptData(noteData.title || '', key),
    encryptData(noteData.content || '', key),
    encryptData(noteData.tags || [], key),
    encryptData(noteData.attachments || [], key),
    encryptData({
      sharedId: noteData.sharedId || null,
      shareUrlKey: noteData.shareUrlKey || null,
      collabShareId: noteData.collabShareId || null,
      dueDate: noteData.dueDate || null,
      repeat: noteData.repeat || 'none'
    }, key),
  ]);

  const fieldData = { encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta };

  const meta = {
    updatedAt: serverTimestamp(),
    versionId: increment(1),
    isPinned: noteData.isPinned || false,
    type: 'note'
  };

  if (noteData.parentId !== undefined) {
    meta.parentId = noteData.parentId;
  } else if (parentId !== undefined) {
    meta.parentId = parentId;
  }

  if (noteData.id) {
    await updateDoc(getNoteDoc(userId, noteData.id, ctx), {
      ...fieldData, ...meta,
      data: deleteField(), iv: deleteField() // clear legacy single-blob fields
    });
    return noteData.id;
  } else {
    const ref = await addDoc(getNotesCol(userId, ctx), { ...fieldData, ...meta, createdAt: serverTimestamp() });
    return ref.id;
  }
};

export const createFolder = async (userId, cryptoKey, title, parentId, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  const encryptedTitle = await encryptData(title, key);
  await addDoc(getNotesCol(userId, ctx), {
    encryptedTitle, type: 'folder', parentId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
};

export const updateFolder = async (userId, cryptoKey, folderId, title, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  const encryptedTitle = await encryptData(title, key);
  await updateDoc(getNoteDoc(userId, folderId, ctx), {
    encryptedTitle, updatedAt: serverTimestamp(),
    data: deleteField(), iv: deleteField()
  });
};

export const deleteNoteItem = async (userId, item, allItems, ctx = null) => {
  if (item.type === 'folder') {
    const batch = writeBatch(db);
    const children = allItems.filter(i => i.parentId === item.id);
    for (const c of children) {
      if (c.attachments && c.attachments.length > 0) {
        for (const att of c.attachments) {
          if (att.driveFileId) await deleteFirebaseFile(att.driveFileId, 'notes');
        }
      }
      batch.delete(getNoteDoc(userId, c.id, ctx));
    }
    batch.delete(getNoteDoc(userId, item.id, ctx));
    await batch.commit();
  } else {
    if (item.attachments && item.attachments.length > 0) {
      for (const att of item.attachments) {
        if (att.driveFileId) await deleteFirebaseFile(att.driveFileId, 'notes');
      }
    }
    await deleteDoc(getNoteDoc(userId, item.id, ctx));
  }
};

export const togglePin = async (userId, itemId, currentStatus, ctx = null) => {
  await updateDoc(getNoteDoc(userId, itemId, ctx), {
    isPinned: !currentStatus
  });
};

export const rescheduleNote = async (userId, cryptoKey, note, ctx = null) => {
  const nextDate = getNextDate(note.dueDate, note.repeat);
  await saveNote(userId, cryptoKey, { ...note, dueDate: nextDate }, note.parentId, ctx);
};

// --- Move (cross-context) ---
// Writes in field-level encrypted format so the listener decrypts via the
// standard field-level path rather than the legacy single-blob path.
export const moveNoteDoc = async (userId, cryptoKey, item, sourceCtx, destCtx) => {
  const sourceKey = sourceCtx?.key ?? cryptoKey;
  const destKey   = destCtx?.key  ?? cryptoKey;

  if (item.type === 'folder') {
    const encryptedTitle = await encryptData(item.title || '', destKey);
    await setDoc(getNoteDoc(userId, item.id, destCtx), {
      encryptedTitle,
      type: 'folder',
      parentId: item.parentId || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const [encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta] = await Promise.all([
      encryptData(item.title || '', destKey),
      encryptData(item.content || '', destKey),
      encryptData(item.tags || [], destKey),
      encryptData(item.attachments || [], destKey),
      encryptData({
        dueDate: item.dueDate || null,
        repeat: item.repeat || 'none',
        sharedId: item.sharedId || null,
        shareUrlKey: item.shareUrlKey || null,
        collabShareId: item.collabShareId || null,
      }, destKey),
    ]);
    await setDoc(getNoteDoc(userId, item.id, destCtx), {
      encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta,
      isPinned: item.isPinned || false,
      type: 'note',
      parentId: item.parentId || null,
      versionId: item.versionId || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await reEncryptStorageFilesForMove(item, sourceKey, destKey, 'notes');
  }

  await deleteDoc(getNoteDoc(userId, item.id, sourceCtx));
};

// --- Sharing ---

const DEFAULT_EXPIRE_MINUTES = 30 * 24 * 60; // 30 days

export const shareNote = async (userId, cryptoKey, note, expireMinutes = DEFAULT_EXPIRE_MINUTES) => {
  const shareKey = await generateMasterKey();
  const payload = {
    title: note.title,
    content: note.content,
    tags: note.tags || [],
    attachments: note.attachments || [],
    date: new Date().toISOString()
  };
  const encryptedBlob = await encryptData(payload, shareKey);

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + (expireMinutes ?? DEFAULT_EXPIRE_MINUTES));

  const docRef = await addDoc(collection(db, 'shared_notes'), {
    data: encryptedBlob, createdBy: userId, createdAt: serverTimestamp(), expiresAt
  });
  const keyString = await keyToUrlString(shareKey);

  await saveNote(userId, cryptoKey, { ...note, sharedId: docRef.id, shareUrlKey: keyString }, note.parentId);

  return { sharedId: docRef.id, shareUrlKey: keyString };
};

export const stopSharingNote = async (userId, cryptoKey, note) => {
  try { await deleteDoc(doc(db, 'shared_notes', note.sharedId)); } catch (e) { console.warn("Cleanup error", e); }
  await saveNote(userId, cryptoKey, { ...note, sharedId: null, shareUrlKey: null }, note.parentId);
};

export const exportNotes = async (userId, cryptoKey) => {
  const q = query(collection(db, 'artifacts', appId, 'users', userId, 'notes'));
  const snapshot = await getDocs(q);

  return Promise.all(snapshot.docs.map(async (docSnap) => {
    const raw = docSnap.data();
    const decrypted = await decryptNoteDoc(raw, cryptoKey);
    return {
      ...raw,
      ...decrypted,
      oldId: docSnap.id,
      createdAt: raw.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: raw.updatedAt?.toDate?.()?.toISOString() || null,
      dueDate: decrypted?.dueDate || null
    };
  }));
};

export const importNotes = async (userId, cryptoKey, data) => {
  if (!Array.isArray(data)) throw new Error("Invalid format");

  const sortedData = data.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return 0;
  });

  const idMap = {};
  let count = 0;

  for (const item of sortedData) {
    const { oldId, title, content, tags, attachments, parentId, type, isPinned, dueDate, repeat } = item;
    const newParentId = parentId && idMap[parentId] ? idMap[parentId] : null;

    let fieldData;
    if (type === 'folder') {
      fieldData = { encryptedTitle: await encryptData(title || '', cryptoKey) };
    } else {
      const [encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta] = await Promise.all([
        encryptData(title || '', cryptoKey),
        encryptData(content || '', cryptoKey),
        encryptData(tags || [], cryptoKey),
        encryptData(attachments || [], cryptoKey),
        encryptData({ dueDate: dueDate || null, repeat: repeat || 'none' }, cryptoKey),
      ]);
      fieldData = { encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta };
    }

    const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'notes'), {
      ...fieldData,
      type: type || 'note',
      parentId: newParentId,
      isPinned: isPinned || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if (oldId) idMap[oldId] = docRef.id;
    count++;
  }
  return count;
};
