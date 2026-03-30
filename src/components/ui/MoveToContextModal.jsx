// src/components/ui/MoveToContextModal.jsx
// Lets users move a document between Personal Vault and any workspace by
// re-encrypting it with the destination key via moveItemToContext.
// Supports recursive folder moves when allItems is provided.
import { useState } from 'react';
import { ArrowRightLeft, AlertTriangle, Loader } from 'lucide-react';
import { Modal, Button } from './index';
import { getWorkspaceKey } from '../../services/workspace';

const getDescendants = (folderId, items) => {
    const result = [];
    const queue = [folderId];
    while (queue.length > 0) {
        const id = queue.shift();
        const children = items.filter(i => i.parentId === id);
        for (const child of children) {
            result.push(child);
            if (child.type === 'folder') queue.push(child.id);
        }
    }
    return result;
};

const MoveToContextModal = ({
    isOpen, onClose,
    item, collectionName,
    allItems,
    workspaces, activeWorkspaceId,
    user, privateKey, cryptoKey, ctx,
    onMoveItemToContext,
}) => {
    const [selected, setSelected] = useState(null); // null = Personal Vault, ws.id = workspace
    const [isMoving, setIsMoving] = useState(false);
    const [progress, setProgress] = useState(null); // null | { current, total }
    const [error, setError] = useState(null);

    if (!isOpen || !item) return null;

    const currentIsPersonal = !activeWorkspaceId;
    const isFolder = item.type === 'folder';
    const descendants = isFolder && allItems ? getDescendants(item.id, allItems) : [];

    const handleMove = async () => {
        setIsMoving(true);
        setError(null);
        try {
            let destCtx = null;
            if (selected !== null) {
                // Moving to a workspace — fetch that workspace's AES key via RSA
                const destKey = await getWorkspaceKey(selected, user.uid, privateKey?.rsa);
                if (!destKey) throw new Error('Could not retrieve destination workspace key.');
                destCtx = { workspaceId: selected, key: destKey };
            }

            if (isFolder && allItems?.length) {
                const total = descendants.length + 1;
                let current = 0;
                for (const child of descendants) {
                    await onMoveItemToContext(child, collectionName, destCtx, cryptoKey);
                    setProgress({ current: ++current, total });
                }
                await onMoveItemToContext(item, collectionName, destCtx, cryptoKey);
            } else {
                await onMoveItemToContext(item, collectionName, destCtx, cryptoKey);
            }

            setSelected(null);
            setProgress(null);
            onClose();
        } catch (e) {
            console.error('Move failed', e);
            setError(e.message || 'Move failed. Please try again.');
            setProgress(null);
        }
        setIsMoving(false);
    };

    const handleClose = () => {
        if (isMoving) return;
        setSelected(null);
        setError(null);
        setProgress(null);
        onClose();
    };

    // Build destination list
    const destinations = [
        { id: null, label: 'Personal Vault', isCurrent: currentIsPersonal },
        ...workspaces.map(ws => ({
            id: ws.id,
            label: ws.name,
            isCurrent: ws.id === activeWorkspaceId,
        })),
    ];

    const isDestinationSelected = selected !== undefined && !destinations.find(d => d.id === selected)?.isCurrent;

    return (
        <Modal isOpen={true} onClose={handleClose} title={`Move "${item.title || 'Untitled'}" to…`}>
            <div className="flex flex-col gap-3">
                {/* Destination list */}
                <div className="flex flex-col gap-1.5">
                    {destinations.map(dest => (
                        <button
                            key={String(dest.id)}
                            disabled={dest.isCurrent || isMoving}
                            onClick={() => setSelected(dest.id)}
                            className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all
                                ${dest.isCurrent
                                    ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-default'
                                    : selected === dest.id
                                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                                        : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/50 text-gray-700'
                                }`}
                        >
                            {dest.label}
                            {dest.isCurrent && <span className="ml-2 text-xs text-gray-400 font-normal">(current)</span>}
                        </button>
                    ))}
                </div>

                {/* Context-aware info banner */}
                {isFolder ? (
                    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700">
                        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                        <span>
                            Moves this folder and all {descendants.length} item{descendants.length !== 1 ? 's' : ''} inside.
                            Attached files will be re-encrypted with the destination key.
                        </span>
                    </div>
                ) : (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-700">
                        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                        <span>Attached files will be re-encrypted with the destination key.</span>
                    </div>
                )}

                {/* Progress indicator */}
                {isMoving && progress && (
                    <p className="text-xs text-blue-500 text-center">
                        Moving {progress.current} of {progress.total} items…
                    </p>
                )}

                {error && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" onClick={handleClose} disabled={isMoving}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={handleMove}
                        disabled={selected === undefined || !isDestinationSelected || isMoving}
                    >
                        {isMoving
                            ? <span className="flex items-center gap-2"><Loader size={14} className="animate-spin" /> Moving…</span>
                            : <span className="flex items-center gap-2"><ArrowRightLeft size={14} /> Move</span>
                        }
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default MoveToContextModal;
