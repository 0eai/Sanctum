import { 
  collection, query, getDocs, writeBatch, doc, setDoc, deleteField, onSnapshot 
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';

// Hard Reset: Deletes all user collections and resets keys
export const resetUserVault = async (userId) => {
  const appCollections = [
    'notes', 'bookmarks', 'checklists', 'counters', 
    'tasks', 'passwords', 'banking', 'finance'
  ];
  
  // 1. Delete all documents in sub-collections
  for (const colName of appCollections) {
    const q = query(collection(db, 'artifacts', appId, 'users', userId, colName));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  // 2. Reset the main user document (keys)
  const userDocRef = doc(db, 'users', userId);
  await setDoc(userDocRef, { 
    encryptionSalt: deleteField(), 
    encryptedMasterKey: deleteField(), 
    encryptedValidator: deleteField() 
  }, { merge: true });
};

// Initialize User Keys (Helper for LockScreen)
export const initializeUserKeys = async (userId, salt, encryptedMasterKey, encryptedValidator) => {
  const userDocRef = doc(db, 'users', userId);
  await setDoc(userDocRef, { 
    encryptionSalt: salt,
    encryptedMasterKey: encryptedMasterKey, 
    encryptedValidator: encryptedValidator 
  }, { merge: true });
};

// Listener for App Stats (Launcher)
export const listenToAppStats = (userId, callback) => {
  const cols = ['counters', 'checklists', 'tasks', 'passwords', 'banking', 'finance'];
  const unsubs = cols.map(col => 
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', userId, col)), 
    snap => callback(col, snap.size))
  );
  
  // Return a cleanup function that calls all unsubscribe functions
  return () => unsubs.forEach(u => u());
};