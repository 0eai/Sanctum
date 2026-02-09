// crypto.js

// Configuration
const ITERATIONS = 100000; 
const ALGO_NAME = "AES-GCM";
const HASH_NAME = "SHA-256";

// --- Helpers for Large Buffer Handling ---
const bufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 32768; 
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
};

const base64ToBuffer = (base64) => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// --- Key Management ---

export const generateSalt = () => {
  const randomValues = new Uint8Array(16);
  window.crypto.getRandomValues(randomValues);
  return Array.from(randomValues).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const generateMasterKey = async () => {
  return window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, 
    ["encrypt", "decrypt"]
  );
};

// *** THIS WAS MISSING ***
export const exportKey = async (key) => {
  return window.crypto.subtle.exportKey("jwk", key);
};

export const importMasterKey = async (jwkData) => {
  return window.crypto.subtle.importKey(
    "jwk",
    jwkData,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
};

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
      salt: textEncoder.encode(saltString),
      iterations: ITERATIONS,
      hash: HASH_NAME
    },
    keyMaterial,
    { name: ALGO_NAME, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// --- Encryption / Decryption ---

export const encryptData = async (data, key) => {
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: ALGO_NAME, iv: iv },
    key,
    encoded
  );

  return {
    iv: bufferToBase64(iv),
    data: bufferToBase64(encrypted)
  };
};

export const decryptData = async (encryptedObj, key) => {
  try {
    if (!encryptedObj || !encryptedObj.iv || !encryptedObj.data) return null;
    
    const iv = base64ToBuffer(encryptedObj.iv);
    const data = base64ToBuffer(encryptedObj.data);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: ALGO_NAME, iv: iv },
      key,
      data
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    console.error("Decryption failed", e);
    return null;
  }
};

export const keyToUrlString = async (key) => {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  const bytes = new Uint8Array(exported);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // URL-safe Base64
};

// Import a Base64 String back to a Key object
export const keyFromUrlString = async (base64) => {
  // Add padding back if needed
  let str = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  
  const binary_string = window.atob(str);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  
  return window.crypto.subtle.importKey(
    "raw",
    bytes.buffer,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};