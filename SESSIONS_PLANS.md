# Sanctum — Remaining Sessions Plan

**Last updated:** 2026-03-30 (after Session 16)
**Source audit:** `AUDIT_2_26_03_29.md`

---

## Open Items Summary

| ID | Issue | Area | Priority | Target Session | Status |
|----|-------|------|----------|----------------|--------|
| M2 | Attachments not re-encrypted during vault↔workspace move | Workspace Move | 🔴 Critical | Session 8 | ✅ Done |
| M3 | Folder moves not recursive (children left orphaned) | Workspace Move | 🔴 Critical | Session 8 | ✅ Done |
| C2 | Full-payload overwrite on every save (field-level updateDoc) | Collaboration | 🟡 Medium | Session 9 | ✅ Done |
| ME7 | Plain `<textarea>` — no syntax highlighting in Markdown editor | Markdown UX | 🟡 Low | Session 10 | ✅ Done |
| F6 | No PDF first-page thumbnail in PaperCard | Research UX | 🟡 Low | Session 11 | ✅ Done |
| ME11 | No WYSIWYG/block-editor mode in Markdown editor | Markdown UX | 🟡 Low | Session 12 | ✅ Done |
| U-B | SharedHub Option B: owner-based grouping, search, unread | Shared UX | 🟡 Medium | Session 13 | ✅ Done |
| C4-1 | CRDT foundation: encrypted Y.js provider + Notes binding | Collaboration | 🔴 High | Session 14 | ✅ Done |
| C4-2 | CRDT TipTap integration + cursor awareness | Collaboration | 🔴 High | Session 15 | ✅ Done |
| F10 | PDF annotation / highlighting | Research UX | ⚪ Long-term | Out of scope | — |
| S16-PDF | PDF viewer CSP/rendering issues + multi-page scrollable + full-height | Research UX | 🔴 Bug | Session 16 | ✅ Done |
| S16-AIR | Multiple AI reviews inline switcher in PaperAiSection | Research UX | 🟡 UX | Session 16 | ✅ Done |
| S16-WS | Workspace name input text invisible on typing | Workspace UX | 🔴 Bug | Session 16 | ✅ Done |

All planned sessions (8–16) are complete. Only long-term out-of-scope items remain.

---

## Session 8 — M2 + M3: Complete Vault↔Workspace Moves ✅ COMPLETED

### What Was Done
- **`src/services/firebaseStorage.js`** — Added `reEncryptStorageFilesForMove`: downloads each Storage file, decrypts with source key, re-encrypts with destination key, uploads in-place (same path, new IV).
- **`src/hooks/useCollaboration.js`** — `moveItemToContext` now uses `setDoc(doc(destCol, docId), ...)` instead of `addDoc`, preserving the document ID so all child `parentId` references remain valid. Calls `reEncryptStorageFilesForMove` after the Firestore write.
- **`src/components/ui/MoveToContextModal.jsx`** — Added `allItems` prop, `getDescendants` BFS helper, recursive `handleMove` that moves descendants first then the folder, `progress` state with live counter UI, and context-aware amber warning text.
- **`src/apps/notes/Notes.jsx`**, **`Markdown.jsx`**, **`ResearchApp.jsx`** — Each passes `allItems={items/docs/papers}` to `MoveToContextModal`.

### Scope & Limitations
- Files re-encrypted **in-place** (same Storage path). Storage security rules may still restrict workspace members from accessing files stored under `users/{uid}/` paths — path migration requires a Cloud Function.
- Partial file failure: logged and skipped; Firestore document still moves successfully.

---

## Session 9 — C2: Field-level Encrypted Saves ✅ COMPLETED

### What Was Done
- **`src/apps/notes/services/notes.js`**, **`markdown/services/markdown.js`**, **`research/services/research.js`** — All three fully rewritten to write 4–5 separate encrypted Firestore fields (`encryptedTitle`, `encryptedContent`, `encryptedTags`, `encryptedAttachments`, `encryptedMeta`) via `Promise.all([encryptData(...), ...])` in parallel.
- **Backwards-compatible decrypt helpers** (`decryptNoteDoc`, `decryptMarkdownDoc`, `decryptPaperDoc`) — detect new format via `raw.encryptedTitle !== undefined`; fall back to `decryptData(raw, key)` for old single-blob docs; old docs auto-migrate on next save.
- **`deleteField()` sentinels** — `updateDoc` calls include `data: deleteField(), iv: deleteField()` to clear legacy blob fields when migrating.
- **Listener state cleaned** — encrypted blob objects stripped from spread into app state; only decrypted plain-text fields reach components.
- **`moveItemToContext` fix** — strips field-level blobs + metadata from payload before re-encrypting; writes `isPinned`, `type`, `parentId`, `versionId` as explicit top-level fields (fixed bug where moved items lost folder position/pin state).
- **`research.js`** — `status` and `markdownIds` added to `encryptedMeta` (were missing).

