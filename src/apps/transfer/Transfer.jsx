// src/apps/transfer/Transfer.jsx
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Share2, Download, Smartphone, Monitor, Laptop } from 'lucide-react';
import { Button } from '../../components/ui';
import { 
    generateRoomCode, getLocalDeviceId, getDeviceName, registerDevice, 
    unregisterDevice, listenToActiveDevices, listenToIncomingInvites, 
    sendTransferInvite, clearIncomingInvite 
} from '../../services/transfer';

import TransferRoom from './components/TransferRoom';

const TransferApp = ({ user, onExit, route, navigate }) => {
    const [joinCode, setJoinCode] = useState('');
    const [activeDevices, setActiveDevices] = useState([]);

    // --- URL-Driven State ---
    const roomId = route.resource === 'room' ? route.resourceId : null;
    const mode = route.query?.mode; 

    // --- Presence System ---
    useEffect(() => {
        if (!user || roomId) return; // Don't run presence if currently in a transfer room

        const deviceId = getLocalDeviceId();
        const deviceName = getDeviceName();

        // 1. Announce this device to Firestore
        const pingDevice = () => registerDevice(user.uid, deviceId, deviceName);
        pingDevice();
        
        // Ping every 60 seconds to keep it "alive"
        const interval = setInterval(pingDevice, 60000); 

        // 2. Listen for other devices on the network
        const unsubDevices = listenToActiveDevices(user.uid, deviceId, setActiveDevices);

        // 3. Listen for someone clicking THIS device on their screen
        const unsubInvites = listenToIncomingInvites(user.uid, deviceId, (incomingRoomId) => {
            clearIncomingInvite(user.uid, deviceId);
            navigate(`#transfer/room/${incomingRoomId}?mode=peer`); // Auto-join!
        });

        // 4. Cleanup on unmount/close
        const handleUnload = () => unregisterDevice(user.uid, deviceId);
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', handleUnload);
            unregisterDevice(user.uid, deviceId);
            unsubDevices();
            unsubInvites();
        };
    }, [user, roomId, navigate]);

    // --- Handlers ---
    const handleSendToDevice = async (targetDeviceId) => {
        const code = generateRoomCode();
        await sendTransferInvite(user.uid, targetDeviceId, code);
        navigate(`#transfer/room/${code}?mode=host`);
    };

    const handleCreateRoom = () => {
        const code = generateRoomCode();
        navigate(`#transfer/room/${code}?mode=host`);
    };

    const handleJoinRoom = (e) => {
        e.preventDefault();
        if (joinCode.length === 6) navigate(`#transfer/room/${joinCode}?mode=peer`);
    };

    if (roomId && mode) {
        return <TransferRoom user={user} roomId={roomId} mode={mode} onLeave={() => navigate(`#transfer`)} />;
    }

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50 relative">
            <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 p-4">
                <div className="max-w-xl mx-auto flex items-center gap-2">
                    <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft /></button>
                    <h1 className="text-xl font-bold flex items-center gap-2"><Share2 size={20} /> Drop</h1>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 flex flex-col items-center pt-8">
                <div className="max-w-md w-full bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center gap-6 text-center">
                    
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">Available Devices</h2>
                        <p className="text-sm text-gray-500 mt-1">Tap a device to connect instantly.</p>
                    </div>

                    {/* Auto-Discovery List */}
                    <div className="w-full flex flex-col gap-3">
                        {activeDevices.length === 0 ? (
                            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-gray-400 text-sm">
                                No other devices found. <br/> Open this app on another device!
                            </div>
                        ) : (
                            activeDevices.map(device => {
                                const isMobile = device.deviceName.includes('iPhone') || device.deviceName.includes('Android');
                                return (
                                    <button 
                                        key={device.id}
                                        onClick={() => handleSendToDevice(device.id)}
                                        className="bg-blue-50 border border-blue-100 hover:bg-[#4285f4] hover:text-white text-[#4285f4] transition-colors rounded-2xl p-4 flex items-center gap-4 group text-left"
                                    >
                                        <div className="bg-white p-3 rounded-full text-[#4285f4]">
                                            {isMobile ? <Smartphone size={24} /> : <Laptop size={24} />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-lg">{device.deviceName}</div>
                                            <div className="text-xs opacity-70">Tap to connect</div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="relative flex py-2 w-full items-center">
                        <div className="flex-grow border-t border-gray-200"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-400 text-[10px] font-bold uppercase tracking-wider">Manual Code</span>
                        <div className="flex-grow border-t border-gray-200"></div>
                    </div>

                    {/* Manual Fallbacks */}
                    <div className="w-full flex flex-col gap-3">
                        <Button onClick={handleCreateRoom} className="w-full py-3 shadow-sm flex items-center justify-center gap-2">
                            <Share2 size={16} /> Generate Code
                        </Button>
                        <form onSubmit={handleJoinRoom} className="flex gap-2">
                            <input 
                                type="text" 
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000000"
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 text-center font-mono font-bold tracking-widest text-gray-800 outline-none focus:border-[#4285f4]"
                            />
                            <Button type="submit" variant="secondary" disabled={joinCode.length !== 6} className="px-6 flex items-center justify-center gap-2">
                                <Download size={16} />
                            </Button>
                        </form>
                    </div>

                </div>
            </main>
        </div>
    );
};

export default TransferApp;