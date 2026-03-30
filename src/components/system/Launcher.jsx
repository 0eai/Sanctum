// src/components/system/Launcher.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, CheckSquare, Key, Bell, Sliders, Lock, Cloud, Cast, Bookmark,
  FileText, ClipboardList, CreditCard, PieChart, Globe, FileCode,
  Music, Video, MessageSquare, ShoppingBag, Briefcase, Layout,
  Users, BellRing, Share2, ShieldCheck, MessageCircle, GraduationCap,
  ChevronRight
} from 'lucide-react';
import { listenToAppStats } from '../../services/firestoredb';
import { listenToAllUnreadMessages } from '../../apps/secureshare/services/secureshare';

// Per-app accent color & gradient definitions
const APP_STYLES = {
  notes:         { bg: 'from-blue-500 to-blue-600',       text: 'text-blue-600',   dot: '#3b82f6' },
  tasks:         { bg: 'from-green-500 to-green-600',      text: 'text-green-600',  dot: '#22c55e' },
  checklist:     { bg: 'from-orange-500 to-orange-600',    text: 'text-orange-600', dot: '#f97316' },
  markdown:      { bg: 'from-purple-500 to-purple-600',    text: 'text-purple-600', dot: '#a855f7' },
  research:      { bg: 'from-teal-500 to-teal-600',        text: 'text-teal-600',   dot: '#14b8a6' },
  reminders:     { bg: 'from-pink-500 to-pink-600',        text: 'text-pink-600',   dot: '#ec4899' },
  banking:       { bg: 'from-emerald-500 to-emerald-600',  text: 'text-emerald-600',dot: '#10b981' },
  finance:       { bg: 'from-indigo-500 to-indigo-600',    text: 'text-indigo-600', dot: '#6366f1' },
  secureshare:   { bg: 'from-violet-500 to-violet-600',    text: 'text-violet-600', dot: '#8b5cf6' },
  contacts:      { bg: 'from-sky-500 to-sky-600',          text: 'text-sky-600',    dot: '#0ea5e9' },
  alerts:        { bg: 'from-amber-500 to-amber-600',      text: 'text-amber-600',  dot: '#f59e0b' },
  passwords:     { bg: 'from-red-500 to-red-600',          text: 'text-red-600',    dot: '#ef4444' },
  authenticator: { bg: 'from-lime-500 to-lime-600',        text: 'text-lime-600',   dot: '#84cc16' },
  bookmarks:     { bg: 'from-yellow-500 to-yellow-600',    text: 'text-yellow-600', dot: '#eab308' },
  counter:       { bg: 'from-cyan-500 to-cyan-600',        text: 'text-cyan-600',   dot: '#06b6d4' },
  settings:      { bg: 'from-gray-500 to-gray-600',        text: 'text-gray-600',   dot: '#6b7280' },
  shared:        { bg: 'from-indigo-500 to-indigo-600',    text: 'text-indigo-600', dot: '#6366f1' },
};

const defaultStyle = { bg: 'from-gray-500 to-gray-600', text: 'text-gray-600', dot: '#6b7280' };

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

const AppIcon = ({ app, onClick }) => {
  const style = APP_STYLES[app.id] || defaultStyle;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex flex-col items-center gap-2 group focus:outline-none"
    >
      <div className={`relative w-[60px] h-[60px] sm:w-[68px] sm:h-[68px] rounded-[22%] bg-gradient-to-br ${style.bg} flex items-center justify-center shadow-md group-active:scale-90 transition-transform duration-150 ${app.locked ? 'opacity-50' : 'group-hover:scale-105'}`}>
        <div className="text-white">
          {React.cloneElement(app.icon, { size: 26 })}
        </div>
        {app.count !== undefined && app.count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-px rounded-full shadow border-2 border-white z-10 min-w-[18px] text-center leading-snug">
            {app.count > 99 ? '99+' : app.count}
          </span>
        )}
      </div>
      <span className="text-[11px] font-medium text-gray-600 text-center leading-tight w-[68px] truncate">{app.label}</span>
    </button>
  );
};

const CategorySection = ({ name, apps, onAppClick }) => {
  if (apps.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 px-1">{name}</h2>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-5">
        {apps.map(app => (
          <AppIcon key={app.id} app={app} onClick={() => onAppClick(app)} />
        ))}
      </div>
    </section>
  );
};