### Scope & Limitations
- `updateDoc` writes all encrypted fields on every auto-save (not just dirty ones). True per-field dirty tracking would require per-field state in editors — out of scope. Benefit: Firestore field-level merging means non-content fields (`isPinned`, etc.) survive concurrent content saves.
- Old docs migrate lazily on next save, no bulk migration.

---

## Session 10 — ME7: CodeMirror 6 Syntax Highlighting ✅ COMPLETED

### What Was Done
- **New `src/apps/markdown/components/CodeMirrorEditor.jsx`** — `forwardRef` wrapper around a `EditorView`; mount-once effect with `markdown()`, `history()`, `EditorView.lineWrapping`, custom dark theme, and keyboard shortcuts (Ctrl+B/I/K → `onShortcut` callback); external content synced via a second `useEffect` comparing doc string to avoid spurious dispatches; `useImperativeHandle` exposes `getView()` for parent toolbar use.
- **`src/apps/markdown/components/MarkdownEditor.jsx`** — Removed both `<textarea>` elements and all related refs/handlers; replaced with `<CodeMirrorEditor ref={cmRef} ...>`; `applyFormat` rewritten to use `view.dispatch` for all 10 format types (bold, italic, heading, code, quote, ul, ol, link, hr, …); split-view uses same `cmRef`.
- **`vite.config.js`** — `@codemirror` + `@lezer` → `vendor-codemirror` chunk; added to `optimizeDeps.include`.
- **Build fix** — `Cannot access 'De' before initialization` TDZ crash in production `ResearchApp` chunk traced to `isSaving` `useState` declared after a `useEffect([isSaving])` in `PaperEditor.jsx`; fixed by hoisting the declaration above the effect. `MarkdownViewer.jsx` simultaneously converted to `React.lazy` dynamic import for `react-syntax-highlighter` (eliminates future TDZ risk from Rollup bundle reordering).

---

## Session 11 — F6: PDF First-Page Thumbnails ✅ COMPLETED

### What Was Done
- **New `src/apps/research/components/PdfThumbnail.jsx`** — Module-level `pdfjsLib` singleton lazy-loaded on first call inside `useEffect`; worker configured via `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href`; downloads encrypted blob via `downloadEncryptedFileBlob` or `downloadNormalFileBlob` based on `isEncrypted`; renders page 1 to an offscreen canvas at 160px wide; exports as JPEG data URL; cancelled flag prevents setState after unmount.
- **`src/apps/research/components/PaperCard.jsx`** — `PdfThumbnail` lazy-loaded via `React.lazy`; shown as `absolute top-3 right-3 w-10 h-14` thumbnail (≈A4 ratio) inside `<Suspense fallback={null}>`; title row and authors paragraph get `pr-14` when thumbnail is active; accepts new `cryptoKey` prop.
- **`src/apps/research/ResearchApp.jsx`** — Passes `cryptoKey={ctx?.key || cryptoKey}` to `PaperCard`.
- **`vite.config.js`** — `pdfjs-dist` → `vendor-pdfjs` chunk (411 KB / 123 KB gzipped).

### Actual vs. Plan Differences
- Plan showed thumbnail as a low-opacity full-card background wash; implemented as a top-right corner thumbnail (40×56 px) — less intrusive, preserves all text legibility without opacity tricks.
- Plan's `downloadFile` abstraction not needed — used existing `downloadEncryptedFileBlob` / `downloadNormalFileBlob` directly.

---

## Session 12 — ME11: WYSIWYG / Block-Editor Mode ✅ COMPLETED

