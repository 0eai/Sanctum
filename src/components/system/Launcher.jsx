// src/components/system/Launcher.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, CheckSquare, Key, Bell, Sliders, Lock, Cloud, Cast, Bookmark,
  FileText, ClipboardList, CreditCard, PieChart, Globe, FileCode,
  Music, Video, MessageSquare, ShoppingBag, Briefcase, Layout,
  Users, BellRing, Share2, ShieldCheck, MessageCircle, GraduationCap,
} from 'lucide-react';
import { listenToAppStats } from '../../services/firestoredb';
import { listenToAllUnreadMessages } from '../../apps/secureshare/services/secureshare';

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
    case 'GraduationCap': return <GraduationCap {...props} />;
    case 'Globe':
    default: return <Globe {...props} />;
  }
};

const Launcher = ({ user, onLaunch, onLock, enabledApps }) => {
  const [stats, setStats] = useState({
    counters: 0, checklists: 0, tasks: 0, passwords: 0, banking: 0, finance: 0, reminders: 0, authenticator: 0, unreadChats: 0
  });

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
    { id: 'secureshare', icon: <MessageCircle size={24} />, label: 'Chat', count: stats.unreadChats },
    { id: 'banking', icon: <CreditCard size={24} />, label: 'Wallet', count: stats.banking },
    { id: 'finance', icon: <PieChart size={24} />, label: 'Finance', count: stats.finance },
    { id: 'research', icon: <GraduationCap size={24} />, label: 'Research' },
    { id: 'bookmarks', icon: <Bookmark size={24} />, label: 'Bookmarks' },
    { id: 'settings', icon: <Sliders size={24} />, label: 'Settings' },
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
        <div className="w-full flex justify-center mb-8">
          <div className="max-w-3xl p-6 w-full space-y-8">
            {Object.entries({
              'Productivity': ['notes', 'tasks', 'checklist', 'markdown', 'research', 'reminders'],
              'Finance': ['banking', 'finance'],
              'Communication': ['secureshare', 'contacts', 'alerts'],
              'Tools': ['passwords', 'authenticator', 'bookmarks', 'counter', 'settings']
            }).map(([categoryName, appIds]) => {
              // Get apps for this category that are actually enabled
              const categoryApps = finalApps.filter(app => appIds.includes(app.id));

              if (categoryApps.length === 0) return null;

              return (
                <div key={categoryName} className="flex flex-col gap-4">
                  <h2 className="text-lg font-bold text-gray-700 px-2">{categoryName}</h2>
                  <div className="flex flex-wrap content-start gap-4 sm:gap-5 lg:gap-6 w-full">
                    {categoryApps.map(app => {
                      const isPrimary = ['checklist', 'tasks', 'counter', 'passwords', 'alerts', 'bookmarks', 'notes', 'markdown', 'contacts', 'reminders', 'settings', 'banking', 'finance', 'secureshare', 'authenticator', 'research'].includes(app.id);

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
                </div>
              );
            })}

            {/* Uncategorized Apps (Custom Apps, external shortcuts) */}
            {(() => {
              const categorizedIds = ['notes', 'tasks', 'checklist', 'markdown', 'research', 'reminders', 'banking', 'finance', 'secureshare', 'contacts', 'alerts', 'passwords', 'authenticator', 'bookmarks', 'counter', 'settings'];
              const uncategorized = finalApps.filter(app => !categorizedIds.includes(app.id));
              if (uncategorized.length === 0) return null;

              return (
                <div className="flex flex-col gap-4">
                  <h2 className="text-lg font-bold text-gray-700 px-2">Other</h2>
                  <div className="flex flex-wrap content-start gap-4 sm:gap-5 lg:gap-6 w-full">
                    {uncategorized.map(app => (
                      <button
                        key={app.id}
                        onClick={() => handleAppClick(app)}
                        className={`w-[5.5rem] h-[5.5rem] sm:w-24 sm:h-24 md:w-[6.5rem] md:h-[6.5rem] rounded-3xl flex flex-col items-center justify-center gap-1 sm:gap-1.5 shadow-sm transition-transform active:scale-95 relative bg-[#4285f4] ${app.locked ? 'opacity-90' : 'hover:brightness-110'}`}
                      >
                        <div className={`p-2.5 sm:p-3 rounded-2xl bg-white text-[#4285f4]`}>
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
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
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