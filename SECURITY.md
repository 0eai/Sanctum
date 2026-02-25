# Security Review — Sanctum v1.0.2

**Date:** February 25, 2026  
**Scope:** Full client-side security audit of encryption, authentication, data storage, sharing, and Firestore rules.

---

## 1. Architecture Overview

Sanctum uses a **zero-knowledge** architecture. All sensitive data is encrypted client-side using the **Web Crypto API** before it reaches Firebase Firestore. The server only stores opaque encrypted blobs — even the Firebase project operator cannot read user data.

```
┌─────────────────────────────────────────────┐
│  Browser (Client)                           │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Passkey   │→ │ PBKDF2   │→ │ Wrapper  │ │
│  │ (user)    │  │ 100k     │  │ Key      │ │
│  └───────────┘  └──────────┘  └──────────┘ │
│                                     │       │
│                              ┌──────▼─────┐ │
│                              │ Decrypt    │ │
│                              │ Master Key │ │
│                              └──────┬─────┘ │
│                                     │       │
│  ┌──────────────────────────────────▼─────┐ │
│  │ AES-256-GCM  Encrypt / Decrypt        │ │
│  │ All app data (notes, passwords, etc.) │ │
│  └───────────────────────────────────────┘ │
└────────────────────┬────────────────────────┘
                     │ Encrypted blobs only
              ┌──────▼──────┐
              │  Firestore  │
              └─────────────┘
```

---

## 2. Cryptographic Primitives

| Purpose | Algorithm | Parameters |
|---------|-----------|------------|
| Key Derivation | PBKDF2 | 100,000 iterations, SHA-256, 16-byte random salt |
| Data Encryption | AES-256-GCM | 12-byte random IV per encryption |
| Key Wrapping | AES-256-GCM | Master key encrypted under PBKDF2-derived wrapper key |
| Chat Encryption (1:1) | RSA-OAEP + AES-256-GCM | RSA-2048, per-message AES key encrypted for each participant |
| Chat Encryption (Group) | RSA-OAEP + AES-256-GCM | Shared group AES key, RSA-encrypted per member |
| Share Link Keys | AES-256-GCM | Random 256-bit key, URL-safe base64 in fragment |

### Strengths
- **AES-256-GCM** provides authenticated encryption (integrity + confidentiality)
- **12-byte random IVs** generated via `crypto.getRandomValues()` — unique per operation
- **100,000 PBKDF2 iterations** is a reasonable cost factor for browser-based derivation
- **RSA-2048-OAEP** with SHA-256 is standard for hybrid E2E encryption
- **Keys never leave the browser** — the master key exists only in memory

### Recommendations
- Consider increasing PBKDF2 to **600,000 iterations** (OWASP 2024 recommendation for SHA-256)
- Consider **Argon2id** via WebAssembly for stronger resistance to GPU attacks (future enhancement)
- RSA-2048 meets current standards; **RSA-4096** or **X25519** would provide longer-term security margins

---

## 3. Key Management

### 3.1 Key Hierarchy

```
Passkey (user-memorized)
  │
  ├── PBKDF2 + salt ──→ Wrapper Key (non-extractable)
  │                         │
  │                         ├── Encrypts Master Key (stored in Firestore as blob)
  │                         │
  │                         └── Stored: { iv, data } in /users/{uid}/encryptedMasterKey
  │
  └── Master Key (AES-256-GCM, extractable=true)
       │
       ├── Encrypts all app data
       ├── Encrypts RSA private key (for SecureShare)
       └── Validator: { check: "VALID" } encrypted with master key
```

### 3.2 Unlock Flow (`LockScreen.jsx`)

1. User enters passkey
2. Fetch `encryptionSalt` and `encryptedMasterKey` from `/users/{uid}`
3. Derive wrapper key: `PBKDF2(passkey, salt, 100k, SHA-256) → AES-256-GCM`
4. Decrypt master key JWK with wrapper key
5. Import JWK → `CryptoKey` object
6. Validate by decrypting `encryptedValidator` — must return `{ check: "VALID" }`
7. On success, master key held in React state (memory only)

