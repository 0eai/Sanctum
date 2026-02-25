// src/components/system/LockScreen.jsx
import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Lock, RotateCcw, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { db } from '../../lib/firebase';
import {
  deriveKeyFromPasskey, generateSalt, encryptData, decryptData,
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

      // Case 1: New User / Reset Vault (Initialize)
      if (!salt || !encryptedMasterKeyBlob) {
        setStatus("Initializing Keys...");
        salt = generateSalt();
        const iterations = getDefaultIterations();
        const masterKey = await generateMasterKey();
        const wrapperKey = await deriveKeyFromPasskey(keyInput, salt, iterations);
        const masterKeyJWK = await exportKey(masterKey);

        const encryptedMasterKey = await encryptData(masterKeyJWK, wrapperKey);
        const validationPayload = await encryptData({ check: "VALID" }, masterKey);

        await initializeUserKeys(user.uid, salt, encryptedMasterKey, validationPayload, iterations);
        setFailCount(0);
        onUnlock(masterKey);
      }
      // Case 2: Existing User (Unlock)
      else {
        setStatus("Unlocking...");

        // Use stored iterations or fallback to legacy 100k
        const storedIterations = userData.iterations || 100000;
        const wrapperKey = await deriveKeyFromPasskey(keyInput, salt, storedIterations);
        const masterKeyJWK = await decryptData(encryptedMasterKeyBlob, wrapperKey);

        if (!masterKeyJWK) throw new Error("WRONG_PASSWORD");

        const masterKey = await importMasterKey(masterKeyJWK);

        if (userData.encryptedValidator) {
          const check = await decryptData(userData.encryptedValidator, masterKey);
          if (!check || check.check !== "VALID") throw new Error("INTEGRITY_FAIL");
        }

        // --- Migration: upgrade iterations if below current default ---
        const defaultIterations = getDefaultIterations();
        if (storedIterations < defaultIterations) {
          setStatus("Upgrading security...");
          const newWrapperKey = await deriveKeyFromPasskey(keyInput, salt, defaultIterations);
          const newEncryptedMasterKey = await encryptData(masterKeyJWK, newWrapperKey);
          await setDoc(userDocRef, {
            encryptedMasterKey: newEncryptedMasterKey,
            iterations: defaultIterations,
          }, { merge: true });
          console.log(`Migrated PBKDF2: ${storedIterations} → ${defaultIterations}`);
        }

        setFailCount(0);
        onUnlock(masterKey);
      }
    } catch (error) {
      console.error("Auth failed:", error);
      const newFailCount = failCount + 1;
      setFailCount(newFailCount);
      setIsDeriving(false);

      const delay = getDelay(newFailCount);
      if (delay > 0) {
        setCooldownEnd(Date.now() + delay * 1000);
        setStatus(`Too many attempts. Wait ${delay}s`);
      } else {
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
        <h2 className="text-2xl font-bold mb-2 text-center tracking-tight">Security Check</h2>
        <p className={`text-center mb-6 text-sm ${status === "Incorrect Passkey" || status.startsWith("Too many") ? "text-red-400 font-bold" : status === "Wiping data..." ? "text-red-400 animate-pulse" : status.startsWith("Passkey must") ? "text-yellow-400" : "text-gray-400"}`}>
          {status || (isNewUser
            ? `Choose a passkey (min ${MIN_PASSKEY_LENGTH} characters)`
            : "Enter your session passkey to decrypt your data."
          )}
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); if (status && status !== "Wiping data...") setStatus(""); }}
            onKeyDown={handleKeyDown}
            placeholder={isNewUser ? "Choose a Passkey" : "Enter Passkey"}
            className="w-full p-4 rounded-xl bg-black border border-[#27272a] text-white mb-2 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder-gray-600 font-medium tracking-wide"
            autoFocus
          />

          {/* Strength Meter (new users only) */}
          {isNewUser && keyInput.length > 0 && (
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
          {!isNewUser && keyInput.length > 0 && keyInput.length < MIN_PASSKEY_LENGTH && (
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
            {isDeriving ? <span className="animate-pulse">Processing...</span> : cooldownRemaining > 0 ? "Locked" : isNewUser ? "Create Vault" : "Unlock Vault"}
          </button>
        </form>
        <div className="mt-8 text-center">
          <button onClick={handleHardReset} className="text-[10px] uppercase tracking-widest text-gray-600 hover:text-red-500 flex items-center justify-center gap-2 mx-auto transition-colors font-semibold">
            <RotateCcw size={12} /> Reset Vault
          </button>
        </div>
      </div>
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } } .animate-shake { animation: shake 0.4s ease-in-out; }`}</style>
    </div>
  );
};

export default LockScreen;