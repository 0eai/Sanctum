import React, { useState, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Camera, X } from 'lucide-react';
import { Modal, Input, Button } from '../../../components/ui';

const AuthEditor = ({ item, isOpen, onClose, onSave }) => {
    const [data, setData] = useState({ id: null, service: '', account: '', secret: '' });
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setData(item || { id: null, service: '', account: '', secret: '' });
        }
    }, [item, isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...data,
            service: data.service.trim(),
            account: data.account.trim(),
            secret: data.secret.replace(/\s+/g, '').toUpperCase()
        });
    };

    // Reusable parse logic pulled out from handleSecretChange
    const parseUriString = (val) => {
        if (val.startsWith('otpauth://totp/')) {
            try {
                const url = new URL(val);
                const secretParams = url.searchParams.get('secret');
                const issuerParams = url.searchParams.get('issuer');

                let pathname = decodeURIComponent(url.pathname.replace(/^\/totp\//, ''));
                let parsedService = issuerParams || '';
                let parsedAccount = pathname;

                if (pathname.includes(':')) {
                    const parts = pathname.split(':');
                    if (!parsedService) parsedService = parts[0].trim();
                    parsedAccount = parts[1].trim();
                }

                setData(prev => ({
                    ...prev,
                    service: prev.service || parsedService,
                    account: prev.account || parsedAccount,
                    secret: secretParams || prev.secret
                }));
                return true;
            } catch (err) {
                // ignore parse errors
                return false;
            }
        }
        return false;
    };

    const handleSecretChange = (e) => {
        let val = e.target.value;
        if (!parseUriString(val)) {
            setData(prev => ({ ...prev, secret: val }));
        }
    };

    const handleScan = (result) => {
        if (result && result[0] && result[0].rawValue) {
            const val = result[0].rawValue;
            if (parseUriString(val)) {
                setIsScanning(false);
            } else {
                setData(prev => ({ ...prev, secret: val }));
                setIsScanning(false);
            }
        }
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={item ? "Edit Authenticator" : "Add Authenticator"}>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <Input
                        label="Service Name"
                        placeholder="e.g. Google, GitHub, AWS"
                        value={data.service}
                        onChange={(e) => setData({ ...data, service: e.target.value })}
                        autoFocus
                        required
                    />

                    <Input
                        label="Account / Email"
                        placeholder="e.g. user@example.com"
                        value={data.account}
                        onChange={(e) => setData({ ...data, account: e.target.value })}
                    />

                    <div className="flex flex-col gap-1">
                        <div className="flex gap-2 items-end">
                            <div className="flex-1">
                                <Input
                                    label="Setup Key (Secret)"
                                    placeholder="e.g. JBSWY3DPEHPK3PXP"
                                    value={data.secret}
                                    onChange={handleSecretChange}
                                    required
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsScanning(true)}
                                className="p-3 mb-4 h-[50px] bg-blue-50 text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors flex items-center justify-center"
                                aria-label="Scan QR Code"
                            >
                                <Camera size={20} />
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 pl-1">
                            Accepts standard Base32 secrets or full <code className="bg-gray-100 px-1 rounded">otpauth://</code> URIs.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 mt-2">
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="submit">Save</Button>
                    </div>
                </form>
            </Modal>

            {/* Nested Scanner Modal */}
            {isScanning && (
                <div className="fixed inset-0 z-[150] bg-black/90 flex flex-col items-center justify-center p-4">
                    <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-black relative">
                        <button
                            onClick={() => setIsScanning(false)}
                            className="absolute top-4 right-4 z-10 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                        >
                            <X size={24} />
                        </button>
                        <Scanner
                            onScan={handleScan}
                            onError={(err) => console.log(err)}
                            components={{
                                audio: false,
                                onOff: true,
                                torch: true,
                                zoom: false,
                                finder: true
                            }}
                        />
                        <div className="p-4 bg-gray-900 text-center text-white text-sm">
                            Focus a standard 2FA QR code to scan.
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AuthEditor;