### 3.3 Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| Salt uniqueness | ✅ Good | 16-byte random salt per user via `crypto.getRandomValues()` |
| Wrapper key extractability | ✅ Good | Set to `false` — cannot be exported |
| Master key extractability | ⚠️ Acceptable | Set to `true` (needed for JWK export/import). Mitigated: only in memory |
| Key storage | ✅ Good | Master key JWK only exists encrypted in Firestore |
| Passkey strength | ⚠️ User-dependent | Min 4 characters enforced. No complexity requirements |
| Brute-force protection | ⚠️ Limited | No server-side rate limiting on passkey attempts. PBKDF2 cost is the only defense |

### Recommendations
- Enforce minimum passkey length of **8+ characters** with strength meter
- Add client-side rate limiting (progressive delay after failed attempts)
- Consider storing a **failed attempt counter** in Firestore

---

## 4. Data Encryption Pattern

Every service follows the same pattern:

```javascript
// ENCRYPT (write)
const payload = { title, content, tags, ... };              // plaintext
const encrypted = await encryptData(payload, masterKey);    // → { iv, data }
await setDoc(docRef, { ...encrypted, ...metadata });        // store

// DECRYPT (read)
const raw = docSnapshot.data();                             // { iv, data, ...meta }
const decrypted = await decryptData(raw, masterKey);        // → { title, content, ... }
```

### What's Encrypted vs. Not

| Field | Encrypted | Rationale |
|-------|-----------|-----------|
| All content (titles, text, passwords, etc.) | ✅ Yes | Primary sensitive data |
| `isPinned`, `type`, `parentId` | ❌ No | Used for Firestore queries/ordering |
| `isCompleted` (checklists) | ❌ No | Used for completion counts |
| `order` | ❌ No | Used for sort ordering |
| `createdAt`, `updatedAt` | ❌ No | Firestore `serverTimestamp()` for ordering |
| `itemCount`, `completedCount` | ❌ No | Aggregate counters on parent docs |

### Assessment
- ✅ **All sensitive content is encrypted** — titles, body text, passwords, URLs, notes, tags, attachments
- ⚠️ **Structural metadata is unencrypted** — an observer can see how many items exist, their creation times, completion status, and folder structure. This is standard for E2E encrypted apps (Signal stores similar metadata)
- ⚠️ **Attachments are base64-encoded inside encrypted blob** — works but increases Firestore document size. Files >1MB should be considered for Firebase Storage with per-file encryption

---

## 5. Sharing Security

### 5.1 Public Share Links

```
https://app.example.com/#view?id=DOC_ID&k=AES_KEY_BASE64
```

| Component | Security |
|-----------|----------|
| `id` | Firestore document ID (random) |
| `k` | URL-safe base64 of raw 256-bit AES key |
| URL fragment (`#`) | ✅ Never sent to server (stays client-side) |
| Encrypted blob in Firestore | ✅ Readable by anyone, but useless without key |

### Assessment
- ✅ Key is in URL **fragment** — not sent to server in HTTP request
- ✅ Each share generates a **unique AES-256 key** — independent of master key
- ⚠️ Anyone with the full URL can decrypt. URL sharing carries inherent risk (clipboard, browser history, messaging apps may log URLs)
- ⚠️ No expiration on shared links. Consider adding TTL support

### 5.2 SecureShare (E2E Chat)

**1:1 Chats:**
- Each message: random AES key → encrypts message → AES key encrypted with each participant's RSA public key
- Private keys encrypted with user's master key and stored in Firestore
- Chat IDs: `uid1_uid2` (sorted) — both participants have Firestore read/write access

**Group Chats:**
- Shared AES-256-GCM group key, RSA-encrypted per member
- Members validated via `memberUids` array in Firestore rules

| Aspect | Status |
|--------|--------|
| Forward secrecy | ❌ Not implemented — same RSA key pair for all messages |
| Key rotation on member removal | ❌ Not implemented — removed members retain old messages |
| Self-destruct messages | ✅ Client-side expiry check + cleanup |
| Read receipts | ✅ Per-user `readBy` map |

