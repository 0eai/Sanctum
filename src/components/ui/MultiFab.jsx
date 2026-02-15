import React from 'react';

/**
 * Reusable Stack of Floating Action Buttons
 * Aligns perfectly with content using the Wrapper Div technique.
 * * @param {Array} actions - [{ label, icon, onClick, variant }]
 * @param {String} maxWidth - 'max-w-3xl', 'max-w-4xl', etc. matching your header
 */
const MultiFab = ({ actions, maxWidth = "max-w-3xl" }) => {
  if (!actions || actions.length === 0) return null;

  return (
    // 1. Fixed wrapper spans the screen
    <div className="fixed inset-x-0 bottom-6 z-30 pointer-events-none">
      
      {/* 2. Inner container constrains width to match your app */}
      <div className={`${maxWidth} mx-auto px-4 flex flex-col items-end gap-3`}>
        
        {/* --- MOBILE (Circles) --- */}
        <div className="flex flex-col gap-3 items-end md:hidden pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-200">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={`
                flex items-center justify-center shadow-lg active:scale-90 transition-transform
                ${action.variant === 'primary' 
                  ? 'h-14 w-14 rounded-full bg-[#4285f4] text-white' 
                  : 'h-12 w-12 rounded-full bg-white text-gray-600 hover:bg-gray-50'
                }
              `}
              title={action.label}
            >
              {action.icon}
            </button>
          ))}
        </div>

        {/* --- DESKTOP (Pills) --- */}
        <div className="hidden md:flex flex-col gap-3 items-end pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-200">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={`
                flex items-center gap-2 rounded-full shadow-lg transition-transform active:scale-95 font-bold whitespace-nowrap px-6
                ${action.variant === 'primary' 
                  ? 'py-4 text-lg bg-[#4285f4] text-white shadow-xl' 
                  : 'py-3 border border-gray-200 bg-white text-[#4285f4] hover:bg-gray-50'
                }
              `}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
};

export default MultiFab;