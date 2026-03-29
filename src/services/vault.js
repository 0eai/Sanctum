// src/services/vault.js
import {
  doc, getDoc, setDoc, deleteField, collection, getDocs, query
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import {
  deriveKeyFromPasskey, deriveKeyArgon2id, generateSalt, generateMasterKey,
  exportKey, importMasterKey, encryptData, decryptData
} from '../lib/crypto';
import { deleteInChunks } from '../lib/firestore';
import { APP_COLLECTIONS } from '../lib/appCollections';

// Service: Hard Reset the Vault
export const resetUserVault = async (userId) => {
  const appCollections = APP_COLLECTIONS;

  // 1. Batch delete all app sub-collections (chunked for >500 docs)
  for (const colName of appCollections) {
    const snapshot = await getDocs(query(collection(db, 'artifacts', appId, 'users', userId, colName)));
    if (!snapshot.empty) {
      await deleteInChunks(snapshot.docs.map(d => d.ref));
    }
  }

  // 2. Reset User Doc (clear encryption keys)
  const userDocRef = doc(db, 'users', userId);
  await setDoc(userDocRef, {
    encryptionSalt: deleteField(),
    encryptedMasterKey: deleteField(),
    encryptedValidator: deleteField(),
    kdf: deleteField(),
    iterations: deleteField(),
    failedAttempts: deleteField(),
    lockoutUntil: deleteField(),
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
    const wrapperKey = await deriveKeyArgon2id(password, salt);
    const masterKeyJWK = await exportKey(masterKey);

    const encryptedMasterKey = await encryptData(masterKeyJWK, wrapperKey);
    const validationPayload = await encryptData({ check: "VALID" }, masterKey);

    await setDoc(userDocRef, {
        encryptionSalt: salt,
        encryptedMasterKey: encryptedMasterKey,
        encryptedValidator: validationPayload,
        kdf: "argon2id"
    }, { merge: true });

    return { status: 'success', masterKey, isNew: true };
  }

  // B. UNLOCK FLOW (Existing Vault)
  try {
    const kdf = userData.kdf || "pbkdf2";
    const wrapperKey = kdf === "argon2id"
      ? await deriveKeyArgon2id(password, salt)
      : await deriveKeyFromPasskey(password, salt, userData.iterations);
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