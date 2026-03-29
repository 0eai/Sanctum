// src/App.jsx
import React, { useEffect, Suspense } from 'react';
import {
  GoogleAuthProvider, signInWithPopup, signInWithCustomToken, onAuthStateChanged
} from 'firebase/auth';
import { Grid, LogIn } from 'lucide-react';

import { auth } from './lib/firebase';
import { Button, LoadingSpinner } from './components/ui';
import { fetchAppPreferences } from './apps/settings/services/settings';
import { syncUserProfile } from './services/profile';
import { logActivity } from './services/activityLog';
import { registerDevice, updateDeviceActivity } from './services/deviceTracker';

import { useVault } from './context/VaultContext';
import { useHashRoute } from './hooks/useHashRoute';

// System Components
import LockScreen from './components/system/LockScreen';
import Launcher from './components/system/Launcher';
import AppErrorBoundary from './components/system/AppErrorBoundary';

// App Registry (replaces 17 individual lazy imports)
import appRegistry, { SharedNote } from './AppRegistry';

export default function App() {
  const { user, cryptoKey, loading, lockReason, setAuthUser, unlockVault, lockVault, setCryptoKey } = useVault();
  const [enabledApps, setEnabledApps] = React.useState(null);

  // --- 1. Router Hook ---
  const { route, navigate } = useHashRoute();

  // --- Auto-lock timer (configurable from Settings > Security) ---
  useEffect(() => {
    if (!cryptoKey || !user) return;

    const getTimeout = () => {
      const saved = localStorage.getItem('sanctum_autolock');
      const minutes = saved ? parseInt(saved) : 60;
      return minutes === 0 ? null : minutes * 60000; // 0 = Never
    };

    let timer = null;
    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      const timeout = getTimeout();
      if (timeout) {
        timer = setTimeout(() => {
          logActivity(user.uid, 'Vault Auto-Locked', 'info', 'Lock', cryptoKey);
          lockVault('Session expired due to inactivity.');
        }, timeout);
      }
    };

    resetTimer();

    // Reset timer on user interaction
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [cryptoKey, user, lockVault]);

  // --- Lock when Tab Hidden (Extension Defense) ---
  useEffect(() => {
    if (!cryptoKey || !user) return;

    const handleVisibilityChange = () => {
      const isLockOnHiddenEnabled = localStorage.getItem('sanctum_lock_on_hidden') === 'true';
      if (isLockOnHiddenEnabled && document.visibilityState === 'hidden') {
        logActivity(user.uid, 'Vault Auto-Locked (Hidden)', 'info', 'Lock', cryptoKey);
        lockVault('Locked for your security because the tab was hidden.');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [cryptoKey, user, lockVault]);

  // --- Periodic device activity update (every 5 min while vault open) ---
  useEffect(() => {
    if (!cryptoKey || !user) return;
    const interval = setInterval(() => updateDeviceActivity(user.uid), 5 * 60000);
    return () => clearInterval(interval);
  }, [cryptoKey, user]);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      }
    };
    initAuth();

    return onAuthStateChanged(auth, async (u) => {
      setAuthUser(u);
      if (u) {
        syncUserProfile(u); // Fire-and-forget profile sync
        const prefs = await fetchAppPreferences(u.uid);
        setEnabledApps(prefs);
      } else {
        setEnabledApps(null);
      }
    });
  }, [setAuthUser]);

  // --- Handlers ---
  const launchApp = (appId) => {
    navigate(`#${appId}`);
  };

  const exitApp = () => {
    navigate('');
  };

  const handleUnlock = (key) => {
    unlockVault(key);
    logActivity(user.uid, 'Vault Unlocked', 'success', 'Lock', key);
    registerDevice(user.uid, key);
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    }
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
    return <LockScreen user={user} onUnlock={handleUnlock} initialMessage={lockReason} />;
  }

  // --- App Routing via Registry (replaces 17-case switch) ---
  const props = { user, cryptoKey, onExit: exitApp, route, navigate };

  const AppComponent = appRegistry[route.appId];
  let AppRenderer;

  if (AppComponent) {
    // Special case: research app needs onOpenApp
    const extraProps = route.appId === 'research' ? { onOpenApp: (id) => navigate(`#${id}`) } : {};
    AppRenderer = <AppComponent {...props} {...extraProps} />;
  } else {
    AppRenderer = <Launcher user={user} onLaunch={launchApp} onLock={() => lockVault()} enabledApps={enabledApps} />;
  }

  return (
    <AppErrorBoundary>
      <Suspense fallback={<div className="h-[100dvh] w-full flex items-center justify-center"><LoadingSpinner /></div>}>
        {AppRenderer}
      </Suspense>
    </AppErrorBoundary>
  );
}