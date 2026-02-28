import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyAreNhyPHuhi0jUWNMAG1zvPxxzgu-aumw",
  authDomain: "aks-hub.firebaseapp.com",
  projectId: "aks-hub",
  storageBucket: "aks-hub.firebasestorage.app",
  messagingSenderId: "668905909424",
  appId: "1:668905909424:web:d7f0b3440d9dd343d0df75"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Initialize Firebase App Check if a ReCAPTCHA site key is provided
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}

// Helper for dynamic App ID
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "aks-hub";
export const appId = rawAppId.replace(/[^a-zA-Z0-9_-]/g, '_');