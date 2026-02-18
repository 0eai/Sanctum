// src/apps/settings/Settings.jsx
import React, { useState } from 'react';
import { ChevronLeft, Shield, Wallet, Grid, Database, CheckCircle, AlertCircle } from 'lucide-react';
import AccountTab from './components/AccountTab';
import FinanceTab from './components/FinanceTab';
import AppsTab from './components/AppsTab';
import DataTab from './components/DataTab';

const SettingsApp = ({ user, cryptoKey, onExit }) => {
  const [activeTab, setActiveTab] = useState('account');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Swipe State
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const MIN_SWIPE_DISTANCE = 50;

  const TABS = ['account', 'apps', 'finance', 'data'];

  // --- Swipe Logic ---
  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > MIN_SWIPE_DISTANCE;
    const isRightSwipe = distance < -MIN_SWIPE_DISTANCE;

    const currIdx = TABS.indexOf(activeTab);

    if (isLeftSwipe && currIdx < TABS.length - 1) {
      setActiveTab(TABS[currIdx + 1]);
    } else if (isRightSwipe && currIdx > 0) {
      setActiveTab(TABS[currIdx - 1]);
    }
  };

  const TabButton = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex-1 py-2 text-xs md:text-sm font-bold rounded-lg flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all ${activeTab === id ? 'bg-[#4285f4] text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
    >
      <Icon size={18} /> {label}
    </button>
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden relative">
      {/* Header */}
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={24} /></button>
            <h1 className="text-xl font-bold">Settings</h1>
          </div>
        </div>
      </header>

      <main
        className="flex-1 overflow-y-auto scroll-smooth p-4"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="max-w-xl mx-auto space-y-6 pb-20">

          {/* Notification Banner */}
          {message && (
            <div className={`p-4 rounded-xl text-sm flex items-center gap-3 shadow-sm animate-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              {message.text}
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex p-1 bg-white rounded-xl border border-gray-200 shadow-sm">
            <TabButton id="account" icon={Shield} label="Account" />
            <TabButton id="apps" icon={Grid} label="Apps" />
            <TabButton id="finance" icon={Wallet} label="Finance" />
            <TabButton id="data" icon={Database} label="Data" />
          </div>

          {/* Render Tab Content */}
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeTab === 'account' && (
              <AccountTab user={user} setLoading={setLoading} setMessage={setMessage} />
            )}

            {activeTab === 'apps' && (
              <AppsTab user={user} setLoading={setLoading} setMessage={setMessage} />
            )}

            {activeTab === 'finance' && (
              <FinanceTab user={user} cryptoKey={cryptoKey} setLoading={setLoading} setMessage={setMessage} />
            )}

            {activeTab === 'data' && (
              <DataTab user={user} cryptoKey={cryptoKey} setLoading={setLoading} setMessage={setMessage} />
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default SettingsApp;