// src/apps/settings/components/SecurityTab.jsx
import React, { useState, useEffect } from 'react';
import {
    Activity, Clock, Lock, Shield, Eye, FileText, Key,
    CheckCircle, XCircle, AlertTriangle, Timer, Cpu, ChevronDown
} from 'lucide-react';
import { auth } from '../../../lib/firebase';
import { listenToActivityLog } from '../../../services/activityLog';
import { exportRecoveryKey } from '../services/settings';
import { Button } from '../../../components/ui/Button';

const AUTO_LOCK_OPTIONS = [
    { value: 5, label: '5 min' },
    { value: 15, label: '15 min' },
    { value: 60, label: '1 hour' },
    { value: 0, label: 'Never' },
];

// Map icon name strings to components
const ICON_MAP = {
    Lock, Shield, FileText, Key, AlertTriangle, Eye, CheckCircle, Cpu,
};

const formatTimeAgo = (date) => {
    if (!date) return '';
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

const formatDuration = (ms) => {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
};

const CollapsibleCard = ({ title, icon: Icon, children, defaultOpen = false, badge }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full p-4 flex items-center gap-2 font-bold text-gray-800 text-sm"
            >
                {Icon && <Icon size={18} className="text-[#4285f4]" />}
                {title}
                {badge && <span className="ml-1 text-xs font-normal text-gray-400">{badge}</span>}
                <ChevronDown size={16} className={`ml-auto text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            <div className={`transition-all duration-200 ease-in-out overflow-hidden ${open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="border-t border-gray-100">
                    {children}
                </div>
            </div>
        </div>
    );
};

const SecurityTab = ({ user, setMessage }) => {
    const [autoLock, setAutoLock] = useState(() => {
        const saved = localStorage.getItem('sanctum_autolock');
        return saved ? parseInt(saved) : 60;
    });
    const [lockOnHidden, setLockOnHidden] = useState(() => {
        return localStorage.getItem('sanctum_lock_on_hidden') === 'true';
    });
    const [sessionDuration, setSessionDuration] = useState(0);
    const [activityLog, setActivityLog] = useState([]);

    // Recovery Key State
    const [recoveryPasskey, setRecoveryPasskey] = useState('');
    const [recoveryKeyString, setRecoveryKeyString] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    // Session duration timer
    useEffect(() => {
        const lastSignIn = auth.currentUser?.metadata?.lastSignInTime;
        if (!lastSignIn) return;

        const updateDuration = () => {
            setSessionDuration(Date.now() - new Date(lastSignIn).getTime());
        };
        updateDuration();
        const interval = setInterval(updateDuration, 60000);
        return () => clearInterval(interval);
    }, []);

    // Real-time activity log listener
    useEffect(() => {
        if (!user?.uid) return;
        return listenToActivityLog(user.uid, setActivityLog);
    }, [user?.uid]);

    const handleAutoLockChange = (value) => {
        setAutoLock(value);
        localStorage.setItem('sanctum_autolock', value.toString());
        const label = AUTO_LOCK_OPTIONS.find(o => o.value === value)?.label;
        setMessage?.({ type: 'success', text: `Auto-lock set to ${label}.` });
    };

    const handleLockOnHiddenChange = () => {
        const newValue = !lockOnHidden;
        setLockOnHidden(newValue);
        localStorage.setItem('sanctum_lock_on_hidden', newValue.toString());
        setMessage?.({ type: 'success', text: `Lock when hidden is now ${newValue ? 'enabled' : 'disabled'}.` });
    };

    const dotColor = (type) => {
        switch (type) {
            case 'success': return 'bg-green-500';
            case 'danger': return 'bg-red-500';
            case 'info': return 'bg-blue-500';
            default: return 'bg-gray-400';
        }
    };

    const bgColor = (type) => {
        switch (type) {
            case 'success': return 'bg-green-50 text-green-600';
            case 'danger': return 'bg-red-50 text-red-600';
            case 'info': return 'bg-blue-50 text-blue-600';
            default: return 'bg-gray-50 text-gray-500';
        }
    };

    const handleExportRecoveryKey = async (e) => {
        e.preventDefault();
        setIsExporting(true);
        try {
            const keyStr = await exportRecoveryKey(user.uid, recoveryPasskey);
            setRecoveryKeyString(keyStr);
            setRecoveryPasskey('');
            setMessage?.({ type: 'success', text: 'Recovery key generated successfully. Keep it safe!' });
        } catch (error) {
            setMessage?.({ type: 'danger', text: error.message || 'Incorrect passkey.' });
        } finally {
            setIsExporting(false);
        }
    };

    const copyRecoveryKey = () => {
        if (recoveryKeyString) {
            navigator.clipboard.writeText(recoveryKeyString);
            setMessage?.({ type: 'success', text: 'Recovery key copied to clipboard.' });
        }
    };

    return (
        <div className="space-y-4">

            {/* Session Info Card — always visible */}
            <div className="bg-gradient-to-br from-[#4285f4] to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                <div className="flex items-center gap-2 text-blue-100 text-xs font-medium mb-3">
                    <Shield size={14} /> CURRENT SESSION
                </div>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-2xl font-bold">{formatDuration(sessionDuration)}</p>
                        <p className="text-blue-200 text-xs mt-1">Session duration</p>
                    </div>
                    <div className="text-right">
                        <div className="flex items-center gap-1.5 text-green-300 text-sm font-semibold">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            Active
                        </div>
                        <p className="text-blue-200 text-xs mt-1">{user?.email}</p>
                    </div>
                </div>
            </div>

            {/* Auto-Lock Timer — always visible */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
                    <Timer size={18} className="text-[#4285f4]" />
                    Auto-Lock Timer
                </div>
                <div className="p-4">
                    <p className="text-xs text-gray-500 mb-3">
                        Automatically lock the vault after a period of inactivity.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {AUTO_LOCK_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => handleAutoLockChange(opt.value)}
                                className={`min-h-[48px] rounded-xl border-2 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${autoLock === opt.value
                                    ? 'bg-[#4285f4] text-white border-[#4285f4] shadow-md'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#4285f4] hover:text-[#4285f4]'
                                    }`}
                            >
                                <Clock size={14} />
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Lock when Tab Hidden — collapsed by default */}
            <CollapsibleCard title="Lock when Tab Hidden" icon={Eye}>
                <div className="p-4 flex items-center justify-between">
                    <p className="text-xs text-gray-500 flex-1 mr-4">
                        Instantly locks the vault if you switch tabs, minimize the browser, or open an extension popup.
                    </p>
                    <button
                        onClick={handleLockOnHiddenChange}
                        className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${lockOnHidden ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${lockOnHidden ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </CollapsibleCard>

            {/* Export Recovery Key */}
            <CollapsibleCard title="Export Recovery Key" icon={Key}>
                <div className="p-4">
                    <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-xs mb-4 flex gap-2 items-start border border-yellow-200">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <p>
                            Your recovery key allows exactly ONE complete bypass of your passkey to restore access to your vault if forgotten. <strong>Store this string securely!</strong> Anyone with this string can read your data.
                        </p>
                    </div>

                    {!recoveryKeyString ? (
                        <form onSubmit={handleExportRecoveryKey} className="flex flex-col gap-3">
                            <input
                                type="password"
                                value={recoveryPasskey}
                                onChange={(e) => setRecoveryPasskey(e.target.value)}
                                placeholder="Enter current passkey to decrypt..."
                                className="w-full p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[#4285f4] focus:border-transparent transition-all"
                                required
                            />
                            <Button type="submit" disabled={isExporting} className="w-full">
                                {isExporting ? 'Decrypting...' : 'Generate Recovery Key'}
                            </Button>
                        </form>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Your Master Recovery Key</label>
                            <textarea
                                readOnly
                                value={recoveryKeyString}
                                className="w-full h-32 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono text-gray-700 outline-none resize-none break-all"
                                onClick={(e) => e.target.select()}
                            />
                            <div className="flex gap-2">
                                <Button onClick={copyRecoveryKey} className="flex-1 flex items-center justify-center gap-2">
                                    <FileText size={16} /> Copy to Clipboard
                                </Button>
                                <Button variant="secondary" onClick={() => setRecoveryKeyString(null)}>
                                    Done
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </CollapsibleCard>

            {/* Activity Log — collapsed by default */}
            <CollapsibleCard title="Recent Activity" icon={Activity} badge={`${activityLog.length} events`}>
                {activityLog.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">
                        <Activity size={32} className="mx-auto mb-2 text-gray-200" />
                        No activity recorded yet.
                        <br />
                        <span className="text-xs">Actions like vault unlocks and passkey attempts will appear here.</span>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                        {activityLog.map(item => {
                            const Icon = ICON_MAP[item.icon] || CheckCircle;
                            const time = item.createdAt?.toDate?.();
                            return (
                                <div
                                    key={item.id}
                                    className="p-4 flex items-center gap-3 min-h-[56px]"
                                >
                                    {/* Color dot */}
                                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                        <div className={`w-2.5 h-2.5 rounded-full ${dotColor(item.type)}`} />
                                    </div>

                                    {/* Icon */}
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${bgColor(item.type)}`}>
                                        <Icon size={16} />
                                    </div>

                                    {/* Text */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{item.action}</p>
                                        <p className="text-[11px] text-gray-400">{time ? formatTimeAgo(time) : 'Just now'}</p>
                                    </div>

                                    {/* Status badge */}
                                    {item.type === 'danger' && (
                                        <XCircle size={16} className="text-red-400 flex-shrink-0" />
                                    )}
                                    {item.type === 'success' && (
                                        <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CollapsibleCard>

        </div>
    );
};

export default SecurityTab;
