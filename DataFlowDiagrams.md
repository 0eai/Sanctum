# Data Flow Diagrams — Sanctum v2.0

Data flow diagrams showing how sensitive data moves through the system.

---

## 1. High-Level Data Flow

```mermaid
flowchart LR
    subgraph Browser["Browser (Client)"]
        User[("User Input")]
        UI["React UI Layer"]
        Services["Service Layer"]
        CryptoLib["crypto.js"]
        FSLib["firebase.js"]
    end

    subgraph Firebase["Firebase (Server)"]
        Auth["Firebase Auth"]
        Firestore["Firestore DB"]
        Storage["Firebase Storage"]
    end

    User -->|plaintext| UI
    UI -->|plaintext objects| Services
    Services -->|plaintext payload| CryptoLib
    CryptoLib -->|"{iv, data}"| Services
    Services -->|encrypted blob| FSLib
    FSLib -->|encrypted blob| Firestore
    FSLib -->|encrypted binary| Storage
    Auth -.->|auth token| FSLib

    Firestore -->|encrypted blob| FSLib
    FSLib -->|encrypted blob| Services
    Services -->|"{iv, data}"| CryptoLib
    CryptoLib -->|plaintext payload| Services
    Services -->|plaintext objects| UI
    UI -->|rendered text| User
```

---

## 2. Key Derivation Data Flow

```mermaid
flowchart TD
    subgraph Input
        PK["Passkey (user-memorized)"]
        Salt["Salt (16-byte hex, stored in Firestore)"]
    end

    subgraph KDF["Key Derivation"]
        A2["Argon2id (WASM)"]
        PB["PBKDF2 (legacy)"]
    end

    subgraph Keys["Key Material"]
        WK["Wrapper Key (non-extractable)"]
        EMK["Encrypted Master Key (Firestore blob)"]
        MK["Master Key (AES-256, in-memory only)"]
    end

    PK --> A2
    Salt --> A2
    PK --> PB
    Salt --> PB
    A2 --> WK
    PB --> WK
    WK -->|decrypt| EMK
    EMK -->|"decryptData()"| MK

    subgraph Usage["Master Key Usage"]
        D1["Encrypt/Decrypt all app data"]
        D2["Encrypt RSA private key"]
        D3["Encrypt validator payload"]
    end

    MK --> D1
    MK --> D2
    MK --> D3
```

---

## 3. Per-App Data Flow Pattern

```mermaid
flowchart TD
    subgraph Write["Write Path"]
        W1["User edits item"] --> W2["Component handler"]
        W2 --> W3["Service: buildPayload()"]
        W3 --> W4["encryptData(payload, masterKey)"]
        W4 --> W5["Firestore: setDoc(ref, {iv, data, ...meta})"]
    end

    subgraph Read["Read Path"]
        R1["Firestore: onSnapshot"] --> R2["Raw doc {iv, data, ...meta}"]
        R2 --> R3["decryptData(doc, masterKey)"]
        R3 --> R4["Merge decrypted + metadata"]
        R4 --> R5["setState(items)"]
        R5 --> R6["React re-render"]
    end
```

---

## 4. Collaboration Key Distribution

```mermaid
flowchart TD
    subgraph Owner["Document Owner"]
        O1["Plaintext document"]
        O2["Per-doc AES-256 key (docKey)"]
        O3["Owner's RSA public key"]
    end

    subgraph SharedDoc["Firestore: /shared_docs/{shareId}"]
        S1["{iv, data} encrypted with docKey"]
        S2["memberUids: [owner, collab1, collab2]"]
    end

    subgraph Members["Members Subcollection"]
        M1["members/owner: RSA(docKey, ownerPubKey)"]
        M2["members/collab1: RSA(docKey, collab1PubKey)"]
        M3["members/collab2: RSA(docKey, collab2PubKey)"]
    end

    O1 -->|encryptData| S1
    O2 -->|encryptRSA per member| M1
    O2 -->|encryptRSA per member| M2
    O2 -->|encryptRSA per member| M3
    O2 -.->|used for| S1

    subgraph Collaborator["Collaborator reads"]
        C1["Read members/{myUid}"]
        C2["decryptRSA(encryptedDocKey, myPrivateKey)"]
        C3["deserializeKey → docKey"]
        C4["decryptData({iv, data}, docKey)"]
        C5["Plaintext document"]
    end

    M2 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> C4
    S1 --> C4
    C4 --> C5
```

---

## 5. File Storage Data Flow

```mermaid
flowchart TD
    subgraph Upload["Upload (Personal)"]
        U1["Raw file bytes"]
        U2["crypto.getRandomValues(12) → IV"]
        U3["AES-GCM.encrypt(IV, masterKey, bytes)"]
        U4["Concat: [IV 12B][ciphertext]"]
        U5["Firebase Storage: users/{uid}/app/{uuid}"]
    end

    subgraph Download["Download (Personal)"]
        D1["Firebase Storage: getBlob"]
        D2["Split: buffer[0:12] → IV"]
        D3["Split: buffer[12:] → ciphertext"]
        D4["AES-GCM.decrypt(IV, masterKey, ciphertext)"]
        D5["Raw file bytes"]
    end

    subgraph SharedUpload["Upload (Shared)"]
        SU1["Download from personal path"]
        SU2["Decrypt with masterKey"]
        SU3["Re-encrypt with docKey"]
        SU4["Upload to shared_docs/{shareId}/{uuid}"]
    end

    U1 --> U2 --> U3 --> U4 --> U5
    D1 --> D2 --> D4
    D1 --> D3 --> D4
    D4 --> D5

    U5 -.->|copyFilesForShare| SU1
    SU1 --> SU2 --> SU3 --> SU4
```

---

## 6. SecureShare E2E Message Data Flow

```mermaid
flowchart TD
    subgraph Sender["Sender"]
        S1["Plaintext message"]
        S2["generateECDHKeyPair() → ephemeral"]
        S3["deriveECDHSharedSecret(ephPriv, recipientECDHPub)"]
        S4["encryptData({text}, sharedSecret)"]
        S5["Export ephemeral public key"]
    end

    subgraph Firestore["Firestore"]
        F1["{iv, data, ephemeralPublicKey, senderId}"]
    end

    subgraph Recipient["Recipient"]
        R1["Import sender's ephemeral public key"]
        R2["deriveECDHSharedSecret(myECDHPriv, ephPub)"]
        R3["decryptData({iv, data}, sharedSecret)"]
        R4["Plaintext message"]
    end

    S1 --> S4
    S2 --> S3
    S3 --> S4
    S4 --> F1
    S5 --> F1

    F1 --> R1
    F1 --> R3
    R1 --> R2
    R2 --> R3
    R3 --> R4
```

---

## 7. Import/Export Data Flow

```mermaid
flowchart TD
    subgraph Export
        E1["Firestore: Read encrypted docs"]
        E2["decryptData() each doc"]
        E3["Build JSON/CSV/VCF/HTML format"]
        E4["Blob download (plaintext file)"]
    end

    subgraph Import
        I1["User selects file"]
        I2["Parse JSON/CSV/VCF/HTML"]
        I3["encryptData(item, masterKey) each"]
        I4["Batch write to Firestore"]
    end

    E1 --> E2 --> E3 --> E4
    I1 --> I2 --> I3 --> I4

    style E4 fill:#f96,color:#000
    style I1 fill:#6f9,color:#000
```

> ⚠️ Exported files contain **plaintext sensitive data**. The file never touches the server but exists unencrypted on the user's device.
