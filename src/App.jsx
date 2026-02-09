import React, { useState, useEffect } from 'react';
import { 
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot,
  doc, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';
import { 
  TrendingUp, CheckSquare, Key, Bell, Sliders, Lock, LogIn, LogOut, Grid, Cloud, Cast, Bookmark, FileText
} from 'lucide-react';

import { auth, db, appId } from './firebase';
import { Button, LoadingSpinner } from './components';
import ChecklistApp from './Checklist'; 
import CounterApp from './Counter';
import BookmarksApp from './Bookmarks';
import NotesApp from './Notes';
import { deriveKeyFromPasskey, generateSalt, encryptData, decryptData } from './crypto';

// --- Lock Screen Component ---
const LockScreen = ({ user, onUnlock, initialMessage }) => {
  const [keyInput, setKeyInput] = useState(""); 
  const [isDeriving, setIsDeriving] = useState(false);
  const [status, setStatus] = useState(initialMessage || ""); 
  const [errorShake, setErrorShake] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
        handleSubmit(e);
    }
    };
  // Clear "Session expired" message when typing starts
  const handleInputChange = (e) => {
    setKeyInput(e.target.value);
    if (status === initialMessage) setStatus("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (keyInput.length < 4) return;
    
    setIsDeriving(true);
    setErrorShake(false);
    setStatus("Checking security profile...");

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.exists() ? userDoc.data() : {};
      
      let salt = userData.encryptionSalt;
      let validator = userData.encryptedValidator;

      if (!salt) {
        setStatus("Initializing new vault...");
        salt = generateSalt();
        const cryptoKey = await deriveKeyFromPasskey(keyInput, salt);
        const validationPayload = await encryptData({ check: "VALID" }, cryptoKey);
        await setDoc(userDocRef, { encryptionSalt: salt, encryptedValidator: validationPayload }, { merge: true });
        onUnlock(cryptoKey);
      } else {
        setStatus("Verifying passkey...");
        const cryptoKey = await deriveKeyFromPasskey(keyInput, salt);
        if (validator) {
            const result = await decryptData(validator, cryptoKey);
            if (!result || result.check !== "VALID") throw new Error("WRONG_PASSWORD");
        } else {
            const validationPayload = await encryptData({ check: "VALID" }, cryptoKey);
            await setDoc(userDocRef, { encryptedValidator: validationPayload }, { merge: true });
        }
        onUnlock(cryptoKey);
      }
    } catch (error) {
      console.error("Auth failed:", error);
      setIsDeriving(false);
      setStatus("");
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
      if (error.message === "WRONG_PASSWORD" || error.message.includes("Decryption Failed")) {
          alert("Incorrect Passkey.");
      } else {
          alert("Security Error: " + error.message);
      }
    }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-900 text-white p-6">
      <div className={`bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-700 transition-transform ${errorShake ? 'animate-shake' : ''}`}>
        <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-900/50">
          <Lock size={32} />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center">Security Check</h2>
        <p className={`text-center mb-6 text-sm ${status && status !== "Checking security profile..." && status !== "Verifying passkey..." ? "text-yellow-400 font-medium" : "text-gray-400"}`}>
          {status || "Enter your session passkey to decrypt your data."}
        </p>
        <form onSubmit={handleSubmit}>
          <input 
            type="password"
            value={keyInput} 
            onChange={handleInputChange} 
            onKeyDown={handleKeyDown}
            placeholder="Enter Passkey"
            className="w-full p-3 rounded-xl bg-gray-900 border border-gray-600 text-white mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
            autoFocus
          />
          <button type="submit" disabled={isDeriving} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-wait rounded-xl font-bold transition-colors">
            {isDeriving ? <span className="animate-pulse">{status === initialMessage ? "Unlock Vault" : status}</span> : "Unlock Vault"}
          </button>
        </form>
      </div>
      <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } } .animate-shake { animation: shake 0.4s ease-in-out; }`}</style>
    </div>
  );
};

// --- Launcher Component ---
const Launcher = ({ user, onLaunch }) => {
  const [stats, setStats] = useState({ counters: 0, checklists: 0 });

  useEffect(() => {
    if(!user) return;
    const q1 = query(collection(db, 'artifacts', appId, 'users', user.uid, 'counters'));
    const q2 = query(collection(db, 'artifacts', appId, 'users', user.uid, 'checklists'));
    
    const unsub1 = onSnapshot(q1, snap => setStats(s => ({ ...s, counters: snap.size })));
    const unsub2 = onSnapshot(q2, snap => setStats(s => ({ ...s, checklists: snap.size })));
    return () => { unsub1(); unsub2(); };
  }, [user]);

  const apps = [
    { id: 'checklist', icon: <CheckSquare size={32} />, label: 'Checklists', count: stats.checklists },
    { id: 'counter', icon: <TrendingUp size={32} />, label: 'Counters', count: stats.counters },
    { id: 'notes', icon: <FileText size={32} />, label: 'Notes' },
    { id: 'bookmarks', icon: <Bookmark size={32} />, label: 'Bookmarks' },
    { id: 'streampi', icon: <Cast size={32} />, label: 'StreamPi', url: 'https://aks-streampi.web.app' },
    { id: 'drive', icon: <Cloud size={32} />, label: 'Cloud Drive', url: 'https://aks-cloud-drive.web.app' },
    { id: 'passwords', icon: <Key size={32} className="text-yellow-400" />, label: 'Passwords', locked: true },
    { id: 'notifications', icon: <Bell size={32} className="text-yellow-400" />, label: 'Alerts', locked: true },
    { id: 'settings', icon: <Sliders size={32} />, label: 'Settings', locked: true },
    { id: 'vault', icon: <Lock size={32} className="text-yellow-400" />, label: 'Vault', locked: true },
  ];

  const handleAppClick = (app) => {
    if (app.locked) return;
    if (app.url) {
        window.open(app.url, '_blank');
    } else {
        onLaunch(app.id);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="bg-white pt-6 pb-2 shadow-sm z-10">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-2xl font-bold text-gray-800">My Apps</h1>
          <p className="text-gray-500 text-sm">Welcome back</p>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 grid grid-cols-2 md:grid-cols-3 gap-8">
          {apps.map(app => {
            const isPrimary = ['checklist', 'counter', 'streampi', 'drive', 'bookmarks', 'notes'].includes(app.id);
            return (
              <button key={app.id} onClick={() => handleAppClick(app)} className={`aspect-square rounded-3xl flex flex-col items-center justify-center gap-3 shadow-lg transition-transform active:scale-95 relative bg-[#4285f4] ${app.locked ? 'opacity-90' : 'hover:brightness-110'}`}>
                <div className={`p-4 rounded-2xl ${isPrimary ? 'bg-white/20 text-white' : 'bg-white text-[#4285f4]'}`}>{app.icon}</div>
                {app.count !== undefined && <span className="absolute top-4 right-4 bg-white text-[#4285f4] text-xs font-bold px-2 py-0.5 rounded-full">{app.count > 9 ? '10+' : app.count}</span>}
                <span className="text-sm font-medium text-white">{app.label}</span>
              </button>
            );
          })}
        </div>
      </main>
      <div className="bg-white p-6 mt-auto border-t border-gray-100">
        <div className="max-w-3xl mx-auto">
          <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-gray-400 hover:text-red-500 transition-colors"><LogOut size={18} /> Sign Out</button>
        </div>
      </div>
    </div>
  );
};

