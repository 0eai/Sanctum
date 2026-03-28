// src/components/ui/headers/index.jsx
// Compound Header Component System
// Usage: <Header.Root> <Header.TopBar> ... </Header.TopBar> </Header.Root>

import React from 'react';
import { ChevronLeft, ChevronRight, Home, Search, X } from 'lucide-react';

// ─── Header.Root ──────────────────────────────────────────────────────────────
// The outermost <header> wrapper. Provides the blue theme, shadow, z-index,
// and responsive max-width layout.
const Root = ({ children, className = '', maxWidth = 'max-w-4xl' }) => (
    <header className={`flex-none bg-[#4285f4] text-white shadow-md z-10 ${className}`}>
        <div className={`${maxWidth} mx-auto px-4 pt-4 flex flex-col gap-4`}>
            {children}
        </div>
    </header>
);

// ─── Header.TopBar ────────────────────────────────────────────────────────────
// A flex container for the top row (left actions / right actions).
const TopBar = ({ children, className = '' }) => (
    <div className={`flex items-center justify-between ${className}`}>
        {children}
    </div>
);

// ─── Header.ActionsLeft ───────────────────────────────────────────────────────
// Left side of the TopBar. Renders a back button + any additional children.
const ActionsLeft = ({ onBack, children, className = '' }) => (
    <div className={`flex items-center gap-2 ${className}`}>
        {onBack && (
            <button onClick={onBack} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <ChevronLeft size={24} />
            </button>
        )}
        {children}
    </div>
);

// ─── Header.Title ─────────────────────────────────────────────────────────────
// A typography component for app titles with optional icon.
const Title = ({ children, icon: Icon, iconProps = {}, className = '' }) => (
    <h1 className={`text-xl font-bold flex items-center gap-2 truncate ${className}`}>
        {children}
        {Icon && <Icon size={20} className="opacity-70" {...iconProps} />}
    </h1>
);

// ─── Header.Workspace ─────────────────────────────────────────────────────────
// Slot for the WorkspaceSwitcher component. The actual <WorkspaceSwitcher>
// is passed as children to keep dep on the collab layer out of the header.
const Workspace = ({ children, className = '' }) => (
    <div className={`flex items-center gap-2 ${className}`}>
        {children}
    </div>
);

// ─── Header.ActionsRight ──────────────────────────────────────────────────────
// Right side of the TopBar. Renders any icon buttons passed as children.
const ActionsRight = ({ children, className = '' }) => (
    <div className={`flex items-center gap-1 ${className}`}>
        {children}
    </div>
);

// ─── Header.IconButton ────────────────────────────────────────────────────────
// A single header icon button, consistent with the existing hover style.
const IconButton = ({ onClick, icon: Icon, size = 20, title, active, className = '' }) => (
    <button
        onClick={onClick}
        className={`p-2 rounded-full transition-colors ${active ? 'bg-white/20 text-white' : 'text-blue-100 hover:text-white hover:bg-white/20'
            } ${className}`}
        title={title}
    >
        <Icon size={size} />
    </button>
);

// ─── Header.Search ────────────────────────────────────────────────────────────
// An expandable search input block with absolute-positioned icons.
const HeaderSearch = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
    <div className={`relative ${className}`}>
        <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm"
        />
        {value && (
            <button onClick={() => onChange('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white">
                <X size={16} />
            </button>
        )}
    </div>
);

// ─── Header.Breadcrumbs ───────────────────────────────────────────────────────
// Overflow-x scrollable breadcrumb row.
// items: [{ id, title }] — first item is always the root.
// onNavigate: (index) => void
const Breadcrumbs = ({ items = [], onNavigate, className = '' }) => (
    <div className={`flex items-center gap-1 text-sm text-blue-100 overflow-x-auto no-scrollbar whitespace-nowrap ${className}`}>
        {items.map((item, index) => (
            <React.Fragment key={item.id ?? `root-${index}`}>
                {index > 0 && <ChevronRight size={14} className="opacity-50 flex-shrink-0" />}
                <button
                    onClick={() => onNavigate(index)}
                    className={`hover:text-white transition-colors flex items-center gap-1 flex-shrink-0 ${index === items.length - 1 ? 'font-bold text-white' : ''
                        }`}
                >
                    {index === 0 && <Home size={14} />} {item.title}
                </button>
            </React.Fragment>
        ))}
    </div>
);

// ─── Header.Tabs ──────────────────────────────────────────────────────────────
// Scrollable tab bar. Renders the "rounded-t-lg" shape with bg-gray-50 active
// state, perfectly matching the existing Finance/Tasks/Banking/Reminders UI.
//
// tabs:     [{ id, label, icon: LucideIcon, count? }]
// activeTab: string
// onSelect:  (tab) => void
// append:   optional ReactNode rendered after the last tab (e.g. "+" button)
const Tabs = ({ tabs = [], activeTab, onSelect, append, className = '' }) => (
    <div className={`flex items-center gap-1 overflow-x-auto no-scrollbar pb-0 mt-1 ${className}`}>
        {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            const TabIcon = tab.icon;
            return (
                <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    onClick={() => onSelect(tab)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap ${isActive ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'
                        }`}
                >
                    {TabIcon && <TabIcon size={14} fill={isActive ? 'currentColor' : 'none'} />}
                    {tab.label}
                    {tab.count !== undefined && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-white/20 text-white'
                            }`}>
                            {tab.count}
                        </span>
                    )}
                </button>
            );
        })}
        {append}
    </div>
);

// ─── Export Compound Object ───────────────────────────────────────────────────
const Header = {
    Root,
    TopBar,
    ActionsLeft,
    Title,
    Workspace,
    ActionsRight,
    IconButton,
    Search: HeaderSearch,
    Breadcrumbs,
    Tabs,
};

export default Header;
