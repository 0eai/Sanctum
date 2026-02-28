import { useState, useEffect, useCallback } from 'react';
import { checkGoogleDriveConnection } from '../services/driveAuth';

/**
 * Hook that checks Google Drive connection status and provides
 * a guard function to call before upload operations.
 * 
 * @param {string} userId - The authenticated user's ID
 * @returns {{ isDriveConnected: boolean|null, showDriveDialog: boolean, requireDrive: () => boolean, dismissDialog: () => void }}
 */
export function useDriveGuard(userId) {
    const [isDriveConnected, setIsDriveConnected] = useState(null);
    const [showDriveDialog, setShowDriveDialog] = useState(false);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        checkGoogleDriveConnection(userId).then((connected) => {
            if (!cancelled) setIsDriveConnected(connected);
        }).catch(() => {
            if (!cancelled) setIsDriveConnected(false);
        });

        return () => { cancelled = true; };
    }, [userId]);

    /**
     * Call before any upload. Returns true if Drive is connected.
     * If not, shows the dialog and returns false.
     */
    const requireDrive = useCallback(() => {
        if (isDriveConnected) return true;
        setShowDriveDialog(true);
        return false;
    }, [isDriveConnected]);

    const dismissDialog = useCallback(() => {
        setShowDriveDialog(false);
    }, []);

    return { isDriveConnected, showDriveDialog, requireDrive, dismissDialog };
}
