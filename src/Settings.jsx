import React, { useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { 
  ChevronLeft, Key, LogOut, Shield, Save, Loader, AlertCircle, CheckCircle 
} from 'lucide-react';

import { db, auth } from './firebase';
import { Button, Input } from './components'; // Assuming you have these from previous files
import { deriveKeyFromPasskey, generateSalt, encryptData, decryptData } from './crypto';

const SettingsApp = ({ user, onExit }) => {
  // State for Password Change
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

  // --- Handlers ---

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMessage(null);

    // 1. Basic Validation
    if (!oldPass || !newPass || !confirmPass) {
        setMessage({ type: 'error', text: "All fields are required." });
        return;
    }
    if (newPass.length < 4) {
        setMessage({ type: 'error', text: "New passkey must be at least 4 characters." });
        return;
    }
    if (newPass !== confirmPass) {
        setMessage({ type: 'error', text: "New passkeys do not match." });
        return;
    }

    setLoading(true);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) throw new Error("User data not found.");
      
      const { encryptionSalt, encryptedMasterKey } = userDoc.data();

      // 2. Verify Old Password (by trying to unlock the Master Key)
      // Derive the wrapper key using the OLD password and EXISTING salt
      const oldWrapperKey = await deriveKeyFromPasskey(oldPass, encryptionSalt);
      
      // Attempt to decrypt the Master Key
      const unlockedMasterKeyJWK = await decryptData(encryptedMasterKey, oldWrapperKey);
      
      // If decryption returns null, the password was wrong
      if (!unlockedMasterKeyJWK) {
        setMessage({ type: 'error', text: "Current passkey is incorrect." });
        setLoading(false);
        return;
      }

      // 3. Generate NEW Security Params
      const newSalt = generateSalt();
      const newWrapperKey = await deriveKeyFromPasskey(newPass, newSalt);

      // 4. Re-Encrypt the Master Key
      // We take the JWK we just successfully decrypted and wrap it with the NEW key
      const newEncryptedMasterKey = await encryptData(unlockedMasterKeyJWK, newWrapperKey);

      // 5. Save to Firestore
      // We only update the salt and the wrapped key. The actual data in other apps remains untouched.
      await setDoc(userDocRef, {
        encryptionSalt: newSalt,
        encryptedMasterKey: newEncryptedMasterKey
      }, { merge: true });

      setMessage({ type: 'success', text: "Passkey changed successfully!" });
      setOldPass("");
      setNewPass("");
      setConfirmPass("");

    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: "Failed to change passkey. " + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    if (window.confirm("Are you sure you want to sign out?")) {
        signOut(auth);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden relative">
      
      {/* Header */}
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-xl font-bold flex items-center gap-2">Settings</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-xl mx-auto space-y-6">
          
          {/* Section: Security */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <div className="bg-blue-50 p-2 rounded-lg text-[#4285f4]">
                    <Shield size={20} />
                </div>
                <h2 className="font-bold text-gray-800">Security</h2>
            </div>
            
            <div className="p-6">
                <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Change Passkey</h3>
                    
                    {message && (
                        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            {message.text}
                        </div>
                    )}

                    <div className="space-y-3">
                        <Input 
                            type="password" 
                            label="Current Passkey" 
                            value={oldPass} 
                            onChange={(e) => setOldPass(e.target.value)} 
                            placeholder="Enter current passkey"
                        />
                        <div className="h-px bg-gray-100 my-2"></div>
                        <Input 
                            type="password" 
                            label="New Passkey" 
                            value={newPass} 
                            onChange={(e) => setNewPass(e.target.value)} 
                            placeholder="Min 4 characters"
                        />
                        <Input 
                            type="password" 
                            label="Confirm New Passkey" 
                            value={confirmPass} 
                            onChange={(e) => setConfirmPass(e.target.value)} 
                            placeholder="Re-enter new passkey"
                        />
                    </div>

                    <Button type="submit" disabled={loading} className="w-full mt-2 flex items-center justify-center gap-2">
                        {loading ? <Loader className="animate-spin" size={18} /> : <Save size={18} />}
                        {loading ? "Updating..." : "Update Passkey"}
                    </Button>
                </form>
            </div>
          </div>

          {/* Section: Account */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <div className="bg-gray-100 p-2 rounded-lg text-gray-600">
                    <Key size={20} />
                </div>
                <h2 className="font-bold text-gray-800">Account</h2>
            </div>
            <div className="p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-900">Signed in as</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                    <Button variant="danger" onClick={handleSignOut} className="flex items-center gap-2">
                        <LogOut size={18} /> Sign Out
                    </Button>
                </div>
            </div>
          </div>

          {/* Info Footer */}
          <div className="text-center text-xs text-gray-400 py-4">
            <p>App Suite v2.0 • Secure Client-Side Encryption</p>
          </div>

        </div>
      </main>
    </div>
  );
};

export default SettingsApp;