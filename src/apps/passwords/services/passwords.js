// src/services/passwords.js
import {
  collection, addDoc, serverTimestamp,
  updateDoc, doc, deleteDoc
} from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { encryptData } from '../../../lib/crypto';
import createEncryptedCRUD from '../../../services/createEncryptedCRUD';

const crud = createEncryptedCRUD('passwords', {
  transformDecrypted: (raw, decrypted) => ({
    type: decrypted.type || 'password',
    parentId: decrypted.parentId || null,
    ...decrypted
  })
});

// --- Listeners ---

export const listenToPasswords = (userId, cryptoKey, callback) =>
  crud.listen(userId, cryptoKey, (data) => {
    // Sort: Folders first, then alphabetically by service name
    data.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return (a.service || a.title || '').localeCompare(b.service || b.title || '');
    });
    callback(data);
  });

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
  return crud.save(userId, cryptoKey, { ...payload, id: itemData.id });
};

export const createPasswordFolder = async (userId, cryptoKey, title, parentId = null) => {
  const payload = { type: 'folder', title, parentId };
  return crud.save(userId, cryptoKey, payload);
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
  await crud.remove(userId, itemId);
};

export const createNewPasswordEntry = async (userId, cryptoKey, parentId = null) => {
  const initialData = { type: 'password', service: '', username: '', password: '', url: '', notes: '', history: [], parentId };
  const id = await crud.save(userId, cryptoKey, initialData);
  return { ...initialData, id };
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