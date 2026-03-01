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
export const fetchWithDriveRetry = async (url, options, masterKey, isBlobResult = false, returnRawResponse = false) => {
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
        if (returnRawResponse) return response;
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

// =============================================
// FILE VAULT - Large Files (Resumable + Streaming E2EE)
// =============================================

/**
 * Uploads a large encrypted file using Google Drive Resumable Upload.
 * It reads the file in chunks, encrypts each chunk independently with a unique IV,
 * and uploads them sequentially to prevent browser RAM exhaustion.
 */
export const uploadLargeEncryptedFile = async (file, masterKey, accessToken, onProgress, appName = 'filevault') => {
    if (!masterKey) throw new Error("Encryption key required.");
    if (!accessToken) throw new Error("Google Drive access token required.");

    // 0. Ensure target folder exists
    const folderId = await getSanctumAppFolder(appName, accessToken, masterKey);
    const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;

    // 1. Initiate resumable upload session
    const metadata = {
        name: file.name + '.enc', // we might not want to encrypt filename yet
        mimeType: 'application/octet-stream',
        description: 'Sanctum E2EE FileVault File',
        parents: [folderId]
    };

    // Use fetchWithDriveRetry so 401s auto-refresh seamlessly
    const initResp = await fetchWithDriveRetry('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + activeToken,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': 'application/octet-stream',
        },
        body: JSON.stringify(metadata)
    }, masterKey, false, true);

    const uploadUrl = initResp.headers.get('Location');


    // 2. Encrypt and upload in chunks
    const CHUNK_SIZE = (5 * 1024 * 1024) - 28; // plaintext size
    // Plaintext + 12B IV + 16B AuthTag = 5242880 bytes (exactly 5MB) per encrypted chunk
    let offset = 0;
    let encryptedOffset = 0;

    const numChunks = Math.ceil(file.size / CHUNK_SIZE);
    const totalEncryptedSize = file.size + (numChunks * 28); // 12 bytes IV + 16 bytes auth tag per chunk

    while (offset < file.size) {
        const end = Math.min(offset + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(offset, end);
        const chunkData = await chunkBlob.arrayBuffer();

        // Encrypt this chunk independently
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            masterKey,
            chunkData
        );

        // Prepend IV to ciphertext
        const payload = new Uint8Array(iv.length + ciphertext.byteLength);
        payload.set(iv, 0);
        payload.set(new Uint8Array(ciphertext), iv.length);

        const encryptedChunkBlob = new Blob([payload], { type: 'application/octet-stream' });
        const encryptedChunkSize = encryptedChunkBlob.size;

        const chunkEndOffset = encryptedOffset + encryptedChunkSize;

        // Use normal fetch, but handle 401 manually to retry, and 308 as success.
        let chunkResp;
        let retries = 0;
        let chunkSuccess = false;

        while (!chunkSuccess && retries < 2) {
            const currentToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;
            chunkResp = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer ' + currentToken,
                    'Content-Range': `bytes ${encryptedOffset}-${chunkEndOffset - 1}/${totalEncryptedSize}`
                },
                body: encryptedChunkBlob
            });

            if (chunkResp.status === 401) {
                console.log("Chunk upload 401. Refreshing token...");
                retries++;
                const userId = auth.currentUser?.uid;
                const refreshToken = await getDecryptedRefreshToken(userId, masterKey);
                const refreshDriveTokenFn = httpsCallable(functions, 'refreshDriveToken');
                const result = await refreshDriveTokenFn({ refresh_token: refreshToken });
                sessionStorage.setItem('googleDriveAccessToken', result.data.access_token);
                // Loop will retry with new token
            } else {
                chunkSuccess = true;
            }
        }

        if (chunkResp.status === 200 || chunkResp.status === 201) {
            // Upload complete
            const result = await chunkResp.json();
            if (onProgress) onProgress(100);
            return result.id;
        } else if (chunkResp.status === 308) {
            // Chunk received, continue
            encryptedOffset = chunkEndOffset;
            offset = end;
            if (onProgress) onProgress(Math.round((offset / file.size) * 100));
        } else {
            const errText = await chunkResp.text().catch(() => chunkResp.statusText);
            throw new Error(`Upload encrypted chunk failed: ${errText} (Status: ${chunkResp.status})`);
        }
    }
    throw new Error("Upload finished without success response");
};

/**
 * Downloads a large encrypted file from Google Drive, decrypts it on the fly
 * via a TransformStream, and writes it directly to disk via the File System Access API
 * to avoid browser RAM limits.
 */
