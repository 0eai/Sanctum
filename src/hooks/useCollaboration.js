// src/hooks/useCollaboration.js
//
// Encapsulates all workspace + shared-doc lifecycle logic that is
// duplicated across 6 collab-enabled apps (notes, markdown, tasks,
// checklist, research, bookmarks).
//
// Usage:
//   const collab = useCollaboration(user, cryptoKey, 'notes');
//   // collab.ctx         → { workspaceId, key } | null
//   // collab.workspaces  → array of workspace objects
//   // collab.sharedDocs  → array of shared documents
//   // collab.activeWorkspace → currently selected workspace | null
//   // collab.switchWorkspace(ws) → select a workspace
//   // collab.createNewWorkspace(name) → create + auto-select
//   // collab.deleteActiveWorkspace() → delete + deselect
//   // collab.workspacePanelProps → spread onto <WorkspacePanel>
//   // collab.switcherProps → spread onto <WorkspaceSwitcher>

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { listenToWorkspaces, getWorkspaceKey, createWorkspace, deleteWorkspace } from '../services/workspace';
import { listenToSharedDocs } from '../services/collaboration';
import { getPersistedWorkspaceId, persistWorkspaceId } from '../components/ui/WorkspaceSwitcher';
import { getMyPrivateKey } from '../apps/secureshare/services/secureshare';
import { encryptData } from '../lib/crypto';
import {
    collection, doc, deleteDoc, setDoc, serverTimestamp
} from 'firebase/firestore';
import { reEncryptStorageFilesForMove } from '../services/firebaseStorage';
import { db, appId } from '../lib/firebase';

/**
 * @param {object} user - Firebase user object (must have .uid)
 * @param {CryptoKey} cryptoKey - Master decryption key
 * @param {string} appType - 'notes' | 'markdown' | 'tasks' | 'checklists' | 'research' | 'bookmarks'
 */
