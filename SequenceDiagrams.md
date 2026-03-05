# Sequence Diagrams — Sanctum v2.0

Interaction timelines between components, services, and Firebase.

---

## 1. First-Time User Setup

```mermaid
sequenceDiagram
    actor User
    participant UI as LockScreen
    participant Vault as vault.js
    participant Crypto as crypto.js
    participant FS as Firestore

    User->>UI: Enter passkey (min 8 chars)
    UI->>UI: Confirm passkey (enter twice)
    UI->>Vault: attemptVaultUnlock(uid, passkey)
    Vault->>FS: getDoc(/users/uid)
    FS-->>Vault: No salt/encryptedMasterKey
    Vault->>Crypto: generateSalt()
    Crypto-->>Vault: salt (16-byte hex)
    Vault->>Crypto: generateMasterKey()
    Crypto-->>Vault: AES-256 CryptoKey
    Vault->>Crypto: deriveKeyFromPasskey(passkey, salt)
    Crypto-->>Vault: wrapperKey (non-extractable)
    Vault->>Crypto: exportKey(masterKey) → JWK
    Vault->>Crypto: encryptData(JWK, wrapperKey)
    Crypto-->>Vault: encryptedMasterKey {iv, data}
    Vault->>Crypto: encryptData({check: VALID}, masterKey)
    Crypto-->>Vault: encryptedValidator {iv, data}
    Vault->>FS: setDoc(/users/uid, {salt, encryptedMasterKey, validator})
    Vault-->>UI: {status: success, masterKey, isNew: true}
    UI->>User: Vault unlocked
```

---

## 2. Returning User Unlock (Argon2id)

```mermaid
sequenceDiagram
    actor User
    participant UI as LockScreen
    participant Vault as vault.js
    participant Crypto as crypto.js
    participant FS as Firestore

    User->>UI: Enter passkey
    UI->>UI: Check rate limit (failedAttempts)
    UI->>Vault: attemptVaultUnlock(uid, passkey)
    Vault->>FS: getDoc(/users/uid)
    FS-->>Vault: {salt, encryptedMasterKey, kdf: "argon2id"}
    Vault->>Crypto: deriveKeyArgon2id(passkey, salt)
    Note right of Crypto: 64MB memory, 3 iters via WASM
    Crypto-->>Vault: wrapperKey
    Vault->>Crypto: decryptData(encryptedMasterKey, wrapperKey)
    Crypto-->>Vault: masterKeyJWK
    Vault->>Crypto: importMasterKey(JWK)
    Crypto-->>Vault: masterKey CryptoKey
    Vault->>Crypto: decryptData(validator, masterKey)
    Crypto-->>Vault: {check: "VALID"}
    Vault-->>UI: {status: success, masterKey}
    UI->>User: Vault unlocked
```

---

## 3. Save Encrypted Note

```mermaid
sequenceDiagram
    participant Editor as NoteEditor
    participant Service as notes.js
    participant Crypto as crypto.js
    participant FS as Firestore

    Editor->>Editor: Debounce (1s after last keystroke)
    Editor->>Service: saveNote(uid, cryptoKey, noteData)
    Service->>Service: Build payload {title, content, tags, attachments, ...}
    Service->>Crypto: encryptData(payload, masterKey)
    Crypto->>Crypto: JSON.stringify → encode → random IV → AES-GCM
    Crypto-->>Service: {iv, data}
    Service->>FS: setDoc(noteRef, {iv, data, type, parentId, isPinned, updatedAt})
    FS-->>Service: Write confirmed
    Service-->>Editor: Note saved
```

---

## 4. Share Document with Collaborator

```mermaid
sequenceDiagram
    actor Owner
    participant Modal as CollaborateModal
    participant Collab as collaboration.js
    participant Crypto as crypto.js
    participant FS as Firestore
    participant Storage as Firebase Storage

    Owner->>Modal: Click Share, search collaborator by email
    Modal->>Collab: findUserByEmail(email)
    Collab->>FS: query(public_keys, where email ==)
    FS-->>Modal: {uid, displayName, email}
    Owner->>Modal: Confirm share
    Modal->>Collab: shareDocument(ownerUid, personalKey, docData, ...)
    Collab->>Crypto: generateMasterKey() → docKey
    Collab->>Crypto: encryptData(cleanData, docKey)
    Crypto-->>Collab: {iv, data}

    loop For each collaborator (including owner)
        Collab->>FS: getDoc(public_keys/uid) → RSA public key
        Collab->>Crypto: serializeKey(docKey) → JSON
        Collab->>Crypto: encryptRSA(JSON, publicKey)
        Crypto-->>Collab: encryptedDocKey
        Collab->>FS: setDoc(shared_docs/shareId/members/uid, {encryptedDocKey, role})
    end

    Collab->>FS: addDoc(shared_docs, {iv, data, appType, memberUids, ...})

    alt Has attachments
        Collab->>Storage: Download file from owner path
        Collab->>Crypto: Decrypt with personalKey
        Collab->>Crypto: Re-encrypt with docKey
        Collab->>Storage: Upload to shared_docs/shareId/uuid
        Collab->>FS: Update shared doc with new file references
    end

    Collab-->>Modal: {shareId, docKey}
```