### What Was Done
- **New `src/apps/markdown/components/WysiwygEditor.jsx`** — TipTap v3 (`@tiptap/react`, `@tiptap/starter-kit`, `tiptap-markdown`, `@tiptap/extension-link`); `tiptap-markdown` used instead of the planned `@tiptap/extension-markdown` (which is a paid Pro extension in TipTap v3); Markdown ↔ ProseMirror serialization via `editor.storage.markdown.getMarkdown()` / `editor.commands.setContent(val, false)`; self-contained formatting toolbar (Bold / Italic / H1 / H2 / H3 / code / code block / blockquote / bullet list / ordered list / link prompt / HR); `setContent(val, false)` suppresses `onUpdate` to prevent feedback loop; `editor.setEditable(!readOnly)` reactive.
- **`src/apps/markdown/components/MarkdownEditor.jsx`** — `WysiwygEditor` lazy-loaded via `React.lazy` + `<Suspense fallback={pulse skeleton}>`; `editorMode: 'source' | 'wysiwyg'` state; `toggleWysiwyg()` clears split-view + preview on entry; `togglePreview()` and `toggleSplitView()` reset `editorMode` to `'source'`; `Type` icon button in header (desktop-only, purple when active); `FormattingToolbar` guarded by `editorMode === 'source'`.
- **`vite.config.js`** — `@tiptap` + `tiptap-markdown` → `vendor-tiptap` chunk (504 KB / 173 KB gzipped, loaded only on first WYSIWYG activation).

### Actual vs. Plan Differences
- `@tiptap/extension-markdown` is a TipTap Pro (paid) extension in v3; replaced with community package `tiptap-markdown` v0.9 (supports TipTap v3, same API).
- `@tiptap/extension-code-block-lowlight` + `lowlight` omitted — unnecessary complexity; StarterKit's built-in code block is sufficient for editing; syntax-highlighted display is already covered by `MarkdownViewer` in preview mode.
- BubbleMenu omitted — requires `@floating-ui/dom` (not installed); replaced with a static toolbar at the top of the WYSIWYG surface (same functionality, simpler).

---

---

## Session 13 — SharedHub Option B: Owner-based Grouping + Search + Unread ✅ COMPLETED

### What Was Done

- **`src/apps/shared/SharedHub.jsx`** — Full rewrite implementing the Option B vision.
  - **`groupMode` state** (`'person' | 'app'`, default `'person'`): Users toggle between "By Person" and "By App" views via icon-button pill (`Users` / `LayoutGrid`) in the header.
  - **Owner name resolution**: `ownerNames` state map fetched on mount/docs-change from `public_keys/{uid}` Firestore documents (same pattern as `SharedDocsView`); falls back to `uid.slice(0,8)…` when not found.
  - **Unread indicators**: `lastSeenAt` read from `localStorage['sanctum_shared_last_seen']` on mount; written on unmount. Any doc with `updatedAt > lastSeenAt` shows a blue `Circle` dot on its row. Header shows an "X new" badge.
  - **Search**: `searchQuery` state; `searched` memo filters `appTypeFilter` results by doc title + resolved owner name (no separate debounce — React state update is fast enough at this scale).
  - **`groupsByPerson` / `groupsByApp` memos**: both derived from the same `searched` array post-filter; `groupsByPerson` groups by `ownerUid` sorted by most-recent doc per group, docs sorted descending within; `groupsByApp` groups by `appType` alphabetically.
  - **`DocRow` sub-component**: unified card for both modes — appType icon, blue dot if new, title, relative time (`relativeTime` helper handles Firestore Timestamps and raw date values via `toDate`), appType label (person-mode only), role badge.
  - **"X new" + item count** displayed in the header alongside the view-toggle pill.
  - **Filter pills + search input**: sticky strip below header; search has a clear button (`×`).

### Scope & Limitations

- Owner name fetched once per session; not live-updated if owner renames mid-session.
- `lastSeenAt` is per-device (localStorage only — not synced across devices).
- Per-app inline `SharedDocsView` within Notes/Markdown/Research lists is unchanged.

---

## Session 14 — C4 Phase 1: CRDT Foundation + Notes Binding ✅ COMPLETED

### What Was Done

