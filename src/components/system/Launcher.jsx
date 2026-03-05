// src/components/system/Launcher.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, CheckSquare, Key, Bell, Sliders, Lock, Cloud, Cast, Bookmark,
  FileText, ClipboardList, CreditCard, PieChart, Globe, FileCode,
  Music, Video, MessageSquare, ShoppingBag, Briefcase, Layout,
  Users, BellRing, Share2, ShieldCheck, MessageCircle, GraduationCap,
  X
} from 'lucide-react';
import { listenToAppStats } from '../../services/firestoredb';
import { listenToAllUnreadMessages } from '../../apps/secureshare/services/secureshare';

// --- Icon Mapping Helper ---
const getIconElement = (iconName, size = 32) => {
  const props = { size };
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
    case 'GraduationCap': return <GraduationCap {...props} />;
    case 'Globe':
    default: return <Globe {...props} />;
  }
};

const AppIcon = ({ app, size = "large", onClick, isPrimary }) => {
  const isLarge = size === "large";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`${isLarge ? 'w-20 h-20 sm:w-24 sm:h-24' : 'w-full h-full p-1.5'} rounded-[22%] flex flex-col items-center justify-center gap-1.5 shadow-sm transition-transform active:scale-95 relative bg-[#4285f4] ${app.locked ? 'opacity-90' : 'hover:brightness-110'}`}
    >
      <div className={`${isLarge ? 'p-2.5 sm:p-3 rounded-2xl' : 'p-0'} ${isPrimary ? 'bg-white/20 text-white' : 'bg-white text-[#4285f4]'}`}>
        {isLarge ? app.icon : React.cloneElement(app.icon, { size: 14 })}
      </div>
      {isLarge && app.count !== undefined && app.count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md border-2 border-white z-10 min-w-[20px] text-center">
          {app.count > 999 ? '1000+' : app.count}
        </span>
      )}
      {isLarge && (
        <span className="text-[10px] sm:text-[11px] font-medium text-white px-1 truncate w-full text-center leading-tight">
          {app.label}
        </span>
      )}
    </button>
  );
};

const FolderIcon = ({ title, apps, onClick }) => {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className="w-20 h-20 sm:w-24 sm:h-24 bg-white/40 backdrop-blur-md rounded-[22%] p-2.5 grid grid-cols-2 grid-rows-2 gap-1.5 shadow-sm active:scale-95 transition-transform border border-white/20"
      >
        {apps.slice(0, 4).map(app => (
          <div key={app.id} className="bg-[#4285f4] rounded-[22%] flex items-center justify-center text-white p-1">
            {React.cloneElement(app.icon, { size: 16 })}
          </div>
        ))}
        {apps.length < 4 && Array.from({ length: 4 - apps.length }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-white/10 rounded-[22%]" />
        ))}
      </button>
      <span className="text-[11px] sm:text-xs font-semibold text-gray-700">{title}</span>
    </div>
  );
};

