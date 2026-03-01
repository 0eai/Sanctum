import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db, appId, functions } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

/**
 * Dynamically loads the Google Identity Services script.
 */
const loadGsiScript = () => {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts?.oauth2) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to load Google Identity Services script."));
        document.head.appendChild(script);
    });
};

/**
 * Uses Google Identity Services to request an offline authorization code,
 * sends it to the Firebase cloud function to exchange for tokens,
 * and securely encrypts the refresh_token.
 */
export const connectGoogleDrive = async (userId, cryptoKey, clientId) => {
    if (!userId || !cryptoKey) throw new Error("User ID and Crypto Key required.");
    if (!clientId) throw new Error("Google Client ID is missing. Check your environment variables.");

    await loadGsiScript();

    return new Promise((resolve, reject) => {
        try {
            const client = window.google.accounts.oauth2.initCodeClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/drive',
                ux_mode: 'popup',
                callback: async (response) => {
                    if (response.error) {
                        reject(new Error(`OAuth Error: ${response.error}`));
                        return;
                    }

                    try {
                        // Send the authorization code to our backend to exchange for a refresh token
                        const exchangeFn = httpsCallable(functions, 'exchangeDriveAuthCode');
                        const result = await exchangeFn({ code: response.code });

                        const { refresh_token, access_token } = result.data;

                        if (!refresh_token) {
                            reject(new Error("Backend did not return a refresh token. You might need to revoke Sanctum's access in your Google Account settings and reconnect to force a new consent screen."));
                            return;
                        }

                        // Save access token to session
                        sessionStorage.setItem('googleDriveAccessToken', access_token);

                        // Encrypt refresh token
                        const encryptedToken = await encryptData(refresh_token, cryptoKey);

                        // Save to Firestore
                        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'integrations', 'googleDrive');
                        await setDoc(docRef, {
                            refreshToken: encryptedToken,
                            updatedAt: new Date().toISOString()
                        });

                        resolve(true);
                    } catch (err) {
                        console.error("Token exchange failed:", err);
                        reject(new Error(`Failed to exchange auth code: ${err.message}`));
                    }
                },
            });

            // Trigger the consent popup
            client.requestCode();
        } catch (err) {
            reject(new Error(`Failed to initialize Google Identity Services: ${err.message}`));
        }
    });
};

/**
 * Removes the refresh token from Firestore and clears session storage.
 */
export const disconnectGoogleDrive = async (userId) => {
    if (!userId) throw new Error("User ID required.");
    const docRef = doc(db, 'artifacts', appId, 'users', userId, 'integrations', 'googleDrive');
    await deleteDoc(docRef);
    sessionStorage.removeItem('googleDriveAccessToken');
};

/**
 * Fetches and decrypts the refresh token from Firestore.
 */
export const getDecryptedRefreshToken = async (userId, cryptoKey) => {
    if (!userId || !cryptoKey) throw new Error("User ID and Crypto Key required.");

    const docRef = doc(db, 'artifacts', appId, 'users', userId, 'integrations', 'googleDrive');
    const snap = await getDoc(docRef);

    if (snap.exists() && snap.data().refreshToken) {
        const decryptedToken = await decryptData(snap.data().refreshToken, cryptoKey);
        return decryptedToken;
    }

    return null;
};

/**
 * Checks if a Google Drive refresh token exists for the user without decrypting it.
 */
export const checkGoogleDriveConnection = async (userId) => {
    if (!userId) return false;
    const docRef = doc(db, 'artifacts', appId, 'users', userId, 'integrations', 'googleDrive');
    const snap = await getDoc(docRef);
    return snap.exists();
};
