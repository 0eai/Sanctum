// src/services/firebaseStorage.js
import { ref, uploadBytesResumable, getDownloadURL, getBlob, deleteObject } from 'firebase/storage';
import { storage, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

// Reusing same signature as driveStorage.js functions for interoperability.

// Helper to determine the actual storage path to use.
// If fileId/scope contains a slash, it's treated as a relative scoped path.
const getStoragePath = (fileIdOrScope, appName) => {
    if (fileIdOrScope && /(?:^|\/)\.\.(?:\/|$)/.test(fileIdOrScope)) {
        throw new Error('Invalid file path: path traversal detected');
    }
    if (!fileIdOrScope) return `artifacts/${appId}/${appName}/unknown`;
    if (fileIdOrScope.includes('/')) {
        // e.g., workspaces/123/notes/uuid-1234
        return `artifacts/${appId}/${fileIdOrScope}`;
    }
    // Legacy generic path
    return `artifacts/${appId}/${appName}/${fileIdOrScope}`;
};

export const uploadEncryptedFile = async (file, masterKey, accessToken, scopeOrAppName = 'misc') => {
    // Read the File as ArrayBuffer and encrypt it natively (same AES-GCM as driveStorage)
    const arrayBuffer = await file.arrayBuffer();

    // We import encryptData from crypto.js, but beware that encryptData normally encodes as B64 string
    // Here we'll just encrypt its ArrayBuffer exactly how driveStorage does it manually, to be compatible.

    // Actually driveStorage does manual AES-GCM encryption returning a Blob. Let's replicate it here.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        masterKey,
        arrayBuffer
    );

    const ivAndEncryptedData = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    ivAndEncryptedData.set(iv, 0);
    ivAndEncryptedData.set(new Uint8Array(encryptedBuffer), iv.length);
    const encryptedBlob = new Blob([ivAndEncryptedData], { type: 'application/octet-stream' });

    // Ensure we don't upload file metadata like name in plaintext.
    const uuid = crypto.randomUUID();

    // If scopeOrAppName is something like "workspaces/1abc234", append the app specific string
    // But since `scopeOrAppName` from the apps might already have "notes" or just be "notes",
    // We expect the caller to pass: "workspaces/123/notes" or just "notes".
    let storagePathSuffix = scopeOrAppName;
    if (scopeOrAppName.includes('/')) {
        storagePathSuffix = `${scopeOrAppName}/${uuid}`;
    } else {
        storagePathSuffix = `${scopeOrAppName}/${uuid}`; // Legacy standard
    }

    const storageRef = ref(storage, getStoragePath(storagePathSuffix, null));

    // Upload to Firebase Storage
    const metadata = {
        // Omitting customMetadata to ensure file name and type remain anonymized on the backend
        contentType: 'application/octet-stream' // Always generic
    };

    await uploadBytesResumable(storageRef, encryptedBlob, metadata);

    // Return the minimal shape matching Drive response so components don't crash
    // We return the storagePathSuffix as the 'id' so future downloads know where to look.
    return {
        id: storagePathSuffix,
        mimeType: file.type || 'application/octet-stream',
        name: file.name,
        size: file.size
    };
};

export const downloadEncryptedFileBlob = async (fileId, masterKey, accessToken, appName = 'misc') => {
    const storageRef = ref(storage, getStoragePath(fileId, appName));

    // Get the encrypted blob from Firebase
    const encryptedBlob = await getBlob(storageRef);
    const buffer = await encryptedBlob.arrayBuffer();

    const iv = new Uint8Array(buffer.slice(0, 12));
    const data = new Uint8Array(buffer.slice(12));

    try {
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            masterKey,
            data
        );
        // We can't automatically infer the original MIME type strictly from the blob,
        // but it doesn't matter for the raw Blob return as long as the caller handles it.
        return new Blob([decryptedBuffer], { type: 'application/octet-stream' });
    } catch (error) {
        console.error("Firebase Storage Decryption failed", error);
        throw new Error('Decryption Failed');
    }
};

