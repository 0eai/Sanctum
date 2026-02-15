// src/services/vault.js
import { 
  doc, getDoc, setDoc, deleteField, collection, getDocs, writeBatch, query 
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { 
  deriveKeyFromPasskey, generateSalt, generateMasterKey, 
  exportKey, importMasterKey, encryptData, decryptData 
} from '../lib/crypto';

// Service: Hard Reset the Vault
export const resetUserVault = async (userId) => {
  const appCollections = ['notes', 'bookmarks', 'checklists', 'counters', 'tasks', 'passwords', 'banking', 'finance'];
  
  // 1. Batch delete sub-collections
  for (const colName of appCollections) {
    const q = query(collection(db, 'artifacts', appId, 'users', userId, colName));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    
    if (!snapshot.empty) {
      snapshot.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  // 2. Reset User Doc
  const userDocRef = doc(db, 'users', userId);
  await setDoc(userDocRef, { 
    encryptionSalt: deleteField(), 
    encryptedMasterKey: deleteField(), 
    encryptedValidator: deleteField() 
  }, { merge: true });
};

// Service: Attempt to Unlock (or Initialize) Vault
export const attemptVaultUnlock = async (userId, password) => {
  const userDocRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userDocRef);
  const userData = userDoc.exists() ? userDoc.data() : {};

  let { encryptionSalt: salt, encryptedMasterKey: encryptedBlob } = userData;
  let masterKey;

  // A. INITIALIZATION FLOW (New Vault)
  if (!salt || !encryptedBlob) {
    salt = generateSalt();
    masterKey = await generateMasterKey();
    const wrapperKey = await deriveKeyFromPasskey(password, salt);
    const masterKeyJWK = await exportKey(masterKey);
    
    const encryptedMasterKey = await encryptData(masterKeyJWK, wrapperKey);
    const validationPayload = await encryptData({ check: "VALID" }, masterKey);
    
    await setDoc(userDocRef, { 
        encryptionSalt: salt,
        encryptedMasterKey: encryptedMasterKey, 
        encryptedValidator: validationPayload 
    }, { merge: true });

    return { status: 'success', masterKey, isNew: true };
  } 

  // B. UNLOCK FLOW (Existing Vault)
  try {
    const wrapperKey = await deriveKeyFromPasskey(password, salt);
    const masterKeyJWK = await decryptData(encryptedBlob, wrapperKey);
    
    if (!masterKeyJWK) throw new Error("WRONG_PASSWORD");
    
    masterKey = await importMasterKey(masterKeyJWK);
    
    if (userData.encryptedValidator) {
        const check = await decryptData(userData.encryptedValidator, masterKey);
        if (!check || check.check !== "VALID") throw new Error("INTEGRITY_FAIL");
    }

    return { status: 'success', masterKey, isNew: false };
  } catch (e) {
    throw new Error("WRONG_PASSWORD");
  }
};