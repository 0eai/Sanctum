// src/apps/settings/Settings.jsx
import React, { useState } from 'react';
import { Shield, Grid, Monitor, Activity, Wallet, Database, CheckCircle, AlertCircle, Network } from 'lucide-react';
import StandardAppLayout from '../../components/ui/StandardAppLayout';
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

  return (
    <StandardAppLayout
      headerConfig={{
        onBack: onExit,
        title: 'Settings',
        nav: {
          type: 'tabs',
          data: TABS,
          activeId: activeTab,
          onSelect: (tabId) => handleTabChange(tabId),
        },
      }}
    >
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
          <DevicesTab user={user} cryptoKey={cryptoKey} setMessage={setMessage} />
        )}
        {activeTab === 'security' && (
          <SecurityTab user={user} cryptoKey={cryptoKey} setMessage={setMessage} />
        )}
        {activeTab === 'finance' && (
          <FinanceTab user={user} cryptoKey={cryptoKey} setLoading={setLoading} setMessage={setMessage} />
        )}
        {activeTab === 'data' && (
          <DataTab user={user} cryptoKey={cryptoKey} setLoading={setLoading} setMessage={setMessage} />
        )}
      </div>
    </StandardAppLayout>
  );
};

export default SettingsApp;