export default function useCollaboration(user, cryptoKey, appType) {
    // --- State ---
    const [privateKey, setPrivateKey] = useState(null);
    const [workspaces, setWorkspaces] = useState([]);
    const [activeWorkspace, setActiveWorkspace] = useState(null);
    const [workspaceKey, setWorkspaceKey] = useState(null);
    const [sharedDocs, setSharedDocs] = useState([]);
    const prevSharedIdsRef = useRef(null); // null = initial load not yet seen
    const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = useState(false);
    const [collaborateModalItem, setCollaborateModalItem] = useState(null);
    const [isNamingWorkspace, setIsNamingWorkspace] = useState(false);
    const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');

    // --- Computed ---
    const ctx = useMemo(
        () => activeWorkspace && workspaceKey ? { workspaceId: activeWorkspace.id, key: workspaceKey } : null,
        [activeWorkspace, workspaceKey]
    );

    // --- Effects ---

    // 1. Fetch RSA private key for workspace key decryption & collaboration
    useEffect(() => {
        if (!user || !cryptoKey) return;
        getMyPrivateKey(user.uid, cryptoKey).then(setPrivateKey);
    }, [user, cryptoKey]);

    // 2. Listen to workspaces the user is a member of
    useEffect(() => {
        if (!user) return;
        return listenToWorkspaces(user.uid, setWorkspaces);
    }, [user]);

    // 3. Auto-restore persisted workspace on load
    useEffect(() => {
        if (!workspaces.length) return;
        const savedId = getPersistedWorkspaceId();
        if (savedId && !activeWorkspace) {
            const ws = workspaces.find(w => w.id === savedId);
            if (ws) setActiveWorkspace(ws);
        }
    }, [workspaces, activeWorkspace]);

    // 4. Fetch workspace AES key when workspace ID changes (not object reference)
    useEffect(() => {
        if (!activeWorkspace?.id || !privateKey) {
            setWorkspaceKey(null);
            return;
        }
        let isMounted = true;
        getWorkspaceKey(activeWorkspace.id, user.uid, privateKey.rsa).then(key => {
            if (isMounted) setWorkspaceKey(key);
        });
        return () => { isMounted = false; };
    }, [activeWorkspace?.id, user, privateKey]);

    // 5. Listen to shared docs (only when not in a workspace)
    useEffect(() => {
        if (!user || !privateKey || activeWorkspace) return;
        return listenToSharedDocs(user.uid, appType, privateKey, (docs) => {
            const incomingIds = new Set(docs.map(d => d.id));
            if (prevSharedIdsRef.current !== null) {
                // Detect genuinely new shares (not present on initial load)
                const newIds = docs.filter(d => !prevSharedIdsRef.current.has(d.id) && d.role !== 'owner');
                if (newIds.length > 0) {
                    const stored = parseInt(localStorage.getItem('sanctum_new_shares') || '0');
                    localStorage.setItem('sanctum_new_shares', String(stored + newIds.length));
                    window.dispatchEvent(new CustomEvent('sanctum_new_shares'));
                }
            }
            prevSharedIdsRef.current = incomingIds;
            setSharedDocs(docs);
        });
    }, [user, privateKey, activeWorkspace, appType]);

    // --- Actions ---

    const switchWorkspace = useCallback((ws) => {
        persistWorkspaceId(ws?.id || null);
        setActiveWorkspace(ws);
    }, []);

    const createNewWorkspace = useCallback(async (name) => {
        if (!name) return null;
        const ws = await createWorkspace(name, user.uid);
        const newWs = { id: ws.workspaceId, name, createdBy: user.uid, memberUids: [user.uid] };
        persistWorkspaceId(ws.workspaceId);
        setActiveWorkspace(newWs);
        return newWs;
    }, [user]);

    const deleteActiveWorkspace = useCallback(async () => {
        if (!activeWorkspace) return;
        await deleteWorkspace(activeWorkspace.id);
        setActiveWorkspace(null);
        setIsWorkspacePanelOpen(false);
    }, [activeWorkspace]);

    const openCollaborateModal = useCallback((item) => {
        setCollaborateModalItem(item);
    }, []);

    const closeCollaborateModal = useCallback(() => {
        setCollaborateModalItem(null);
    }, []);

    /**
     * Move (or copy) a decrypted item between personal vault and a workspace.
     * @param {object} item - The already-decrypted item (from the app's state array)
     * @param {string} collectionName - e.g. 'notes', 'tasks'
     * @param {object|null} destCtx - destination context { workspaceId, key } or null for personal vault
     * @param {CryptoKey} personalKey - user's personal master key
     * @param {boolean} [deleteSource=true] - whether to remove the item from the source
     */
    const moveItemToContext = useCallback(async (item, collectionName, destCtx, personalKey, deleteSource = true) => {
        const uid = user?.uid;
        if (!uid) throw new Error('moveItemToContext: user not authenticated');

        const sourceCtx = ctx; // current context at call time
        const sourceKey = sourceCtx?.key ?? personalKey;
        const destKey   = destCtx?.key  ?? personalKey;

        // Build destination collection ref
        const destCol = destCtx?.workspaceId
            ? collection(db, 'artifacts', appId, 'workspaces', destCtx.workspaceId, collectionName)
            : collection(db, 'artifacts', appId, 'users', uid, collectionName);

        // Re-encrypt with destination key — preserve original document ID so parentId
        // references remain valid when moving a folder tree.
        // Strip field-level encrypted blobs, legacy blob, and raw metadata — they'll
        // be written separately so the destination doc has the same structure as a
        // freshly-saved item (metadata at top level, content in encrypted fields).
        const {
            id: docId,
            // field-level encrypted blobs (Session 9 format)
            encryptedTitle, encryptedContent, encryptedTags, encryptedAttachments, encryptedMeta,
            // legacy single-blob fields
            data: _data, iv: _iv,
            // Firestore metadata — stored separately, not in the encrypted payload
            isPinned, type, parentId, updatedAt: _updatedAt, createdAt: _createdAt, versionId,
            // Collaboration listener fields — not persisted to Firestore
            isSharedDoc, role, docKey,
            ...cleanPayload
        } = item;
        const encrypted = await encryptData(cleanPayload, destKey);
        await setDoc(doc(destCol, docId), {
            ...encrypted,
            // Write metadata fields explicitly so they're accessible without decryption
            isPinned: isPinned || false,
            type: type || 'note',
            parentId: parentId || null,
            versionId: versionId || 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        // Re-encrypt Storage attachment files in-place with the destination key.
        await reEncryptStorageFilesForMove(item, sourceKey, destKey, collectionName);

        // Remove from source
        if (deleteSource && docId) {
            const srcColRef = sourceCtx?.workspaceId
                ? collection(db, 'artifacts', appId, 'workspaces', sourceCtx.workspaceId, collectionName)
                : collection(db, 'artifacts', appId, 'users', uid, collectionName);
            await deleteDoc(doc(srcColRef, docId));
        }
    }, [ctx, user]);

    // --- Pre-built props for UI components ---

    const confirmNewWorkspace = useCallback(async () => {
        const name = workspaceNameDraft.trim();
        if (!name) return;
        setIsNamingWorkspace(false);
        setWorkspaceNameDraft('');
        await createNewWorkspace(name);
    }, [workspaceNameDraft, createNewWorkspace]);

    /** Spread onto <WorkspaceSwitcher> */
    const switcherProps = useMemo(() => ({
        workspaces,
        activeWorkspace,
        onSelect: switchWorkspace,
        onCreateNew: () => { setWorkspaceNameDraft(''); setIsNamingWorkspace(true); },
        isNamingWorkspace,
        workspaceNameDraft,
        onNameDraftChange: setWorkspaceNameDraft,
        onConfirmName: confirmNewWorkspace,
        onCancelName: () => { setIsNamingWorkspace(false); setWorkspaceNameDraft(''); },
    }), [workspaces, activeWorkspace, switchWorkspace, isNamingWorkspace, workspaceNameDraft, confirmNewWorkspace]);

    /** Spread onto <WorkspacePanel> (only render when activeWorkspace is truthy) */
    const workspacePanelProps = useMemo(() => ({
        isOpen: isWorkspacePanelOpen,
        onClose: () => setIsWorkspacePanelOpen(false),
        workspace: activeWorkspace,
        workspaceKey,
        currentUid: user?.uid,
        onKeyRotated: (newKey) => setWorkspaceKey(newKey),
        onDelete: deleteActiveWorkspace,
    }), [isWorkspacePanelOpen, activeWorkspace, workspaceKey, user, deleteActiveWorkspace]);

    return {
        // State
        privateKey,
        workspaces,
        activeWorkspace,
        workspaceKey,
        sharedDocs,
        ctx,

        // UI state
        isWorkspacePanelOpen,
        setIsWorkspacePanelOpen,
        collaborateModalItem,
        isNamingWorkspace,
        setIsNamingWorkspace,
        workspaceNameDraft,
        setWorkspaceNameDraft,
        confirmNewWorkspace,

        // Actions
        switchWorkspace,
        createNewWorkspace,
        deleteActiveWorkspace,
        openCollaborateModal,
        closeCollaborateModal,
        moveItemToContext,

        // Pre-built component props
        switcherProps,
        workspacePanelProps,
    };
}
