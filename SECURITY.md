# Security Review — Sanctum v2.0

**Date:** March 4, 2026  
**Scope:** Full client-side security audit of encryption, authentication, data storage, sharing, collaboration, and Firebase rules.

---

## 1. Architecture Overview

Sanctum uses a **zero-knowledge** architecture. All sensitive data is encrypted client-side using the **Web Crypto API** before it reaches Firebase Firestore. The server only stores opaque encrypted blobs.

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Client)                                       │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Passkey   │→ │ Argon2id │→ │ Wrapper  │             │
│  │ (user)    │  │ (WASM)   │  │ Key      │             │
│  └───────────┘  └──────────┘  └──────────┘             │
│                                     │                   │
│                              ┌──────▼─────┐             │
│                              │ Decrypt    │             │
│                              │ Master Key │             │
│                              └──────┬─────┘             │
│                                     │                   │
│  ┌──────────────────────────────────▼─────────────────┐ │
│  │ AES-256-GCM  Encrypt / Decrypt all app data       │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ RSA-4096-OAEP   Key exchange for collaboration     │ │
│  │ ECDH P-256      Forward secrecy for messaging      │ │
│  └────────────────────────────────────────────────────┘ │
└────────────────────┬──────────────────────────────────┘
                     │ Encrypted blobs only
              ┌──────▼──────┐
              │  Firebase   │
              │  Firestore  │
              │  Storage    │
              └─────────────┘
```

---

## 2. Cryptographic Primitives

| Purpose | Algorithm | Parameters |
|---------|-----------|------------|
| Key Derivation (new users) | **Argon2id** (WebAssembly) | 3 iterations, 64 MB memory, parallelism 1, 256-bit output |
| Key Derivation (legacy) | PBKDF2 | 600,000 iterations, SHA-256, 16-byte random salt |
| Legacy → Modern Migration | Argon2id | Auto-migrates on next unlock |
| Data Encryption | AES-256-GCM | 12-byte random IV per encryption |
| Key Wrapping | AES-256-GCM | Master key encrypted under Argon2id-derived wrapper key |
| Collaboration Key Exchange | RSA-4096-OAEP | Per-doc/workspace AES key wrapped per collaborator |
| Chat Encryption (1:1) | ECDH P-256 + AES-256-GCM | Per-message ephemeral keys with ECDH shared secret |
| Chat Encryption (1:1 fallback) | RSA-4096-OAEP + AES-256-GCM | Per-message AES key RSA-encrypted per participant |
| Chat Encryption (Group) | RSA-4096-OAEP + AES-256-GCM | Shared group AES key, RSA-encrypted per member |
| Share Link Keys | AES-256-GCM | Random 256-bit key, URL-safe base64 in fragment |
| File Encryption | AES-256-GCM | 12-byte IV prepended to ciphertext binary |

### Strengths
- ✅ **Argon2id** — gold standard memory-hard KDF (64 MB), resistant to GPU/ASIC
- ✅ **AES-256-GCM** — authenticated encryption (integrity + confidentiality)
- ✅ **12-byte random IVs** — `crypto.getRandomValues()`, unique per operation
- ✅ **RSA-4096-OAEP** with SHA-256 — strong asymmetric key exchange
- ✅ **ECDH P-256** — per-message forward secrecy for 1:1 chats
- ✅ **Keys never leave the browser** — master key exists only in React state
- ✅ **Auto-migration** — PBKDF2 users transparently upgraded to Argon2id

### Known Limitations
- ⚠️ New vault initialization still uses PBKDF2 (pending fix — see LOGICAL_BUGS.md #2)
- ⚠️ No full Double Ratchet — using ephemeral ECDH per message (v2.0 roadmap)

---

## 3. Key Management

### 3.1 Key Hierarchy

```
Passkey (user-memorized, min 8 chars, strength meter enforced)
  │
  ├── Argon2id (64 MB, 3 iters) ──→ Wrapper Key (non-extractable)
  │                                       │
  │                                       └── Encrypts Master Key (stored as blob)
  │
  └── Master Key (AES-256-GCM, extractable=true)
       │
       ├── Encrypts all personal app data
       ├── Encrypts RSA-4096 private key
       ├── Encrypts ECDH P-256 private key
       ├── Validator: { check: "VALID" }
       │
       └── Per-Doc Key (AES-256-GCM)         Per-Workspace Key (AES-256-GCM)
            │                                       │
            ├── Encrypts shared doc content          ├── Encrypts workspace docs
            └── RSA-wrapped per collaborator         └── RSA-wrapped per member
