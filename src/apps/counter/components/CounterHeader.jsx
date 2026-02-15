// src/apps/counter/components/CounterHeader.jsx
import React from 'react';
import { ChevronLeft, Edit2, Settings, Trash2, History, PieChart } from 'lucide-react';

const CounterHeader = ({ 
  view, 
  title, 
  onBack, 
  onEdit, 
  onSettings, 
  onDelete, 
  activeTab, 
  setActiveTab 
}) => {
  return (
    <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 transition-all duration-300">
      <div className={`max-w-4xl mx-auto px-4 pt-4 flex flex-col gap-4 ${view === 'detail' ? 'pb-0' : 'pb-4'}`}>
        
        {/* Top Row: Title & Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            <button onClick={onBack} className="p-1 hover:bg-white/20 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-xl font-bold truncate">
              {title}
            </h1>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-1">
            {view === 'detail' ? (
              /* Detail View Actions */
              <>
                <button onClick={onEdit} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Edit Counter">
                  <Edit2 size={18} />
                </button>
                {/* Optional: You can keep Settings here too if you want access from detail view */}
                <button onClick={onSettings} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Settings">
                  <Settings size={18} />
                </button>
                <button onClick={onDelete} className="p-2 hover:bg-white/20 text-red-100 hover:text-red-500 rounded-full transition-colors" title="Delete Counter">
                  <Trash2 size={18} />
                </button>
              </>
            ) : (
              /* List View Actions (Import/Export) */
              <button onClick={onSettings} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Manage Data">
                <Settings size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Bottom Row: Tabs (Only in Detail View) */}
        {view === 'detail' && (
          /* Removed 'overflow-x-auto' to prevent desktop scrollbars */
          <div className="flex items-center gap-1 pb-0 mt-1">
            <button 
                onClick={() => setActiveTab('history')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-colors relative top-[1px] ${activeTab === 'history' ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
            >
                <History size={16} /> History
            </button>
            <button 
                onClick={() => setActiveTab('stats')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-colors relative top-[1px] ${activeTab === 'stats' ? 'bg-gray-50 text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
            >
                <PieChart size={16} /> Stats
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default CounterHeader;