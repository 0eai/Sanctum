# Data Structures — Sanctum v2.0

This document maps every Firestore collection, document schema, Firebase Storage structure, and in-memory data model.

---

## Encryption Format

All encrypted fields follow the same blob format:

```json
{
  "iv": "base64-encoded-12-byte-IV",
  "data": "base64-encoded-AES-256-GCM-ciphertext"
}
```

When stored, `iv` and `data` are spread directly onto the document alongside unencrypted metadata fields.

**File encryption format** (Firebase Storage):
```
[12-byte IV][AES-256-GCM ciphertext]  →  single binary blob
```

---

## 1. User Keys

**Path:** `/users/{userId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `encryptionSalt` | string | ❌ | 16-byte hex salt for key derivation |
| `encryptedMasterKey` | `{iv, data}` | ✅ (wrapper key) | AES-256 master key JWK, encrypted with derived wrapper key |
| `encryptedValidator` | `{iv, data}` | ✅ (master key) | `{ check: "VALID" }` encrypted with master key — verifies passkey correctness |
| `kdf` | string | ❌ | Key derivation function: `"argon2id"` (default) or `"pbkdf2"` (legacy) |
| `iterations` | number | ❌ | PBKDF2 iteration count (legacy users only, default 600,000) |
| `failedAttempts` | number | ❌ | Server-side failed unlock counter |
| `lockoutUntil` | timestamp | ❌ | Server-side lockout expiry |

---

## 2. Notes

**Path:** `/artifacts/{appId}/users/{userId}/notes/{noteId}`

### Stored (Firestore)
| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `iv` | string | — | AES-GCM initialization vector |
| `data` | string | — | Encrypted payload blob |
| `isPinned` | boolean | ❌ | Pin status (for query filtering) |
| `type` | string | ❌ | `"note"` or `"folder"` |
| `parentId` | string\|null | ❌ | Parent folder ID |
| `createdAt` | timestamp | ❌ | Firestore server timestamp |
| `updatedAt` | timestamp | ❌ | Firestore server timestamp |

### Decrypted Payload
```json
{
  "title": "My Note",
  "content": "Note body text...",
  "tags": ["tag1", "tag2"],
  "attachments": [
    { "name": "file.pdf", "type": "application/pdf", "driveFileId": "users/{uid}/notes/{uuid}" }
  ],
  "dueDate": "2026-03-01T09:00:00.000Z",
  "repeat": "none|daily|weekly|monthly|yearly",
  "sharedId": "firestore-doc-id-or-null",
  "shareUrlKey": "url-safe-base64-key-or-null"
}
```

### Folders
```json
{ "title": "Folder Name" }
```

---

## 3. Markdown Documents

**Path:** `/artifacts/{appId}/users/{userId}/markdown/{docId}`

### Stored (Firestore)
| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `iv` | string | — | AES-GCM IV |
| `data` | string | — | Encrypted payload |
| `isPinned` | boolean | ❌ | Pin status |
| `type` | string | ❌ | `"markdown"` or `"folder"` |
| `parentId` | string\|null | ❌ | Parent folder ID |
| `createdAt` | timestamp | ❌ | |
| `updatedAt` | timestamp | ❌ | |

### Decrypted Payload
```json
{
  "title": "Document Title",
  "content": "# Heading\n\nMarkdown content...",
  "tags": ["tag1"],
  "attachments": [{ "name": "image.png", "type": "image/png", "driveFileId": "users/{uid}/markdown/{uuid}" }],
  "dueDate": "2026-03-01T00:00:00.000Z",
  "repeat": "none",
  "sharedId": "firestore-doc-id-or-null",
  "shareUrlKey": "url-safe-base64-key-or-null"
}
```

---

## 4. Tasks

**Path:** `/artifacts/{appId}/users/{userId}/tasks/{taskId}`

### Stored (Firestore)
| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `iv` | string | — | AES-GCM IV |
| `data` | string | — | Encrypted payload |
| `isPinned` | boolean | ❌ | Starred status |
| `completed` | boolean | ❌ | Completion status |
| `order` | number | ❌ | Sort order |
| `createdAt` | timestamp | ❌ | |
| `updatedAt` | timestamp | ❌ | |

### Decrypted Payload
```json
{
  "title": "Task title",
  "folderId": "folder-id-or-null",
  "notes": "Additional notes...",
  "dueDate": "2026-03-01T09:00:00.000Z",
  "deadline": null,
  "repeat": "none|daily|weekly|monthly|yearly",
  "sharedId": "shareId-or-null",
  "shareUrlKey": "key-or-null",
  "subtasks": [
    { "text": "Subtask 1", "completed": false },
    { "text": "Subtask 2", "completed": true }
  ]
}
```

### Task Folders
**Path:** `/artifacts/{appId}/users/{userId}/task_folders/{folderId}`

Decrypted: `{ "name": "Work" }`

---

## 5. Checklists

### Lists — `/artifacts/{appId}/users/{userId}/checklists/{listId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `iv` | string | — | AES-GCM IV |
| `data` | string | — | Encrypted payload |
| `itemCount` | number | ❌ | Total items |
| `completedCount` | number | ❌ | Completed items |
| `order` | number | ❌ | Sort order |
| `createdAt` | timestamp | ❌ | |

Decrypted: `{ "title": "Groceries", "dueDate": "...", "repeat": "weekly", "sharedId": null }`

### Items (subcollection) — `checklists/{listId}/items/{itemId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `iv`, `data` | string | — | Encrypted payload |
| `isCompleted` | boolean | ❌ | Completion status |
| `order` | number | ❌ | Sort order |
| `createdAt` | timestamp | ❌ | |

Decrypted: `{ "text": "Milk", "dueDate": "...", "repeat": "none" }`

---

## 6. Passwords

**Path:** `/artifacts/{appId}/users/{userId}/passwords/{itemId}`

### Decrypted Payload (Entry)
```json
{
  "type": "password",
  "service": "GitHub",
  "username": "user@example.com",
  "password": "s3cureP@ss!",
  "url": "https://github.com",
  "notes": "Personal account",
  "history": [{ "password": "oldP@ss", "changedAt": "2026-01-15T..." }],
  "parentId": "folder-id-or-null",
  "updatedAt": "2026-02-25T..."
}
```

### Decrypted Payload (Folder)
```json
{ "type": "folder", "title": "Social Media", "parentId": null }
```

---

## 7. Authenticator (TOTP)

**Path:** `/artifacts/{appId}/users/{userId}/authenticator/{entryId}`

```json
{
  "service": "GitHub",
  "account": "user@example.com",
  "secret": "JBSWY3DPEHPK3PXP",
  "algorithm": "SHA1",
  "digits": 6,
  "period": 30
}
```

---

## 8. Contacts

**Path:** `/artifacts/{appId}/users/{userId}/contacts/{contactId}`

```json
{
  "firstName": "John", "lastName": "Doe",
  "company": "Acme Inc", "jobTitle": "Engineer",
  "birthday": "1990-01-15",
  "photo": "data:image/jpeg;base64,...",
  "isFavorite": true,
  "phones": [{ "id": "...", "label": "Mobile", "value": "+1234567890" }],
  "emails": [{ "id": "...", "label": "Personal", "value": "john@example.com" }],
  "addresses": [{ "id": "...", "label": "Home", "value": "123 Main St" }],
  "websites": [{ "id": "...", "label": "Website", "value": "https://example.com" }],
  "customFields": [{ "id": "...", "label": "Notes", "value": "Met at conference" }],
  "labels": ["Work", "VIP"],
  "notes": "Additional notes"
}
```

---

## 9. Bookmarks

**Path:** `/artifacts/{appId}/users/{userId}/bookmarks/{bookmarkId}`

```json
{
  "type": "bookmark",
  "title": "Example Site",
  "url": "https://example.com",
  "description": "...",
  "parentId": "folder-id-or-null",
  "sharedId": null,
  "shareUrlKey": null
}
```

---

## 10. Finance

**Path:** `/artifacts/{appId}/users/{userId}/finance/{entryId}`

```json
{
  "type": "expense|income",
  "amount": 42.50,
  "currency": "USD",
  "category": "Food",
  "description": "Lunch",
  "date": "2026-02-25"
}
```

---

## 11. Banking

**Path:** `/artifacts/{appId}/users/{userId}/banking/{accountId}`

```json
{
  "accountName": "Main Checking",
  "balance": 1500.00,
  "currency": "USD",
  "transactions": [
    { "description": "Grocery Store", "amount": -45.30, "date": "2026-02-25", "category": "Food" }
  ]
}
```

---

## 12. Reminders

**Path:** `/artifacts/{appId}/users/{userId}/reminders/{reminderId}`

```json
{
  "title": "Doctor appointment",
  "datetime": "2026-03-01T10:00:00.000Z",
  "repeat": "none",
  "notes": "Room 204",
  "isActive": true
}
```

---

## 13. Counters

**Path:** `/artifacts/{appId}/users/{userId}/counters/{counterId}`

```json
{ "title": "Push-ups", "count": 42, "step": 1 }
```

---

## 14. Research Papers

**Path:** `/artifacts/{appId}/users/{userId}/research/{paperId}`

### Stored (Firestore)
| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `iv`, `data` | string | — | Encrypted payload |
| `type` | string | ❌ | `"paper"` or `"folder"` |
| `parentId` | string\|null | ❌ | Parent folder ID |
| `createdAt`, `updatedAt` | timestamp | ❌ | |

### Decrypted Payload
```json
{
  "title": "Paper Title",
  "authors": "Author 1, Author 2",
  "year": "2025",
  "venue": "Conference Name",
  "url": "https://...",
  "bibtex": "@article{...}",
  "isPrivate": false,
  "hasPdf": true,
  "pdfPath": null,
  "pdfWrappingKey": null,
  "pdfHash": "content-hash-string",
  "driveFileId": "users/{uid}/research/{uuid}",
  "isEncrypted": false,
  "aiSummary": "AI-generated summary...",
  "tags": ["ML", "NLP"],
  "addedAt": "2026-02-25T...",
  "sharedId": null,
  "shareUrlKey": null
}
```

---

## 15. Shared Notes (Public Links)

**Path:** `/shared_notes/{noteId}`

| Field | Type | Description |
|-------|------|-------------|
| `iv`, `data` | `{iv, data}` | Encrypted payload (AES-256-GCM with share-specific key) |
| `createdBy` | string | Owner's UID |
| `createdAt` | timestamp | Creation time |

---

## 16. SecureShare: Public Keys

**Path:** `/artifacts/{appId}/public_keys/{userId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `publicKey` | string | ❌ | RSA-4096 SPKI public key (base64) |
| `displayName` | string | ❌ | User's display name |
| `email` | string | ❌ | User's email |
| `photoURL` | string | ❌ | Profile photo URL |
| `encryptedPrivateKey` | `{iv, data}` | ✅ (master key) | RSA-4096 PKCS#8 private key |
| `ecdhPublicKey` | string | ❌ | ECDH P-256 public key (base64) |
| `encryptedEcdhPrivateKey` | `{iv, data}` | ✅ (master key) | ECDH P-256 private key |

---

## 17. SecureShare: 1:1 Chats

**Path:** `/artifacts/{appId}/chats/{chatId}/messages/{msgId}`

| Field | Type | Description |
|-------|------|-------------|
| `senderId` | string | Sender's UID |
| `iv`, `data` | string | Encrypted message content |
| `ephemeralPublicKey` | string | ECDH ephemeral public key for forward secrecy |
| `senderCopy` | `{iv, data}` | RSA fallback: message encrypted for sender |
| `recipientCopy` | `{iv, data}` | RSA fallback: message encrypted for recipient |
| `timestamp` | timestamp | Server timestamp |
| `expiresAt` | timestamp\|null | Self-destruct time |
| `readBy` | map | `{ [uid]: timestamp }` — read receipts |
| `artifact` | object\|null | Shared artifact metadata |

---

## 18. SecureShare: Group Chats

### Group Document — `/artifacts/{appId}/groups/{groupId}`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Group name |
| `createdBy` | string | Creator's UID |
| `memberUids` | string[] | Member UID array |
| `members` | map | `{ [uid]: { displayName, email, photoURL, encryptedGroupKey } }` |
| `createdAt` | timestamp | |

### Group Messages — `/groups/{groupId}/messages/{msgId}`

| Field | Type | Description |
|-------|------|-------------|
| `senderId`, `senderName` | string | Sender info |
| `iv`, `data` | string | Message encrypted with shared AES key |
| `timestamp` | timestamp | |
| `expiresAt` | timestamp\|null | Self-destruct |
| `readBy` | map | Read receipts |

---

## 19. Per-Document Sharing

**Path:** `/artifacts/{appId}/shared_docs/{shareId}`

| Field | Type | Description |
|-------|------|-------------|
| `iv`, `data` | string | Document encrypted with per-doc AES-256 key |
| `appType` | string | `notes\|markdown\|tasks\|research\|bookmarks\|checklists` |
| `docType` | string | `note\|folder\|task\|paper\|bookmark\|checklist` |
| `ownerUid` | string | Owner's UID |
| `memberUids` | string[] | Member UIDs for Firestore rules |
| `sharedFolderId` | string\|null | Group link for batch-shared folders |
| `parentShareId` | string\|null | Parent folder's shareId |
| `isPinned` | boolean | |
| `createdAt`, `updatedAt` | timestamp | |

### Members — `/shared_docs/{shareId}/members/{uid}`

| Field | Type | Description |
|-------|------|-------------|
| `encryptedDocKey` | string | AES-256 key, RSA-OAEP encrypted for this member |
| `role` | string | `owner\|editor\|viewer` |
| `joinedAt` | timestamp | |

---

## 20. Workspace Sharing

**Path:** `/artifacts/{appId}/workspaces/{wsId}`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Workspace display name |
| `createdBy` | string | Creator's UID |
| `memberUids` | string[] | Member UIDs |
| `createdAt` | timestamp | |

### Members — `/workspaces/{wsId}/members/{uid}`
```json
{ "encryptedWorkspaceKey": "RSA-OAEP encrypted AES-256 key", "role": "owner|editor|viewer", "joinedAt": "Timestamp" }
```

### Documents — `/workspaces/{wsId}/{collection}/{docId}`
Same schema as personal vault. Collections: `notes`, `markdown`, `tasks`, `task_folders`, `research`, `bookmarks`, `checklists`.

---

## 21. Activity Log

**Path:** `/artifacts/{appId}/users/{userId}/activity_log/{eventId}`

| Field | Type | Description |
|-------|------|-------------|
| `action` | string | Event description (e.g., "Vault Unlocked") |
| `type` | string | `"success"`, `"danger"`, `"info"` |
| `icon` | string | Lucide icon name |
| `createdAt` | timestamp | |

> ⚠️ Activity log entries are **not encrypted** — they contain only action labels, not content data.

---

## 22. Device Tracker

**Path:** `/artifacts/{appId}/users/{userId}/devices/{deviceId}`

| Field | Type | Description |
|-------|------|-------------|
| `deviceId` | string | `dev_{timestamp}_{random}` |
| `deviceName` | string | "Mac", "Windows PC", etc. |
| `os`, `browser`, `deviceType` | string | Platform info |
| `userAgent` | string | Truncated to 200 chars |
| `lastActive` | timestamp | |

> ⚠️ Device data is **not encrypted** — used for session management.

---

## 23. Transfer App

**Path:** `/artifacts/{appId}/global_transfers/{transferId}`

| Field | Type | Description |
|-------|------|-------------|
| Room/transfer metadata | various | Encrypted file transfer sessions |

---

## Firebase Storage Paths

```
artifacts/{appId}/
├── users/{userId}/
│   ├── notes/{uuid}              # Encrypted note attachments
│   ├── markdown/{uuid}           # Encrypted markdown attachments
│   ├── research/{uuid}           # Research PDFs (encrypted or plain)
│   ├── tasks/{uuid}              # Task attachments
│   ├── bookmarks/{uuid}          # Bookmark attachments
│   └── misc/{uuid}               # Other files
│
├── shared_docs/{shareId}/
│   └── {uuid}                    # Re-encrypted attachments for sharing
│
├── workspaces/{workspaceId}/
│   └── {collection}/{uuid}       # Workspace file storage
│
├── secureshare/{chatId}/
│   └── {uuid}                    # E2E encrypted chat files
│
└── {folder}/{uuid}               # Legacy (pre-migration) files
```

---

## Collection Hierarchy (Complete)

```
firestore/
├── users/{userId}                              # Encryption keys + fail counters
│
├── shared_notes/{noteId}                       # Public encrypted shares
│
└── artifacts/{appId}/
    ├── public_keys/{userId}                    # RSA + ECDH public keys
    │
    ├── users/{userId}/
    │   ├── notes/{noteId}                      # Notes & folders
    │   ├── markdown/{docId}                    # Markdown docs & folders
    │   ├── tasks/{taskId}                      # Tasks
    │   ├── task_folders/{folderId}             # Task folders
    │   ├── checklists/{listId}                 # Checklists
    │   │   └── items/{itemId}                  # Checklist items
    │   ├── passwords/{itemId}                  # Passwords & folders
    │   ├── authenticator/{entryId}             # TOTP entries
    │   ├── contacts/{contactId}                # Contacts
    │   ├── bookmarks/{bookmarkId}              # Bookmarks & folders
    │   ├── finance/{entryId}                   # Finance entries
    │   ├── banking/{accountId}                 # Banking data
    │   ├── reminders/{reminderId}              # Reminders
    │   ├── counters/{counterId}                # Counters
    │   ├── research/{paperId}                  # Research papers & folders
    │   ├── devices/{deviceId}                  # Device sessions
    │   └── activity_log/{eventId}              # Audit trail
    │
    ├── chats/{chatId}/
    │   └── messages/{msgId}                    # 1:1 encrypted messages
    │
    ├── groups/{groupId}/
    │   ├── messages/{msgId}                    # Group encrypted messages
    │   └── group_members/{memberId}            # Group members
    │
    ├── shared_docs/{shareId}/
    │   └── members/{uid}                       # Per-doc collaboration keys
    │
    ├── workspaces/{wsId}/
    │   ├── members/{uid}                       # Workspace member keys
    │   └── {collection}/{docId}                # Workspace documents
    │
    └── global_transfers/{transferId}           # File transfer rooms
```

---

## Import / Export Formats

| App | Export Formats | Import Formats |
|-----|---------------|----------------|
| Notes | JSON | JSON |
| Markdown | JSON | JSON |
| Tasks | JSON | JSON |
| Contacts | JSON, CSV (Google), VCF (vCard 3.0) | JSON, CSV (Google), VCF (vCard 3.0) |
| Passwords | JSON, CSV (Google Passwords) | JSON, CSV (Google Passwords) |
| Bookmarks | JSON, HTML (Chrome/Firefox/Brave) | JSON, HTML (Chrome/Firefox/Brave) |
| Finance | JSON | JSON |
| Banking | JSON | JSON |
| Checklists | JSON | JSON |
| Counters | JSON | JSON |
| Research | JSON | JSON |
| **Full Backup** | JSON (all collections) | JSON (all collections) |
