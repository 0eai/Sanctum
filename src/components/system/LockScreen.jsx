// src/components/system/LockScreen.jsx
import React, { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Lock, RotateCcw } from 'lucide-react';
import { db } from '../../lib/firebase';
import { 
  deriveKeyFromPasskey, generateSalt, encryptData, decryptData, 
  generateMasterKey, exportKey, importMasterKey 
} from '../../lib/crypto';
import { resetUserVault, initializeUserKeys } from '../../services/firestoredb'; // Imported service

const LockScreen = ({ user, onUnlock, initialMessage }) => {
  const [keyInput, setKeyInput] = useState(""); 
  const [isDeriving, setIsDeriving] = useState(false);
  const [status, setStatus] = useState(initialMessage || ""); 
  const [errorShake, setErrorShake] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit(e);
  };

  const handleHardReset = async () => {
    if (!window.confirm("⚠️ FACTORY RESET VAULT?\n\nThis will PERMANENTLY DELETE all data.\nAre you sure?")) return;

    setStatus("Wiping data...");
    setIsDeriving(true); 

    try {
        await resetUserVault(user.uid);
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
    if (keyInput.length < 4) return;
    
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
        const masterKey = await generateMasterKey();
        const wrapperKey = await deriveKeyFromPasskey(keyInput, salt);
        const masterKeyJWK = await exportKey(masterKey);
        
        const encryptedMasterKey = await encryptData(masterKeyJWK, wrapperKey);
        const validationPayload = await encryptData({ check: "VALID" }, masterKey);
        
        await initializeUserKeys(user.uid, salt, encryptedMasterKey, validationPayload);
        onUnlock(masterKey);
      } 
      // Case 2: Existing User (Unlock)
      else {
        setStatus("Unlocking...");
        const wrapperKey = await deriveKeyFromPasskey(keyInput, salt);
        const masterKeyJWK = await decryptData(encryptedMasterKeyBlob, wrapperKey);
        
        if (!masterKeyJWK) throw new Error("WRONG_PASSWORD");
        
        const masterKey = await importMasterKey(masterKeyJWK);
        
        if (userData.encryptedValidator) {
            const check = await decryptData(userData.encryptedValidator, masterKey);
            if (!check || check.check !== "VALID") throw new Error("INTEGRITY_FAIL");
        }
        onUnlock(masterKey);
      }
    } catch (error) {
      console.error("Auth failed:", error);
      setIsDeriving(false);
      setStatus("Incorrect Passkey");
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[#09090b] text-white p-6">
      <div className={`bg-[#18181b] p-8 rounded-3xl shadow-2xl max-w-sm w-full border border-[#27272a] transition-transform ${errorShake ? 'animate-shake' : ''}`}>
        <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_-5px_rgba(37,99,235,0.5)]">
          <Lock size={32} />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center tracking-tight">Security Check</h2>
        <p className={`text-center mb-6 text-sm ${status === "Incorrect Passkey" ? "text-red-400 font-bold" : status === "Wiping data..." ? "text-red-400 animate-pulse" : "text-gray-400"}`}>
          {status || "Enter your session passkey to decrypt your data."}
        </p>
        <form onSubmit={handleSubmit}>
          <input 
            type="password"
            value={keyInput} 
            onChange={(e) => { setKeyInput(e.target.value); if(status && status !== "Wiping data...") setStatus(""); }}
            onKeyDown={handleKeyDown}
            placeholder="Enter Passkey"
            className="w-full p-4 rounded-xl bg-black border border-[#27272a] text-white mb-4 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder-gray-600 font-medium tracking-wide"
            autoFocus
          />
          <button type="submit" disabled={isDeriving} className="w-full py-4 bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-wait rounded-xl font-bold transition-all active:scale-[0.98]">
            {isDeriving ? <span className="animate-pulse">Processing...</span> : "Unlock Vault"}
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