export const downloadLargeEncryptedFile = async (fileId, masterKey, accessToken, fileMetadata, onProgress) => {
    if (!masterKey) throw new Error("Encryption key required.");
    if (!accessToken) throw new Error("Google Drive access token required.");

    // 1. File System Access API
    let writableStream;
    try {
        if (!window.showSaveFilePicker) {
            throw new Error("File System Access API not supported in this browser. Fallback required.");
        }

        const defaultName = fileMetadata.name.endsWith('.enc')
            ? fileMetadata.name.slice(0, -4)
            : fileMetadata.name;

        const handle = await window.showSaveFilePicker({
            suggestedName: defaultName,
        });
        writableStream = await handle.createWritable();
    } catch (e) {
        if (e.name === 'AbortError') return null; // Cancelled
        console.warn("showSaveFilePicker failed or unsupported, falling back to Blob download.", e);
        return _fallbackDownloadLargeFile(fileId, masterKey, accessToken, fileMetadata, onProgress);
    }

    // 2. Fetch via Streams
    const response = await fetchWithDriveRetry(`${DRIVE_API_URL}/${fileId}?alt=media`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    }, masterKey, true, true); // return raw response

    const totalBytes = Number(response.headers.get('Content-Length')) || 0;
    let loadedBytes = 0;

    // We process the incoming stream by finding 5MB chunk boundaries
    let buffer = new Uint8Array(0);

    // This transform stream buffers bytes until it has a full E2EE chunk,
    // decrypts it, and enqueues the plaintext chunk.
    const decryptionStream = new TransformStream({
        async transform(chunk, controller) {
            // Append incoming chunk to buffer
            const newBuffer = new Uint8Array(buffer.length + chunk.length);
            newBuffer.set(buffer, 0);
            newBuffer.set(chunk, buffer.length);
            buffer = newBuffer;

            // Update Progress
            loadedBytes += chunk.length;
            if (totalBytes && onProgress) {
                onProgress(Math.round((loadedBytes / totalBytes) * 100));
            }
            // We want to wait for 5242880 encrypted bytes to accumulate
            // A typical chunk is plaintext + 12B IV + 16B tags = 5242880 bytes (exactly 5MB)

            const ENCRYPTED_CHUNK_SIZE = 5242880;

            while (buffer.length >= ENCRYPTED_CHUNK_SIZE) {
                const chunkToProcess = buffer.slice(0, ENCRYPTED_CHUNK_SIZE);
                buffer = buffer.slice(ENCRYPTED_CHUNK_SIZE);

                const iv = chunkToProcess.slice(0, 12);
                const ciphertext = chunkToProcess.slice(12);

                try {
                    const decryptedBuffer = await window.crypto.subtle.decrypt(
                        { name: "AES-GCM", iv: iv },
                        masterKey,
                        ciphertext
                    );
                    controller.enqueue(new Uint8Array(decryptedBuffer));
                } catch (e) {
                    controller.error(new Error("Decryption failed mid-stream. File may be corrupted or key invalid."));
                    return;
                }
            }
        },
        async flush(controller) {
            // Process the remaining bytes in the buffer (the last chunk)
            if (buffer.length > 0) {
                if (buffer.length < 28) {
                    controller.error(new Error("Remaining buffer too small for IV and Auth Tag. Corrupted file."));
                    return;
                }
                const iv = buffer.slice(0, 12);
                const ciphertext = buffer.slice(12);
                try {
                    const decryptedBuffer = await window.crypto.subtle.decrypt(
                        { name: "AES-GCM", iv: iv },
                        masterKey,
                        ciphertext
                    );
                    controller.enqueue(new Uint8Array(decryptedBuffer));
                } catch (e) {
                    controller.error(new Error("Final chunk decryption failed."));
                }
            }
        }
    });

    try {
        await response.body
            .pipeThrough(decryptionStream)
            .pipeTo(writableStream);
    } catch (e) {
        console.error("Stream processing error", e);
        throw e;
    }

    if (onProgress) onProgress(100);
    return true; // Success
};

/**
 * Fallback for downloading large files directly into browser RAM.
 * Useful if the File System Access API is not supported (e.g., Firefox).
 */
