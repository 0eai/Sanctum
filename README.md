# Sanctum

A privacy-first, end-to-end encrypted personal vault built with React and Firebase. All sensitive data is encrypted client-side with AES-256-GCM before touching the server — not even the server operator can read your data.

**Live:** [sanctum.aks-hub.web.app](https://aks-hub.web.app)

---

## Features

### 🔐 Security Model

- **Argon2id key derivation** — memory-hard (64 MB), GPU/ASIC resistant, via WebAssembly
- **AES-256-GCM encryption** — all data encrypted/decrypted in the browser using the Web Crypto API
- **Zero-knowledge architecture** — Firebase only stores encrypted blobs
- **RSA-4096-OAEP** — asymmetric key exchange for collaboration and E2E messaging
- **ECDH P-256 forward secrecy** — per-message ephemeral keys for SecureShare 1:1 chats
- **Passkey strength enforcement** — min 8 characters with visual strength meter
- **Client + server-side rate limiting** — progressive delays on failed attempts
- **Auto-lock timer** — configurable inactivity timeout (5 min / 15 min / 1 hour / Never)
- **Lock on tab hidden** — instant vault lock when switching tabs or minimizing
- **Master Key Recovery** — offline recovery exporting the raw master key
- **Device tracking** — see all active sessions, sign out other devices
- **Activity log** — real-time audit trail of vault events
- **Firebase App Check** — ReCAPTCHA v3 prevents unauthorized API access
- **Content Security Policy** — full CSP, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy

### 📱 Apps

| App | Description |
|-----|-------------|
| **Notes** | Rich notes with tags, attachments, folders, pinning, scheduling |
| **Markdown** | Full markdown editor with live preview, syntax highlighting, and KaTeX math |
| **Tasks** | Task manager with folders, subtasks, due dates, recurring tasks, drag reorder |
| **Checklists** | Reorderable checklists with items, due dates, repeat cycles, and reset |
| **Passwords** | Password vault with generator, strength meter, and copy-to-clipboard |
| **Authenticator** | TOTP 2FA code generator (Google Authenticator compatible) with QR import |
| **Contacts** | Encrypted address book with photo upload, labels, multi-field support |
| **Bookmarks** | Bookmark manager with folders and browser-compatible HTML import/export |
| **Finance** | Expense tracker with categories and multi-currency support |
| **Banking** | Wallet / banking interface with transaction history |
| **Reminders** | Date/time reminders with recurring schedules |
| **Alerts** | Alert/notification manager |
| **Research** | Academic paper vault with PDF storage, AI summaries, and BibTeX |
| **SecureShare** | E2E encrypted messaging with ECDH forward secrecy, groups, WebRTC calls (mute/camera/timer) |
| **Counter** | Tally counter with multiple counters and history |
| **Transfer** | Encrypted file transfer with room-based sharing |

### 🤝 Collaboration

- **Per-document sharing** — share Notes, Markdown, Tasks, Research, Bookmarks, Checklists with specific users
- **Per-doc encryption keys** — each shared document gets its own AES-256 key, RSA-wrapped per collaborator
- **Key rotation** — new key generated on collaborator removal, doc re-encrypted
- **File re-encryption** — attachments copied to shared storage and re-encrypted with doc key
- **Workspace sharing** — workspace-level collaboration with shared AES key; inline workspace naming
- **Role-based access** — owner, editor, viewer roles per collaborator
- **Vault ↔ Workspace transfers** — move any item between personal vault and workspace (decrypt + re-encrypt in browser)

### 🔗 Public Sharing

Any document can be shared via an encrypted public link directly from the **Share** modal (Public Link tab). The decryption key lives only in the URL fragment — never sent to any server. Links support configurable TTL (1 day / 7 days / 30 days / never) and can be revoked at any time.

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

### 📲 Progressive Web App

Installable as a PWA:
- **Android**: Chrome → three-dot menu → "Install app"
- **iOS**: Safari → Share → "Add to Home Screen"
- Offline shell caching for instant launch

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 |
| **Build** | Vite 7 |
| **Styling** | Tailwind CSS 4 |
| **Backend** | Firebase (Auth, Firestore, Storage, Hosting, App Check, RTDB) |
| **Encryption** | Web Crypto API (AES-GCM, RSA-OAEP, ECDH P-256) + Argon2id (hash-wasm) |
| **Markdown** | react-markdown + remark-gfm + rehype-katex + react-syntax-highlighter |
| **Icons** | Lucide React |
| **2FA** | OTPAuth |
| **Real-time** | WebRTC (SecureShare voice/video) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Firebase project with Firestore, Authentication, Storage, and RTDB enabled

### Install

```bash
git clone https://github.com/your-username/sanctum.git
cd sanctum
npm install
```

### Configure

Copy `.env.example` to `.env` and fill in your Firebase config:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DATABASE_URL=...
VITE_RECAPTCHA_SITE_KEY=...
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

## Project Structure

```
src/
├── App.jsx                      # App shell: auth, vault lock, routing, auto-lock
├── main.jsx                     # React entry point
├── index.css                    # Global styles
│
├── apps/
│   ├── notes/                   # Notes app (Notes.jsx + NoteEditor + NoteCard)
│   ├── markdown/                # Markdown editor (Markdown.jsx + MarkdownEditor)
│   ├── tasks/                   # Task manager (Tasks.jsx + TaskCard)
│   ├── checklist/               # Checklists (Checklist.jsx)
│   ├── passwords/               # Password vault (Passwords.jsx)
│   ├── authenticator/           # TOTP 2FA (Authenticator.jsx)
│   ├── contacts/                # Address book (Contacts.jsx)
│   ├── bookmarks/               # Bookmarks (Bookmarks.jsx)
│   ├── finance/                 # Expense tracker (Finance.jsx)
│   ├── banking/                 # Wallet (Banking.jsx)
│   ├── reminders/               # Reminders (Reminders.jsx)
│   ├── alerts/                  # Alerts (Alerts.jsx)
│   ├── research/                # Academic papers (ResearchApp.jsx + PaperEditor)
│   ├── secureshare/             # E2E chat (SecureShare.jsx + ChatBubble + GroupPanel)
│   ├── counter/                 # Tally counters (Counter.jsx)
│   ├── transfer/                # File transfer (Transfer.jsx)
│   ├── settings/                # Settings (6 tabs: Account, Apps, Devices, Security, Finance, Data)
│   └── SharedNote.jsx           # Public shared content viewer
│
├── components/
│   ├── system/
│   │   ├── LockScreen.jsx       # Vault lock/unlock with Argon2id + rate limiting
│   │   └── Launcher.jsx         # App grid: per-app colors, category sections, greeting
│   └── ui/
│       ├── CollaborateModal.jsx # Share modal: Collaborators tab + Public Link tab
│       ├── WorkspaceSwitcher.jsx # Workspace dropdown with inline naming
│       ├── SharedDocsView.jsx   # Shared documents viewer
│       ├── SecureText.jsx       # Canvas-rendered text (defeats extension DOM scrapers)
│       ├── MarkdownViewer.jsx   # Markdown renderer with KaTeX + syntax highlighting
│       └── ...                  # Button, Modal, Input, StandardAppLayout, etc.
│
├── services/
│   ├── collaboration.js         # Per-document E2EE sharing (AES+RSA key management)
│   ├── workspace.js             # Workspace-level E2EE collaboration
│   ├── firebaseStorage.js       # Encrypted file upload/download
│   ├── vault.js                 # Vault unlock/initialize
│   ├── sharing.js               # Public share link generation
│   ├── activityLog.js           # Audit trail
│   ├── deviceTracker.js         # Device session management
│   ├── profile.js               # User profile sync
│   ├── gemini.js                # AI integration (research summaries)
│   ├── transfer.js              # File transfer service
│   ├── pdfStorage.js            # PDF file management
│   └── firestoredb.js           # Firestore helpers + app stats
│
├── lib/
│   ├── crypto.js                # AES-GCM, RSA-OAEP, ECDH, Argon2id, PBKDF2
│   ├── firebase.js              # Firebase config + App Check
│   ├── wasmIntegrity.js         # Argon2id WASM known-answer test (supply-chain guard)
│   ├── extensionGuard.js        # Browser extension detection warning
│   ├── appCollections.js        # Single source-of-truth collection names
│   ├── firestore.js             # deleteInChunks batch helper
│   ├── dateUtils.js             # Date formatting helpers
│   ├── fileUtils.js             # File helpers
│   ├── passwordUtils.js         # Password generation (crypto.getRandomValues)
│   └── bookmarkUtils.js         # Bookmark HTML parsing
│
├── hooks/
│   ├── useCollaboration.js      # Workspace + shared-doc lifecycle; moveItemToContext
│   ├── useHashRoute.js          # Hash-based routing
│   └── useDebounce.js           # Debounce hook
│
└── context/                     # React context providers
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [DATA_STRUCTURES.md](DATA_STRUCTURES.md) | Complete Firestore/Storage schema with encrypted + decrypted views |
| [SECURITY.md](SECURITY.md) | Full security audit: crypto, rules, threat model |
| [ControlFlowGraphs.md](ControlFlowGraphs.md) | Flowcharts for all major application flows |
| [FiniteStateMachines.md](FiniteStateMachines.md) | State machine diagrams for all stateful components |
| [SequenceDiagrams.md](SequenceDiagrams.md) | Interaction timelines between components and services |
| [DataFlowDiagrams.md](DataFlowDiagrams.md) | Data flow through encryption layers |
| [LOGICAL_BUGS.md](LOGICAL_BUGS.md) | Known bugs and edge cases by severity |
| [Recommendations.md](Recommendations.md) | Prioritized improvement roadmap |
| [TASKS.md](TASKS.md) | Development backlog |

---

## License

Private — All rights reserved.
