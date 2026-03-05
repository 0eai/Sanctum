import { useVault } from '../context/VaultContext';

export const usePermissions = (item) => {
    const { user } = useVault();

    if (!item || !user) {
        return { isOwner: false, canDelete: false, canShare: false };
    }

    // Determine ownership: if ownerId is explicitly set, check it;
    // otherwise, for legacy items without an ownerId created by the user, assume ownership.
    const isOwner = item.ownerId === user.uid || !item.ownerId;

    return {
        isOwner,
        canDelete: isOwner,
        canShare: isOwner
    };
};