const Launcher = ({ user, onLaunch, onLock, enabledApps }) => {
  const [stats, setStats] = useState({
    counters: 0, checklists: 0, tasks: 0, passwords: 0, banking: 0, finance: 0, reminders: 0, authenticator: 0, unreadChats: 0
  });
  const [openFolder, setOpenFolder] = useState(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribeStats = listenToAppStats(user.uid, (colName, size) => {
      setStats(prev => ({ ...prev, [colName]: size }));
    });

    const unsubscribeUnread = listenToAllUnreadMessages(user.uid, (count) => {
      setStats(prev => ({ ...prev, unreadChats: count }));
    });

    return () => {
      unsubscribeStats();
      unsubscribeUnread();
    };
  }, [user]);

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
    { id: 'secureshare', icon: <MessageCircle size={24} />, label: 'Chat', count: stats.unreadChats },
    { id: 'banking', icon: <CreditCard size={24} />, label: 'Wallet', count: stats.banking },
    { id: 'finance', icon: <PieChart size={24} />, label: 'Finance', count: stats.finance },
    { id: 'research', icon: <GraduationCap size={24} />, label: 'Research' },
    { id: 'bookmarks', icon: <Bookmark size={24} />, label: 'Bookmarks' },
    { id: 'settings', icon: <Sliders size={24} />, label: 'Settings' },
  ], [stats]);

  const finalApps = useMemo(() => {
    let computedList = [];
    if (!enabledApps) {
      computedList = [...systemApps];
    } else {
      const { customAppList, selectedApps } = enabledApps;
      if (!customAppList) {
        const ids = Array.isArray(enabledApps) ? enabledApps : (selectedApps || []);
        computedList = systemApps.filter(app => ids.includes(app.id) || ['settings'].includes(app.id));
      } else {
        computedList = customAppList
          .filter(savedApp => ['settings'].includes(savedApp.id) || selectedApps.includes(savedApp.id))
          .map(savedApp => {
            const systemApp = systemApps.find(a => a.id === savedApp.id);
            if (systemApp) return systemApp;
            return {
              ...savedApp,
              label: savedApp.name,
              icon: getIconElement(savedApp.icon, 24),
              locked: false
            };
          });
      }
    }
    const settingsApp = systemApps.find(a => a.id === 'settings');
    const listWithoutSettings = computedList.filter(app => app.id !== 'settings');
    return settingsApp ? [...listWithoutSettings, settingsApp] : listWithoutSettings;
  }, [enabledApps, systemApps]);

  const categories = {
    'Productivity': ['notes', 'tasks', 'checklist', 'markdown', 'research', 'reminders'],
    'Finance': ['banking', 'finance'],
    'Communication': ['secureshare', 'contacts', 'alerts'],
    'Tools': ['passwords', 'authenticator', 'bookmarks', 'counter', 'settings']
  };

  const handleAppClick = (app) => {
    if (app.locked) return;
    setOpenFolder(null);
    if (app.url) {
      window.open(app.url, '_blank');
    } else {
      onLaunch(app.id);
    }
  };

  const isPrimary = (id) => ['checklist', 'tasks', 'counter', 'passwords', 'alerts', 'bookmarks', 'notes', 'markdown', 'contacts', 'reminders', 'settings', 'banking', 'finance', 'secureshare', 'authenticator', 'research'].includes(id);

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden">
      <header className="bg-white/80 backdrop-blur-lg pt-8 pb-4 px-6 border-b border-gray-200">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Launcher</h1>
            <p className="text-gray-500 font-medium">Safe Space</p>
          </div>
          {onLock && (
            <button onClick={onLock} className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors shadow-sm">
              <Lock size={22} />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-6 justify-items-center">
          {Object.entries(categories).map(([name, ids]) => {
            const folderApps = finalApps.filter(a => ids.includes(a.id));
            if (folderApps.length === 0) return null;
            return (
              <FolderIcon
                key={name}
                title={name}
                apps={folderApps}
                onClick={() => setOpenFolder({ name, apps: folderApps })}
              />
            );
          })}

          {/* Uncategorized / Extra Apps */}
          {finalApps.filter(app => !Object.values(categories).flat().includes(app.id)).map(app => (
            <AppIcon key={app.id} app={app} onClick={() => handleAppClick(app)} isPrimary={isPrimary(app.id)} />
          ))}
        </div>
      </main>

      {/* iOS Folder Overlay */}
      {openFolder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/20 backdrop-blur-2xl animate-in fade-in duration-300"
          onClick={() => setOpenFolder(null)}
        >
          <div
            className="w-full max-w-sm bg-white/40 backdrop-blur-md rounded-[3rem] p-8 shadow-2xl border border-white/30 animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-800">{openFolder.name}</h2>
              <button
                onClick={() => setOpenFolder(null)}
                className="p-2 bg-black/5 rounded-full hover:bg-black/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-6 justify-items-center">
              {openFolder.apps.map(app => (
                <AppIcon key={app.id} app={app} onClick={() => handleAppClick(app)} isPrimary={isPrimary(app.id)} />
              ))}
            </div>
          </div>
        </div>
      )}

      <footer className="py-6 border-t border-gray-200 bg-white/50 text-center">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">End-to-End Encrypted Workspace</span>
      </footer>
    </div>
  );
};

export default Launcher;