// --- Main App Entry ---
export default function App() {
  const [user, setUser] = useState(null);
  const [cryptoKey, setCryptoKey] = useState(null);
  const [currentApp, setCurrentApp] = useState('launcher'); 
  const [loading, setLoading] = useState(true);
  const [lockMessage, setLockMessage] = useState(""); 

  // 1. Session Timer (Locks app after inactivity)
  useEffect(() => {
    if (!cryptoKey) return;
    const timer = setTimeout(() => {
      setLockMessage("Session expired due to inactivity.");
      setCryptoKey(null);
    }, 3600000); // 1 Hour
    return () => clearTimeout(timer);
  }, [cryptoKey]);

  // 2. Auth Init
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if(!u) setCryptoKey(null);
    });
  }, []);

  // 3. Browser History Handling (NEW FEATURE)
  useEffect(() => {
    // A. Handle Deep Links on Load (e.g. user refreshes on #bookmarks)
    const hash = window.location.hash.replace('#', '');
    if (hash && ['checklist', 'counter', 'bookmarks'].includes(hash)) {
      setCurrentApp(hash);
    }

    // B. Handle Back Button (Popstate)
    const handlePopState = (event) => {
      if (event.state && event.state.appId) {
        setCurrentApp(event.state.appId);
      } else {
        // If we popped to a state with no ID, go to launcher
        setCurrentApp('launcher');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --- Actions ---

  // NEW: Launch App + Push History
  const launchApp = (appId) => {
    window.history.pushState({ appId }, '', `#${appId}`);
    setCurrentApp(appId);
  };

  // NEW: Exit App + Go Back in History
  const exitApp = () => {
    // If the history has states to go back to, use back()
    // Otherwise fallback to launcher state
    if (window.history.state && window.history.state.appId) {
        window.history.back();
    } else {
        // Fallback for direct loads where history stack is empty
        window.history.replaceState(null, '', ' '); // Clear hash
        setCurrentApp('launcher');
    }
  };

  const handleUnlock = (key) => {
    setLockMessage("");
    setCryptoKey(key);
  };

  const handleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (e) { console.error(e); alert("Login failed"); }
  };

  // --- Render ---

  if (loading) return <div className="h-screen w-full flex items-center justify-center"><LoadingSpinner /></div>;

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50 text-gray-800 p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full">
          <div className="mx-auto w-16 h-16 bg-blue-100 text-[#4285f4] rounded-2xl flex items-center justify-center mb-6"><Grid size={32} /></div>
          <h2 className="text-2xl font-bold mb-2">App Suite</h2>
          <Button variant="google" onClick={handleLogin} className="w-full py-3 mb-4"><LogIn size={20} /> Sign in with Google</Button>
        </div>
      </div>
    );
  }

  // Locked State
  if (!cryptoKey) {
    return <LockScreen user={user} onUnlock={handleUnlock} initialMessage={lockMessage} />;
  }

  // Unlocked State (Routing)
  if (currentApp === 'checklist') return <ChecklistApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  if (currentApp === 'counter') return <CounterApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  if (currentApp === 'bookmarks') return <BookmarksApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  if (currentApp === 'notes') return <NotesApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;

  return <Launcher user={user} onLaunch={launchApp} />;
}