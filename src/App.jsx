// src/App.jsx
import React, { useState, useEffect } from 'react';
import { 
  GoogleAuthProvider, signInWithPopup, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { Grid, LogIn } from 'lucide-react';

import { auth } from './lib/firebase';
import { Button, LoadingSpinner } from './components/ui';
import { fetchAppPreferences } from './services/settings'; 

import { useHashRoute } from './hooks/useHashRoute';

// System Components
import LockScreen from './components/system/LockScreen';
import Launcher from './components/system/Launcher';

// App Modules
import ChecklistApp from './apps/checklist/Checklist'; 
import CounterApp from './apps/counter/Counter';
import BookmarksApp from './apps/bookmarks/Bookmarks';
import NotesApp from './apps/notes/Notes';
import TasksApp from './apps/tasks/Tasks'; 
import PasswordsApp from './apps/passwords/Passwords'; 
import AlertsApp from './apps/alerts/Alerts'; 
import BankingApp from './apps/banking/Banking'; 
import FinanceApp from './apps/finance/Finance';
import SettingsApp from './apps/settings/Settings';
import SharedNote from './apps/SharedNote'; 
import MarkdownApp from './apps/markdown/Markdown';
import RemindersApp from './apps/reminders/Reminders';
import ContactsApp from './apps/contacts/Contacts';

export default function App() {
  const [user, setUser] = useState(null);
  const [cryptoKey, setCryptoKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lockMessage, setLockMessage] = useState(""); 
  const [enabledApps, setEnabledApps] = useState(null); 

  // --- 1. Router Hook ---
  const { route, navigate } = useHashRoute();

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
    
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        const prefs = await fetchAppPreferences(u.uid);
        setEnabledApps(prefs);
      } else {
        setCryptoKey(null);
        setEnabledApps(null);
      }
    });
  }, []);

  // --- Handlers ---
  const launchApp = (appId) => {
    navigate(`#${appId}`); 
  };

  const exitApp = () => {
    navigate(''); 
  };

  const handleUnlock = (key) => {
    setLockMessage("");
    setCryptoKey(key);
  };

  const handleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (e) { console.error(e); alert("Login failed"); }
  };

  // --- Render Logic ---
  
  // FIXED: Use the route.appId instead of the deleted isSharedView state
  if (route.appId === 'view') return <SharedNote />; 
  
  if (loading) return <div className="h-[100dvh] w-full flex items-center justify-center"><LoadingSpinner /></div>;

  if (!user) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-gray-50 text-gray-800 p-6 text-center">
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

  // Pass route and navigate down to apps so they can handle sub-routing
  const props = { user, cryptoKey, onExit: exitApp, route, navigate };

  switch (route.appId) {
    case 'alerts': return <AlertsApp {...props} />;
    case 'banking': return <BankingApp {...props} />;
    case 'finance': return <FinanceApp {...props} />;
    case 'checklist': return <ChecklistApp {...props} />;
    case 'tasks': return <TasksApp {...props} />;
    case 'reminders': return <RemindersApp {...props} />;
    case 'passwords': return <PasswordsApp {...props} />;
    case 'counter': return <CounterApp {...props} />;
    case 'bookmarks': return <BookmarksApp {...props} />;
    case 'notes': return <NotesApp {...props} />;
    case 'markdown': return <MarkdownApp {...props} />;
    case 'contacts': return <ContactsApp {...props} />;
    case 'settings': return <SettingsApp {...props} />;
    // Launcher handles empty string or unrecognized appIds
    default: return <Launcher user={user} onLaunch={launchApp} enabledApps={enabledApps} />; 
  }
}