// src/components/system/Launcher.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, CheckSquare, Key, Bell, Sliders, Lock, Cloud, Cast, Bookmark,
  FileText, ClipboardList, CreditCard, PieChart, Globe, FileCode,
  Music, Video, MessageSquare, ShoppingBag, Briefcase, Layout,
  Users, BellRing // <--- Added new icons
} from 'lucide-react';
import { listenToAppStats } from '../../services/firestoredb'; 

// --- Icon Mapping Helper ---
const getIconElement = (iconName) => {
    const props = { size: 32 };
    switch (iconName) {
        case 'Cloud': return <Cloud {...props} />;
        case 'Cast': return <Cast {...props} />;
        case 'Music': return <Music {...props} />;
        case 'Video': return <Video {...props} />;
        case 'MessageSquare': return <MessageSquare {...props} />;
        case 'ShoppingBag': return <ShoppingBag {...props} />;
        case 'Briefcase': return <Briefcase {...props} />;
        case 'Layout': return <Layout {...props} />;
        case 'FileCode': return <FileCode {...props} />;
        case 'Users': return <Users {...props} />; // <--- Added Contacts Icon
        case 'BellRing': return <BellRing {...props} />; // <--- Added Reminders Icon
        case 'Globe': 
        default: return <Globe {...props} />;
    }
};

const Launcher = ({ user, onLaunch, enabledApps }) => {
  const [stats, setStats] = useState({ 
    counters: 0, checklists: 0, tasks: 0, passwords: 0, banking: 0, finance: 0 
  });

  useEffect(() => {
    if(!user) return;
    const unsubscribe = listenToAppStats(user.uid, (colName, size) => {
        setStats(prev => ({ ...prev, [colName]: size }));
    });
    return () => unsubscribe();
  }, [user]);

  // 1. Define Standard System Apps
  const systemApps = useMemo(() => [
    { id: 'alerts', icon: <Bell size={32} />, label: 'DayPulse' }, 
    { id: 'tasks', icon: <ClipboardList size={32} />, label: 'Tasks', count: stats.tasks },
    { id: 'checklist', icon: <CheckSquare size={32} />, label: 'Checklists', count: stats.checklists },
    { id: 'reminders', icon: <BellRing size={32} />, label: 'Reminders' }, // <--- Added Reminders
    { id: 'counter', icon: <TrendingUp size={32} />, label: 'Counters', count: stats.counters },
    { id: 'notes', icon: <FileText size={32} />, label: 'Notes' }, 
    { id: 'markdown', icon: <FileCode size={32} />, label: 'Markdown' },
    { id: 'contacts', icon: <Users size={32} />, label: 'Contacts' }, // <--- Added Contacts
    { id: 'passwords', icon: <Key size={32} />, label: 'Passwords', count: stats.passwords },
    { id: 'banking', icon: <CreditCard size={32} />, label: 'Wallet', count: stats.banking }, 
    { id: 'finance', icon: <PieChart size={32} />, label: 'Finance', count: stats.finance }, 
    { id: 'bookmarks', icon: <Bookmark size={32} />, label: 'Bookmarks' },
    { id: 'streampi', icon: <Cast size={32} />, label: 'StreamPi', url: 'https://aks-streampi.web.app' },
    { id: 'drive', icon: <Cloud size={32} />, label: 'Cloud Drive', url: 'https://aks-cloud-drive.web.app' },
    { id: 'settings', icon: <Sliders size={32} />, label: 'Settings' }, 
    { id: 'vault', icon: <Lock size={32} className="text-yellow-400" />, label: 'Vault', locked: true },
  ], [stats]);

  // 2. Merge & Sort Logic
  const finalApps = useMemo(() => {
      let computedList = [];

      if (!enabledApps) {
          computedList = [...systemApps];
      } else {
          const { customAppList, selectedApps } = enabledApps;
          
          if (!customAppList) {
              const ids = Array.isArray(enabledApps) ? enabledApps : (selectedApps || []);
              computedList = systemApps.filter(app => ids.includes(app.id) || ['vault', 'settings'].includes(app.id));
          } else {
              computedList = customAppList
                  .filter(savedApp => ['vault', 'settings'].includes(savedApp.id) || selectedApps.includes(savedApp.id))
                  .map(savedApp => {
                      const systemApp = systemApps.find(a => a.id === savedApp.id);
                      if (systemApp) return systemApp; 
                      
                      return {
                          ...savedApp,
                          label: savedApp.name,
                          icon: getIconElement(savedApp.icon),
                          locked: false
                      };
                  });
          }
      }

      const settingsApp = systemApps.find(a => a.id === 'settings');
      const listWithoutSettings = computedList.filter(app => app.id !== 'settings');

      return settingsApp ? [...listWithoutSettings, settingsApp] : listWithoutSettings;

  }, [enabledApps, systemApps]);

  const handleAppClick = (app) => {
    if (app.locked) return;
    if (app.url) {
        window.open(app.url, '_blank');
    } else {
        onLaunch(app.id);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-white">
      <header className="bg-white pt-6 pb-2 shadow-sm z-10">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-2xl font-bold text-gray-800">My Apps</h1>
          <p className="text-gray-500 text-sm">Welcome back</p>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 grid grid-cols-2 md:grid-cols-3 gap-8">
          {finalApps.map(app => {
            // Updated to include 'reminders' and 'contacts' in the primary blue-background list
            const isPrimary = ['checklist', 'tasks', 'counter', 'passwords', 'alerts', 'streampi', 'drive', 'bookmarks', 'notes', 'markdown', 'contacts', 'reminders', 'settings', 'banking', 'finance'].includes(app.id);
            
            return (
              <button key={app.id} onClick={() => handleAppClick(app)} className={`aspect-square rounded-3xl flex flex-col items-center justify-center gap-3 shadow-lg transition-transform active:scale-95 relative bg-[#4285f4] ${app.locked ? 'opacity-90' : 'hover:brightness-110'}`}>
                <div className={`p-4 rounded-2xl ${isPrimary ? 'bg-white/20 text-white' : 'bg-white text-[#4285f4]'}`}>
                    {app.icon}
                </div>
                {app.count !== undefined && <span className="absolute top-4 right-4 bg-white text-[#4285f4] text-xs font-bold px-2 py-0.5 rounded-full">{app.count > 9 ? '10+' : app.count}</span>}
                <span className="text-sm font-medium text-white px-2 truncate w-full text-center">{app.label}</span>
              </button>
            );
          })}
        </div>
      </main>
      <div className="bg-white p-6 mt-auto border-t border-gray-100">
        <div className="max-w-3xl mx-auto text-center text-xs text-gray-300">
          Encrypted Workspace
        </div>
      </div>
    </div>
  );
};

export default Launcher;