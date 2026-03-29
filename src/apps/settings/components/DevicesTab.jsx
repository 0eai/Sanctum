// src/apps/settings/components/DevicesTab.jsx
import React, { useState, useEffect } from 'react';
import { Monitor, Smartphone, Cpu, LogOut, Shield, Clock, Wifi, Globe } from 'lucide-react';
import { Button } from '../../../components/ui';
import { listenToDevices, removeDevice, removeAllOtherDevices } from '../../../services/deviceTracker';
import { logActivity } from '../../../services/activityLog';

const getDeviceIcon = (deviceType, os) => {
    if (deviceType === 'mobile') return Smartphone;
    if (os?.toLowerCase().includes('jetson') || os?.toLowerCase().includes('arm')) return Cpu;
    return Monitor;
};

const formatLastActive = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return 'Active now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
};

const DevicesTab = ({ user, cryptoKey, setMessage }) => {
    const [devices, setDevices] = useState([]);
    const [currentDeviceId, setCurrentDeviceId] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [loggingOut, setLoggingOut] = useState(false);
    const [removingId, setRemovingId] = useState(null);

    // Real-time device listener
    useEffect(() => {
        if (!user?.uid) return;
        return listenToDevices(user.uid, (deviceList, currentId) => {
            setDevices(deviceList);
            setCurrentDeviceId(currentId);
        }, cryptoKey);
    }, [user?.uid, cryptoKey]);

    const handleRemoveDevice = async (deviceId, deviceName) => {
        if (!window.confirm(`Sign out "${deviceName}"? That device will need to re-authenticate.`)) return;
        setRemovingId(deviceId);
        try {
            await removeDevice(user.uid, deviceId);
            logActivity(user.uid, `Signed out: ${deviceName}`, 'info', 'Lock');
            setMessage?.({ type: 'success', text: `${deviceName} has been signed out.` });
        } catch (e) {
            setMessage?.({ type: 'error', text: 'Failed to sign out device.' });
        } finally {
            setRemovingId(null);
        }
    };

    const handleLogoutAll = async () => {
        const otherCount = devices.filter(d => d.deviceId !== currentDeviceId).length;
        if (otherCount === 0) {
            setMessage?.({ type: 'info', text: 'No other devices to sign out.' });
            return;
        }
        if (!window.confirm(`Sign out ${otherCount} other device${otherCount > 1 ? 's' : ''}? You will stay logged in on this device.`)) return;
        setLoggingOut(true);
        try {
            await removeAllOtherDevices(user.uid);
            logActivity(user.uid, `Signed out ${otherCount} other device${otherCount > 1 ? 's' : ''}`, 'danger', 'Shield');
            setMessage?.({ type: 'success', text: 'All other devices have been signed out.' });
        } catch (e) {
            setMessage?.({ type: 'error', text: 'Failed to sign out other devices.' });
        } finally {
            setLoggingOut(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header info */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-4 flex items-start gap-3">
                <Shield size={20} className="text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                    <p className="text-sm font-semibold text-gray-800">Device Management</p>
                    <p className="text-xs text-gray-500 mt-1">
                        Devices that have accessed your vault. Remove any you don't recognize.
                    </p>
                </div>
            </div>

            {/* Device List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
                    <Monitor size={18} className="text-[#4285f4]" />
                    Active Devices
                    <span className="ml-auto text-xs font-normal text-gray-400">{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
                </div>

                {devices.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">
                        <Monitor size={32} className="mx-auto mb-2 text-gray-200" />
                        No devices registered yet.
                        <br />
                        <span className="text-xs">Devices appear here when the vault is unlocked.</span>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {devices.map(device => {
                            const isCurrent = device.deviceId === currentDeviceId;
                            const Icon = getDeviceIcon(device.deviceType, device.os);
                            const isExpanded = expandedId === device.deviceId;
                            const isRemoving = removingId === device.deviceId;

                            return (
                                <button
                                    key={device.deviceId}
                                    onClick={() => setExpandedId(isExpanded ? null : device.deviceId)}
                                    className="w-full text-left p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors min-h-[56px]"
                                >
                                    {/* Icon */}
                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isCurrent
                                        ? 'bg-green-100 text-green-600'
                                        : 'bg-gray-100 text-gray-500'
                                        }`}>
                                        <Icon size={22} />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-gray-900 text-sm">{device.deviceName || 'Unknown Device'}</p>
                                            {isCurrent && (
                                                <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                                    This device
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">{device.os} · {device.browser}</p>

                                        {/* Last active */}
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <div className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-green-500' : 'bg-gray-300'}`} />
                                            <span className="text-xs text-gray-500">{formatLastActive(device.lastActive)}</span>
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && (
                                            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-xs text-gray-500">
                                                <div className="flex items-center gap-2">
                                                    <Globe size={12} /> <span>{device.browser}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Wifi size={12} /> <span className="truncate">{device.userAgent?.slice(0, 80) || 'N/A'}…</span>
                                                </div>
                                                {!isCurrent && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRemoveDevice(device.deviceId, device.deviceName);
                                                        }}
                                                        disabled={isRemoving}
                                                        className="mt-2 w-full min-h-[44px] text-red-600 bg-red-50 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 hover:bg-red-100 transition-colors disabled:opacity-50"
                                                    >
                                                        <LogOut size={14} />
                                                        {isRemoving ? 'Signing out...' : 'Sign Out This Device'}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Emergency Logout Button */}
            <div className="bg-red-50 rounded-2xl border border-red-100 p-4">
                <p className="text-xs text-red-600 mb-3 font-medium">
                    If you suspect unauthorized access, sign out all other devices immediately.
                </p>
                <Button
                    onClick={handleLogoutAll}
                    variant="danger"
                    className="w-full min-h-[48px] bg-red-600 text-white hover:bg-red-700 border-red-600"
                    disabled={loggingOut}
                >
                    <LogOut size={18} />
                    {loggingOut ? 'Signing out...' : 'Log Out All Other Devices'}
                </Button>
            </div>
        </div>
    );
};

export default DevicesTab;
