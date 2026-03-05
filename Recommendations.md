# Recommendations — Sanctum v2.0

**Date:** March 4, 2026  
**Scope:** Architecture, security, performance, and UX improvement recommendations.

---

## 🔴 Critical (Must Address)

### 1. Fix New-User KDF to Use Argon2id
**Current:** `vault.js` initializes new vaults with `deriveKeyFromPasskey()` (PBKDF2).  
**Recommended:** Use `deriveKeyArgon2id()` and set `kdf: "argon2id"` in the initial write.  
**Effort:** Low (single function swap + field addition).

### 2. Remove Legacy Storage Rule
**Current:** `storage.rules:42-45` allows any authenticated user to read/write legacy folder paths.  
**Recommended:** Migrate all legacy files to `users/{uid}/` paths, then delete the legacy rule.  
**Effort:** Medium (needs data migration script + rule update).

### 3. Complete `resetUserVault` Collection List
**Current:** Only 8 of 15+ collections are deleted during vault reset.  
**Recommended:** Add all collections including `markdown`, `authenticator`, `contacts`, `reminders`, `research`, `devices`, `activity_log`, `task_folders`, and handle subcollections recursively.  
**Effort:** Low.

---

## 🟡 High Priority

### 4. Add React Error Boundary
**Current:** `App.jsx` uses `Suspense` only — no error handling for failed chunk loads.  
**Recommended:** Wrap with `ErrorBoundary` that shows a retry/reload UI.  
**Effort:** Low.

### 5. Firestore Transactions for Concurrent Edits
**Current:** `removeDocCollaborator` and `copyFilesForShare` use read-then-write patterns without transactions.  
**Recommended:** Use `runTransaction()` to prevent lost updates during concurrent editing.  
**Effort:** Medium.

### 6. TTL for Shared Notes
**Current:** Public shared notes never expire.  
**Recommended:** Add optional TTL (1h, 24h, 7d, 30d, never). Deploy a Cloud Function for periodic cleanup.  
**Effort:** Medium.

### 7. Encrypt Activity Log & Device Tracker
**Current:** Activity logs and device metadata are stored in plaintext.  
**Recommended:** Encrypt with master key. Only viewable when vault is unlocked (which matches the UX).  
**Effort:** Low.

---

## 🟢 Enhancements

### 8. Code Splitting — Manual Chunks
**Current:** Build produces large chunks (1MB+ for MarkdownViewer).  
**Recommended:** Configure `build.rollupOptions.output.manualChunks` to split heavy dependencies:
```js
manualChunks: {
  'markdown-viewer': ['react-markdown', 'remark-gfm', 'rehype-katex', 'react-syntax-highlighter'],
  'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
  'crypto': ['hash-wasm'],
}
```
**Effort:** Low.

### 9. Offline-First with Service Worker
**Current:** Basic offline shell caching.  
**Recommended:** Cache Firestore data locally using IndexedDB. Auto-sync when back online using Firestore's persistence (`enableMultiTabIndexedDbPersistence`).  
**Effort:** High.

### 10. Biometric Unlock (WebAuthn)
**Current:** Passkey-only unlock.  
**Recommended:** Add WebAuthn/FIDO2 as an alternative unlock method. Store the wrapper key (or a key-encrypting-key) in the authenticator's credential.  
**Effort:** High.

### 11. End-to-End Encrypted Search
**Current:** No search across encrypted documents.  
**Recommended:** Implement client-side full-text search using an in-memory index (e.g., FlexSearch) built from decrypted documents after unlock.  
**Effort:** Medium.

### 12. Passkey Strength — Zxcvbn Integration
**Current:** Simple character-counting strength meter.  
**Recommended:** Use `zxcvbn` for realistic password strength estimation (dictionary attacks, patterns, etc.).  
**Effort:** Low.

### 13. File Size Limit Enforcement (Client-Side)
**Current:** Storage rules enforce 50MB limit, but no client-side feedback.  
**Recommended:** Check file size before upload and show a user-friendly error with the limit.  
**Effort:** Low.

### 14. Conflict Resolution for Shared Docs
**Current:** Last-write-wins. Concurrent edits can overwrite each other.  
**Recommended:** For v2.0, implement OT (Operational Transform) or CRDT-based conflict resolution. Short-term: add `updatedAt` version checks and show a merge conflict UI.  
**Effort:** Very High (CRDT) / Medium (version check).

### 15. Per-App Encryption Keys
**Current:** Single master key encrypts all app data. Compromising it exposes everything.  
**Recommended:** Derive per-app sub-keys from the master key: `HKDF(masterKey, "notes")`, `HKDF(masterKey, "passwords")`, etc. This limits blast radius if a key is accidentally exposed in a specific context.  
**Effort:** Medium.

---

## 📊 Priority Matrix

| # | Recommendation | Impact | Effort | Priority |
|---|---------------|--------|--------|----------|
| 1 | Argon2id for new users | 🔴 Critical | Low | **P0** |
| 2 | Remove legacy storage rule | 🔴 Critical | Medium | **P0** |
| 3 | Complete vault reset | 🔴 Critical | Low | **P0** |
| 4 | Error boundary | 🟡 High | Low | **P1** |
| 5 | Firestore transactions | 🟡 High | Medium | **P1** |
| 6 | Shared notes TTL | 🟡 High | Medium | **P1** |
| 7 | Encrypt logs/devices | 🟡 High | Low | **P1** |
| 8 | Manual chunks | 🟢 Enhancement | Low | **P2** |
| 12 | Zxcvbn | 🟢 Enhancement | Low | **P2** |
| 13 | Client file size check | 🟢 Enhancement | Low | **P2** |
| 11 | Client-side search | 🟢 Enhancement | Medium | **P3** |
| 15 | Per-app sub-keys | 🟢 Enhancement | Medium | **P3** |
| 14 | Conflict resolution | 🟢 Enhancement | Very High | **P4** |
| 9 | Offline-first | 🟢 Enhancement | High | **P4** |
| 10 | Biometric unlock | 🟢 Enhancement | High | **P4** |
