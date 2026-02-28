import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { appId } from '../lib/firebase';
import { generateSalt } from '../lib/crypto'; // Local re-use for UUID/randomness if needed

// Generate a random AES key for file wrapping
export const generateFileKey = async () => {
    return await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
};

// Export the key to raw bytes for storage inside the encrypted Firestore document
export const exportFileKey = async (key) => {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return btoa(String.fromCharCode(...new Uint8Array(exported))); // Base64
};

// Import the raw bytes back into an AES key
export const importFileKey = async (base64Key) => {
    const binaryStr = atob(base64Key);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return await window.crypto.subtle.importKey(
        "raw",
        bytes.buffer,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
};

// Encrypt a file (Blob/File) using AES-GCM
export const encryptFile = async (file, key) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const data = await file.arrayBuffer();

    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
    );

    // Prepend IV to ciphertext for storage
    const payload = new Uint8Array(iv.length + ciphertext.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.length);

    return new Blob([payload], { type: 'application/octet-stream' });
};

// Upload the encrypted Blob to Firebase Storage
export const uploadEncryptedPdf = async (userId, paperId, encryptedBlob) => {
    const storage = getStorage();
    // Unique filename to avoid collisions
    const filename = `${Date.now()}_paper.enc`;
    const storageRef = ref(storage, `artifacts/${appId}/users/${userId}/research/${paperId}/${filename}`);

    const snapshot = await uploadBytes(storageRef, encryptedBlob);
    return await getDownloadURL(snapshot.ref);
};

// Decrypt a file (Blob/File) using AES-GCM
export const decryptFile = async (encryptedBlob, base64Key) => {
    const key = await importFileKey(base64Key);
    const data = await encryptedBlob.arrayBuffer();

    // Create a pristine copy of the bytes using slice to bypass offset/padding issues
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);

    try {
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            ciphertext
        );

        return new Blob([decrypted], { type: 'application/pdf' });
    } catch (e) {
        console.error("Decryption failed during subtle.decrypt", e);
        throw e;
    }
};
