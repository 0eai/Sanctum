import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Search, X, ChevronRight, Home, Users, Folder } from 'lucide-react';
import WorkspaceSwitcher from '../WorkspaceSwitcher';

const AppLandingPageHeader = ({
  onBack,
  title,
  icon: TitleIcon,
  workspaceConfig,
  search,
  nav,
  customActions
}) => {
  // --- Collapsible Search State ---
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef(null);

  // Auto-focus input when expanded
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleCloseSearch = () => {
    if (search) search.setQuery('');
    setIsSearchOpen(false);
  };

  // If we have nav and it's visible, don't add bottom padding (so tabs attach to bottom)
  // Otherwise, add some bottom padding for breathing room
  const hasVisibleNav = nav && !isSearchOpen;
  const paddingBottomClass = hasVisibleNav ? 'pb-0' : 'pb-4';

  return (
    <header className={`flex-none bg-[#4285f4] text-white shadow-md z-20 ${paddingBottomClass}`}>
      <div className="max-w-4xl mx-auto px-4 pt-4 flex flex-col gap-4">

        {/* TOP BAR */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button onClick={onBack} className="p-1 hover:bg-white/20 rounded-full transition-colors flex-shrink-0">
              <ChevronLeft size={24} />
            </button>

            {/* Expanded Search: replaces title/workspace when open */}
            {search && isSearchOpen ? (
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-2.5 text-blue-200 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search.query}
                  onChange={(e) => search.setQuery(e.target.value)}
                  placeholder={search.placeholder || "Search..."}
                  className="w-full pl-9 pr-9 py-2 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm"
                />
                <button onClick={handleCloseSearch} className="absolute right-3 top-2.5 text-blue-200 hover:text-white">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                {title ? (
                  <h1 className="text-xl font-bold flex items-center gap-2 truncate">
                    {TitleIcon && <TitleIcon size={20} className="opacity-70" />}
                    {title}
                  </h1>
                ) : workspaceConfig ? (
                  <div className="flex-1 min-w-0 mr-2 lg:mr-4 z-50">
                    <WorkspaceSwitcher
                      {...workspaceConfig.switcherProps}
                      onSelect={workspaceConfig.onSelect}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Search toggle icon (only when search is collapsed) */}
            {search && !isSearchOpen && (
              <button onClick={() => setIsSearchOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white" title="Search">
                <Search size={20} />
              </button>
            )}
            {/* Team button for workspace apps */}
            {workspaceConfig?.activeWorkspace && workspaceConfig?.onOpenPanel && (
              <button onClick={workspaceConfig.onOpenPanel} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white">
                <Users size={20} />
              </button>
            )}
            {customActions}
          </div>
        </div>

        {/* NAVIGATION (Hidden if actively searching) */}
        {nav && !isSearchOpen && (
          <div className="mt-1">
            {nav.type === 'breadcrumbs' && (
              <div className="flex items-center gap-1 text-sm text-blue-100 overflow-x-auto no-scrollbar whitespace-nowrap mask-fade-right pb-3">
                {nav.data.map((folder, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <ChevronRight size={14} className="opacity-50 flex-shrink-0" />}
                    <button
                      onClick={() => nav.onSelect(index, folder)}
                      className={`hover:text-white transition-colors flex items-center gap-1 ${index === nav.data.length - 1 ? 'font-bold text-white' : ''}`}
                    >
                      {index === 0 && <Home size={14} />} {folder.title}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

            {nav.type === 'tabs' && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0">
                {nav.data.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = nav.activeId === tab.id;
                  return (
                    <button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      onClick={() => nav.onSelect(tab.id, tab)}
                      className={`flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap flex-1 sm:flex-initial ${isActive ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
                    >
                      {Icon && <Icon size={16} fill={isActive ? "currentColor" : "none"} />}
                      <span className={tab.truncate ? 'max-w-[100px] truncate' : ''}>{tab.label || tab.name}</span>
                      {tab.count !== undefined && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-white/20 text-white'}`}>
                          {tab.count}
                        </span>
                      )}
                      {isActive && tab.onCollaborate && (
                        <span onClick={(e) => { e.stopPropagation(); tab.onCollaborate(); }} className="ml-1 opacity-50 hover:opacity-100 hover:text-blue-400" title="Share folder">
                          <Users size={12} />
                        </span>
                      )}
                      {isActive && tab.onDelete && (
                        <span onClick={(e) => { e.stopPropagation(); tab.onDelete(); }} className="ml-1 opacity-50 hover:opacity-100 hover:text-red-500">
                          <X size={12} />
                        </span>
                      )}
                    </button>
                  );
                })}
                {nav.extraNode && nav.extraNode}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default AppLandingPageHeader;