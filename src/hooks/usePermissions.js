import { useVault } from '../context/VaultContext';

export const usePermissions = (item) => {
    const { user } = useVault();

    if (!item || !user) {
        return { isOwner: false, canDelete: false, canShare: false };
    }

    // Shared items must have an explicit ownerUid match — never fall back to "no ownerId" logic
    // since a shared item always has ownerUid set and we must not grant ownership to non-owners.
    const isOwner = item.isShared
        ? item.ownerUid === user.uid
        : (item.ownerId === user.uid || !item.ownerId);

    return {
        isOwner,
        canDelete: isOwner,
        canShare: isOwner
    };
};
