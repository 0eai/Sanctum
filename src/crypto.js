// crypto.js

// Configuration
const ITERATIONS = 100000; // High iterations for security
const ALGO_NAME = "AES-GCM";
const HASH_NAME = "SHA-256";

// Helpers for ArrayBuffer <-> Base64 conversion
const buffToBase64 = (buff) => btoa(String.fromCharCode(...new Uint8Array(buff)));
const base64ToBuff = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export const generateSalt = () => {
  const randomValues = new Uint8Array(16);
  window.crypto.getRandomValues(randomValues);
  // Return as hex string for storage
  return Array.from(randomValues).map(b => b.toString(16).padStart(2, '0')).join('');
};

// 1. Derive a Cryptographic Key from the User's Passkey
// We do this ONCE when the user "Unlocks" the app
export const deriveKeyFromPasskey = async (passkey, saltString) => {
  const textEncoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passkey),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: textEncoder.encode(saltString), // <--- Use specific salt here
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// 2. Encrypt Data
// Returns: Base64 String containing [IV + Ciphertext]
export const encryptData = async (dataObj, cryptoKey) => {
  try {
    const textEncoder = new TextEncoder();
    const encodedData = textEncoder.encode(JSON.stringify(dataObj));

    // Generate a random initialization vector (IV) for every encryption
    // This ensures that encrypting the same data twice yields different results
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: ALGO_NAME, iv: iv },
      cryptoKey,
      encodedData
    );

    // Combine IV and Ciphertext
    const combined = new Uint8Array(iv.length + new Uint8Array(encryptedContent).length);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);

    return {
      encryptedData: buffToBase64(combined.buffer),
      isEncrypted: true,
      updatedAt: new Date() // Metadata kept clear for sorting
    };
  } catch (e) {
    console.error("Encryption Failed:", e);
    throw e;
  }
};

// 3. Decrypt Data
export const decryptData = async (docData, cryptoKey) => {
  if (!docData || !docData.isEncrypted || !docData.encryptedData) return docData;

  try {
    const combined = base64ToBuff(docData.encryptedData);

    // Extract IV (first 12 bytes)
    const iv = combined.slice(0, 12);
    // Extract Ciphertext (remaining bytes)
    const data = combined.slice(12);

    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: ALGO_NAME, iv: iv },
      cryptoKey,
      data
    );

    const textDecoder = new TextDecoder();
    const jsonString = textDecoder.decode(decryptedContent);
    return { ...docData, ...JSON.parse(jsonString) };
  } catch (e) {
    console.error("Decryption Failed (Wrong Key?):", e);
    return { ...docData, error: "Decryption Failed" };
  }
};