---

## 5. Collaborator Opens Shared Document

```mermaid
sequenceDiagram
    participant App as Notes/Research/etc
    participant Collab as collaboration.js
    participant Crypto as crypto.js
    participant FS as Firestore

    App->>Collab: listenToSharedDocs(uid, appType, privateKey, callback)
    Collab->>FS: onSnapshot(shared_docs, where memberUids contains uid)
    FS-->>Collab: Snapshot with shared docs

    loop For each shared doc
        Collab->>FS: getDoc(shared_docs/shareId/members/uid)
        FS-->>Collab: {encryptedDocKey}
        Collab->>Crypto: decryptRSA(encryptedDocKey, privateKey)
        Crypto-->>Collab: serialized key JSON
        Collab->>Crypto: deserializeKey(JSON) → docKey
        Collab->>Crypto: decryptData({iv, data}, docKey)
        Crypto-->>Collab: decryptedContent
        Collab->>Collab: Merge with metadata (appType, ownerUid, isShared, docKey)
    end

    Collab-->>App: callback(decryptedDocs)
```

---

## 6. SecureShare 1:1 Message (ECDH Forward Secrecy)

```mermaid
sequenceDiagram
    actor Sender
    participant Chat as SecureShare
    participant Service as secureshare.js
    participant Crypto as crypto.js
    participant FS as Firestore

    Sender->>Chat: Type message + Send
    Chat->>Service: sendMessage(chatId, text, senderPrivateKey, recipientPublicKey)
    Service->>Crypto: generateECDHKeyPair() → ephemeral{pub, priv}
    Crypto-->>Service: ephemeralKeyPair
    Service->>Crypto: deriveECDHSharedSecret(ephPriv, recipientECDHPub)
    Crypto-->>Service: sharedSecret (AES-256)
    Service->>Crypto: encryptData({text}, sharedSecret)
    Crypto-->>Service: {iv, data}
    Service->>Crypto: exportECDHPublicKey(ephPub) → base64
    Service->>FS: addDoc(messages, {iv, data, ephemeralPublicKey, senderId, timestamp})
    FS-->>Chat: onSnapshot → new message

    Note over Chat,FS: Recipient decrypts with their ECDH private key + sender's ephemeral public key
```

---

## 7. Remove Last Collaborator → Delete Share

```mermaid
sequenceDiagram
    actor Owner
    participant Modal as CollaborateModal
    participant Collab as collaboration.js
    participant FS as Firestore

    Owner->>Modal: Click remove on last collaborator
    Modal->>Collab: removeDocCollaborator(shareId, uid, currentDocKey)
    Collab->>FS: getDocs(shared_docs/shareId/members)
    FS-->>Collab: remaining members (1 = owner only)
    Collab->>Collab: remaining.length <= 1 → batch delete

    loop For each remaining member doc
        Collab->>FS: batch.delete(memberRef)
    end
    Collab->>FS: batch.delete(shareRef)
    Collab->>FS: batch.commit()
    Collab-->>Modal: return null (share deleted)

    Modal->>Modal: Reset state (shareId, docKey, members)
    Modal->>Owner: onShareDeleted() → clear sharedId from item
```

---

## 8. File Upload with Encryption

```mermaid
sequenceDiagram
    participant Editor as NoteEditor
    participant Storage as firebaseStorage.js
    participant Crypto as Web Crypto API
    participant FB as Firebase Storage

    Editor->>Editor: User selects file
    Editor->>Storage: uploadEncryptedFile(file, masterKey, null, 'notes')
    Storage->>Storage: file.arrayBuffer() → plainBuffer
    Storage->>Crypto: crypto.getRandomValues(12) → IV
    Storage->>Crypto: AES-GCM.encrypt(IV, masterKey, plainBuffer)
    Crypto-->>Storage: encryptedBuffer
    Storage->>Storage: Concat [IV (12 bytes) + ciphertext] → payload
    Storage->>Storage: Generate UUID → fileId
    Storage->>FB: uploadBytesResumable(users/uid/notes/uuid, Blob)
    FB-->>Storage: Upload complete
    Storage-->>Editor: {id: fileId, name, type, size}
```