```

### 3.2 Unlock Flow

1. User enters passkey (≥8 characters, strength meter enforced)
2. Client checks rate limit (progressive: 2s → 5s → 15s → 60s after 3/5/8/10 fails)
3. Server-side `failedAttempts` check from Firestore
4. Fetch `encryptionSalt`, `encryptedMasterKey`, `kdf` from `/users/{uid}`
5. Derive wrapper key: Argon2id(passkey, salt, 64MB, 3 iters) or PBKDF2(legacy)
6. Decrypt master key JWK with wrapper key
7. Import JWK → `CryptoKey` object
8. Validate by decrypting `encryptedValidator` — must return `{ check: "VALID" }`
9. If legacy PBKDF2 → auto-migrate to Argon2id (re-wrap, update kdf field)
10. Master key held in React state (memory only)

### 3.3 Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| KDF algorithm | ✅ Excellent | Argon2id (64 MB) |
| Legacy migration | ✅ Good | Auto-upgrades PBKDF2 → Argon2id |
| Salt uniqueness | ✅ Good | 16-byte random per user |
| Wrapper key extractability | ✅ Good | `false` — cannot be exported |
| Master key extractability | ⚠️ Acceptable | `true` (needed for JWK). Mitigated: memory-only |
| Passkey strength | ✅ Good | Min 8 chars + visual strength meter |
| Brute-force protection | ✅ Good | Client + server-side rate limiting |
| Key recovery | ✅ Good | Offline master key export available |

---

## 4. Data Encryption Pattern

```javascript
// ENCRYPT (write)
const payload = { title, content, tags, ... };
const encrypted = await encryptData(payload, masterKey);    // → { iv, data }
await setDoc(docRef, { ...encrypted, ...metadata });

