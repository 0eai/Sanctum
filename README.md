# Sanctum

A privacy-first, end-to-end encrypted personal vault built with React and Firebase. All sensitive data is encrypted client-side with AES-GCM before touching the server — not even the server operator can read your data.

**Live:** [sanctum.aks-hub.web.app](https://aks-hub.web.app)

---

## Features

### 🔐 Security Model

- **Client-side AES-GCM encryption** — all data encrypted/decrypted in the browser using the Web Crypto API
- **Passkey-derived keys** — your master key is derived from a passkey (not stored anywhere)
- **Zero-knowledge architecture** — Firebase only stores encrypted blobs
- **Auto-lock timer** — configurable inactivity timeout (5 min / 15 min / 1 hour / Never)
- **Device tracking** — see all active sessions, sign out other devices
- **Activity log** — real-time audit trail of vault events

### 📱 Apps

| App | Description |
|-----|-------------|
| **Notes** | Rich notes with tags, attachments, folders, pinning, and scheduling |
| **Markdown** | Full markdown editor with live preview, syntax highlighting, and KaTeX math |
| **Tasks** | Task manager with folders, subtasks, due dates, recurring tasks, and drag reorder |
| **Checklists** | Reorderable checklists with items, due dates, repeat cycles, and reset |
| **Passwords** | Password vault with generator, strength meter, and copy-to-clipboard |
| **Authenticator** | TOTP 2FA code generator (Google Authenticator compatible) with QR import |
| **Contacts** | Encrypted address book |
| **Bookmarks** | Bookmark manager with folders |
| **Finance** | Expense tracker with categories and currency support |
| **Banking** | Wallet / banking interface with transaction history |
| **Reminders** | Date/time reminders with recurring schedules |
| **Alerts** | Alert/notification manager |
| **SecureShare** | End-to-end encrypted messaging (1:1 and group chats) with RSA+AES hybrid encryption |
| **Counter** | Tally counter with multiple counters |
| **Transfer** | Encrypted file transfer |

### 🔗 Sharing

Notes, Markdown documents, Tasks, and Checklists can be shared via encrypted public links. The recipient doesn't need an account — the decryption key is embedded in the URL fragment (never sent to the server).

### ⚙️ Settings

- **Account** — Profile, sign out, delete account
- **Apps** — Enable/disable apps, reorder launcher
- **Devices** — Active device management with per-device sign out
- **Security** — Auto-lock timer, activity log
- **Finance** — Default currency, categories
- **Data** — Centralized import/export for individual apps (JSON, CSV), full vault backup/restore

### 📲 Progressive Web App

Sanctum is installable on phones as a PWA:
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
| **Backend** | Firebase (Auth, Firestore, Hosting) |
| **Encryption** | Web Crypto API (AES-GCM, RSA-OAEP, PBKDF2) |
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
      allow delete: if request.auth != null;
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
      match /{document=**} {
        allow read, write: if request.auth != null;
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
│   ├── secureshare/         # E2E encrypted chat
│   ├── settings/            # Settings (6 tabs)
│   └── SharedNote.jsx       # Public shared content viewer
├── components/
│   ├── system/              # LockScreen, Launcher
│   └── ui/                  # Modal, Button, Input, MarkdownViewer, etc.
├── services/                # Firestore CRUD + encryption for each app
├── lib/
│   ├── crypto.js            # AES-GCM, RSA-OAEP, PBKDF2, key management
│   ├── firebase.js          # Firebase config
│   └── dateUtils.js         # Date formatting helpers
└── hooks/                   # useDebounce, useHashRoute, etc.
```

---

## License

Private — All rights reserved.