export const downloadEncryptedFile = async (fileId, masterKey, accessToken, appName = 'misc') => {
    const decryptedBlob = await downloadEncryptedFileBlob(fileId, masterKey, accessToken, appName);
    return URL.createObjectURL(decryptedBlob);
};

export const deleteFirebaseFile = async (fileId, appName = 'misc') => {
    if (!fileId) return;
    const storageRef = ref(storage, getStoragePath(fileId, appName));
    try {
        await deleteObject(storageRef);
    } catch (e) {
        console.warn(`Failed to delete Firebase file ${fileId}`, e);
    }
};

export const uploadNormalFile = async (file, cryptoKey, accessToken, scopeOrAppName = 'misc') => {
    const uuid = crypto.randomUUID();
    let storagePathSuffix = scopeOrAppName;
    if (scopeOrAppName.includes('/')) {
        storagePathSuffix = `${scopeOrAppName}/${uuid}`;
    } else {
        storagePathSuffix = `${scopeOrAppName}/${uuid}`;
    }

    const storageRef = ref(storage, getStoragePath(storagePathSuffix, null));

    const metadata = {
        contentType: file.type || 'application/octet-stream'
    };

    await uploadBytesResumable(storageRef, file, metadata);
    return storagePathSuffix;
};

export const downloadNormalFileBlob = async (fileId, cryptoKey, accessToken, appName = 'misc') => {
    const storageRef = ref(storage, getStoragePath(fileId, appName));
    return await getBlob(storageRef);
};

export const downloadNormalFile = async (fileId, cryptoKey, accessToken, appName = 'misc') => {
    const blob = await downloadNormalFileBlob(fileId, cryptoKey, accessToken, appName);
    return URL.createObjectURL(blob);
};

// =============================================
// SECURESHARE APP LOGIC API COMPATIBILITY
// =============================================

export const uploadShareableFile = async (file, cryptoKey, accessToken, chatId) => {
    // Generate an ephemeral AES key for this specific file
    const ephemeralKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    // Export raw key bytes and encrypt the file
    const rawEphemeralBytes = await crypto.subtle.exportKey('raw', ephemeralKey);
    const arrayBuffer = await file.arrayBuffer();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        ephemeralKey,
        arrayBuffer
    );

    const payload = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(encryptedBuffer), iv.length);
    const encryptedBlob = new Blob([payload], { type: 'application/octet-stream' });

    const fileId = crypto.randomUUID();
    const storageRef = ref(storage, `artifacts/${appId}/secureshare/${chatId}/${fileId}`);

    const metadata = {
        contentType: 'application/octet-stream' // Always generic for encrypted blob
    };

    await uploadBytesResumable(storageRef, encryptedBlob, metadata);

    // Now encrypt the ephemeral key using the chat's RSA/Shared crypto wrapper key provided
    const encryptedEphemeralKeyBase64 = await encryptData(Array.from(rawEphemeralBytes), cryptoKey);

    return {
        id: fileId,
        encryptedKey: encryptedEphemeralKeyBase64,
        mimeType: file.type,
        name: file.name,
        size: file.size
    };
};

export const downloadShareableFileBlob = async (fileId, fileKeyBase64, cryptoKey, chatId) => {
    // Decrypt the ephemeral AES key utilizing the chat's cryptoKey
    const rawEphemeralBytesArray = await decryptData(fileKeyBase64, cryptoKey);
    const rawEphemeralBytes = new Uint8Array(rawEphemeralBytesArray);

    const ephemeralKey = await crypto.subtle.importKey(
        'raw',
        rawEphemeralBytes,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );

    const storageRef = ref(storage, `artifacts/${appId}/secureshare/${chatId}/${fileId}`);
    const encryptedBlob = await getBlob(storageRef);

    const buffer = await encryptedBlob.arrayBuffer();
    const iv = new Uint8Array(buffer.slice(0, 12));
    const data = new Uint8Array(buffer.slice(12));

    try {
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            ephemeralKey,
            data
        );
        return new Blob([decryptedBuffer], { type: 'application/octet-stream' });
    } catch (e) {
        console.error('Shareable Firebase File Decryption failed', e);
        throw new Error('Decryption Failed');
    }
};
