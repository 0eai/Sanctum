import React from 'react';

const Fab = ({ 
  icon, 
  onClick, 
  maxWidth = "max-w-3xl", 
  ariaLabel = "Create",
  className = "" 
}) => {
  return (
    <div className="fixed inset-x-0 bottom-6 z-30 pointer-events-none">
      {/* Updated px-4 to match Header padding */}
      <div className={`${maxWidth} mx-auto px-4 flex justify-end pointer-events-auto`}>
        <button 
          onClick={onClick}
          aria-label={ariaLabel}
          className={`
            h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg 
            flex items-center justify-center 
            active:scale-90 transition-transform duration-200 
            hover:bg-blue-600 hover:shadow-xl
            ${className}
          `}
        >
          {icon}
        </button>
      </div>
    </div>
  );
};

export default Fab;