const _fallbackDownloadLargeFile = async (fileId, masterKey, accessToken, fileMetadata, onProgress) => {
    // 1. Fetch entire file into memory as Blob (will crash if > 2GB usually)
    const response = await fetchWithDriveRetry(`${DRIVE_API_URL}/${fileId}?alt=media`, {
        headers: {
            'Authorization': 'Bearer ' + accessToken
        }
    }, masterKey, true, true);

    const totalBytes = Number(response.headers.get('Content-Length')) || 0;
    if (totalBytes > 1000 * 1024 * 1024) { // 1GB warning
        console.warn("Attempting to load a file > 1GB directly into browser RAM. Browser may crash.");
    }

    const reader = response.body.getReader();
    let loadedBytes = 0;
    const pieces = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pieces.push(value);
        loadedBytes += value.length;

        if (totalBytes && onProgress) {
            // We use 0-50% for the fetch portion in fallback
            onProgress(Math.round((loadedBytes / totalBytes) * 50));
        }
    }

    // Concatenate all Uint8Array pieces
    const fullBuffer = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const p of pieces) {
        fullBuffer.set(p, offset);
        offset += p.length;
    }

    // Now decrypt chunk by chunk
    const ENCRYPTED_CHUNK_SIZE = 5242880;
    const decryptedPieces = [];
    let processOffset = 0;

    while (processOffset < fullBuffer.length) {
        const chunkEnd = Math.min(processOffset + ENCRYPTED_CHUNK_SIZE, fullBuffer.length);
        const chunkToProcess = fullBuffer.slice(processOffset, chunkEnd);
        processOffset = chunkEnd;

        const iv = chunkToProcess.slice(0, 12);
        const ciphertext = chunkToProcess.slice(12);

        try {
            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                masterKey,
                ciphertext
            );
            decryptedPieces.push(new Uint8Array(decryptedBuffer));
        } catch (e) {
            throw new Error("Decryption failed during fallback. Corrupt file or invalid key.");
        }

        if (onProgress) {
            // Decryption phase is 50-100%
            const decryptProgress = 50 + Math.round((processOffset / fullBuffer.length) * 50);
            onProgress(decryptProgress);
        }
    }

    // Create final blob
    const finalBlob = new Blob(decryptedPieces);

    // Save using standard anchor tag fallback
    const defaultName = fileMetadata.name.endsWith('.enc')
        ? fileMetadata.name.slice(0, -4)
        : fileMetadata.name;

    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    return true; // Success
};

/**
 * Fetches basic metadata for a Drive file (size and mimeType).
 */
export const getDriveFileMetadata = async (fileId, masterKey, accessToken) => {
    if (!accessToken) throw new Error("Google Drive access token required.");
    return await fetchWithDriveRetry(`${DRIVE_API_URL}/${fileId}?fields=size,mimeType,name`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    }, masterKey, false);
};

/**
 * Downloads a specific byte range of a file from Google Drive and decrypts it.
 * Used for Media Source Extensions (MSE) streaming.
 * @param {string} fileId The Drive file ID
 * @param {CryptoKey} masterKey The AES-GCM master key
 * @param {string} accessToken Google Drive access token
 * @param {number} startByte Start byte index (inclusive)
 * @param {number} endByte End byte index (inclusive)
 * @returns {Promise<Uint8Array>} The decrypted byte array
 */
export const downloadPartialEncryptedFile = async (fileId, masterKey, accessToken, startByte, endByte) => {
    if (!masterKey) throw new Error("Encryption key required.");
    if (!accessToken) throw new Error("Google Drive access token required.");

    const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;

    // Fetch the specific encrypted byte range using the HTTP Range header
    const response = await fetchWithDriveRetry(`${DRIVE_API_URL}/${fileId}?alt=media`, {
        headers: {
            'Authorization': 'Bearer ' + activeToken,
            'Range': `bytes=${startByte}-${endByte}`
        }
    }, masterKey, true, true); // return raw response

    if (!response.ok && response.status !== 206 && response.status !== 200) {
        throw new Error(`Failed to fetch chunk: ${response.status} ${response.statusText}`);
    }

    const chunkBuffer = await response.arrayBuffer();

    if (chunkBuffer.byteLength === 0) return new Uint8Array();

    // Each 5MB encrypted chunk is prepended with a 12-byte IV during upload.
    // The chunk format: [12 bytes IV] + [Ciphertext + 16 bytes AuthTag]
    if (chunkBuffer.byteLength < 28) { // 12 IV + 16 AuthTag minimum
        throw new Error("Encrypted chunk is too small to contain IV and Auth Tag.");
    }

    const iv = chunkBuffer.slice(0, 12);
    const ciphertext = chunkBuffer.slice(12);

    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            masterKey,
            ciphertext
        );
        return new Uint8Array(decryptedBuffer);
    } catch (e) {
        console.error("Failed to decrypt chunk in range", startByte, endByte, e);
        throw new Error("Failed to decrypt media chunk. Key may be invalid or data corrupted.");
    }
};

