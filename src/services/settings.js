import { 
  doc, getDoc, setDoc, updateDoc, collection, getDocs, writeBatch, deleteDoc 
} from 'firebase/firestore';
import { deleteUser } from 'firebase/auth'; 
import { db, appId } from '../lib/firebase';
import { 
  encryptData, decryptData, deriveKeyFromPasskey, generateSalt 
} from '../lib/crypto';
import { DEFAULT_CATEGORIES } from '../apps/settings/constants';

// Ensure we target all specific app collections
const TARGET_COLLECTIONS = [
    'notes', 
    'bookmarks', 
    'tasks', 
    'passwords', 
    'banking', 
    'finance', 
    'checklists', // Has sub-collection: 'items'
    'counters'    // Has sub-collection: 'entries'
];

// --- App Preferences ---

export const fetchAppPreferences = async (userId) => {
    try {
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'settings', 'apps');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            return {
                // If customized, return saved list. Otherwise null.
                customAppList: snap.data().customAppList || null,
                selectedApps: snap.data().selectedApps || []
            };
        }
        return null;
    } catch (e) {
        console.error("Fetch apps error", e);
        return null;
    }
};

export const saveAppPreferences = async (userId, selectedApps, customAppList) => {
    await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'settings', 'apps'), { 
        selectedApps,
        customAppList 
    });
};

// --- Data Management (Deep Export/Import) ---

export const exportUserData = async (userId, cryptoKey) => {
    const exportData = {};
    
    for (const colName of TARGET_COLLECTIONS) {
        const colRef = collection(db, 'artifacts', appId, 'users', userId, colName);
        const snapshot = await getDocs(colRef);
        
        const items = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const raw = docSnap.data();
            let docData = { _id: docSnap.id }; 

            // 1. Decrypt Parent Document
            try {
                const decrypted = await decryptData(raw, cryptoKey);
                if (decrypted) {
                    docData = { ...docData, ...decrypted };
                } else {
                    docData = { ...docData, ...raw, _decryptionFailed: true };
                }
            } catch (e) {
                console.warn(`[Export] Failed to decrypt ${colName}/${docSnap.id}`, e);
                docData = { ...docData, ...raw, _error: e.message };
            }

            // Restore timestamps for clean JSON
            if (raw.createdAt && raw.createdAt.seconds) {
                docData._createdAt = new Date(raw.createdAt.seconds * 1000).toISOString();
            }

            // 2. Handle Sub-Collections (Deep Fetch)
            
            // -> Checklists: Fetch 'items'
            if (colName === 'checklists') {
                const subRef = collection(db, 'artifacts', appId, 'users', userId, colName, docSnap.id, 'items');
                const subSnap = await getDocs(subRef);
                const subItems = await Promise.all(subSnap.docs.map(async (s) => {
                    try {
                        const d = await decryptData(s.data(), cryptoKey);
                        return { ...d, _id: s.id };
                    } catch { return { ...s.data(), _id: s.id }; }
                }));
                if (subItems.length > 0) docData.items = subItems;
            }

            // -> Counters: Fetch 'entries' (FIXED: was 'logs')
            if (colName === 'counters') {
                const subRef = collection(db, 'artifacts', appId, 'users', userId, colName, docSnap.id, 'entries');
                const subSnap = await getDocs(subRef);
                const entries = await Promise.all(subSnap.docs.map(async (s) => {
                    try {
                        const d = await decryptData(s.data(), cryptoKey);
                        // Restore timestamps for entries
                        const rawEntry = s.data();
                        const entryData = { ...d, _id: s.id };
                        if (rawEntry.timestamp?.seconds) entryData.timestamp = new Date(rawEntry.timestamp.seconds * 1000).toISOString();
                        if (rawEntry.endTimestamp?.seconds) entryData.endTimestamp = new Date(rawEntry.endTimestamp.seconds * 1000).toISOString();
                        return entryData;
                    } catch { return { ...s.data(), _id: s.id }; }
                }));
                if (entries.length > 0) docData.entries = entries;
            }

            return docData;
        }));

        if (items.length > 0) exportData[colName] = items;
    }
    return exportData;
};

