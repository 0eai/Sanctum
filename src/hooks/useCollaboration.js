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

import { useState, useEffect, useMemo, useCallback } from 'react';
import { listenToWorkspaces, getWorkspaceKey, createWorkspace, deleteWorkspace } from '../services/workspace';
import { listenToSharedDocs } from '../services/collaboration';
import { getPersistedWorkspaceId, persistWorkspaceId } from '../components/ui/WorkspaceSwitcher';
import { getMyPrivateKey } from '../apps/secureshare/services/secureshare';

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
    const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = useState(false);
    const [collaborateModalItem, setCollaborateModalItem] = useState(null);

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

    // 4. Fetch workspace AES key when workspace changes
    useEffect(() => {
        if (!activeWorkspace) {
            setWorkspaceKey(null);
            return;
        }
        if (!privateKey) {
            setWorkspaceKey(null);
            return;
        }
        let isMounted = true;
        getWorkspaceKey(activeWorkspace.id, user.uid, privateKey.rsa).then(key => {
            if (isMounted) setWorkspaceKey(key);
        });
        return () => { isMounted = false; };
    }, [activeWorkspace, user, privateKey]);

    // 5. Listen to shared docs (only when not in a workspace)
    useEffect(() => {
        if (!user || !privateKey || activeWorkspace) return;
        return listenToSharedDocs(user.uid, appType, privateKey, setSharedDocs);
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

    // --- Pre-built props for UI components ---

    /** Spread onto <WorkspaceSwitcher> */
    const switcherProps = useMemo(() => ({
        workspaces,
        activeWorkspace,
        onSelect: switchWorkspace,
        onCreateNew: async () => {
            const name = prompt("Workspace Name:");
            if (name) await createNewWorkspace(name);
        }
    }), [workspaces, activeWorkspace, switchWorkspace, createNewWorkspace]);

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

        // Actions
        switchWorkspace,
        createNewWorkspace,
        deleteActiveWorkspace,
        openCollaborateModal,
        closeCollaborateModal,

        // Pre-built component props
        switcherProps,
        workspacePanelProps,
    };
}