### Recommendations
- Implement **group key rotation** on member removal
- Consider **Double Ratchet** or **Signal Protocol** for forward secrecy in 1:1 chats
- Self-destruct relies on client-side enforcement — Firebase Functions could add server-side TTL cleanup

---

## 6. Firestore Security Rules

### Current Rules Assessment

| Rule | Verdict | Notes |
|------|---------|-------|
| User data isolation | ✅ Secure | `request.auth.uid == userId` enforced |
| Shared notes — create | ✅ Auth required | Only logged-in users can create |
| Shared notes — read | ✅ Public | Intentional — encrypted blobs |
| Shared notes — delete | ⚠️ Broad | Any auth user can delete any shared note. Mitigated: doc IDs are random and only known to creator |
| Public keys — read | ✅ Auth users | Required for RSA key exchange |
| Public keys — write | ✅ Owner only | Prevents key impersonation |
| 1:1 chats | ✅ Participants only | UID in chat ID validation |
| Group chats — create | ✅ Auth required | |
| Group chats — read/update | ✅ Members only | `memberUids` array check |
| Group chats — subcollections | ⚠️ Broad | Any auth user can read/write group subcollections. Should check membership |

### Recommendations
- **Group subcollections**: Restrict to members. Current rule `allow read, write: if request.auth != null` is too permissive — it should check parent `memberUids`
- **Shared notes delete**: Consider adding `request.auth.uid == resource.data.createdBy` if you add a `createdBy` field
- **Rate limiting**: Firestore rules don't support rate limiting. Consider Firebase App Check for API abuse prevention

---

## 7. Client-Side Security

| Control | Status |
|---------|--------|
| Auto-lock on inactivity | ✅ Configurable timer (Settings → Security) |
| Key cleared on lock | ✅ Master key removed from React state |
| Device tracking | ✅ Sessions logged in Firestore with UA/OS/browser |
| Activity audit log | ✅ Failed attempts, vault unlocks, resets logged |
| Vault factory reset | ✅ Deletes all collections + key material |
| XSS protection | ⚠️ React's default escaping. ReactMarkdown with `remarkGfm` could render HTML in shared content |
| CSRF | ✅ N/A — Firebase Auth tokens, no cookies |
| Content Security Policy | ✅ Configured | `firebase.json` headers enforce CSP |

### Recommendations
- ✅ **CSP headers configured** in `firebase.json`
- Sanitize shared markdown content (use `rehype-sanitize` with ReactMarkdown)  
- ✅ **Firebase App Check** configured with ReCAPTCHA v3

---

## 8. Summary

### What Sanctum Does Well
1. **True zero-knowledge** — all encryption/decryption happens client-side
2. **Strong primitives** — AES-256-GCM, PBKDF2, RSA-2048-OAEP
3. **Defense in depth** — auto-lock, device tracking, activity logging
4. **Share links use URL fragments** — keys never reach the server
5. **Each encryption operation uses a unique random IV**

### Areas for Improvement
1. **PBKDF2 iterations** → increase to 600k or migrate to Argon2id
2. **Passkey policy** → enforce minimum 8 chars + strength indicator
3. **Group chat key rotation** → rotate on member removal
4. **Forward secrecy** → Signal Protocol for 1:1 chats
5. **Firestore rules** → tighten group subcollection access
6. **CSP headers** → add Content-Security-Policy
7. **Shared content sanitization** → rehype-sanitize for markdown

### Risk Matrix

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Server compromise | Medium | **None** — encrypted blobs only | Zero-knowledge architecture |
| Weak passkey | High | High | PBKDF2 slows brute-force; add policy |
| URL leak (share links) | Medium | Medium | Key in fragment; unique per share |
| XSS injection | Low | High | React escaping; add CSP + sanitize |
| Compromised device | Medium | High | Auto-lock; device tracking |
| Firestore rules bypass | Low | Medium | Auth-gated; data still encrypted |