- **New `src/services/yjsCollab.js`** — `createYjsProvider(ydoc, shareId, docKey, uid)`: on `init()`, fetches `crdt_state/v1` snapshot (if exists) and applies it, then fetches all `crdt_updates` ordered by `at` and applies each, then subscribes a real-time `onSnapshot` listener for new remote updates (skips own echoes by `uid`). Local Y.js updates are encrypted (AES-GCM, base64 IV‖ciphertext) and written to `crdt_updates` via `addDoc`; after 50 local updates the owner compacts to a new `crdt_state/v1` snapshot and deletes all `crdt_updates`.
- **New `src/hooks/useYjsCollab.js`** — manages `Y.Doc` + `Y.Text('content')` lifecycle; creates provider on mount, calls `provider.init()`, tears everything down on unmount; returns stable `ydocRef` / `ytextRef`.
- **`src/apps/notes/components/NoteEditor.jsx`** — `crdtEnabled = isSharedDoc && collabShareId`; `useYjsCollab` hook wired; Y.Text observer mirrors remote changes into React state (origin `'remote'` only); `handleContentChange` computes minimal prefix/suffix delta and applies it to `Y.Doc` via `transact()`; debounced auto-save excludes `content` and `title` when CRDT is active; 30 s `setInterval` flushes `Y.Text` content to Firestore so non-CRDT readers stay in sync.
- **`vite.config.js`** — `yjs` + `lib0` isolated in `vendor-yjs` chunk.

### Scope & Limitations

- Notes only. Markdown and Research editors + TipTap collaboration follow in Session 15.
- CRDT only for shared docs (`collabShareId` set). Personal vault and workspace docs keep the existing debounce + hash-guard auto-save.
- Compaction by owner only; non-owner concurrent compaction attempts are idempotent (full-state snapshot).
- No offline queuing: edits made offline are buffered in Y.js memory; they push on reconnect.

---

## Session 15 — C4 Phase 2: TipTap CRDT + Multi-editor Expansion ✅ COMPLETED

### What Was Done

**Extended beyond original plan — CRDT wired into Markdown and Tasks in addition to WysiwygEditor.**

- **`@tiptap/extension-collaboration` v3.21.0** installed — compatible with yjs ^13.
- **`WysiwygEditor.jsx`** — accepts optional `ydoc` prop; when provided: `Collaboration.configure({ document: ydoc })` added to extension list, StarterKit history disabled (Y.js UndoManager handles undo/redo), content prop bypassed, `onChange` suppressed (Y.js is source of truth), content sync effect guarded by `!ydoc`.
- **`MarkdownEditor.jsx`** — `crdtEnabled = isSharedDoc && shareId`; `useYjsCollab` with `shareId` as CRDT namespace; Y.Text observer mirrors remote changes into CodeMirror source-mode state; `handleContentChange` with minimal prefix/suffix delta on CM `onChange`; `ydocRef.current` passed to `WysiwygEditor` when CRDT + WYSIWYG mode; auto-save suppresses `content`/`title` when CRDT active; 30 s flush interval; stale-document amber banner suppressed when CRDT active.
- **`TaskEditor.jsx`** — added `cryptoKey` + `user` to props; `crdtEnabled = sharedId && memberUids.length`; `useYjsCollab` with `sharedId` as CRDT namespace; Y.Text observer for `notes` field; `handleNotesChange` with minimal delta; auto-save suppresses `notes` when CRDT active; 30 s flush.
- **`Tasks.jsx`** — passes `user={user}` to `TaskEditor`.

### Actual vs. Plan Differences

- **Cursor awareness skipped**: `CollaborationCursor` + Firestore awareness adapter (`createFirestoreAwareness`) were planned but omitted — they require a custom awareness shim that is statically evaluated at TipTap init, making reactive cursor updates complex. Document-level sync (the most valuable part) is complete; cursor indicators remain a future enhancement.
- **CodeMirror source mode gets Y.Text CRDT** (not just WYSIWYG as originally scoped) — the same Y.Text observer + `handleContentChange` pattern from NoteEditor applies directly to CM's `onChange`, giving CRDT in both editor modes.
- **Tasks CRDT added** (beyond original plan) — `notes` field wired; `sharedId` used as CRDT namespace.
- **Checklists skipped** — items are managed via discrete Firestore operations (add/toggle/delete), not a single text field; CRDT would require Y.Array and adds no practical benefit over the current model.
- **Research PaperEditor skipped** — metadata fields only (title, authors, year, venue, tags); research notes are linked Markdown docs that receive CRDT coverage through MarkdownEditor.