// DECRYPT (read)
const raw = docSnapshot.data();
const decrypted = await decryptData(raw, masterKey);        // → { title, content, ... }
```

### Encrypted vs. Unencrypted Fields

| Category | Encrypted | Examples |
|----------|-----------|---------|
| Content | ✅ Yes | Titles, body text, passwords, URLs, tags, attachments |
| Structural metadata | ❌ No | `isPinned`, `type`, `parentId`, `order`, timestamps |
| Aggregate counters | ❌ No | `itemCount`, `completedCount` |
| Completion status | ❌ No | `completed`, `isCompleted` |
| Activity log | ❌ No | Action labels (no content data) |
| Device tracker | ❌ No | OS, browser, userAgent |

---

## 5. Sharing Security

### 5.1 Public Share Links

```
https://app.example.com/#view?id=DOC_ID&k=AES_KEY_BASE64
```

| Aspect | Security |
|--------|----------|
| Key location | ✅ URL **fragment** — never sent to server |
| Key uniqueness | ✅ Unique AES-256 per share |
| Firestore rule | ✅ `allow read: if true` (intentional — blob is useless without key) |
| Expiration | ⚠️ No TTL — links are permanent |

### 5.2 Per-Document Collaboration

| Aspect | Status | Details |
|--------|--------|---------|
| Per-doc key isolation | ✅ | Each shared doc gets its own AES-256 key |
| RSA key wrapping | ✅ | Per-collaborator RSA-4096-OAEP encryption |
| Key rotation on removal | ✅ | New key generated, doc re-encrypted |
| File re-encryption | ✅ | Attachments copied + re-encrypted with docKey |
| Share deletion cleanup | ✅ | Batch delete shared_docs + members on last removal |
| Transaction safety | ⚠️ | Read-modify-write not wrapped in Firestore transaction |

### 5.3 SecureShare E2E Messaging

| Aspect | Status |
|--------|--------|
| Forward secrecy (1:1) | ✅ ECDH P-256 ephemeral keys per message |
| RSA fallback (1:1) | ✅ RSA-4096 per-message key wrapping |
| Group encryption | ✅ Shared AES-256 key, RSA-wrapped per member |
| Key rotation on member removal | ✅ New key + re-wrap for remaining |
| Self-destruct messages | ✅ Client-side `expiresAt` check + cleanup |
| Read receipts | ✅ Per-user `readBy` map |
| WebRTC calling | ✅ P2P audio/video via WebRTC |

---

## 6. Firebase Security Rules

### Firestore Rules

| Resource | Access | Verdict |
|----------|--------|---------|
| User data (`/users/{uid}`) | Owner only | ✅ Secure |
| App data (`/artifacts/.../users/{uid}/`) | Owner only | ✅ Secure |
| Public keys | Read: any auth user. Write: owner | ✅ Correct |
| Shared notes | Create: auth. Read: public. Delete: creator | ✅ Correct |
| 1:1 chats | Participants only (UID in chatId) | ✅ Secure |
| Groups | Members only (`memberUids` check) | ✅ Secure |
| Group subcollections | Members only (`get()` parent check) | ✅ Secure |
| Shared docs | Members only (`memberUids` check) | ✅ Secure |
| Shared doc members | Members only (`get()` parent check) | ✅ Secure |
| Workspaces | Members only (`memberUids` check) | ✅ Secure |
| Workspace docs | Members only (`get()` parent check) | ✅ Secure |
| Global transfers | Any authenticated user | ⚠️ Broad |

### Storage Rules

| Resource | Access | Verdict |
|----------|--------|---------|
| Personal vault files | Owner only | ✅ Secure |
| Workspace files | Members only (`firestore.get`) | ✅ Secure |
| Shared doc files | Any authenticated user | ⚠️ Broad (mitigated: AES-encrypted) |
| SecureShare files | Any authenticated user | ⚠️ Broad (mitigated: AES-encrypted) |
| Legacy folder paths | Any authenticated user | ❌ **Vulnerability** — see LOGICAL_BUGS.md #1 |

---

## 7. Client-Side Security

| Control | Status |
|---------|--------|
| Auto-lock on inactivity | ✅ Configurable (5m/15m/1h/Never) |
| Lock when tab hidden | ✅ Instant vault lock on tab switch |
| Key cleared on lock | ✅ Master key removed from React state |
| Device tracking | ✅ Sessions logged with UA/OS/browser |
| Activity audit log | ✅ Real-time event log |
| Vault factory reset | ✅ Deletes all collections + key material |
| Per-app data wipe | ✅ With confirmation prompt |
| XSS protection | ✅ React escaping + rehype-sanitize |
| CSRF | ✅ N/A — Firebase Auth tokens, no cookies |
| Content Security Policy | ✅ Full CSP in `firebase.json` |
| X-Content-Type-Options | ✅ `nosniff` |
| X-Frame-Options | ✅ `DENY` |
| Referrer-Policy | ✅ `strict-origin-when-cross-origin` |
| Permissions-Policy | ✅ `camera=(), microphone=(), geolocation=()` |
| Firebase App Check | ✅ ReCAPTCHA v3 |

---

## 8. Import / Export Security

| Feature | Security Model |
|---------|---------------|
| Full vault backup | Decrypted client-side → plaintext JSON download |
| Per-app export | Same — client-side decryption → download |
| Import | Client-side parse → re-encrypt with master key → store |
| Per-app delete | Requires typing app name in CAPS to confirm |

> ⚠️ Exported files contain **plaintext sensitive data** — users should be warned.

---

## 9. Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Server compromise | Medium | **None** — encrypted blobs only | Zero-knowledge architecture |
| Weak passkey | Medium | High | Argon2id (64MB) + 8-char min + strength meter |
| Brute-force passkey | Low | High | Rate limiting (client + server) + Argon2id memory cost |
| URL leak (share links) | Medium | Medium | Key in fragment; unique per share |
| XSS injection | Low | High | React escaping + CSP + rehype-sanitize |
| Compromised device | Medium | High | Auto-lock + lock-on-hidden + device tracking |
| Firestore rules bypass | Low | Medium | Auth-gated + data still encrypted |
| Exported backup leak | Medium | High | User responsibility; plaintext file |
| Legacy storage path access | Medium | Medium | **Needs fix** — remove legacy rule |
| Concurrent edit data loss | Low | Medium | **Needs fix** — Firestore transactions |
| Stale shared doc accumulation | Low | Low | **Needs fix** — TTL + cleanup |

---

## 10. Summary

### What Sanctum Does Well
1. **True zero-knowledge** — all encryption/decryption client-side
2. **Argon2id** — memory-hard KDF (64 MB)
3. **Auto-migration** — PBKDF2 → Argon2id
4. **Strong primitives** — AES-256-GCM, RSA-4096-OAEP, ECDH P-256
5. **Defense in depth** — auto-lock, lock-on-hidden, device tracking, activity log
6. **Per-document collaboration keys** — isolated AES-256 per shared document
7. **ECDH forward secrecy** — per-message ephemeral key pairs
8. **Share links use URL fragments** — keys never reach server
9. **Unique random IV per operation**
10. **Server-side rate limiting** — fail count persisted in Firestore
11. **Key rotation on collaborator removal**
12. **Comprehensive CSP** + App Check

### Areas for Improvement
1. Fix new-user KDF to use Argon2id (currently PBKDF2)
2. Remove legacy storage rule vulnerability
3. Firestore transactions for concurrent edit safety
4. Encrypt activity log and device tracker metadata
5. Add TTL for public shared notes
6. Full Double Ratchet protocol (v2.0 roadmap)
