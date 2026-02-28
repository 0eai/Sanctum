// src/apps/settings/Settings.jsx
import React, { useState } from 'react';
import { ChevronLeft, Shield, Grid, Monitor, Activity, Wallet, Database, CheckCircle, AlertCircle, Network } from 'lucide-react';
import AccountTab from './components/AccountTab';
import FinanceTab from './components/FinanceTab';
import AppsTab from './components/AppsTab';
import DataTab from './components/DataTab';
import DevicesTab from './components/DevicesTab';
import SecurityTab from './components/SecurityTab';
import IntegrationsTab from './components/IntegrationsTab';

const TABS = [
  { id: 'account', label: 'Account', icon: Shield },
  { id: 'apps', label: 'Apps', icon: Grid },
  { id: 'integrations', label: 'Integrations', icon: Network },
  { id: 'devices', label: 'Devices', icon: Monitor },
  { id: 'security', label: 'Security', icon: Activity },
  { id: 'finance', label: 'Finance', icon: Wallet },
  { id: 'data', label: 'Data', icon: Database },
];

const SettingsApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const validTabIds = TABS.map(t => t.id);
  const initialTab = (route?.resource && validTabIds.includes(route.resource)) ? route.resource : 'account';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (navigate) navigate(`#settings/${tabId}`);
  };
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Swipe State
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const MIN_SWIPE_DISTANCE = 50;

  const TAB_IDS = TABS.map(t => t.id);

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
    const currIdx = TAB_IDS.indexOf(activeTab);

    if (isLeftSwipe && currIdx < TAB_IDS.length - 1) {
      setActiveTab(TAB_IDS[currIdx + 1]);
    } else if (isRightSwipe && currIdx > 0) {
      setActiveTab(TAB_IDS[currIdx - 1]);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden relative">

      {/* Header with Wallet-style tabs */}
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
        <div className="max-w-xl md:max-w-4xl mx-auto px-4 pt-4 pb-0 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <button onClick={onExit} className="p-2 hover:bg-white/20 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-xl font-bold">Settings</h1>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0 mt-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap flex-1 justify-center min-h-[44px] ${activeTab === tab.id
                  ? 'bg-gray-50 text-[#4285f4]'
                  : 'text-blue-100 hover:bg-white/10'
                  }`}
              >
                <tab.icon size={16} fill={activeTab === tab.id ? "currentColor" : "none"} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
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
            <div className={`p-4 rounded-xl text-sm flex items-center gap-3 shadow-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              {message.text}
            </div>
          )}

          {/* Render Tab Content */}
          <div>
            {activeTab === 'account' && (
              <AccountTab user={user} setLoading={setLoading} setMessage={setMessage} />
            )}
            {activeTab === 'apps' && (
              <AppsTab user={user} setLoading={setLoading} setMessage={setMessage} />
            )}
            {activeTab === 'integrations' && (
              <IntegrationsTab user={user} cryptoKey={cryptoKey} />
            )}
            {activeTab === 'devices' && (
              <DevicesTab user={user} setMessage={setMessage} />
            )}
            {activeTab === 'security' && (
              <SecurityTab user={user} setMessage={setMessage} />
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