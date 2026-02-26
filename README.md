# Sanctum

A privacy-first, end-to-end encrypted personal vault built with React and Firebase. All sensitive data is encrypted client-side with AES-256-GCM before touching the server — not even the server operator can read your data.

**Live:** [sanctum.aks-hub.web.app](https://aks-hub.web.app)

---

## Features

### 🔐 Security Model

- **Argon2id key derivation** — memory-hard (64 MB), GPU/ASIC resistant, via WebAssembly
- **AES-256-GCM encryption** — all data encrypted/decrypted in the browser using the Web Crypto API
- **Zero-knowledge architecture** — Firebase only stores encrypted blobs
- **Passkey strength enforcement** — min 8 characters with visual strength meter
- **Client-side rate limiting** — progressive delays on failed attempts (2s → 5s → 15s → 60s)
- **Auto-lock timer** — configurable inactivity timeout (5 min / 15 min / 1 hour / Never)
- **Lock on tab hidden** — instant vault lock when switching tabs or minimizing
- **Master Key Recovery** — offline recovery method exporting the raw master key
- **Device tracking** — see all active sessions, sign out other devices
- **Activity log** — real-time audit trail of vault events
- **Firebase App Check** — ReCAPTCHA v3 prevents unauthorized API access
- **Content Security Policy** — full CSP, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy

### 📱 Apps

| App | Description |
|-----|-------------|
| **Notes** | Rich notes with tags, attachments, folders, pinning, and scheduling |
| **Markdown** | Full markdown editor with live preview, syntax highlighting, and KaTeX math |
| **Tasks** | Task manager with folders, subtasks, due dates, recurring tasks, and drag reorder |
| **Checklists** | Reorderable checklists with items, due dates, repeat cycles, and reset |
| **Passwords** | Password vault with generator, strength meter, and copy-to-clipboard |
| **Authenticator** | TOTP 2FA code generator (Google Authenticator compatible) with QR import |
| **Contacts** | Encrypted address book with photo upload, labels, and multi-field support |
| **Bookmarks** | Bookmark manager with folders and browser-compatible HTML import/export |
| **Finance** | Expense tracker with categories and multi-currency support |
| **Banking** | Wallet / banking interface with transaction history |
| **Reminders** | Date/time reminders with recurring schedules |
| **Alerts** | Alert/notification manager |
| **SecureShare** | End-to-end encrypted messaging (1:1 and group chats) with RSA+AES hybrid encryption |
| **Counter** | Tally counter with multiple counters and history |
| **Transfer** | Encrypted file transfer |

### 🔗 Sharing

Notes, Markdown documents, Tasks, and Checklists can be shared via encrypted public links. The recipient doesn't need an account — the decryption key is embedded in the URL fragment (never sent to the server).

### ⚙️ Settings

- **Account** — Profile, update passkey, sign out, delete account
- **Apps** — Enable/disable apps, reorder launcher layout
- **Devices** — Active device management with per-device sign out
- **Security** — Auto-lock timer, lock-on-hidden toggle, activity log
- **Finance** — Default currency, expense categories
- **Data** — Centralized import/export, per-app data management, full vault backup/restore

### 📥 Import / Export

All import/export is centralized in **Settings → Data**:

| App | Export Formats | Import Formats |
|-----|---------------|----------------|
| Contacts | JSON, CSV (Google), VCF (vCard 3.0) | JSON, CSV (Google), VCF (vCard 3.0) |
| Passwords | JSON, CSV (Google Passwords) | JSON, CSV (Google Passwords) |
| Bookmarks | JSON, HTML (Chrome/Firefox/Brave) | JSON, HTML (Chrome/Firefox/Brave) |
| All other apps | JSON | JSON |
| **Full Backup** | JSON (all collections) | JSON (all collections) |

Per-app data deletion is also available with confirmation prompt.

### 📲 Progressive Web App

Sanctum is installable as a PWA:
- **Android**: Open in Chrome → three-dot menu → "Install app"
- **iOS**: Open in Safari → Share → "Add to Home Screen"
- Offline shell caching for instant launch

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 |
| **Build** | Vite 7 |
| **Styling** | Tailwind CSS 4 |
| **Backend** | Firebase (Auth, Firestore, Hosting, App Check) |
| **Encryption** | Web Crypto API (AES-GCM, RSA-OAEP, ECDH P-256) + Argon2id (hash-wasm) |
| **Markdown** | react-markdown + remark-gfm + rehype-katex + react-syntax-highlighter |
| **Icons** | Lucide React |
| **2FA** | OTPAuth |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Firebase project with Firestore and Authentication enabled

### Install

```bash
git clone https://github.com/your-username/sanctum.git
cd sanctum
npm install
```

### Configure Firebase

Create `src/lib/firebase.js` with your Firebase config:

```javascript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = "your-app-id";
```

### Development

```bash
npm run dev
```

### Build & Deploy

```bash
npm run build
firebase deploy
```

---

## Firestore Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /artifacts/{appId}/users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /shared_notes/{noteId} {
      allow create: if request.auth != null;
      allow read: if true;
      allow delete: if request.auth != null && resource.data.createdBy == request.auth.uid;
    }
    match /artifacts/{appId}/public_keys/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /artifacts/{appId}/chats/{chatId}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.uid in chatId.split('_');
    }
    match /artifacts/{appId}/groups/{groupId} {
      allow create: if request.auth != null;
      allow read, update: if request.auth != null
        && request.auth.uid in resource.data.memberUids;
      allow delete: if request.auth != null
        && resource.data.createdBy == request.auth.uid;
      match /messages/{msgId} {
        allow read, write: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/artifacts/$(appId)/groups/$(groupId)).data.memberUids;
      }
      match /group_members/{memberId} {
        allow read, write: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/artifacts/$(appId)/groups/$(groupId)).data.memberUids;
      }
    }
  }
}
```

---

## Project Structure

```
src/
├── App.jsx                  # Main app shell, auth, routing, auto-lock
├── apps/
│   ├── notes/               # Notes app
│   ├── markdown/            # Markdown editor
│   ├── tasks/               # Task manager
│   ├── checklist/           # Checklists
│   ├── passwords/           # Password vault
│   ├── authenticator/       # TOTP 2FA
│   ├── contacts/            # Address book
│   ├── bookmarks/           # Bookmarks
│   ├── finance/             # Expense tracker
│   ├── banking/             # Wallet
│   ├── reminders/           # Reminders
│   ├── counter/             # Tally counter
│   ├── transfer/            # File transfer
│   ├── secureshare/         # E2E encrypted chat
│   ├── settings/            # Settings (6 tabs)
│   └── SharedNote.jsx       # Public shared content viewer
├── components/
│   ├── system/              # LockScreen, Launcher
│   └── ui/                  # Modal, Button, Input, MarkdownViewer, etc.
├── services/                # Firestore CRUD + encryption for each app
├── lib/
│   ├── crypto.js            # AES-GCM, RSA-OAEP, ECDH, Argon2id, PBKDF2
│   ├── firebase.js          # Firebase config + App Check
│   └── dateUtils.js         # Date formatting helpers
└── hooks/                   # useDebounce, useHashRoute, etc.
```

---

## License

Private — All rights reserved.
