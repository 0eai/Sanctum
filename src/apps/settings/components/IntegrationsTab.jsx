import React, { useState, useEffect } from 'react';
import { Network, Key, Eye, EyeOff, Save, Check, Loader2, Bot, Edit2, Cloud, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui';
import { fetchApiIntegrations, saveApiIntegration } from '../../../services/settings';
import { connectGoogleDrive, disconnectGoogleDrive, checkGoogleDriveConnection } from '../../../services/driveAuth';
import { DEFAULT_SYSTEM_INSTRUCTION } from '../../../services/gemini';
import PromptEditor from '../../../components/ui/PromptEditor';
import { functions } from '../../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

const IntegrationsTab = ({ user, cryptoKey }) => {
    const [geminiKey, setGeminiKey] = useState('');
    const [geminiPrompt, setGeminiPrompt] = useState('');
    const [showKey, setShowKey] = useState(false);

    // Save states for Key
    const [isSavingKey, setIsSavingKey] = useState(false);
    const [isKeySaved, setIsKeySaved] = useState(false);

    // Save states for Prompt
    const [isSavingPrompt, setIsSavingPrompt] = useState(false);
    const [isPromptSaved, setIsPromptSaved] = useState(false);
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);

    // Google Drive States
    const [isDriveConnected, setIsDriveConnected] = useState(false);
    const [isConnectingDrive, setIsConnectingDrive] = useState(false);
    const [isDisconnectingDrive, setIsDisconnectingDrive] = useState(false);

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadKeys = async () => {
            if (!user || !cryptoKey) return;
            const data = await fetchApiIntegrations(user.uid, cryptoKey);
            if (data.gemini) {
                setGeminiKey(data.gemini);
            }
            if (data.geminiPrompt) {
                setGeminiPrompt(data.geminiPrompt);
            }

            const driveStatus = await checkGoogleDriveConnection(user.uid);
            setIsDriveConnected(driveStatus);

            setIsLoading(false);
        };
        loadKeys();
    }, [user, cryptoKey]);

    const handleConnectDrive = async () => {
        setIsConnectingDrive(true);
        try {
            const getClientIdFn = httpsCallable(functions, 'getGoogleClientId');
            const result = await getClientIdFn();

            await connectGoogleDrive(user.uid, cryptoKey, result.data.clientId);
            setIsDriveConnected(true);
        } catch (error) {
            console.error("Failed to connect Google Drive", error);
            alert(error.message || "Failed to connect Google Drive.");
        }
        setIsConnectingDrive(false);
    };

    const handleDisconnectDrive = async () => {
        if (!window.confirm("Are you sure you want to disconnect Google Drive? Your encrypted offline token will be deleted.")) return;
        setIsDisconnectingDrive(true);
        try {
            await disconnectGoogleDrive(user.uid);
            setIsDriveConnected(false);
        } catch (error) {
            console.error("Failed to disconnect Google Drive", error);
        }
        setIsDisconnectingDrive(false);
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

    const handleSavePrompt = async (contentToSave = geminiPrompt) => {
        setIsSavingPrompt(true);
        try {
            await saveApiIntegration(user.uid, 'geminiPrompt', contentToSave, cryptoKey);
            setIsPromptSaved(true);
            setTimeout(() => setIsPromptSaved(false), 3000);
        } catch (error) {
            console.error("Failed to save prompt", error);
        }
        setIsSavingPrompt(false);
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
                {/* GOOGLE DRIVE SECTION */}
                <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg text-emerald-600">
                                <Cloud className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-gray-900">Google Drive Storage</h4>
                                    {isDriveConnected ? (
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
                                <p className="text-xs text-gray-500 mt-0.5">Offline access token for attaching files.</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            Sanctum requests an offline refresh token so you don't have to keep logging into Google Drive.
                            <br /><br />
                            <strong>Your connection token is end-to-end encrypted. Sanctum cannot access your Drive without your Master Key.</strong>
                        </p>

                        <div className="flex items-center gap-3 pt-2">
                            {!isDriveConnected ? (
                                <Button
                                    onClick={handleConnectDrive}
                                    disabled={isConnectingDrive}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                                >
                                    {isConnectingDrive ? <Loader2 size={16} className="animate-spin mr-2" /> : <Cloud size={16} className="mr-2" />}
                                    Connect Google Drive
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleDisconnectDrive}
                                    disabled={isDisconnectingDrive}
                                    variant="danger"
                                >
                                    {isDisconnectingDrive ? <Loader2 size={16} className="animate-spin mr-2" /> : <Trash2 size={16} className="mr-2" />}
                                    Disconnect
                                </Button>
                            )}
                        </div>
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

                {/* GEMINI PROMPT SECTION */}
                <div className="p-4 sm:p-5 bg-gray-50/50">
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Research Vault AI Prompt
                            </label>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Customize the prompt sent to Gemini when analyzing newly uploaded PDFs.
                                Note: You must instruct it to return JSON matching the expected structure.
                            </p>
                        </div>

                        <div className="pt-2">
                            <Button
                                onClick={() => setIsEditingPrompt(true)}
                                className="w-full justify-center bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 uppercase tracking-wide text-xs font-bold"
                            >
                                <Edit2 size={16} className="mr-2" /> Open in Prompt Editor
                            </Button>
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

            {isEditingPrompt && (
                <div className="fixed inset-0 z-[100]">
                    <PromptEditor
                        prompt={{ title: 'Research Vault AI Prompt', content: geminiPrompt, tags: ['system', 'ai'] }}
                        saveStatus={isSavingPrompt ? 'saving' : isPromptSaved ? 'saved' : ''}
                        onSave={(data) => {
                            setGeminiPrompt(data.content);
                            handleSavePrompt(data.content);
                        }}
                        onBack={() => setIsEditingPrompt(false)}
                    />
                </div>
            )}
        </div>
    );
};

export default IntegrationsTab;
