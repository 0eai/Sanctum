import React from 'react';
import { Cloud, Settings, X } from 'lucide-react';
import { Button } from './index';

/**
 * Dialog that prompts the user to connect Google Drive before uploading.
 * Shown by the useDriveGuard hook when requireDrive() fails.
 */
const DriveGuardDialog = ({ onDismiss, navigate }) => {
    const handleGoToSettings = () => {
        onDismiss();
        if (navigate) {
            navigate('#settings/integrations');
        } else {
            window.location.hash = '#settings/integrations';
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 pt-6 pb-4">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-amber-100 rounded-xl text-amber-600">
                                <Cloud size={24} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 text-lg">Storage Required</h3>
                                <p className="text-sm text-amber-700 mt-0.5">Google Drive not connected</p>
                            </div>
                        </div>
                        <button
                            onClick={onDismiss}
                            className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        File attachments are stored in your personal Google Drive with end-to-end encryption.
                        Please connect your Google Drive account first to enable file uploads.
                    </p>
                </div>

                {/* Actions */}
                <div className="px-6 pb-6 flex gap-3">
                    <Button variant="ghost" onClick={onDismiss} className="flex-1">
                        Cancel
                    </Button>
                    <Button onClick={handleGoToSettings} className="flex-1">
                        <Settings size={16} />
                        Go to Settings
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default DriveGuardDialog;
