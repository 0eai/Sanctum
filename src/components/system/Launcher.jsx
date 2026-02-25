// src/components/system/Launcher.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, CheckSquare, Key, Bell, Sliders, Lock, Cloud, Cast, Bookmark,
  FileText, ClipboardList, CreditCard, PieChart, Globe, FileCode,
  Music, Video, MessageSquare, ShoppingBag, Briefcase, Layout,
  Users, BellRing, Share2, ShieldCheck, MessageCircle
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
    case 'MessageCircle': return <MessageCircle {...props} />;
    case 'ShoppingBag': return <ShoppingBag {...props} />;
    case 'Briefcase': return <Briefcase {...props} />;
    case 'Layout': return <Layout {...props} />;
    case 'FileCode': return <FileCode {...props} />;
    case 'Users': return <Users {...props} />;
    case 'BellRing': return <BellRing {...props} />;
    case 'ShieldCheck': return <ShieldCheck {...props} />;
    case 'transfer': return <Share2 {...props} />;
    case 'Globe':
    default: return <Globe {...props} />;
  }
};

const Launcher = ({ user, onLaunch, onLock, enabledApps }) => {
  const [stats, setStats] = useState({
    counters: 0, checklists: 0, tasks: 0, passwords: 0, banking: 0, finance: 0, reminders: 0, authenticator: 0
  });

  useEffect(() => {
    if (!user) return;
    const unsubscribe = listenToAppStats(user.uid, (colName, size) => {
      setStats(prev => ({ ...prev, [colName]: size }));
    });
    return () => unsubscribe();
  }, [user]);

  // 1. Define Standard System Apps
  const systemApps = useMemo(() => [
    { id: 'alerts', icon: <Bell size={24} />, label: 'DayPulse' },
    { id: 'tasks', icon: <ClipboardList size={24} />, label: 'Tasks', count: stats.tasks },
    { id: 'checklist', icon: <CheckSquare size={24} />, label: 'Checklists', count: stats.checklists },
    { id: 'reminders', icon: <BellRing size={24} />, label: 'Reminders', count: stats.reminders },
    { id: 'counter', icon: <TrendingUp size={24} />, label: 'Counters', count: stats.counters },
    { id: 'notes', icon: <FileText size={24} />, label: 'Notes' },
    { id: 'markdown', icon: <FileCode size={24} />, label: 'Markdown' },
    { id: 'contacts', icon: <Users size={24} />, label: 'Contacts' },
    { id: 'passwords', icon: <Key size={24} />, label: 'Passwords', count: stats.passwords },
    { id: 'authenticator', icon: <ShieldCheck size={24} />, label: 'Authenticator', count: stats.authenticator },
    { id: 'secureshare', icon: <MessageCircle size={24} />, label: 'Chat' },
    { id: 'banking', icon: <CreditCard size={24} />, label: 'Wallet', count: stats.banking },
    { id: 'finance', icon: <PieChart size={24} />, label: 'Finance', count: stats.finance },
    { id: 'bookmarks', icon: <Bookmark size={24} />, label: 'Bookmarks' },
    { id: 'transfer', icon: <Share2 size={24} />, label: 'Drop' },
    { id: 'streampi', icon: <Cast size={24} />, label: 'StreamPi', url: 'https://aks-streampi.web.app' },
    { id: 'drive', icon: <Cloud size={24} />, label: 'Cloud Drive', url: 'https://aks-cloud-drive.web.app' },
    { id: 'settings', icon: <Sliders size={24} />, label: 'Settings' },
    { id: 'vault', icon: <Lock size={24} className="text-yellow-400" />, label: 'Vault', locked: true },
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
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">My Apps</h1>
            <p className="text-gray-500 text-sm">Welcome back</p>
          </div>
          {onLock && (
            <button
              onClick={onLock}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors flex flex-col items-center"
              aria-label="Lock Workspace"
            >
              <Lock size={20} />
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto flex flex-col items-center">
        <div className="max-w-3xl p-6 flex flex-wrap justify-center content-start gap-4 sm:gap-5 lg:gap-6 mb-8 w-full">
          {finalApps.map(app => {
            const isPrimary = ['checklist', 'tasks', 'counter', 'passwords', 'alerts', 'streampi', 'drive', 'bookmarks', 'notes', 'markdown', 'contacts', 'reminders', 'settings', 'banking', 'finance', 'transfer', 'secureshare', 'authenticator'].includes(app.id);

            return (
              <button
                key={app.id}
                onClick={() => handleAppClick(app)}
                className={`w-[5.5rem] h-[5.5rem] sm:w-24 sm:h-24 md:w-[6.5rem] md:h-[6.5rem] rounded-3xl flex flex-col items-center justify-center gap-1 sm:gap-1.5 shadow-sm transition-transform active:scale-95 relative bg-[#4285f4] ${app.locked ? 'opacity-90' : 'hover:brightness-110'}`}
              >
                <div className={`p-2.5 sm:p-3 rounded-2xl ${isPrimary ? 'bg-white/20 text-white' : 'bg-white text-[#4285f4]'}`}>
                  {app.icon}
                </div>
                {app.count !== undefined && app.count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md border-2 border-white z-10 min-w-[20px] text-center">
                    {app.count > 999 ? '1000+' : app.count}
                  </span>
                )}
                <span className="text-[10px] sm:text-[11px] md:text-xs font-medium text-white px-2 truncate w-full text-center leading-tight">
                  {app.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="bg-white p-6 mt-auto border-t border-gray-100">
          <div className="max-w-3xl mx-auto text-center text-xs text-gray-300">
            Encrypted Workspace
          </div>
        </div>
      </main>
    </div>
  );
};

export default Launcher;