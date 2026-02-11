import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { 
  ChevronLeft, Key, LogOut, Shield, Save, Loader, AlertCircle, CheckCircle, 
  Wallet, List, Globe, Check 
} from 'lucide-react';

import { db, auth, appId } from './firebase';
import { Button, Input } from './components'; 
import { deriveKeyFromPasskey, generateSalt, encryptData, decryptData } from './crypto';

// Default Data
const DEFAULT_CURRENCIES = [
    { code: 'KRW', name: 'South Korean Won' },
    { code: 'INR', name: 'Indian Rupee' },
    { code: 'USD', name: 'US Dollar' },
    { code: 'EUR', name: 'Euro' },
    { code: 'JPY', name: 'Japanese Yen' },
    { code: 'GBP', name: 'British Pound' }
];

const DEFAULT_CATEGORIES = {
    income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'],
    expenses: ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Entertainment', 'Education'],
    investments: ['Stock', 'Crypto', 'Real Estate', 'Gold', 'Mutual Fund'],
    subscriptions: ['Streaming', 'Software', 'Gym', 'Internet']
};

const SettingsApp = ({ user, cryptoKey, onExit }) => {
  const [activeTab, setActiveTab] = useState('account'); 
  
  // --- Password State ---
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  
  // --- Finance State ---
  const [financeLoading, setFinanceLoading] = useState(true);
  const [financeSettings, setFinanceSettings] = useState({
      activeCurrencies: ['KRW'],
      categories: DEFAULT_CATEGORIES
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); 

  // --- Load Finance Settings ---
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const loadSettings = async () => {
        try {
            const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'finance_settings', 'config');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = await decryptData(snap.data(), cryptoKey);
                if (data) {
                    setFinanceSettings(prev => ({
                        ...prev,
                        ...data,
                        categories: { ...DEFAULT_CATEGORIES, ...data.categories }
                    }));
                }
            }
        } catch (e) {
            console.error("Load settings error", e);
        } finally {
            setFinanceLoading(false);
        }
    };
    loadSettings();
  }, [user, cryptoKey]);

  // --- Handlers ---

  const handleSaveFinance = async (e) => {
      e.preventDefault();
      setLoading(true);
      try {
          const encrypted = await encryptData(financeSettings, cryptoKey);
          await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'finance_settings', 'config'), encrypted);
          setMessage({ type: 'success', text: "Finance settings saved!" });
      } catch (err) {
          setMessage({ type: 'error', text: "Save failed." });
      } finally {
          setLoading(false);
      }
  };

  const handleCategoryChange = (type, strValue) => {
      const arr = strValue.split(',').map(s => s.trim()).filter(s => s !== "");
      setFinanceSettings(prev => ({
          ...prev,
          categories: { ...prev.categories, [type]: arr }
      }));
  };

  const toggleCurrency = (code) => {
      setFinanceSettings(prev => {
          const isActive = prev.activeCurrencies.includes(code);
          let newActive = isActive 
              ? prev.activeCurrencies.filter(c => c !== code)
              : [...prev.activeCurrencies, code];
          
          if (newActive.length === 0) newActive = ['KRW']; // Prevent empty
          return { ...prev, activeCurrencies: newActive };
      });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!oldPass || !newPass || !confirmPass) return setMessage({ type: 'error', text: "All fields are required." });
    if (newPass.length < 4) return setMessage({ type: 'error', text: "New passkey must be at least 4 characters." });
    if (newPass !== confirmPass) return setMessage({ type: 'error', text: "New passkeys do not match." });

    setLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) throw new Error("User data not found.");
      
      const { encryptionSalt, encryptedMasterKey } = userDoc.data();
      const oldWrapperKey = await deriveKeyFromPasskey(oldPass, encryptionSalt);
      const unlockedMasterKeyJWK = await decryptData(encryptedMasterKey, oldWrapperKey);
      
      if (!unlockedMasterKeyJWK) {
        setLoading(false);
        return setMessage({ type: 'error', text: "Current passkey is incorrect." });
      }

      const newSalt = generateSalt();
      const newWrapperKey = await deriveKeyFromPasskey(newPass, newSalt);
      const newEncryptedMasterKey = await encryptData(unlockedMasterKeyJWK, newWrapperKey);

      await setDoc(userDocRef, { encryptionSalt: newSalt, encryptedMasterKey: newEncryptedMasterKey }, { merge: true });
      setMessage({ type: 'success', text: "Passkey updated!" });
      setOldPass(""); setNewPass(""); setConfirmPass("");
    } catch (err) {
      setMessage({ type: 'error', text: "Failed: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden relative">
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={24} /></button>
            <h1 className="text-xl font-bold">Settings</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-smooth p-4">
        <div className="max-w-xl mx-auto space-y-6 pb-20">
          {message && (
            <div className={`p-4 rounded-xl text-sm flex items-center gap-3 shadow-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                {message.text}
            </div>
          )}

          <div className="flex p-1 bg-white rounded-xl border border-gray-200 shadow-sm">
              <button onClick={() => setActiveTab('account')} className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 ${activeTab === 'account' ? 'bg-[#4285f4] text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}><Shield size={16} /> Account</button>
              <button onClick={() => setActiveTab('finance')} className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 ${activeTab === 'finance' ? 'bg-[#4285f4] text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}><Wallet size={16} /> Finance</button>
          </div>

          {activeTab === 'account' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-bold text-gray-800 mb-4">Update Passkey</h2>
                <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                    <Input type="password" label="Current" value={oldPass} onChange={(e) => setOldPass(e.target.value)} />
                    <Input type="password" label="New" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                    <Input type="password" label="Confirm" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
                    <Button type="submit" disabled={loading} className="w-full mt-2">{loading ? "Updating..." : "Update"}</Button>
                </form>
                <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-sm text-gray-500">{user.email}</span>
                    <Button variant="danger" onClick={() => window.confirm("Sign out?") && signOut(auth)}><LogOut size={18} /> Sign Out</Button>
                </div>
            </div>
          )}

          {activeTab === 'finance' && !financeLoading && (
             <form onSubmit={handleSaveFinance} className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex gap-2 items-center"><Globe size={18} className="text-[#4285f4]"/><h2 className="font-bold text-gray-800">Currencies</h2></div>
                    <div className="p-4 grid grid-cols-2 gap-2">
                        {DEFAULT_CURRENCIES.map(curr => (
                            <button key={curr.code} type="button" onClick={() => toggleCurrency(curr.code)} className={`p-3 rounded-lg border text-sm font-bold flex justify-between items-center ${financeSettings.activeCurrencies.includes(curr.code) ? 'bg-blue-50 border-[#4285f4] text-[#4285f4]' : 'bg-white border-gray-200 text-gray-600'}`}>
                                <span>{curr.code} <span className="text-xs font-normal opacity-70 ml-1">({curr.name})</span></span>
                                {financeSettings.activeCurrencies.includes(curr.code) && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex gap-2 items-center"><List size={18} className="text-[#4285f4]"/><h2 className="font-bold text-gray-800">Categories (Comma separated)</h2></div>
                    <div className="p-4 space-y-4">
                        {Object.keys(DEFAULT_CATEGORIES).map(type => (
                            <div key={type}>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{type}</label>
                                <textarea className="w-full p-2 text-sm border border-gray-200 rounded-lg h-16 resize-none" value={financeSettings.categories[type]?.join(', ') || ''} onChange={(e) => handleCategoryChange(type, e.target.value)} />
                            </div>
                        ))}
                    </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full"><Save size={18} /> Save Settings</Button>
             </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default SettingsApp;