export const importUserData = async (userId, cryptoKey, jsonData) => {
    const batchSize = 400; 
    let batch = writeBatch(db);
    let count = 0;

    const commitBatch = async () => {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
    };

    for (const [colName, items] of Object.entries(jsonData)) {
        if (!TARGET_COLLECTIONS.includes(colName)) continue; 

        for (const item of items) {
            // Extract special fields (added 'entries')
            const { _id, _createdAt, _updatedAt, _decryptionFailed, _error, items: subItems, entries: subEntries, ...data } = item;
            
            // Re-encrypt main data
            const encrypted = await encryptData(data, cryptoKey);
            
            // Restore Timestamps
            const payload = { 
                ...encrypted, 
                createdAt: _createdAt ? new Date(_createdAt) : new Date(),
                updatedAt: new Date() 
            };

            // Set Main Document
            const docRef = doc(db, 'artifacts', appId, 'users', userId, colName, _id);
            batch.set(docRef, payload);
            count++;

            // Handle Sub-Collections: Checklist Items
            if (colName === 'checklists' && Array.isArray(subItems)) {
                for (const sub of subItems) {
                    const { _id: subId, ...subData } = sub;
                    const subEncrypted = await encryptData(subData, cryptoKey);
                    const subRef = doc(db, 'artifacts', appId, 'users', userId, colName, _id, 'items', subId);
                    batch.set(subRef, subEncrypted);
                    count++;
                }
            }

            // Handle Sub-Collections: Counter Entries (FIXED: was 'logs')
            if (colName === 'counters' && Array.isArray(subEntries)) {
                for (const entry of subEntries) {
                    const { _id: entryId, timestamp, endTimestamp, ...entryData } = entry;
                    const entryEncrypted = await encryptData(entryData, cryptoKey);
                    
                    const entryPayload = {
                        ...entryEncrypted,
                        timestamp: timestamp ? new Date(timestamp) : null,
                        endTimestamp: endTimestamp ? new Date(endTimestamp) : null,
                        createdAt: new Date()
                    };

                    const entryRef = doc(db, 'artifacts', appId, 'users', userId, colName, _id, 'entries', entryId);
                    batch.set(entryRef, entryPayload);
                    count++;
                }
            }

            if (count >= batchSize) await commitBatch();
        }
    }
    if (count > 0) await commitBatch();
};

export const wipeAllUserData = async (userId) => {
    const batchSize = 400;
    let batch = writeBatch(db);
    let count = 0;

    const deleteCollection = async (collRef) => {
        const snapshot = await getDocs(collRef);
        for (const d of snapshot.docs) {
            batch.delete(d.ref);
            count++;
            if (count >= batchSize) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
            }
        }
    };

    for (const colName of TARGET_COLLECTIONS) {
        const mainColRef = collection(db, 'artifacts', appId, 'users', userId, colName);
        const mainSnap = await getDocs(mainColRef);

        for (const d of mainSnap.docs) {
            // Delete Sub-collections first
            if (colName === 'checklists') {
                await deleteCollection(collection(d.ref, 'items'));
            }
            if (colName === 'counters') {
                await deleteCollection(collection(d.ref, 'entries')); // FIXED: was 'logs'
            }
            
            // Delete Parent Doc
            batch.delete(d.ref);
            count++;
            if (count >= batchSize) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
            }
        }
    }
    
    // Delete Settings
    await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'settings', 'apps'));
    await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'finance_settings', 'config'));

    if (count > 0) await batch.commit();
};

export const deleteUserAccount = async (user) => {
    await wipeAllUserData(user.uid);
    await deleteDoc(doc(db, 'users', user.uid));
    await deleteUser(user);
};

// --- Finance Settings ---
export const fetchFinanceSettings = async (userId, cryptoKey) => {
  try {
    const docRef = doc(db, 'artifacts', appId, 'users', userId, 'finance_settings', 'config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = await decryptData(snap.data(), cryptoKey);
      return data ? { ...data, categories: { ...DEFAULT_CATEGORIES, ...data.categories } } : null;
    }
    return { activeCurrencies: ['KRW'], categories: DEFAULT_CATEGORIES };
  } catch (e) { return null; }
};

export const saveFinanceSettings = async (userId, settings, cryptoKey) => {
  const encrypted = await encryptData(settings, cryptoKey);
  await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'finance_settings', 'config'), encrypted);
};

// --- Security ---
export const rotateUserPasskey = async (userId, oldPass, newPass) => {
  const userDocRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userDocRef);
  if (!userDoc.exists()) throw new Error("User data not found.");
  
  const { encryptionSalt, encryptedMasterKey } = userDoc.data();
  const oldWrapperKey = await deriveKeyFromPasskey(oldPass, encryptionSalt);
  const unlockedMasterKeyJWK = await decryptData(encryptedMasterKey, oldWrapperKey);
  
  if (!unlockedMasterKeyJWK) throw new Error("Current passkey is incorrect.");

  const newSalt = generateSalt();
  const newWrapperKey = await deriveKeyFromPasskey(newPass, newSalt);
  const newEncryptedMasterKey = await encryptData(unlockedMasterKeyJWK, newWrapperKey);

  await updateDoc(userDocRef, { encryptionSalt: newSalt, encryptedMasterKey: newEncryptedMasterKey });
};