const getGreeting = (displayName) => {
  const hour = new Date().getHours();
  const name = displayName
    ? displayName.split(' ')[0]
    : null;
  const prefix = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${prefix}, ${name}` : prefix;
};

const CATEGORIES = [
  { name: 'Productivity', ids: ['notes', 'tasks', 'checklist', 'markdown', 'research', 'reminders'] },
  { name: 'Communication', ids: ['secureshare', 'contacts', 'alerts', 'shared'] },
  { name: 'Finance', ids: ['banking', 'finance'] },
  { name: 'Security', ids: ['passwords', 'authenticator'] },
  { name: 'Tools', ids: ['bookmarks', 'counter'] },
];

const readNewShareCount = () => parseInt(localStorage.getItem('sanctum_new_shares') || '0');

const Launcher = ({ user, onLaunch, onLock, enabledApps }) => {
  const [stats, setStats] = useState({
    counters: 0, checklists: 0, tasks: 0, passwords: 0, banking: 0,
    finance: 0, reminders: 0, authenticator: 0, unreadChats: 0,
    newShares: readNewShareCount()
  });

  useEffect(() => {
    if (!user) return;
    const unsubStats = listenToAppStats(user.uid, (col, size) =>
      setStats(prev => ({ ...prev, [col]: size }))
    );
    const unsubUnread = listenToAllUnreadMessages(user.uid, count =>
      setStats(prev => ({ ...prev, unreadChats: count }))
    );
    const handleNewShare = () =>
      setStats(prev => ({ ...prev, newShares: readNewShareCount() }));
    window.addEventListener('sanctum_new_shares', handleNewShare);
    return () => { unsubStats(); unsubUnread(); window.removeEventListener('sanctum_new_shares', handleNewShare); };
  }, [user]);

  const systemApps = useMemo(() => [
    { id: 'alerts',        icon: <Bell size={24} />,         label: 'DayPulse' },
    { id: 'tasks',         icon: <ClipboardList size={24} />, label: 'Tasks',        count: stats.tasks },
    { id: 'checklist',     icon: <CheckSquare size={24} />,  label: 'Checklists',   count: stats.checklists },
    { id: 'reminders',     icon: <BellRing size={24} />,     label: 'Reminders',    count: stats.reminders },
    { id: 'counter',       icon: <TrendingUp size={24} />,   label: 'Counters',     count: stats.counters },
    { id: 'notes',         icon: <FileText size={24} />,     label: 'Notes' },
    { id: 'markdown',      icon: <FileCode size={24} />,     label: 'Markdown' },
    { id: 'contacts',      icon: <Users size={24} />,        label: 'Contacts' },
    { id: 'passwords',     icon: <Key size={24} />,          label: 'Passwords',    count: stats.passwords },
    { id: 'authenticator', icon: <ShieldCheck size={24} />,  label: 'Authenticator',count: stats.authenticator },
    { id: 'secureshare',   icon: <MessageCircle size={24} />,label: 'Chat',         count: stats.unreadChats },
    { id: 'banking',       icon: <CreditCard size={24} />,   label: 'Wallet',       count: stats.banking },
    { id: 'finance',       icon: <PieChart size={24} />,     label: 'Finance',      count: stats.finance },
    { id: 'research',      icon: <GraduationCap size={24} />,label: 'Research' },
    { id: 'bookmarks',     icon: <Bookmark size={24} />,     label: 'Bookmarks' },
    { id: 'shared',        icon: <Share2 size={24} />,        label: 'Shared',       count: stats.newShares },
    { id: 'settings',      icon: <Sliders size={24} />,      label: 'Settings' },
  ], [stats]);

  const finalApps = useMemo(() => {
    let list = [];
    if (!enabledApps) {
      list = [...systemApps];
    } else {
      const { customAppList, selectedApps } = enabledApps;
      if (!customAppList) {
        const ids = Array.isArray(enabledApps) ? enabledApps : (selectedApps || []);
        list = systemApps.filter(a => ids.includes(a.id) || a.id === 'settings');
      } else {
        list = customAppList
          .filter(sa => sa.id === 'settings' || selectedApps.includes(sa.id))
          .map(sa => {
            const sys = systemApps.find(a => a.id === sa.id);
            if (sys) return sys;
            return { ...sa, label: sa.name, icon: getIconElement(sa.icon, 24), locked: false };
          });
      }
    }
    return list;
  }, [enabledApps, systemApps]);

  const appById = useMemo(() => Object.fromEntries(finalApps.map(a => [a.id, a])), [finalApps]);

  const categorisedIds = CATEGORIES.flatMap(c => c.ids);
  const uncategorised = finalApps.filter(a => !categorisedIds.includes(a.id) && a.id !== 'settings');
  const settingsApp = appById['settings'];

  const handleAppClick = (app) => {
    if (app.locked) return;
    if (app.url) window.open(app.url, '_blank');
    else onLaunch(app.id);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 pt-10 pb-5 px-6">
        <div className="max-w-3xl mx-auto flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-400 mb-0.5">Sanctum</p>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">
              {getGreeting(user?.displayName || user?.email)}
            </h1>
          </div>
          {onLock && (
            <button
              onClick={onLock}
              className="mt-1 p-2.5 rounded-xl bg-gray-100 hover:bg-red-50 hover:text-red-500 text-gray-500 transition-colors"
              aria-label="Lock vault"
            >
              <Lock size={20} />
            </button>
          )}
        </div>
      </header>

      {/* App Grid */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">

          {/* Categorised sections */}
          {CATEGORIES.map(({ name, ids }) => {
            const sectionApps = ids.map(id => appById[id]).filter(Boolean);
            return (
              <CategorySection
                key={name}
                name={name}
                apps={sectionApps}
                onAppClick={handleAppClick}
              />
            );
          })}

          {/* Custom / uncategorised apps */}
          {uncategorised.length > 0 && (
            <CategorySection
              name="Apps"
              apps={uncategorised}
              onAppClick={handleAppClick}
            />
          )}

          {/* Settings — always at bottom */}
          {settingsApp && (
            <section className="mt-2">
              <button
                onClick={() => handleAppClick(settingsApp)}
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-white rounded-2xl border border-gray-100 hover:bg-gray-50 active:scale-[0.99] transition-all shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white flex-shrink-0">
                  <Sliders size={18} />
                </div>
                <span className="text-sm font-semibold text-gray-700">Settings</span>
                <ChevronRight size={16} className="ml-auto text-gray-300" />
              </button>
            </section>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-gray-100 bg-white/60 text-center">
        <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">
          End-to-End Encrypted
        </span>
      </footer>
    </div>
  );
};

export default Launcher;
