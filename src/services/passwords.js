import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc 
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

// --- Listeners ---

export const listenToPasswords = (userId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'passwords'), 
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, async (snapshot) => {
    const decrypted = await Promise.all(snapshot.docs.map(async d => {
      const raw = d.data();
      const decryptedData = await decryptData(raw, cryptoKey);
      return { id: d.id, ...decryptedData };
    }));
    callback(decrypted);
  });
};

// --- Actions ---

export const savePasswordItem = async (userId, cryptoKey, itemData) => {
  const payload = {
    service: itemData.service || "",
    username: itemData.username || "",
    password: itemData.password || "",
    url: itemData.url || "",
    notes: itemData.notes || "",
    history: itemData.history || [],
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

export const deletePasswordItem = async (userId, itemId) => {
  await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'passwords', itemId));
};

export const createNewPasswordEntry = async (userId, cryptoKey) => {
  const initialData = { service: '', username: '', password: '', url: '', notes: '', history: [] };
  const encrypted = await encryptData(initialData, cryptoKey);
  const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'passwords'), {
      ...encrypted, createdAt: serverTimestamp()
  });
  return { ...initialData, id: docRef.id };
};