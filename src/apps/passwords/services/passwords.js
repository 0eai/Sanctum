// src/services/passwords.js
import {
  collection, query, onSnapshot, addDoc, serverTimestamp,
  updateDoc, doc, deleteDoc
} from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { encryptData, decryptData } from '../../../lib/crypto';

// --- Listeners ---

export const listenToPasswords = (userId, cryptoKey, callback) => {
  const q = query(collection(db, 'artifacts', appId, 'users', userId, 'passwords'));

  return onSnapshot(q, async (snapshot) => {
    const decrypted = await Promise.all(snapshot.docs.map(async d => {
      const raw = d.data();
      const decryptedData = await decryptData(raw, cryptoKey);

      return {
        id: d.id,
        // FIXED: Legacy Data Fallbacks
        // If old data is missing these fields, safely default them so they appear at the root level
        type: decryptedData.type || 'password',
        parentId: decryptedData.parentId || null,
        ...decryptedData
      };
    }));

    // Sort locally: Folders first, then alphabetically by service name
    decrypted.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return (a.service || a.title || '').localeCompare(b.service || b.title || '');
    });

    callback(decrypted);
  });
};

// --- Actions ---

export const savePasswordItem = async (userId, cryptoKey, itemData) => {
  const payload = {
    type: 'password',
    service: itemData.service || "",
    username: itemData.username || "",
    password: itemData.password || "",
    url: itemData.url || "",
    notes: itemData.notes || "",
    history: itemData.history || [],
    parentId: itemData.parentId || null,
    updatedAt: itemData.updatedAt || new Date().toISOString()
  };

  const encrypted = await encryptData(payload, cryptoKey);

  if (itemData.id) {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'passwords', itemData.id), { ...encrypted });
    return itemData.id;
  } else {
    const ref = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'passwords'), {
      ...encrypted, createdAt: serverTimestamp()
    });
    return ref.id;
  }
};

export const createPasswordFolder = async (userId, cryptoKey, title, parentId = null) => {
  const payload = { type: 'folder', title, parentId };
  const encrypted = await encryptData(payload, cryptoKey);
  const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'passwords'), {
    ...encrypted, createdAt: serverTimestamp()
  });
  return docRef.id;
};

export const updatePasswordFolder = async (userId, cryptoKey, id, title) => {
  const encrypted = await encryptData({ type: 'folder', title }, cryptoKey);
  await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'passwords', id), { ...encrypted });
};

export const deletePasswordItem = async (userId, itemId, allItems = []) => {
  // If it's a folder, recursively delete children
  const itemToDelete = allItems.find(i => i.id === itemId);
  if (itemToDelete?.type === 'folder') {
    const children = allItems.filter(i => i.parentId === itemId);
    for (const child of children) {
      await deletePasswordItem(userId, child.id, allItems);
    }
  }
  await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'passwords', itemId));
};

export const createNewPasswordEntry = async (userId, cryptoKey, parentId = null) => {
  const initialData = { type: 'password', service: '', username: '', password: '', url: '', notes: '', history: [], parentId };
  const encrypted = await encryptData(initialData, cryptoKey);
  const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'passwords'), {
    ...encrypted, createdAt: serverTimestamp()
  });
  return { ...initialData, id: docRef.id };
};

// --- CSV INTEGRATION (Google Passwords format) ---

const escapeCSV = (str) => {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
};

export const exportPasswordsCSV = (passwords) => {
  const headers = ['name', 'url', 'username', 'password', 'note'];
  const rows = [headers.join(',')];
  const entries = passwords.filter(p => p.type === 'password');
  entries.forEach(p => {
    rows.push([
      escapeCSV(p.service || ''),
      escapeCSV(p.url || ''),
      escapeCSV(p.username || ''),
      escapeCSV(p.password || ''),
      escapeCSV(p.notes || '')
    ].join(','));
  });
  return rows.join('\n');
};

export const importPasswordsCSV = async (userId, cryptoKey, csvText) => {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return 0;

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
  let count = 0;

  // Fetch existing items for deduplication
  const existingColRef = collection(db, 'artifacts', appId, 'users', userId, 'passwords');
  const existingSnap = await getDocs(existingColRef);
  const existingFingerprints = new Set();

  for (const d of existingSnap.docs) {
    try {
      const decrypted = await decryptData(d.data(), cryptoKey);
      if (decrypted && decrypted.type === 'password') {
        const fingerprint = `${decrypted.service || ''}|${decrypted.username || ''}|${decrypted.url || ''}`;
        existingFingerprints.add(fingerprint);
      }
    } catch (e) {
      // Ignore errors
    }
  }

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parse (handles basic quoting)
    const values = [];
    let current = '';
    let inQuote = false;
    for (const char of lines[i]) {
      if (char === '"') { inQuote = !inQuote; }
      else if (char === ',' && !inQuote) { values.push(current); current = ''; }
      else { current += char; }
    }
    values.push(current);

    const get = (name) => {
      const idx = headers.indexOf(name);
      return idx !== -1 ? values[idx]?.trim() || '' : '';
    };

    const service = get('name') || get('title') || get('service');
    const url = get('url') || get('website');
    const username = get('username') || get('login') || get('email');
    const password = get('password');
    const notes = get('note') || get('notes');

    if (service || username || password) {
      const fingerprint = `${service || ''}|${username || ''}|${url || ''}`;
      if (existingFingerprints.has(fingerprint)) continue;

      existingFingerprints.add(fingerprint);

      const itemData = {
        type: 'password',
        service,
        username,
        password,
        url,
        notes,
        history: [],
        parentId: null,
        updatedAt: new Date().toISOString()
      };
      const encrypted = await encryptData(itemData, cryptoKey);
      await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'passwords'), {
        ...encrypted, createdAt: serverTimestamp()
      });
      count++;
    }
  }
  return count;
};