// =============================================
// TRANSFER APP LOGIC
// =============================================

export const uploadTransferFile = async (file, masterKey, accessToken, roomId, onProgress) => {
    if (!accessToken) throw new Error("Google Drive access token required.");
    if (!masterKey) throw new Error("Encryption key required.");

    // Ensure target folder exists
    const sanctumTransferFolder = await getSanctumAppFolder('transfer', accessToken, masterKey);
    const roomFolderId = await getOrCreateFolder(roomId, sanctumTransferFolder, accessToken, masterKey);

    const metadata = {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        description: 'Sanctum Transfer File',
        parents: [roomFolderId]
    };

    const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;

    if (onProgress) onProgress(50);
    const fileId = await multipartUpload(file, metadata, activeToken, masterKey);
    if (onProgress) onProgress(100);
    return fileId;
};

export const deleteTransferFolder = async (roomId, masterKey, accessToken) => {
    if (!accessToken) throw new Error("Google Drive access token required.");
    if (!masterKey) throw new Error("Encryption key required.");

    const sanctumTransferFolder = await getSanctumAppFolder('transfer', accessToken, masterKey);

    const query = `mimeType='application/vnd.google-apps.folder' and name='${roomId}' and '${sanctumTransferFolder}' in parents and trashed=false`;

    const searchData = await fetchWithDriveRetry(`${DRIVE_API_URL}?q=${encodeURIComponent(query)}&fields=files(id)`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    }, masterKey, false);

    if (searchData.files && searchData.files.length > 0) {
        const folderId = searchData.files[0].id;
        const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;

        await fetchWithDriveRetry(`${DRIVE_API_URL}/${folderId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + activeToken }
        }, masterKey, false, true); // true for returning raw Response (204 No Content won't parse JSON)
        return true;
    }
    return false;
};

// =============================================
// SECURESHARE APP LOGIC
// =============================================

export const uploadShareableFile = async (file, cryptoKey, accessToken, chatId) => {
    if (!accessToken) throw new Error("Google Drive access token required.");
    if (!cryptoKey) throw new Error("Encryption key required.");

    const randomIv = window.crypto.getRandomValues(new Uint8Array(12));
    const randomKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exportedKey = await window.crypto.subtle.exportKey('raw', randomKey);
    const fileKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));

    const data = await file.arrayBuffer();
    const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: randomIv }, randomKey, data);

    const payload = new Uint8Array(randomIv.length + ciphertext.byteLength);
    payload.set(randomIv, 0);
    payload.set(new Uint8Array(ciphertext), randomIv.length);

    const encryptedBlob = new Blob([payload], { type: 'application/octet-stream' });

    const sanctumSecureShareFolder = await getSanctumAppFolder('secureshare', accessToken, cryptoKey);
    const chatFolderId = await getOrCreateFolder(chatId, sanctumSecureShareFolder, accessToken, cryptoKey);

    const metadata = {
        name: file.name + '.enc',
        mimeType: 'application/octet-stream',
        description: 'Sanctum SecureShare File',
        parents: [chatFolderId]
    };

    const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;
    const fileId = await multipartUpload(encryptedBlob, metadata, activeToken, cryptoKey);
    return { fileId, fileKey: fileKeyBase64 };
};

export const downloadShareableFileBlob = async (fileId, fileKeyBase64, cryptoKey) => {
    const activeToken = sessionStorage.getItem('googleDriveAccessToken');
    if (!activeToken) throw new Error("Google Drive access token required.");

    const encryptedBlob = await fetchWithDriveRetry(`${DRIVE_API_URL}/${fileId}?alt=media`, {
        headers: { 'Authorization': 'Bearer ' + activeToken }
    }, cryptoKey, true);

    const data = await encryptedBlob.arrayBuffer();
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);

    const importedKeyRaw = new Uint8Array(atob(fileKeyBase64).split('').map(c => c.charCodeAt(0)));
    const fileKey = await window.crypto.subtle.importKey('raw', importedKeyRaw, { name: "AES-GCM" }, false, ["decrypt"]);

    try {
        const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, fileKey, ciphertext);
        return new Blob([decrypted]);
    } catch (e) {
        throw new Error("Shared file decryption failed.");
    }
};

export const deleteDriveFile = async (fileId, masterKey, accessToken) => {
    const activeToken = sessionStorage.getItem('googleDriveAccessToken') || accessToken;
    await fetchWithDriveRetry(`${DRIVE_API_URL}/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + activeToken }
    }, masterKey, false, true);
    return true;
};
