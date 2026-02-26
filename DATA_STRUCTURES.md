# Data Structures — Sanctum v1.0.2

This document maps every Firestore collection and document schema, showing both the **encrypted** (as stored) and **decrypted** (application) views.

---

## Encryption Format

All encrypted fields follow the same blob format:

```json
{
  "iv": "base64-encoded-12-byte-IV",
  "data": "base64-encoded-AES-256-GCM-ciphertext"
}
```

When a document is stored, the `iv` and `data` fields are spread directly onto the document alongside unencrypted metadata fields.

---

## 1. User Keys

**Path:** `/users/{userId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `encryptionSalt` | string | ❌ | 16-byte hex salt for key derivation |
| `encryptedMasterKey` | `{iv, data}` | ✅ (wrapper key) | AES-256 master key JWK, encrypted with derived wrapper key |
| `encryptedValidator` | `{iv, data}` | ✅ (master key) | `{ check: "VALID" }` encrypted with master key — used to verify passkey correctness |
| `kdf` | string | ❌ | Key derivation function: `"argon2id"` (default) or `"pbkdf2"` (legacy) |
| `iterations` | number | ❌ | PBKDF2 iteration count (legacy users only, default 600000) |

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
  "attachments": [{ "name": "file.pdf", "type": "application/pdf", "data": "base64..." }],
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
  "attachments": [{ "name": "image.png", "type": "image/png", "data": "base64..." }],
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
| `completed` | boolean | ❌ | Completion status (for filtering) |
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
  "subtasks": [
    { "text": "Subtask 1", "completed": false },
    { "text": "Subtask 2", "completed": true }
  ]
}
```

### Task Folders

**Path:** `/artifacts/{appId}/users/{userId}/task_folders/{folderId}`

```json
{
  "iv": "...",
  "data": "..."
}
```

Decrypted: `{ "name": "Work" }`

---

## 5. Checklists

### Lists