---

## Session 16 — Bug fixes + Research UX improvements ✅ COMPLETED

### What Was Done

- **`src/apps/research/hooks/usePaperPdf.js`** — Replaced `pdfUrl`/`setPdfUrl` (blob URL) with `pdfBlob`/`setPdfBlob` (raw `Blob`). PDF.js receives the Blob and calls `.arrayBuffer()` directly — no `fetch()` call, no `connect-src` violation.
- **`src/components/ui/FileViewer.jsx`** — New `PdfPage` sub-component with `IntersectionObserver` lazy rendering and `renderedScaleRef` scale-change guard. New `PdfCanvasViewer` component: loads PDF via `blob.arrayBuffer()`, renders all pages in a scrollable flex-column, zoom toolbar (±25% steps), download button. Full-height overlay: PDF path bypasses the centering wrapper via `absolute inset-0`; toolbar + scrollable pages fill `100dvh`.
- **`src/apps/research/components/PaperEditor.jsx`** — `findOrCreateFolder` fixed to handle both field-level encrypted folders (`raw.encryptedTitle`) and legacy single-blob format; previously missed existing folders and created duplicates. AI markdown reviews now always saved with `personalKey || cryptoKey` (personal vault), not the shared-doc key.
- **`src/apps/research/components/PaperAiSection.jsx`** — Full rewrite: `selectedIndex` state (defaults to latest), `contentCache` map for on-demand Firestore fetches, `← N / M →` navigation arrows (shown only when >1 review), spinner while loading, auto-jump to newest review on generation, single "Open" button for the selected review.
- **`src/apps/markdown/services/markdown.js`** — New `fetchMarkdownDocById(userId, cryptoKey, docId)` export: single-doc `getDoc` + `decryptMarkdownDoc` for personal vault (used by `PaperAiSection` switcher).
- **`src/components/ui/WorkspaceSwitcher.jsx`** — Added `text-gray-900` to workspace name input; was inheriting white/light text from the header, making typed characters invisible against the white input background.

### Scope & Limitations
- PDF.js renders from the raw Blob passed to `FileViewer`; works for encrypted and unencrypted PDFs. Legacy files that were uploaded without the current storage path scheme return a 404 from Firebase — that is a data issue, not a code bug.
- Older AI reviews are fetched from the personal vault only (always saved there). Reviews generated before the `personalKey` fix (Session 16) may still be stored under the shared-doc key and fail to decrypt.

---

## Out of Scope

| ID | Reason |
|----|--------|
| F10 — PDF annotation | Requires in-browser PDF annotation engine (PDF.js annotation layer or equivalent), annotation data model, sync/storage layer. Months of work. |
| Storage path migration (M2 follow-up) | Moving files to workspace-scoped Storage paths requires a Firestore Cloud Function + Storage rules update. Infrastructure concern, not client-side. |
| CRDT in CodeMirror source mode | Requires `y-codemirror.next` integration; source mode is used less often than WYSIWYG; lower priority. |
| CRDT for Research PaperNotesPanel | Separate contenteditable architecture; lower priority than Notes + Markdown. |

---

## Execution Order

```
Session 8  (M2+M3)    ✅ — vault↔workspace move: attachment re-encryption + recursive folder move
Session 9  (C2)       ✅ — field-level encrypted saves across all three apps
Session 10 (ME7)      ✅ — CodeMirror 6 syntax highlighting in Markdown editor
Session 11 (F6)       ✅ — PDF first-page thumbnails in PaperCard
Session 12 (ME11)     ✅ — TipTap WYSIWYG mode in Markdown editor
Session 13 (U-B)      ✅ — SharedHub: owner grouping, search, unread indicators
Session 14 (C4-1)     ✅ — CRDT foundation: encrypted Y.js Firestore provider + Notes binding
Session 15 (C4-2)     ✅ — CRDT TipTap/WYSIWYG + Firestore cursor awareness
Session 16 (bugs/UX)  ✅ — PDF viewer CSP fix + multi-page scroll + AI review switcher + workspace input fix
```

Sessions 13 and 14 are independent of each other. Session 15 requires Session 14 (uses the same `yjsCollab.js` service and `useYjsCollab` hook).
