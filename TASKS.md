# TASKS — Sanctum v2.0

Development backlog organized by priority and category.

---

## 🔴 P0 — Critical Fixes

- [ ] **Fix new-user KDF**: Use `deriveKeyArgon2id()` instead of `deriveKeyFromPasskey()` in `vault.js` initialization flow. Set `kdf: "argon2id"` in Firestore.
- [ ] **Remove legacy storage rule**: Migrate files from `artifacts/{appId}/{folder}/{fileId}` to `artifacts/{appId}/users/{uid}/{folder}/{fileId}`, then remove `storage.rules:42-45`.
- [ ] **Complete vault reset**: Add missing collections to `resetUserVault()`: `markdown`, `authenticator`, `contacts`, `reminders`, `research`, `devices`, `activity_log`, `task_folders`. Handle subcollection deletion recursively.
- [ ] **Fix batch size limits**: Chunk Firestore batch operations to max 500 ops in `resetUserVault` and `removeDocCollaborator`.

---

## 🟡 P1 — High Priority

- [ ] **Add React ErrorBoundary**: Wrap `<Suspense>` in `App.jsx` with an error boundary for failed lazy-load chunks.
- [ ] **Firestore transactions**: Use `runTransaction()` in `removeDocCollaborator` and `copyFilesForShare` to prevent concurrent edit data loss.
- [ ] **Shared notes TTL**: Add expiration options (1h/24h/7d/30d/never) to public share links. Deploy Cloud Function for cleanup.
- [ ] **Encrypt activity log**: Encrypt activity log entries with master key in `activityLog.js`.
- [ ] **Encrypt device tracker**: Encrypt device metadata with master key in `deviceTracker.js`.
- [ ] **Passkey confirm on change**: Add double-entry confirmation when changing passkey in Settings.
- [ ] **Fix datetime format**: Strip timezone/milliseconds from ISO strings before setting `datetime-local` input values: `value.slice(0, 16)`.
- [ ] **Validate storage paths**: Add path traversal prevention in `getStoragePath()`. Reject `..` sequences.

---

## 🟢 P2 — Enhancements

- [ ] **Manual chunk splitting**: Configure Vite `manualChunks` for `react-markdown`, `firebase`, and `hash-wasm` bundles.
- [ ] **Zxcvbn password strength**: Replace simple character-counting with `zxcvbn` library for realistic strength estimation.
- [ ] **Client-side file size check**: Validate file size before upload, show error if >50MB.
- [ ] **Lockout persistence**: Store `lockoutUntil` timestamp in Firestore to prevent countdown bypass via page refresh.
- [ ] **Error logging service**: Add structured error logging (e.g., Sentry) for production debugging.

---

## 🔵 P3 — Future Features

- [ ] **Client-side full-text search**: Build in-memory FlexSearch index from decrypted docs after unlock.
- [ ] **Per-app encryption sub-keys**: Derive app-specific keys via HKDF: `HKDF(masterKey, "notes")`.
- [ ] **Shared doc version history**: Track document versions in a subcollection for undo/audit.
- [ ] **Multi-device sync indicator**: Show real-time sync status icon in the header.
- [ ] **Markdown collaboration**: Real-time collaborative editing via OT/CRDT on shared markdown docs.

---

## 🟣 P4 — Long-Term Roadmap

- [ ] **Offline-first mode**: IndexedDB caching + Firestore persistence for offline access.
- [ ] **Biometric unlock (WebAuthn)**: FIDO2 authenticator as alternative to passkey.
- [ ] **CRDT conflict resolution**: Implement conflict-free replicated data types for shared document editing.
- [ ] **Double Ratchet protocol**: Full Signal-style ratcheted key evolution for SecureShare.
- [ ] **Self-hosted deployment guide**: Docker + Firestore emulator setup for on-prem deployments.
- [ ] **Accessibility audit**: WCAG 2.1 AA compliance review and fixes.
- [ ] **i18n / Localization**: Multi-language support framework.

---

## 📋 Recently Completed

- [x] ~~Fix shared file access (403 Forbidden)~~ — Files now copied to `shared_docs/` path with re-encryption
- [x] ~~Fix research PDF sharing~~ — Handle both encrypted and unencrypted PDFs
- [x] ~~Delete shared_docs on last collaborator removal~~ — Batch delete with state cleanup
- [x] ~~Wire `onShareDeleted` in all 6 app components~~ — Notes, Markdown, Research, Tasks, Bookmarks, Checklist
- [x] ~~Simplify storage rules for shared_docs~~ — Broadened read access (files are AES-encrypted anyway)
- [x] ~~Skip permission-denied stale shared docs~~ — Silent `continue` in `listenToSharedDocs`
- [x] ~~Upgrade RSA to 4096-bit~~ — SecureShare key generation
- [x] ~~Implement ECDH forward secrecy~~ — Per-message ephemeral key pairs
- [x] ~~Auto-migrate PBKDF2 → Argon2id~~ — Transparent upgrade on unlock