**Path:** `/artifacts/{appId}/users/{userId}/checklists/{listId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `iv` | string | — | AES-GCM IV |
| `data` | string | — | Encrypted payload |
| `itemCount` | number | ❌ | Total items (aggregate) |
| `completedCount` | number | ❌ | Completed items (aggregate) |
| `order` | number | ❌ | Sort order |
| `createdAt` | timestamp | ❌ | |

Decrypted: `{ "title": "Groceries", "dueDate": "...", "repeat": "weekly" }`

### Items (subcollection)

**Path:** `/artifacts/{appId}/users/{userId}/checklists/{listId}/items/{itemId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `iv` | string | — | AES-GCM IV |
| `data` | string | — | Encrypted payload |
| `isCompleted` | boolean | ❌ | Completion status |
| `order` | number | ❌ | Sort order |
| `createdAt` | timestamp | ❌ | |

Decrypted: `{ "text": "Milk", "dueDate": "...", "repeat": "none" }`

---

## 6. Passwords

**Path:** `/artifacts/{appId}/users/{userId}/passwords/{itemId}`

### Stored (Firestore)
| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `iv` | string | — | AES-GCM IV |
| `data` | string | — | Encrypted payload |
| `createdAt` | timestamp | ❌ | |

### Decrypted Payload (Password Entry)
```json
{
  "type": "password",
  "service": "GitHub",
  "username": "user@example.com",
  "password": "s3cureP@ss!",
  "url": "https://github.com",
  "notes": "Personal account",
  "history": [
    { "password": "oldP@ss", "changedAt": "2026-01-15T..." }
  ],
  "parentId": "folder-id-or-null",
  "updatedAt": "2026-02-25T..."
}
```

### Decrypted Payload (Folder)
```json
{
  "type": "folder",
  "title": "Social Media",
  "parentId": null
}
```

---

## 7. Authenticator (TOTP)

**Path:** `/artifacts/{appId}/users/{userId}/authenticator/{entryId}`

Decrypted:
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

Decrypted:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "company": "Acme Inc",
  "jobTitle": "Engineer",
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

Decrypted:
```json
{
  "type": "bookmark",
  "title": "Example Site",
  "url": "https://example.com",
  "description": "...",
  "parentId": "folder-id-or-null"
}
```

---

## 10. Finance

**Path:** `/artifacts/{appId}/users/{userId}/finance/{entryId}`

Decrypted:
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

Decrypted:
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

Decrypted:
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

Decrypted:
```json
{
  "title": "Push-ups",
  "count": 42,
  "step": 1
}
```

---

## 14. Shared Notes (Public)

**Path:** `/shared_notes/{noteId}`

| Field | Type | Description |
|-------|------|-------------|
| `data` | `{iv, data}` | Encrypted payload (AES-256-GCM with share-specific key) |
| `createdAt` | timestamp | Creation time |

### Decrypted (by recipient with URL key)
```json
{
  "sharedType": "note|markdown|task|checklist",
  "title": "Document Title",
  "content": "Body text or markdown...",
  "tags": ["tag1"],
  "attachments": [...],
  "date": "2026-02-25T...",
  
  // Task-specific:
  "notes": "Task notes",
  "subtasks": [{ "text": "...", "completed": false }],
  "dueDate": "...",
  
  // Checklist-specific:
  "items": [{ "text": "...", "completed": false }],
  "progress": 75
}
```

---

## 15. SecureShare — Public Keys

**Path:** `/artifacts/{appId}/public_keys/{userId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `publicKey` | string | ❌ | RSA-2048 SPKI public key (base64) |
| `displayName` | string | ❌ | User's display name |
| `email` | string | ❌ | User's email |
| `photoURL` | string | ❌ | Profile photo URL |
| `encryptedPrivateKey` | `{iv, data}` | ✅ (master key) | RSA-2048 PKCS#8 private key |

---

## 16. SecureShare — 1:1 Chats

### Messages

**Path:** `/artifacts/{appId}/chats/{chatId}/messages/{msgId}`

| Field | Type | Description |
|-------|------|-------------|
| `senderId` | string | Sender's UID |
| `senderCopy` | `{iv, data}` | Message encrypted with sender's RSA public key → AES → content |
| `recipientCopy` | `{iv, data}` | Same message encrypted with recipient's RSA public key |
| `timestamp` | timestamp | Server timestamp |
| `expiresAt` | timestamp\|null | Self-destruct time |
| `readBy` | map | `{ [uid]: timestamp }` — read receipts |
| `artifact` | object\|null | Shared artifact metadata (app items) |

### Decrypted Message
The AES key is RSA-encrypted per participant. The AES-decrypted content:
```json
{
  "text": "Hello!",
  "artifact": {
    "type": "note|task|...",
    "title": "...",
    "data": { ... }
  }
}
```

---

## 17. SecureShare — Group Chats

### Group Document

**Path:** `/artifacts/{appId}/groups/{groupId}`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Group name |
| `createdBy` | string | Creator's UID |
| `memberUids` | string[] | Member UID array (for Firestore rules) |
| `members` | map | `{ [uid]: { displayName, email, photoURL, encryptedGroupKey } }` |
| `createdAt` | timestamp | |

Each member's `encryptedGroupKey` is the shared AES-256 group key, RSA-encrypted with that member's public key.

### Group Messages

**Path:** `/artifacts/{appId}/groups/{groupId}/messages/{msgId}`

| Field | Type | Description |
|-------|------|-------------|
| `senderId` | string | Sender UID |
| `senderName` | string | Display name at time of send |
| `iv` | string | AES-GCM IV |
| `data` | string | Message encrypted with shared group AES key |
| `timestamp` | timestamp | |
| `expiresAt` | timestamp\|null | Self-destruct |
| `readBy` | map | Read receipts |

Decrypted: `{ "text": "Group message", "artifact": {...} }`

---

## 18. Activity Log

**Path:** `/artifacts/{appId}/users/{userId}/activity_log/{eventId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `action` | string | ❌ | Event description (e.g., "Vault Unlocked") |
| `type` | string | ❌ | `"success"`, `"danger"`, `"info"` |
| `icon` | string | ❌ | Lucide icon name |
| `createdAt` | timestamp | ❌ | |

> **Note:** Activity log entries are **not encrypted** — they contain only action labels, not content data.

---

## 19. Device Tracker

**Path:** `/artifacts/{appId}/users/{userId}/devices/{deviceId}`

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `deviceId` | string | ❌ | `dev_{timestamp}_{random}` |
| `deviceName` | string | ❌ | "Mac", "Windows PC", etc. |
| `os` | string | ❌ | "macOS 14.2", "Windows", etc. |
| `browser` | string | ❌ | "Chrome 120", "Safari 17" |
| `deviceType` | string | ❌ | "desktop", "mobile" |
| `userAgent` | string | ❌ | Truncated to 200 chars |
| `lastActive` | timestamp | ❌ | |

> **Note:** Device data is **not encrypted** — used for session management UI. Contains no sensitive content.

---

## Collection Hierarchy Summary

```
firestore/
├── users/{userId}                              # Encryption keys
│
├── shared_notes/{noteId}                       # Public encrypted shares
│
└── artifacts/{appId}/
    ├── public_keys/{userId}                    # RSA public keys + encrypted private key
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
    │   ├── devices/{deviceId}                  # Device sessions
    │   └── activity_log/{eventId}              # Audit trail
    │
    ├── chats/{chatId}/
    │   └── messages/{msgId}                    # 1:1 encrypted messages
    │
    └── groups/{groupId}/
        └── messages/{msgId}                    # Group encrypted messages
```

---

## Import / Export Formats

All import/export is centralized in **Settings → Data Tab**.

| App | Export Formats | Import Formats |
|-----|---------------|----------------|
| Notes | JSON | JSON |
| Tasks | JSON | JSON |
| Contacts | JSON, CSV (Google format), VCF (vCard 3.0) | JSON, CSV (Google format), VCF (vCard 3.0) |
| Passwords | JSON, CSV (Google Passwords) | JSON, CSV (Google Passwords) |
| Bookmarks | JSON, HTML (Netscape/Chrome/Firefox/Brave) | JSON, HTML (Netscape/Chrome/Firefox/Brave) |
| Finance | JSON | JSON |
| Banking | JSON | JSON |
| Checklists | JSON | JSON |
| Counters | JSON | JSON |
| **Full Backup** | JSON (all collections) | JSON (all collections) |

### JSON Export Format

Each per-app JSON export uses the Sanctum backup format:
```json
{
  "collection_name": [
    { "_id": "doc-id", "_createdAt": "ISO-8601", ...decrypted_fields }
  ]
}
```

### CSV Format (Contacts)

Google Contacts CSV format with dynamic column expansion for multi-value fields (phones, emails, addresses, websites, custom fields).
