// src/components/system/LockScreen.jsx
import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Lock, RotateCcw, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { db } from '../../lib/firebase';
import {
  deriveKeyFromPasskey, deriveKeyArgon2id, generateSalt, encryptData, decryptData,
  generateMasterKey, exportKey, importMasterKey, getDefaultIterations
} from '../../lib/crypto';
import { resetUserVault, initializeUserKeys } from '../../services/firestoredb';
import { logActivity } from '../../services/activityLog';

// --- Rate Limiting ---
const RATE_LIMITS = [
  { attempts: 3, delay: 2 },
  { attempts: 5, delay: 5 },
  { attempts: 8, delay: 15 },
  { attempts: 10, delay: 60 },
];

const getDelay = (failCount) => {
  for (let i = RATE_LIMITS.length - 1; i >= 0; i--) {
    if (failCount >= RATE_LIMITS[i].attempts) return RATE_LIMITS[i].delay;
  }
  return 0;
};

// --- Passkey Strength ---
const getStrength = (passkey) => {
  if (!passkey || passkey.length === 0) return { label: '', color: '', width: '0%' };
  let score = 0;
  if (passkey.length >= 8) score++;
  if (passkey.length >= 12) score++;
  if (passkey.length >= 16) score++;
  if (/[A-Z]/.test(passkey) && /[a-z]/.test(passkey)) score++;
  if (/[0-9]/.test(passkey)) score++;
  if (/[^A-Za-z0-9]/.test(passkey)) score++;

  if (score <= 2) return { label: 'Weak', color: 'bg-red-500', width: '25%' };
  if (score <= 3) return { label: 'Fair', color: 'bg-yellow-500', width: '50%' };
  if (score <= 4) return { label: 'Strong', color: 'bg-blue-500', width: '75%' };
  return { label: 'Very Strong', color: 'bg-green-500', width: '100%' };
};

const MIN_PASSKEY_LENGTH = 8;

