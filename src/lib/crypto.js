// crypto.js
import { argon2id } from 'hash-wasm';
// Configuration
const DEFAULT_ITERATIONS = 600000; // OWASP 2024 recommendation for SHA-256
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

export const getDefaultIterations = () => DEFAULT_ITERATIONS;

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

export const deriveKeyFromPasskey = async (passkey, saltString, iterations = DEFAULT_ITERATIONS) => {
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
      iterations: iterations,
      hash: HASH_NAME
    },
    keyMaterial,
    { name: ALGO_NAME, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

export const deriveKeyArgon2id = async (passkey, saltString) => {
  const salt = new TextEncoder().encode(saltString);
  const hash = await argon2id({
    password: passkey,
    salt: salt,
    iterations: 3,
    memorySize: 65536, // 64 MB
    parallelism: 1,
    hashLength: 32,    // 256-bit key
    outputType: 'binary',
  });

  return window.crypto.subtle.importKey(
    "raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
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

// --- RSA Key Management for E2EE ---

export const generateRSAKeyPair = async () => {
  return window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
};

export const exportRSAPublicKey = async (publicKey) => {
  const exported = await window.crypto.subtle.exportKey("spki", publicKey);
  return bufferToBase64(exported);
};

export const exportRSAPrivateKey = async (privateKey) => {
  const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  return bufferToBase64(exported);
};

export const importRSAPublicKey = async (base64) => {
  const buffer = base64ToBuffer(base64);
  return window.crypto.subtle.importKey(
    "spki",
    buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
};

export const importRSAPrivateKey = async (base64) => {
  const buffer = base64ToBuffer(base64);
  return window.crypto.subtle.importKey(
    "pkcs8",
    buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
};

// --- RSA Encryption / Decryption ---

export const encryptRSA = async (dataString, publicKey) => {
  const encoded = new TextEncoder().encode(dataString);
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP"
    },
    publicKey,
    encoded
  );
  return bufferToBase64(encrypted);
};

export const decryptRSA = async (base64EncryptedData, privateKey) => {
  try {
    const buffer = base64ToBuffer(base64EncryptedData);
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP"
      },
      privateKey,
      buffer
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("RSA Decryption failed", e);
    return null;
  }
};

// --- ECDH (Elliptic Curve Diffie-Hellman) for Forward Secrecy ---

export const generateECDHKeyPair = async () => {
  return window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
};

export const exportECDHPublicKey = async (publicKey) => {
  const exported = await window.crypto.subtle.exportKey("spki", publicKey);
  return bufferToBase64(exported);
};

export const exportECDHPrivateKey = async (privateKey) => {
  const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  return bufferToBase64(exported);
};

export const importECDHPublicKey = async (base64) => {
  const buffer = base64ToBuffer(base64);
  return window.crypto.subtle.importKey(
    "spki",
    buffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
};

export const importECDHPrivateKey = async (base64) => {
  const buffer = base64ToBuffer(base64);
  return window.crypto.subtle.importKey(
    "pkcs8",
    buffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
};

export const deriveECDHSharedSecret = async (privateKey, publicKey) => {
  return window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: publicKey
    },
    privateKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
};