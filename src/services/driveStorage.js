// src/services/driveStorage.js
import { auth, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { getDecryptedRefreshToken } from './driveAuth';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';

/**
 * Intercepts 401 Unauthorized errors from Google Drive, decrypts the securely stored
 * refresh token using the user's masterKey, and triggers a Cloud Function to mint
 * a new Access Token. It then transparently retries the failed fetch request inline.
 */
const fetchWithDriveRetry = async (url, options, masterKey, isBlobResult = false) => {
    const doFetch = async (token) => {
        const fetchOptions = {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            }
        };
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            let errMsg = response.statusText;
            try {
                const errData = await response.json();
                if (errData?.error?.message) errMsg = errData.error.message;
            } catch (e) { }

            const err = new Error(`Drive Error: ${errMsg}`);
            err.status = response.status;
            throw err;
        }
        return isBlobResult ? await response.blob() : await response.json();
    };

    const initialToken = options.headers['Authorization'] ? options.headers['Authorization'].split(' ')[1] : null;

    try {
        return await doFetch(initialToken);
    } catch (error) {
        if (error.status === 401 || (error.message && (error.message.includes("401") || error.message.includes("Unauthorized")))) {
            console.log("Drive token expired (401). Intercepting and refreshing...");
            const userId = auth.currentUser?.uid;
            if (!userId || !masterKey) {
                console.error("Cannot refresh Drive token without user session and masterKey.");
                throw error;
            }
            try {
                const refreshToken = await getDecryptedRefreshToken(userId, masterKey);
                if (!refreshToken) throw new Error("No offline Google Drive token found. Please reconnect in Settings.");

                const refreshDriveTokenFn = httpsCallable(functions, 'refreshDriveToken');
                const result = await refreshDriveTokenFn({ refresh_token: refreshToken });
                const newAccessToken = result.data.access_token;

                sessionStorage.setItem('googleDriveAccessToken', newAccessToken);
                console.log("Token refreshed successfully. Retrying request inline...");

                return await doFetch(newAccessToken);
            } catch (refreshErr) {
                console.error("Failed to refresh token natively:", refreshErr);
                throw error;
            }
        }
        throw error;
    }
};

/**
 * Helper to upload to Google Drive using a multipart request.
 * This allows us to set the filename and mimeType in the same request as the file bytes.
 */
const multipartUpload = async (fileBlob, metadata, accessToken, masterKey) => {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    // Convert blob to base64 for the multipart body (Google Drive API requirement for base64 in multipart if treating as string, or we can construct a Blob payload)
    // Actually, it's highly recommended to construct a composite Blob to send to fetch without exhausting RAM.

    // Create the multipart body as a Blob
    const metadataBlob = new Blob([
        delimiter,
        'Content-Type: application/json; charset=UTF-8\r\n\r\n',
        JSON.stringify(metadata),
        delimiter,
        'Content-Type: ', metadata.mimeType || 'application/octet-stream', '\r\n\r\n'
    ], { type: 'text/plain' });

    const closeBlob = new Blob([close_delim], { type: 'text/plain' });

    const multipartBody = new Blob([metadataBlob, fileBlob, closeBlob], {
        type: 'multipart/related; boundary=' + boundary
    });

    try {
        const result = await fetchWithDriveRetry(DRIVE_UPLOAD_URL, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken
            },
            body: multipartBody
        }, masterKey, false);
        return result.id;
    } catch (error) {
        if (error.status === 403) {
            throw new Error(`Google Drive API 403 Forbidden. Ensure the 'Google Drive API' is enabled in your Google Cloud Console.`);
        }
        throw new Error(`Drive upload failed: ${error.message}`);
    }
};

/**
 * Gets or creates a folder by name inside an optional parentId.
 */
export const getOrCreateFolder = async (folderName, parentId, accessToken, masterKey) => {
    let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    } else {
        query += ` and 'root' in parents`;
    }

    try {
        const searchData = await fetchWithDriveRetry(`${DRIVE_API_URL}?q=${encodeURIComponent(query)}&fields=files(id, name)`, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        }, masterKey, false);

        if (searchData.files && searchData.files.length > 0) {
            return searchData.files[0].id;
        }

        const metadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };
        if (parentId) metadata.parents = [parentId];

        // The first call might have refreshed the token, check sessionStorage
        const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;

        const createdData = await fetchWithDriveRetry(DRIVE_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + activeToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(metadata)
        }, masterKey, false);

        return createdData.id;
    } catch (error) {
        if (error.status === 401 || error.status === 403) {
            throw new Error(`Google Drive authentication error (${error.status}). Please sign out and sign back in.`);
        }
        throw new Error(`Failed to get/create folder: ${error.message}`);
    }
};

