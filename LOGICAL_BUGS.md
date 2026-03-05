# Logical Bugs & Known Issues — Sanctum v2.0

**Date:** March 4, 2026  
**Scope:** Full codebase audit identifying logical bugs, race conditions, and edge cases.

---

## Critical

### 1. ❌ Storage Rules — Legacy Folder Path Too Broad
**File:** `storage.rules:42-45`  
**Issue:** The legacy fallback rule allows any authenticated user to read/write files under generic folder names (`misc`, `notes`, `markdown`, `research`, etc.) without ownership verification. This means User A can access User B's files stored under `artifacts/{appId}/notes/{fileId}`.  
**Impact:** Cross-user file access for files uploaded before the per-user storage path migration.  
**Fix:** Add ownership check or migrate all legacy files to the `users/{uid}/` scoped path, then remove the legacy rule.

### 2. ❌ `vault.js` — First-Time Vault Uses PBKDF2 Instead of Argon2id
**File:** `vault.js:52`  
**Issue:** `deriveKeyFromPasskey()` (PBKDF2) is used for new vault initialization instead of `deriveKeyArgon2id()`. New users get PBKDF2 as their initial KDF, then need to re-unlock to trigger auto-migration to Argon2id.  
**Impact:** First unlock for new users is weaker than intended (PBKDF2 instead of Argon2id).  
**Fix:** Use `deriveKeyArgon2id()` for initialization, set `kdf: "argon2id"` in the initial Firestore write.

### 3. ❌ `copyFilesForShare` — Attachments Use Personal Master Key for Decryption
**File:** `collaboration.js:86-123`  
**Issue:** Note/markdown attachments are always decrypted with `personalKey` (master key). If the attachment was originally uploaded through a workspace (encrypted with workspace key), the AES decryption will fail silently.  
**Fix:** Accept a `sourceKey` parameter or detect the source encryption context.

---

## High

### 4. ⚠️ Race Condition in `listenToSharedDocs` + `copyFilesForShare`
**File:** `collaboration.js:377-438` / `70-185`  
**Issue:** `shareDocument()` creates the shared doc, then `copyFilesForShare()` reads it back, decrypts, merges updated file references, re-encrypts, and writes again. Between the initial write and the update, `listenToSharedDocs` may fire for the intermediate state, causing the collaborator to see a document with broken file references.  
**Fix:** Use a Firestore transaction or batch the initial write + file reference update together.

### 5. ⚠️ `removeDocCollaborator` — Data Re-encryption Uses Stale Snapshot
**File:** `collaboration.js:285-338`  
**Issue:** When rotating the doc key, the function reads the current doc, decrypts with old key, re-encrypts with new key, and writes back. If another user is simultaneously editing the shared doc, the re-encryption overwrites their changes.  
**Fix:** Use a Firestore transaction to read-modify-write atomically.

### 6. ⚠️ `resetUserVault` — Incomplete Collection List
**File:** `vault.js:12-13`  
**Issue:** `resetUserVault` only deletes 8 app collections (`notes`, `bookmarks`, `checklists`, `counters`, `tasks`, `passwords`, `banking`, `finance`). Missing: `markdown`, `authenticator`, `contacts`, `reminders`, `research`, `devices`, `activity_log`, `task_folders`, and all checklist `items` subcollections.  
**Fix:** Add all app collection names. Use recursive batch deletion for subcollections.

### 7. ⚠️ `shared_notes` — No Expiration / Cleanup
**File:** `firestore.rules:21-25`  
**Issue:** Public shared notes (`/shared_notes/{noteId}`) are readable by anyone and never expire. Over time, orphaned shared notes accumulate with no cleanup mechanism.  
**Fix:** Add a `createdAt` TTL field and a Cloud Function to periodically purge old shared notes.

---

## Medium

### 8. 🔶 Passkey Confirmation Only on Setup, Not on Change
**File:** `LockScreen.jsx`  
**Issue:** Passkey double-entry confirmation is only required during first-time vault setup. When changing the passkey via Settings, there's no confirmation step, so a typo could lock the user out.  
**Fix:** Add passkey confirmation to the change-passkey flow in Settings.

### 9. 🔶 `getStoragePath` — Ambiguous Path Detection
**File:** `firebaseStorage.js:8-18`  
**Issue:** `getStoragePath` uses `fileIdOrScope.includes('/')` to detect scoped paths. A UUID-based fileId like `shared_docs/shareId/uuid` triggers the scoped path logic, which is correct. But a malicious or corrupted `fileId` containing `/` could navigate to unexpected storage paths.  
**Fix:** Validate `fileId` format before constructing the path. Reject any path traversal sequences (e.g., `..`).

### 10. 🔶 Activity Log — Not Encrypted
**File:** `activityLog.js`  
**Issue:** Activity log entries contain action descriptions like "Vault Unlocked", "Failed Unlock Attempt", etc. While they don't contain document content, they reveal usage patterns, login times, and security events to anyone with Firestore access.  
**Fix:** Encrypt activity log entries with the master key (they'd only be viewable when unlocked, which is the intended UX anyway).

### 11. 🔶 Device Tracker — Device Name Leaks OS/Browser Info
**File:** `deviceTracker.js`  
**Issue:** Device entries store `os`, `browser`, `deviceType`, and `userAgent` (truncated to 200 chars) in plaintext. This metadata leaks device fingerprinting info.  
**Fix:** Encrypt device metadata with the master key.

### 12. 🔶 Batch Size Limits Not Handled
**Files:** `vault.js:resetUserVault`, `collaboration.js:removeDocCollaborator`  
**Issue:** Firestore batches have a 500-operation limit. If a user has >500 items in a single collection, `resetUserVault` will fail. Similarly, batch-deleting shared doc members could exceed limits for heavily-shared docs.  
**Fix:** Chunk batch operations into groups of 500.

---

## Low

### 13. 💡 `LockScreen` — Rate Limit is Client-Side Only for Countdown
**File:** `LockScreen.jsx:21-26`  
**Issue:** While `failedAttempts` is persisted in Firestore (server-side), the countdown timer is client-side only. A user could refresh the page to bypass the visual countdown (though the fail count persists).  
**Fix:** Store `lockoutUntil` timestamp in Firestore and enforce it on the next attempt.

### 14. 💡 DateTime Format Warning in Task/Reminder Inputs
**Files:** Various app components  
**Issue:** `datetime-local` inputs receive ISO strings like `2026-02-11T15:00:00.000Z` which don't conform to the required `yyyy-MM-ddThh:mm` format. This causes console warnings.  
**Fix:** Strip the timezone suffix and milliseconds before setting the input value: `value.slice(0, 16)`.

### 15. 💡 No Error Boundary for Lazy-Loaded Apps
**File:** `App.jsx:202-206`  
**Issue:** If a lazy-loaded app chunk fails to load (network error, corrupt cache), the entire app crashes with an unhandled error. Only `Suspense` is used, which handles loading but not errors.  
**Fix:** Wrap `Suspense` with a React `ErrorBoundary` component.
