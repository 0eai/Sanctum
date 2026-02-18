// src/services/passwords.js
import { 
  collection, query, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc 
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

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