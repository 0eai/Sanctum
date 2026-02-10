import React, { useState, useEffect } from 'react';
import { 
  GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signOut, onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, query, onSnapshot, doc, getDoc, setDoc, deleteField, 
  getDocs, writeBatch 
} from 'firebase/firestore';
import { 
  TrendingUp, CheckSquare, Key, Bell, Sliders, Lock, LogIn, Grid, Cloud, Cast, Bookmark,
  FileText, RotateCcw, ClipboardList 
} from 'lucide-react';

import { auth, db, appId } from './firebase';
import { Button, LoadingSpinner } from './components';
import ChecklistApp from './Checklist'; 
import CounterApp from './Counter';
import BookmarksApp from './Bookmarks';
import NotesApp from './Notes';
import TasksApp from './Tasks'; 
import PasswordsApp from './Passwords'; 
import AlertsApp from './Alerts'; // <--- 1. Import Alerts App
import SharedNote from './SharedNote';
import SettingsApp from './Settings';
import { 
  deriveKeyFromPasskey, generateSalt, encryptData, decryptData, 
  generateMasterKey, exportKey, importMasterKey 
} from './crypto';

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
  
  const handleInputChange = (e) => {
    setKeyInput(e.target.value);
    if (status === initialMessage) setStatus("");
  };

  const handleHardReset = async () => {
    const confirmation = window.confirm(
        "⚠️ FACTORY RESET VAULT?\n\n" + 
        "This will PERMANENTLY DELETE all data.\n" +
        "This action cannot be undone.\n\n" + 
        "Are you sure?"
    );

    if (!confirmation) return;

    setStatus("Wiping data...");
    setIsDeriving(true); 

    try {
        // Note: AlertsApp uses 'tasks' collection, so no specific 'alerts' collection to wipe here.
        const appCollections = ['notes', 'bookmarks', 'checklists', 'counters', 'tasks', 'passwords'];
        
        for (const colName of appCollections) {
            const q = query(collection(db, 'artifacts', appId, 'users', user.uid, colName));
            const snapshot = await getDocs(q);
            
            const batch = writeBatch(db);
            let count = 0;
            
            snapshot.forEach((doc) => {
                batch.delete(doc.ref);
                count++;
            });

            if (count > 0) {
                await batch.commit();
            }
        }

        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, { 
            encryptionSalt: deleteField(), 
            encryptedMasterKey: deleteField(), 
            encryptedValidator: deleteField() 
        }, { merge: true });
        
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

      if (!salt || !encryptedMasterKeyBlob) {
        setStatus("Initializing Keys...");
        salt = generateSalt();
        const masterKey = await generateMasterKey();
        const wrapperKey = await deriveKeyFromPasskey(keyInput, salt);
        const masterKeyJWK = await exportKey(masterKey);
        const encryptedMasterKey = await encryptData(masterKeyJWK, wrapperKey);
        const validationPayload = await encryptData({ check: "VALID" }, masterKey);
        
        await setDoc(userDocRef, { 
            encryptionSalt: salt,
            encryptedMasterKey: encryptedMasterKey, 
            encryptedValidator: validationPayload 
        }, { merge: true });
        
        onUnlock(masterKey);
      } 
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
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#09090b] text-white p-6">
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

// --- Launcher Component ---
const Launcher = ({ user, onLaunch }) => {
  const [stats, setStats] = useState({ counters: 0, checklists: 0, tasks: 0, passwords: 0 });

  useEffect(() => {
    if(!user) return;
    const q1 = query(collection(db, 'artifacts', appId, 'users', user.uid, 'counters'));
    const q2 = query(collection(db, 'artifacts', appId, 'users', user.uid, 'checklists'));
    const q3 = query(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'));
    const q4 = query(collection(db, 'artifacts', appId, 'users', user.uid, 'passwords'));
    
    const unsub1 = onSnapshot(q1, snap => setStats(s => ({ ...s, counters: snap.size })));
    const unsub2 = onSnapshot(q2, snap => setStats(s => ({ ...s, checklists: snap.size })));
    const unsub3 = onSnapshot(q3, snap => setStats(s => ({ ...s, tasks: snap.size })));
    const unsub4 = onSnapshot(q4, snap => setStats(s => ({ ...s, passwords: snap.size })));
    
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [user]);

  const apps = [
    // 2. Added Alerts (DayPulse) to the grid
    { id: 'alerts', icon: <Bell size={32} />, label: 'DayPulse' }, 
    { id: 'tasks', icon: <ClipboardList size={32} />, label: 'Tasks', count: stats.tasks },
    { id: 'checklist', icon: <CheckSquare size={32} />, label: 'Checklists', count: stats.checklists },
    { id: 'counter', icon: <TrendingUp size={32} />, label: 'Counters', count: stats.counters },
    { id: 'notes', icon: <FileText size={32} />, label: 'Notes' }, 
    { id: 'passwords', icon: <Key size={32} />, label: 'Passwords', count: stats.passwords },
    { id: 'bookmarks', icon: <Bookmark size={32} />, label: 'Bookmarks' },
    { id: 'streampi', icon: <Cast size={32} />, label: 'StreamPi', url: 'https://aks-streampi.web.app' },
    { id: 'drive', icon: <Cloud size={32} />, label: 'Cloud Drive', url: 'https://aks-cloud-drive.web.app' },
    { id: 'settings', icon: <Sliders size={32} />, label: 'Settings' }, 
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
            // 3. Added 'alerts' to primary apps list for blue styling
            const isPrimary = ['checklist', 'tasks', 'counter', 'passwords', 'alerts', 'streampi', 'drive', 'bookmarks', 'notes', 'settings'].includes(app.id);
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
        <div className="max-w-3xl mx-auto text-center text-xs text-gray-300">
          Encrypted Workspace
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
  const [isSharedView, setIsSharedView] = useState(false);

  useEffect(() => {
    if (!cryptoKey) return;
    const timer = setTimeout(() => {
      setLockMessage("Session expired due to inactivity.");
      setCryptoKey(null);
    }, 3600000); 
    return () => clearTimeout(timer);
  }, [cryptoKey]);

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

  useEffect(() => {
    if (window.location.hash.startsWith('#view')) {
      setIsSharedView(true);
    }
    const hash = window.location.hash.replace('#', '');
    // 4. Added 'alerts' to deep linking
    if (hash && ['checklist', 'tasks', 'counter', 'passwords', 'alerts', 'bookmarks', 'notes', 'settings'].includes(hash)) {
      setCurrentApp(hash);
    }

    const handlePopState = (event) => {
      if (event.state && event.state.appId) {
        setCurrentApp(event.state.appId);
      } else {
        setCurrentApp('launcher');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const launchApp = (appId) => {
    window.history.pushState({ appId }, '', `#${appId}`);
    setCurrentApp(appId);
  };

  const exitApp = () => {
    if (window.history.state && window.history.state.appId) {
        window.history.back();
    } else {
        window.history.replaceState(null, '', ' '); 
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

  if (isSharedView) {
    return <SharedNote />;
  }

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

  if (!cryptoKey) {
    return <LockScreen user={user} onUnlock={handleUnlock} initialMessage={lockMessage} />;
  }

  // 5. Render Alerts App
  if (currentApp === 'alerts') return <AlertsApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  
  if (currentApp === 'checklist') return <ChecklistApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  if (currentApp === 'tasks') return <TasksApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  if (currentApp === 'passwords') return <PasswordsApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  if (currentApp === 'counter') return <CounterApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  if (currentApp === 'bookmarks') return <BookmarksApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  if (currentApp === 'notes') return <NotesApp user={user} cryptoKey={cryptoKey} onExit={exitApp} />;
  if (currentApp === 'settings') return <SettingsApp user={user} onExit={exitApp} />;

  return <Launcher user={user} onLaunch={launchApp} />;
}