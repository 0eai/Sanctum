import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, getDocs 
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

// --- Listeners ---

export const listenToBankingItems = (userId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'banking'), 
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, async (snap) => {
    const data = await Promise.all(snap.docs.map(async d => {
      const raw = d.data();
      const decrypted = await decryptData(raw, cryptoKey);
      return { id: d.id, ...decrypted };
    }));
    callback(data);
  });
};

// --- Actions ---

export const saveBankingItem = async (userId, cryptoKey, itemData, type) => {
  const payload = { ...itemData, type };
  const encrypted = await encryptData(payload, cryptoKey);

  if (itemData.id) {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'banking', itemData.id), {
      ...encrypted,
      updatedAt: serverTimestamp()
    });
  } else {
    await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'banking'), {
      ...encrypted,
      createdAt: serverTimestamp()
    });
  }
};

export const deleteBankingItem = async (userId, itemId) => {
  await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'banking', itemId));
};

// --- Import / Export ---

export const exportBankingData = async (userId, cryptoKey) => {
  const q = query(collection(db, 'artifacts', appId, 'users', userId, 'banking'));
  const snapshot = await getDocs(q);
  return Promise.all(snapshot.docs.map(async (doc) => {
    const raw = doc.data();
    const decrypted = await decryptData(raw, cryptoKey);
    return { 
      ...decrypted, 
      createdAt: raw.createdAt?.toDate?.()?.toISOString() || null 
    };
  }));
};

export const importBankingData = async (userId, cryptoKey, data) => {
  if (!Array.isArray(data)) throw new Error("Invalid format");
  let count = 0;
  for (const item of data) {
    // Validate basic structure
    if (!item.type) continue;
    
    // Clean up ID or timestamps from import to ensure fresh entry
    const { id, createdAt, updatedAt, ...cleanItem } = item;
    
    // Reuse save logic (handles encryption)
    await saveBankingItem(userId, cryptoKey, cleanItem, item.type);
    count++;
  }
  return count;
};