const LockScreen = ({ user, onUnlock, initialMessage }) => {
  const [keyInput, setKeyInput] = useState("");
  const [confirmKeyInput, setConfirmKeyInput] = useState("");
  const [isDeriving, setIsDeriving] = useState(false);
  const [status, setStatus] = useState(initialMessage || "");
  const [errorShake, setErrorShake] = useState(false);

  // Rate limiting state
  const [failCount, setFailCount] = useState(0);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const timerRef = useRef(null);

  // Is this a new user? (no keys stored yet)
  const [isNewUser, setIsNewUser] = useState(null);

  // Recovery Mode
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");

  // Check if user has existing keys
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const data = userDoc.exists() ? userDoc.data() : {};
      setIsNewUser(!data.encryptionSalt || !data.encryptedMasterKey);
    };
    check();
  }, [user]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownEnd <= Date.now()) {
      setCooldownRemaining(0);
      return;
    }
    const tick = () => {
      const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setCooldownRemaining(0);
        clearInterval(timerRef.current);
      } else {
        setCooldownRemaining(remaining);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => clearInterval(timerRef.current);
  }, [cooldownEnd]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit(e);
  };

  const handleHardReset = async () => {
    if (!window.confirm("⚠️ FACTORY RESET VAULT?\n\nThis will PERMANENTLY DELETE all data.\nAre you sure?")) return;

    setStatus("Wiping data...");
    setIsDeriving(true);

    try {
      await resetUserVault(user.uid);
      logActivity(user.uid, 'Vault Reset', 'danger', 'AlertTriangle');
      alert("Vault Reset Complete. All data erased.");
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert("Reset Error: " + e.message);
      setIsDeriving(false);
      setStatus("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (keyInput.length < MIN_PASSKEY_LENGTH) {
      setStatus(`Passkey must be at least ${MIN_PASSKEY_LENGTH} characters`);
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
      return;
    }

    // Rate limiting check
    if (cooldownRemaining > 0) return;

    setIsDeriving(true);
    setErrorShake(false);
    setStatus("Accessing vault...");

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.exists() ? userDoc.data() : {};

      let salt = userData.encryptionSalt;
      let encryptedMasterKeyBlob = userData.encryptedMasterKey;

      if (userData.lockoutUntil && userData.lockoutUntil > Date.now()) {
        const remaining = Math.ceil((userData.lockoutUntil - Date.now()) / 1000);
        setCooldownEnd(userData.lockoutUntil);
        setStatus(`Too many attempts. Wait ${remaining}s`);
        setIsDeriving(false);
        return;
      }

      // Case 1: New User / Reset Vault (Initialize)
      if (!salt || !encryptedMasterKeyBlob) {
        if (keyInput !== confirmKeyInput) {
          setStatus("Passkeys do not match");
          setErrorShake(true);
          setTimeout(() => setErrorShake(false), 500);
          setIsDeriving(false);
          return;
        }

        setStatus("Initializing Keys...");
        salt = generateSalt();
        const masterKey = await generateMasterKey();
        const wrapperKey = await deriveKeyArgon2id(keyInput, salt);
        const masterKeyJWK = await exportKey(masterKey);

        const encryptedMasterKey = await encryptData(masterKeyJWK, wrapperKey);
        const validationPayload = await encryptData({ check: "VALID" }, masterKey);

        await initializeUserKeys(user.uid, salt, encryptedMasterKey, validationPayload, "argon2id");
        setFailCount(0);
        onUnlock(masterKey);
      }
      // Case 2: Recovery Flow
      else if (isRecovering) {
        setStatus("Recovering Vault...");
        if (keyInput !== confirmKeyInput) {
          setStatus("New passkeys do not match");
          setErrorShake(true);
          setTimeout(() => setErrorShake(false), 500);
          setIsDeriving(false);
          return;
        }

        let masterKeyJWK;
        try {
          // The recovery key is the base64 encoded original JWK
          masterKeyJWK = JSON.parse(atob(recoveryInput));
        } catch (e) {
          throw new Error("INVALID_RECOVERY_KEY");
        }

        const masterKey = await importMasterKey(masterKeyJWK);

        // Verify validity of the parsed recovery key
        if (userData.encryptedValidator) {
          const check = await decryptData(userData.encryptedValidator, masterKey);
          if (!check || check.check !== "VALID") throw new Error("INTEGRITY_FAIL");
        }

        // Vault verified perfectly, now wrap the master key with the NEW passkey
        setStatus("Securing with new passkey...");
        const newSalt = generateSalt();
        const newWrapperKey = await deriveKeyArgon2id(keyInput, newSalt);
        const newEncryptedMasterKey = await encryptData(masterKeyJWK, newWrapperKey);

        await setDoc(userDocRef, {
          encryptionSalt: newSalt,
          encryptedMasterKey: newEncryptedMasterKey,
          kdf: "argon2id"
        }, { merge: true });

        if (userData.failedAttempts > 0) {
          await setDoc(userDocRef, { failedAttempts: 0, lockoutUntil: 0 }, { merge: true });
        }

        setFailCount(0);
        onUnlock(masterKey);
      }
      // Case 3: Existing User (Unlock normally)
      else {
        setStatus("Unlocking...");

        const kdf = userData.kdf || "pbkdf2";
        let wrapperKey;

        if (kdf === "argon2id") {
          wrapperKey = await deriveKeyArgon2id(keyInput, salt);
        } else {
          const storedIterations = userData.iterations || 100000;
          console.log("Using stored iterations:", storedIterations, "salt:", salt);
          wrapperKey = await deriveKeyFromPasskey(keyInput, salt, storedIterations);
          console.log("Wrapper key generated:", wrapperKey);
        }

        console.log("Attempting decryption with Blob:", encryptedMasterKeyBlob ? "exists" : "MISSING");
        const masterKeyJWK = await decryptData(encryptedMasterKeyBlob, wrapperKey);
        console.log("Decrypted JWK:", masterKeyJWK ? "SUCCESS" : "NULL");

        if (!masterKeyJWK) throw new Error("WRONG_PASSWORD");

        const masterKey = await importMasterKey(masterKeyJWK);

        if (userData.encryptedValidator) {
          const check = await decryptData(userData.encryptedValidator, masterKey);
          if (!check || check.check !== "VALID") throw new Error("INTEGRITY_FAIL");
        }

        // --- Migration: upgrade KDF to Argon2id if legacy PBKDF2 ---
        if (kdf !== "argon2id") {
          setStatus("Upgrading cryptography to Argon2id...");
          const newWrapperKey = await deriveKeyArgon2id(keyInput, salt);
          const newEncryptedMasterKey = await encryptData(masterKeyJWK, newWrapperKey);
          await setDoc(userDocRef, {
            encryptedMasterKey: newEncryptedMasterKey,
            kdf: "argon2id"
          }, { merge: true });
          console.log(`Migrated PBKDF2 → Argon2id`);
        }

        if (userData.failedAttempts > 0) {
          await setDoc(userDocRef, { failedAttempts: 0, lockoutUntil: 0 }, { merge: true });
        }

        setFailCount(0);
        onUnlock(masterKey);
      }
    } catch (error) {
      console.error("Auth failed:", error);
      setIsDeriving(false);

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const currentData = userDoc.exists() ? userDoc.data() : {};
        const newFailCount = (currentData.failedAttempts || 0) + 1;
        const delay = getDelay(newFailCount);
        const newLockoutUntil = delay > 0 ? Date.now() + delay * 1000 : 0;

        await setDoc(userDocRef, {
          failedAttempts: newFailCount,
          lockoutUntil: newLockoutUntil
        }, { merge: true });

        setFailCount(newFailCount);

        if (delay > 0) {
          setCooldownEnd(newLockoutUntil);
          setStatus(`Too many attempts. Wait ${delay}s`);
        } else {
          setStatus("Incorrect Passkey");
        }
      } catch (dbError) {
        console.error("Failed to update rate limit:", dbError);
        setStatus("Incorrect Passkey");
      }

      setErrorShake(true);
      logActivity(user.uid, 'Failed Passkey Attempt', 'danger', 'AlertTriangle');
      setTimeout(() => setErrorShake(false), 500);
    }
  };

  const strength = isNewUser ? getStrength(keyInput) : null;

  return (
    <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[#09090b] text-white p-6">
      <div className={`bg-[#18181b] p-8 rounded-3xl shadow-2xl max-w-sm w-full border border-[#27272a] transition-transform ${errorShake ? 'animate-shake' : ''}`}>
        <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_-5px_rgba(37,99,235,0.5)]">
          <Lock size={32} />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center tracking-tight">{isRecovering ? "Vault Recovery" : "Security Check"}</h2>
        <p className={`text-center mb-6 text-sm ${status === "Incorrect Passkey" || status === "INVALID_RECOVERY_KEY" || status.startsWith("Too many") ? "text-red-400 font-bold" : status === "Wiping data..." ? "text-red-400 animate-pulse" : status.startsWith("Passkey must") || status.startsWith("New passkey") ? "text-yellow-400" : "text-gray-400"}`}>
          {status || (isNewUser
            ? `Choose a passkey (min ${MIN_PASSKEY_LENGTH} characters)`
            : isRecovering ? "Paste Recovery Key & set a new passkey" : "Enter your session passkey to decrypt your data."
          )}
        </p>
        <form onSubmit={handleSubmit}>
          {isRecovering && (
            <textarea
              value={recoveryInput}
              onChange={(e) => { setRecoveryInput(e.target.value); if (status) setStatus(""); }}
              placeholder="Paste your Base64 recovery key..."
              className="w-full h-24 p-3 rounded-xl bg-black border border-[#27272a] text-white mb-4 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder-gray-600 font-mono text-xs resize-none"
              required
            />
          )}

          <input
            type="password"
            value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); if (status && status !== "Wiping data...") setStatus(""); }}
            onKeyDown={handleKeyDown}
            placeholder={isNewUser ? "Choose a Passkey" : isRecovering ? "New Passkey" : "Enter Passkey"}
            className="w-full p-4 rounded-xl bg-black border border-[#27272a] text-white mb-2 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder-gray-600 font-medium tracking-wide"
            autoFocus
          />

          {(isNewUser || isRecovering) && (
            <input
              type="password"
              value={confirmKeyInput}
              onChange={(e) => { setConfirmKeyInput(e.target.value); if (status && status !== "Wiping data...") setStatus(""); }}
              onKeyDown={handleKeyDown}
              placeholder="Confirm Passkey"
              className="w-full p-4 rounded-xl bg-black border border-[#27272a] text-white mb-2 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder-gray-600 font-medium tracking-wide"
            />
          )}

          {/* Strength Meter (new users or recovery) */}
          {(isNewUser || isRecovering) && keyInput.length > 0 && (
            <div className="mb-3">
              <div className="h-1 bg-[#27272a] rounded-full overflow-hidden">
                <div className={`h-full ${strength.color} rounded-full transition-all duration-300`} style={{ width: strength.width }} />
              </div>
              <div className="flex justify-between items-center mt-1.5">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">{strength.label}</span>
                <span className="text-[10px] text-gray-600">{keyInput.length} chars</span>
              </div>
            </div>
          )}

          {/* Character count for existing users */}
          {!isNewUser && !isRecovering && keyInput.length > 0 && keyInput.length < MIN_PASSKEY_LENGTH && (
            <div className="text-[10px] text-yellow-500/70 mb-2 text-right">{keyInput.length}/{MIN_PASSKEY_LENGTH} min chars</div>
          )}

          {!isNewUser && keyInput.length === 0 && <div className="mb-2" />}

          {/* Cooldown timer */}
          {cooldownRemaining > 0 && (
            <div className="flex items-center justify-center gap-2 bg-red-950/50 text-red-400 text-xs font-bold py-2 px-3 rounded-lg mb-3 border border-red-900/50">
              <ShieldAlert size={14} />
              Locked for {cooldownRemaining}s
            </div>
          )}

          <button
            type="submit"
            disabled={isDeriving || cooldownRemaining > 0}
            className="w-full py-4 bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-wait rounded-xl font-bold transition-all active:scale-[0.98]"
          >
            {isDeriving ? <span className="animate-pulse">Processing...</span> : cooldownRemaining > 0 ? "Locked" : isNewUser ? "Create Vault" : isRecovering ? "Recover & Unlock" : "Unlock Vault"}
          </button>
        </form>
        <div className="mt-8 flex justify-between items-center">
          {!isNewUser && (
            <button onClick={() => { setIsRecovering(!isRecovering); setStatus(''); setKeyInput(''); setConfirmKeyInput(''); }} className="text-[10px] uppercase tracking-widest text-[#4285f4] hover:text-blue-400 flex items-center gap-2 transition-colors font-semibold">
              <Key size={12} /> {isRecovering ? "Cancel Recovery" : "Forgot Passkey?"}
            </button>
          )}
          <button onClick={handleHardReset} className="text-[10px] uppercase tracking-widest text-gray-600 hover:text-red-500 flex items-center gap-2 transition-colors font-semibold ml-auto">
            <RotateCcw size={12} /> Reset Vault
          </button>
        </div>
      </div>
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } } .animate-shake { animation: shake 0.4s ease-in-out; }`}</style>
    </div>
  );
};

export default LockScreen;