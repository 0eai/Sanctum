// src/context/VaultContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';

const VaultContext = createContext();

export const VaultProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [cryptoKey, setCryptoKey] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // New state to tell the user WHY they were locked out
  const [lockReason, setLockReason] = useState(""); 

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (!u) {
        setCryptoKey(null);
        setLockReason(""); // Clear reason on logout
      }
    });
    return () => unsub();
  }, []);

  // 2. Auto-Lock Timer
  useEffect(() => {
    if (!cryptoKey) return;
    
    // Lock after 1 hour (3600000 ms)
    const timer = setTimeout(() => {
      setLockReason("Session expired due to inactivity."); // Set the reason
      setCryptoKey(null);
    }, 3600000); 

    return () => clearTimeout(timer);
  }, [cryptoKey]);

  // Helper to manually lock (e.g. from a "Lock Vault" button)
  const lockVault = () => {
    setLockReason("");
    setCryptoKey(null);
  };

  return (
    <VaultContext.Provider value={{ user, cryptoKey, setCryptoKey, loading, lockReason, lockVault }}>
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => useContext(VaultContext);