/**
 * Ensures the Sanctum/[appName] folder structure exists and returns the [appName] folder ID.
 */
export const getSanctumAppFolder = async (appName, accessToken, masterKey) => {
    const sanctumFolderId = await getOrCreateFolder('Sanctum', null, accessToken, masterKey);
    const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;
    const appFolderId = await getOrCreateFolder(appName, sanctumFolderId, activeToken, masterKey);
    return appFolderId;
};


/**
 * Encrypts a file (Blob/File) using AES-GCM with the provided masterKey
 * and uploads it to Google Drive.
 * We do not use `encryptData` from crypto.js because that wraps the payload in JSON
 * and Base64 encodes it, which wastes massive amounts of RAM for large PDFs.
 */
export const uploadEncryptedFile = async (file, masterKey, accessToken, appName = 'misc') => {
    if (!masterKey) throw new Error("Encryption key required.");
    if (!accessToken) throw new Error("Google Drive access token required.");

    // 0. Ensure target folder exists
    const folderId = await getSanctumAppFolder(appName, accessToken, masterKey);

    // 1. Encrypt the file efficiently
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const data = await file.arrayBuffer();

    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        masterKey,
        data
    );

    // Prepend IV to ciphertext for storage
    const payload = new Uint8Array(iv.length + ciphertext.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.length);

    const encryptedBlob = new Blob([payload], { type: 'application/octet-stream' });

    // 2. Upload to Drive
    const metadata = {
        name: file.name + '.enc',
        mimeType: 'application/octet-stream',
        description: 'Sanctum E2EE File',
        parents: [folderId]
    };

    const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;
    return await multipartUpload(encryptedBlob, metadata, activeToken, masterKey);
};

/**
 * Downloads an encrypted file from Google Drive, decrypts it, and returns the raw Blob.
 */
export const downloadEncryptedFileBlob = async (fileId, masterKey, accessToken) => {
    if (!masterKey) throw new Error("Encryption key required.");
    if (!accessToken) throw new Error("Google Drive access token required.");

    // 1. Fetch encrypted blob from Drive with auto-retry
    const encryptedBlob = await fetchWithDriveRetry(`${DRIVE_API_URL}/${fileId}?alt=media`, {
        headers: {
            'Authorization': 'Bearer ' + accessToken
        }
    }, masterKey, true);

    const data = await encryptedBlob.arrayBuffer();

    // 2. Extract IV and Ciphertext without padding issues (slice method)
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);

    try {
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            masterKey,
            ciphertext
        );

        return new Blob([decrypted]);
    } catch (e) {
        console.error("E2EE Decryption failed", e);
        throw new Error("Failed to decrypt file. It may be corrupted or the key is invalid.");
    }
};

/**
 * Downloads an encrypted file from Google Drive, decrypts it, and returns a local Blob URL.
 */
export const downloadEncryptedFile = async (fileId, masterKey, accessToken) => {
    const decryptedBlob = await downloadEncryptedFileBlob(fileId, masterKey, accessToken);
    return URL.createObjectURL(decryptedBlob);
};

/**
 * Uploads a raw unencrypted File natively to Google Drive.
 */
export const uploadNormalFile = async (file, masterKey, accessToken, appName = 'misc') => {
    if (!accessToken) throw new Error("Google Drive access token required.");
    if (!masterKey) throw new Error("Encryption key required.");

    // 0. Ensure target folder exists
    const folderId = await getSanctumAppFolder(appName, accessToken, masterKey);

    const metadata = {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        description: 'Sanctum Standard File',
        parents: [folderId]
    };

    const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;
    return await multipartUpload(file, metadata, activeToken, masterKey);
};

/**
 * Downloads a standard file from Google Drive and returns the raw Blob.
 */
export const downloadNormalFileBlob = async (fileId, masterKey, accessToken) => {
    if (!accessToken) throw new Error("Google Drive access token required.");
    if (!masterKey) throw new Error("Encryption key required.");

    return await fetchWithDriveRetry(`${DRIVE_API_URL}/${fileId}?alt=media`, {
        headers: {
            'Authorization': 'Bearer ' + accessToken
        }
    }, masterKey, true);
};

/**
 * Downloads a standard file from Google Drive and returns a local Blob URL.
 */
export const downloadNormalFile = async (fileId, masterKey, accessToken) => {
    const blob = await downloadNormalFileBlob(fileId, masterKey, accessToken);
    return URL.createObjectURL(blob);
};

