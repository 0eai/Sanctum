// src/apps/settings/components/SecurityTab.jsx
import React, { useState, useEffect } from 'react';
import {
    Activity, Clock, Lock, Shield, Eye, FileText, Key,
    CheckCircle, XCircle, AlertTriangle, Timer, Cpu
} from 'lucide-react';
import { auth } from '../../../lib/firebase';
import { listenToActivityLog } from '../../../services/activityLog';

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

const SecurityTab = ({ user, setMessage }) => {
    const [autoLock, setAutoLock] = useState(() => {
        const saved = localStorage.getItem('sanctum_autolock');
        return saved ? parseInt(saved) : 60;
    });
    const [sessionDuration, setSessionDuration] = useState(0);
    const [activityLog, setActivityLog] = useState([]);

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

    return (
        <div className="space-y-6">

            {/* Session Info Card */}
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

            {/* Auto-Lock Timer */}
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

            {/* Activity Log */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
                    <Activity size={18} className="text-[#4285f4]" />
                    Recent Activity
                    <span className="ml-auto text-xs font-normal text-gray-400">{activityLog.length} events</span>
                </div>

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
            </div>

        </div>
    );
};

export default SecurityTab;
