# Sanctum Apps Overview

Sanctum is built with a modular, app-driven architecture. Each app operates within the secure vault environment, ensuring that all data is client-side encrypted before being synced to the cloud.

## Access Modalities & Permissions

Sanctum enforces strict access controls based on the context in which data is accessed. The following table describes the different user types and their specific access rights: **(C)reate, (E)dit, (V)iew, (D)elete**.

| Modality | User Type | Access Rights | Description |
| --- | --- | --- | --- |
| **Personal Vault** | Vault Owner | `C, E, V, D` | Full control over all personal, unshared data. |
| **Workspaces** | Workspace Admin<br>Workspace Member | `C, E, V, D`<br>`C, E, V` | Admins manage the workspace and members. Members can create, edit, and view shared items. |
| **Per-Doc Collab** | Document Owner<br>Editor<br>Viewer | `E, V, D`<br>`E, V`<br>`V` | Owners control sharing. Editors can modify content. Viewers have read-only access. |
| **Public Vault (SecureLink)**| Sender<br>Recipient | `C, E, V, D`<br>`V` | Sender creates E2EE payloads with TTL. Recipient can only view the decrypted payload once. |
| **Public Link** | Anyone with Link | `V` | Read-only access to specific, explicitly published documents (if supported). |

### Feature Matrix by App

| App | Personal Vault | Workspaces | Per-Doc Collab | Public Vault (SecureLink) | Public Link |
| --- | --- | --- | --- | --- | --- |
| **Notes** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Markdown** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Tasks** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Checklist** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Research** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Bookmarks** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **SecureShare** | ✅ Yes | ❌ No | ❌ No | ✅ Yes | ❌ No |
| **Reminders** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Finance** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Banking** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Contacts** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Passwords** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Authenticator** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Counter** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Alerts** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Settings** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |

Below is a detailed breakdown of the features and capabilities of each app, grounded in their specific access modalities.

## Productivity & Organization

*(Supports: Personal Vault, Workspaces, Per-Doc Collab, and Public Links)*

### 📝 Notes
- **Vault Owner**: Has absolute control (Create, Edit, View, Delete) over private notes.
- **Workspace Collab**: Admins and Members can co-author notes natively within the vault environment.
- **Per-Doc Collab**: Owners can share individual notes, granting Edit or View-only access to external collaborators.
- **Public Link**: Notes can be published as read-only (View) web pages to anyone with the link.

### ⬇️ Markdown
- **Vault Owner**: Full control over private markdown documents and their live previews.
- **Workspace Collab**: Workspace Members can co-edit technical documentation with real-time syntax highlighting.
- **Per-Doc Collab**: Specific markdown files can be shared with Editors or Viewers without exposing the entire workspace.
- **Public Link**: Documents can be rendered as read-only web pages for public consumption.

### ✓ Tasks
- **Vault Owner**: Manages personal task lists, folders, and due dates (C, E, V, D).
- **Workspace Collab**: Collaborative task management where Members can add, edit, or check off tasks.
- **Per-Doc Collab**: Share specific task lists with outside Editors or Viewers.
- **Public Link**: Task lists can be published for public, read-only tracking.

### ☑️ Checklist
- **Vault Owner**: Controls private, reusable checklists (e.g., daily routines).
- **Workspace Collab**: Teams can share operational checklists where Members have Create/Edit/View access.
- **Per-Doc Collab**: Individual checklists can be shared with granular Editor/Viewer rights.
- **Public Link**: Export packing lists or static procedures via read-only links.

### 📚 Research
- **Vault Owner**: Maintains a private library of reference materials and papers.
- **Workspace Collab**: Research teams can curate shared document folders.
- **Per-Doc Collab**: Share specific findings or curated folders with external peers (Edit/View).
- **Public Link**: Publish research bibliographies or abstracts as read-only pages.

### � Bookmarks
*(Supports: Personal Vault, Workspaces, Per-Doc Collab)*
- **Vault Owner**: Organizes private web links into private folder hierarchies.
- **Workspace Collab**: Teams can curate shared resource banks (Create, Edit, View).
- **Per-Doc Collab**: Specific bookmark collections can be shared with Editors or Viewers.
- *(Note: Bookmarks do not currently support Public Links).*

## Utilities & Security

### 🤝 SecureShare
*(Supports: Personal Vault, Public Vault / SecureLink)*
- **Vault Owner (Sender)**: Creates an ephemeral, encrypted payload (C, E, V, D) and sets a Time-to-Live (TTL).
- **Recipient (Anyone with SecureLink)**: Has one-time, read-only access (View) to the decrypted payload using the key embedded in the URL.
- *(Note: Bypasses Workspaces and Per-Doc Collab entirely for pure zero-knowledge transfer).*

### 🔐 Strict Personal Vault Apps
*(Supports ONLY Personal Vault. No collaboration or sharing features)*

These apps belong exclusively to the **Vault Owner** (`C, E, V, D`). Data never leaves the personal encrypted context:

- **🔑 Passwords**: Secure, zero-knowledge credential manager.
- **🏦 Banking**: Encrypted storage for PANs, CVVs, and account details.
- **💰 Finance**: Personal transaction logging and budget tracking.
- **📇 Contacts**: Private address book with rich metadata.
- **🛡️ Authenticator**: Built-in 2FA/TOTP code generator.
- **⏰ Reminders**: Standalone scheduling tool with encrypted alerts.
- **🔢 Counter**: Simple utility for tracking numerical tallies.
- **🔔 Alerts**: Custom notification hub.
- **⚙️ Settings**: Control center for vault timeouts, keys, and session management.
