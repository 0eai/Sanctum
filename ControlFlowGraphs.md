# Control Flow Graphs — Sanctum v2.0

All diagrams use Mermaid syntax and depict the major control-flow paths through the application.

---

## 1. Application Bootstrap (`App.jsx`)

```mermaid
flowchart TD
    A[Page Load] --> B[onAuthStateChanged]
    B -->|No user| C[Show Login Screen]
    B -->|User authenticated| D[syncUserProfile + fetchAppPreferences]
    C -->|signInWithPopup| B
    D --> E{cryptoKey exists?}
    E -->|No| F[Show LockScreen]
    E -->|Yes| G{Parse Hash Route}
    F -->|onUnlock| H[setCryptoKey + logActivity + registerDevice]
    H --> G
    G -->|#view| I[SharedNote Viewer]
    G -->|#notes, #tasks, etc.| J["Suspense → Lazy Load App"]
    G -->|No hash / empty| K[Launcher Grid]
    J --> L[App Component with props]
    L -->|onExit| K
```

---

## 2. Vault Unlock / Initialization (`vault.js + LockScreen.jsx`)

```mermaid
flowchart TD
    A[User Enters Passkey] --> B{Rate Limited?}
    B -->|Yes| C[Show Countdown Timer]
    C --> A
    B -->|No| D[Fetch /users/uid]
    D --> E{Salt + EncryptedMasterKey exist?}

    E -->|No: New Vault| F["generateSalt()"]
    F --> G["generateMasterKey()"]
    G --> H["deriveKeyFromPasskey(passkey, salt)"]
    H --> I["encryptData(masterKeyJWK, wrapperKey)"]
    I --> J["encryptData({check: VALID}, masterKey)"]
    J --> K[Write to Firestore: salt + encryptedMasterKey + validator]
    K --> L[Return masterKey]

    E -->|Yes: Existing Vault| M{Check kdf field}
    M -->|argon2id| N["deriveKeyArgon2id(passkey, salt)"]
    M -->|pbkdf2 / legacy| O["deriveKeyFromPasskey(passkey, salt, iterations)"]
    N --> P["decryptData(encryptedBlob, wrapperKey)"]
    O --> P
    P --> Q{Decrypted JWK valid?}
    Q -->|No| R[Increment failCount + Show Error]
    R --> A
    Q -->|Yes| S["importMasterKey(jwk)"]
    S --> T["decryptData(validator, masterKey)"]
    T --> U{check === VALID?}
    U -->|No| R
    U -->|Yes| V{Legacy PBKDF2?}
    V -->|Yes| W[Auto-migrate to Argon2id]
    V -->|No| L
    W --> L
```

---

## 3. Data Encrypt / Decrypt (`crypto.js`)

```mermaid
flowchart TD
    subgraph Encrypt
        A[plainObject] --> B["JSON.stringify()"]
        B --> C["TextEncoder.encode()"]
        C --> D["crypto.getRandomValues(12 bytes) → IV"]
        D --> E["AES-GCM encrypt(IV, masterKey, encoded)"]
        E --> F["{ iv: base64(IV), data: base64(ciphertext) }"]
    end

    subgraph Decrypt
        G["{ iv, data }"] --> H["base64ToBuffer(iv) → IV"]
        G --> I["base64ToBuffer(data) → ciphertext"]
        H --> J["AES-GCM decrypt(IV, masterKey, ciphertext)"]
        I --> J
        J --> K["TextDecoder.decode()"]
        K --> L["JSON.parse() → plainObject"]
    end
```

---

## 4. Share Document Flow (`collaboration.js`)

```mermaid
flowchart TD
    A[Owner clicks Share] --> B["generateMasterKey() → docKey"]
    B --> C["encryptData(cleanData, docKey)"]
    C --> D["For each collaborator UID"]
    D --> E["getPublicKey(uid) → RSA public key"]
    E --> F["serializeKey(docKey) → JSON string"]
    F --> G["encryptRSA(JSON, publicKey) → encryptedDocKey"]
    G --> H[Write member doc: /shared_docs/shareId/members/uid]
    D --> I{More collaborators?}
    I -->|Yes| D
    I -->|No| J[Write shared doc to Firestore]
    J --> K{Has attachments or driveFileId?}
    K -->|Yes| L["copyFilesForShare()"]
    K -->|No| M[Return shareId + docKey]
    L --> N[Download from owner path → Decrypt → Re-encrypt with docKey → Upload to shared path]
    N --> O[Update shared doc with new file references]
    O --> M
```

---

## 5. Auto-Lock Flow (`App.jsx`)

```mermaid
flowchart TD
    A[cryptoKey set] --> B["Read sanctum_autolock from localStorage"]
    B --> C{Timeout = 0 (Never)?}
    C -->|Yes| D[No timer set]
    C -->|No| E["setTimeout(lock, timeout)"]
    E --> F{User interaction?}
    F -->|mousedown/keydown/touchstart/scroll| G[Clear + Reset timer]
    G --> E
    F -->|Timeout fires| H["setCryptoKey(null) → Lock"]

    A --> I{lock_on_hidden enabled?}
    I -->|Yes| J[Listen visibilitychange]
    J --> K{Tab hidden?}
    K -->|Yes| H
    K -->|No| J
```

---

## 6. Notes App CRUD Flow (`Notes.jsx`)

```mermaid
flowchart TD
    A[NotesApp Mount] --> B["listenToNotes(uid, cryptoKey, parentId)"]
    B --> C[onSnapshot → decrypt each doc → setNotes]

    D[User creates note] --> E["saveNote(uid, cryptoKey, noteData)"]
    E --> F["encryptData(payload, masterKey)"]
    F --> G["setDoc(noteRef, encrypted + metadata)"]
    G --> C

    H[User opens folder] --> I[setCurrentFolderId + push breadcrumb]
    I --> B

    J[User edits note] --> K[NoteEditor: auto-save via debounce]
    K --> E

    L[User shares note] --> M["shareNote(uid, cryptoKey, note)"]
    M --> N[Generate share key → Encrypt → Upload to /shared_notes]
    N --> O[Update note with sharedId + shareUrlKey]
```

---

## 7. SecureShare Message Flow (`SecureShare.jsx`)

```mermaid
flowchart TD
    A[User types message] --> B["handleSend()"]
    B --> C{Group chat?}
    C -->|Yes| D["sendGroupMessage(groupId, text, groupKey)"]
    D --> E["encryptData({text}, groupKey)"]
    E --> F[Write to /groups/groupId/messages]
    C -->|No: 1:1| G{ECDH available?}
    G -->|Yes| H["generateECDHKeyPair() → ephemeral"]
    H --> I["deriveECDHSharedSecret(ephPrivate, recipientECDHPublic)"]
    I --> J["encryptData({text}, sharedSecret)"]
    J --> K["Attach ephemeral public key to message"]
    G -->|No: RSA fallback| L["generateMasterKey() → msgKey"]
    L --> M["encryptData({text}, msgKey)"]
    M --> N["encryptRSA(msgKey, senderPublicKey) → senderCopy"]
    N --> O["encryptRSA(msgKey, recipientPublicKey) → recipientCopy"]
    K --> P[Write to /chats/chatId/messages]
    O --> P
```
