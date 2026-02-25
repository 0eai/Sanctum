import { doc, setDoc } from 'firebase/firestore';
import { db, appId } from '../lib/firebase';

/**
 * Syncs the Google user's profile (displayName, photoURL, email) to Firestore.
 * We merge this into the `public_keys` collection so SecureShare can display
 * proper names and avatars in its contacts list.
 */
export const syncUserProfile = async (user) => {
    if (!user) return;
    try {
        const ref = doc(db, 'artifacts', appId, 'public_keys', user.uid);
        await setDoc(ref, {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email?.split('@')[0] || 'Unknown',
            photoURL: user.photoURL || null,
            updatedAt: new Date().toISOString()
        }, { merge: true }); // Use merge so we don't wipe existing RSA keys
    } catch (e) {
        console.warn('Profile sync failed:', e);
    }
};
