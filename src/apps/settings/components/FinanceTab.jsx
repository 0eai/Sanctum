// src/apps/settings/FinanceTab.jsx
import React, { useState, useEffect } from 'react';
import { Globe, List, Save, Check } from 'lucide-react';
import { Button } from '../../../components/ui';
import { fetchFinanceSettings, saveFinanceSettings } from '../../../services/settings';
import { DEFAULT_CURRENCIES, DEFAULT_CATEGORIES } from '../constants';

const FinanceTab = ({ user, cryptoKey, setLoading, setMessage }) => {
    const [settings, setSettings] = useState({
        activeCurrencies: ['KRW'],
        categories: DEFAULT_CATEGORIES
    });
    const [initLoading, setInitLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const data = await fetchFinanceSettings(user.uid, cryptoKey);
            if (data) setSettings(data);
            setInitLoading(false);
        };
        load();
    }, [user, cryptoKey]);

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await saveFinanceSettings(user.uid, settings, cryptoKey);
            setMessage({ type: 'success', text: "Finance settings saved!" });
        } catch (err) {
            setMessage({ type: 'error', text: "Save failed." });
        } finally {
            setLoading(false);
        }
    };

    const toggleCurrency = (code) => {
        setSettings(prev => {
            const isActive = prev.activeCurrencies.includes(code);
            let newActive = isActive
                ? prev.activeCurrencies.filter(c => c !== code)
                : [...prev.activeCurrencies, code];

            if (newActive.length === 0) newActive = ['KRW'];
            return { ...prev, activeCurrencies: newActive };
        });
    };

    const handleCategoryChange = (type, strValue) => {
        const arr = strValue.split(',').map(s => s.trim()).filter(s => s !== "");
        setSettings(prev => ({
            ...prev,
            categories: { ...prev.categories, [type]: arr }
        }));
    };

    if (initLoading) return <div className="p-4 text-center text-gray-400">Loading settings...</div>;

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {/* Currencies */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex gap-2 items-center">
                    <Globe size={18} className="text-[#4285f4]" />
                    <h2 className="font-bold text-gray-800">Currencies</h2>
                </div>
                <div className="p-4 grid grid-cols-2 gap-2">
                    {DEFAULT_CURRENCIES.map(curr => (
                        <button key={curr.code} type="button" onClick={() => toggleCurrency(curr.code)} className={`p-3 rounded-lg border text-sm font-bold flex justify-between items-center ${settings.activeCurrencies.includes(curr.code) ? 'bg-blue-50 border-[#4285f4] text-[#4285f4]' : 'bg-white border-gray-200 text-gray-600'}`}>
                            <span>{curr.code} <span className="text-xs font-normal opacity-70 ml-1">({curr.name})</span></span>
                            {settings.activeCurrencies.includes(curr.code) && <Check size={14} />}
                        </button>
                    ))}
                </div>
            </div>

            {/* Categories */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex gap-2 items-center">
                    <List size={18} className="text-[#4285f4]" />
                    <h2 className="font-bold text-gray-800">Categories (Comma separated)</h2>
                </div>
                <div className="p-4 space-y-4">
                    {Object.keys(DEFAULT_CATEGORIES).map(type => (
                        <div key={type}>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">{type}</label>
                            <textarea
                                className="w-full p-2 text-sm border border-gray-200 rounded-lg h-16 resize-none focus:ring-2 focus:ring-[#4285f4] outline-none"
                                value={settings.categories[type]?.join(', ') || ''}
                                onChange={(e) => handleCategoryChange(type, e.target.value)}
                            />
                        </div>
                    ))}
                </div>
            </div>
            <Button type="submit" className="w-full"><Save size={18} /> Save Settings</Button>
        </form>
    );
};

export default FinanceTab;