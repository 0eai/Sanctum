// src/apps/settings/components/IntegrationsTab.jsx
import React, { useState, useEffect } from 'react';
import { Network, Key, Eye, EyeOff, Save, Check, Loader2, Bot, Edit2, Cloud, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui';
import { fetchApiIntegrations, saveApiIntegration } from '../services/settings';
import { DEFAULT_SYSTEM_INSTRUCTION } from '../../../services/gemini';
import PromptEditor from '../../../components/ui/PromptEditor';
import { functions } from '../../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { CalendarDays, AlertTriangle, CheckCircle, Plus, Globe, X } from 'lucide-react';
import { initializeGoogleClient, createTokenClient, checkStoredToken, disconnectGoogleCalendar } from '../../alerts/services/alerts';
import { fetchAppPreferences, saveAppPreferences } from '../services/settings';

const IntegrationsTab = ({ user, cryptoKey }) => {
    const [geminiKey, setGeminiKey] = useState('');
    const [showKey, setShowKey] = useState(false);

    // Save states for Key
    const [isSavingKey, setIsSavingKey] = useState(false);
    const [isKeySaved, setIsKeySaved] = useState(false);

    const [isLoading, setIsLoading] = useState(true);

    // Google Calendar States
    const [tokenClient, setTokenClient] = useState(null);
    const [gapiInited, setGapiInited] = useState(false);
    const [gcalSignedIn, setGcalSignedIn] = useState(false);
    const [gcalError, setGcalError] = useState(null);
    const [calendarIds, setCalendarIds] = useState([]);

    useEffect(() => {
        const loadKeys = async () => {
            if (!user || !cryptoKey) return;
            const data = await fetchApiIntegrations(user.uid, cryptoKey);
            if (data.gemini) {
                setGeminiKey(data.gemini);
            }

            const prefs = await fetchAppPreferences(user.uid) || {};
            setCalendarIds(prefs.calendarIds || []);

            setIsLoading(false);
        };
        loadKeys();
    }, [user, cryptoKey]);

    // Google Calendar Init
    useEffect(() => {
        initializeGoogleClient(
            (type) => {
                if (type === 'gapi') setGapiInited(true);
                else setTokenClient(createTokenClient(user?.uid, cryptoKey, () => setGcalSignedIn(true)));
            },
            (err) => setGcalError(err)
        );
    }, [user, cryptoKey]);

    useEffect(() => {
        if (gapiInited && user && cryptoKey) {
            checkStoredToken(user.uid, cryptoKey, () => setGcalSignedIn(true), (err) => setGcalError(err));
        }
    }, [gapiInited, user, cryptoKey]);

    const handleConnectCalendar = () => { if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' }); };

    const handleDisconnectCalendar = async () => {
        setGcalSignedIn(false);
        await disconnectGoogleCalendar(user.uid);
    };

    const handleAddCalendar = async (e) => {
        e.preventDefault();
        let calId = e.target.calUrl.value.trim();
        if (!calId) return;
        if (calId.includes('src=')) calId = decodeURIComponent(calId.match(/src=([^&]+)/)[1]);
        if (!calendarIds.includes(calId)) {
            const newIds = [...calendarIds, calId];
            setCalendarIds(newIds);
            await saveAppPreferences(user.uid, { calendarIds: newIds });
        }
        e.target.reset();
    };

    const handleRemoveCalendar = async (id) => {
        const newIds = calendarIds.filter(c => c !== id);
        setCalendarIds(newIds);
        await saveAppPreferences(user.uid, { calendarIds: newIds });
    };

    const handleSaveKey = async () => {
        setIsSavingKey(true);
        try {
            await saveApiIntegration(user.uid, 'gemini', geminiKey, cryptoKey);
            setIsKeySaved(true);
            setTimeout(() => setIsKeySaved(false), 3000);
        } catch (error) {
            console.error("Failed to save API key", error);
        }
        setIsSavingKey(false);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                    <Network className="text-blue-500" size={20} />
                    Service Integrations
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                    Manage API keys and AI configurations for external services securely.
                    Keys are encrypted with your master key and never leave your device unencrypted.
                </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col divide-y divide-gray-100">

                {/* GOOGLE CALENDAR SECTION */}
                <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-orange-100 to-red-100 rounded-lg text-orange-600">
                                <CalendarDays className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-gray-900">Google Calendar</h4>
                                    {gcalSignedIn ? (
                                        <span className="flex items-center gap-1 text-[10px] font-medium bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                            Connected
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                            Not Connected
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">Integrates with DayPulse alerts app.</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {gcalError && (
                            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                                <AlertTriangle size={14} /> {gcalError}
                            </div>
                        )}

                        {!gcalSignedIn ? (
                            <div className="flex flex-col gap-2 pt-2">
                                <Button onClick={handleConnectCalendar} className="bg-orange-600 hover:bg-orange-700 text-white w-max border-0">
                                    Connect Google Calendar
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                                    <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                        <CheckCircle size={16} className="text-emerald-500" /> Connection Active
                                    </span>
                                    <Button onClick={handleDisconnectCalendar} variant="danger" className="text-xs py-1.5">Disconnect</Button>
                                </div>

                                <div className="border-t border-gray-200 pt-4 mt-2">
                                    <p className="text-sm font-medium text-gray-800 mb-3">Sync Additional Calendars</p>
                                    <form onSubmit={handleAddCalendar} className="flex gap-2 mb-3">
                                        <input
                                            name="calUrl"
                                            placeholder="Calendar ID or Embed URL"
                                            className="block w-full px-3 py-2 sm:text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white outline-none border"
                                        />
                                        <Button type="submit" className="bg-orange-600 w-10 p-0 flex items-center justify-center flex-shrink-0"><Plus size={16} /></Button>
                                    </form>
                                    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                                        {calendarIds.map(id => (
                                            <div key={id} className="flex items-center justify-between bg-gray-50 p-2.5 rounded-lg border border-gray-200 text-xs text-gray-700">
                                                <span className="truncate flex-1 pr-2 flex items-center"><Globe size={14} className="mr-2 text-gray-400" /> {id}</span>
                                                <button onClick={() => handleRemoveCalendar(id)} className="text-gray-400 hover:text-red-500 p-1"><X size={14} /></button>
                                            </div>
                                        ))}
                                        {calendarIds.length === 0 && (
                                            <p className="text-xs text-gray-500 italic">No additional public calendars added.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* GEMINI KEY SECTION */}
                <div className="p-4 sm:p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg text-purple-600">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="font-medium text-gray-900">Google Gemini API</h4>
                            <p className="text-xs text-gray-500">Required for Research Vault AI summarization and extraction.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">
                            API Key
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                <Key size={16} />
                            </div>
                            <input
                                type={showKey ? 'text' : 'password'}
                                value={geminiKey}
                                onChange={(e) => setGeminiKey(e.target.value)}
                                placeholder="AIzaSy..."
                                className="block w-full pl-10 pr-10 py-2.5 sm:text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-colors bg-gray-50 outline-none border"
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                            >
                                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        <div className="pt-2 flex justify-end">
                            <Button
                                onClick={handleSaveKey}
                                disabled={isSavingKey}
                                className={isKeySaved ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                            >
                                {isSavingKey ? <Loader2 size={16} className="animate-spin mr-2" /> : isKeySaved ? <Check size={16} className="mr-2" /> : <Save size={16} className="mr-2" />}
                                {isKeySaved ? "Saved" : "Save Key"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* AI PROMPTS DIRECTORY NOTE */}
                <div className="p-4 sm:p-5 bg-gray-50/50">
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Research Vault AI Prompts
                            </label>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Prompts are now managed securely inside the <span className="font-semibold text-[#4285f4]">AI Prompts</span> folder in your Notes app.
                                You can create, edit, and organize multiple prompts there and select them when analyzing a PDF.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl flex items-start gap-3 text-blue-800 text-sm">
                <Network className="shrink-0 mt-0.5" size={16} />
                <p>
                    <strong>Security Note:</strong> These configurations are locked on your device. They are sent directly to the respective API endpoints from your browser and are never readable by Sanctum's servers.
                </p>
            </div>

        </div>
    );
};

export default IntegrationsTab;
