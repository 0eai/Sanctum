import {
  collection, query, getDocs, writeBatch, doc, setDoc, deleteField, onSnapshot
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { APP_COLLECTIONS, STATS_COLLECTIONS } from '../lib/appCollections';
import { deleteInChunks } from '../lib/firestore';

// Hard Reset: Deletes all user collections and resets keys
export const resetUserVault = async (userId) => {
  // 1. Delete all documents in sub-collections (chunked for >500 docs)
  for (const colName of APP_COLLECTIONS) {
    const q = query(collection(db, 'artifacts', appId, 'users', userId, colName));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      await deleteInChunks(snapshot.docs.map(d => d.ref));
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
export const initializeUserKeys = async (userId, salt, encryptedMasterKey, encryptedValidator, kdf = "argon2id", iterations = null) => {
  const userDocRef = doc(db, 'users', userId);
  const data = {
    encryptionSalt: salt,
    encryptedMasterKey: encryptedMasterKey,
    encryptedValidator: encryptedValidator,
    kdf: kdf
  };
  if (iterations) data.iterations = iterations;

  await setDoc(userDocRef, data, { merge: true });
};

// Listener for App Stats (Launcher)
export const listenToAppStats = (userId, callback) => {
  const cols = STATS_COLLECTIONS;
  const unsubs = cols.map(col =>
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', userId, col)),
      snap => callback(col, snap.size))
  );

  // Return a cleanup function that calls all unsubscribe functions
  return () => unsubs.forEach(u => u());
};