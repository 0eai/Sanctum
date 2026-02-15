import React from 'react';

const SimpleBarChart = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end h-32 gap-2 mt-4 px-1 w-full overflow-x-auto pb-2">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center h-full justify-end group flex-shrink-0 min-w-[36px]">
          <div 
            className="w-6 bg-blue-200 rounded-t-sm transition-all duration-500 relative hover:bg-[#4285f4]"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? '4px' : '0' }}
          >
             <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
               {d.value}
             </div>
          </div>
          <span className="text-[9px] text-gray-400 mt-1 text-center block whitespace-nowrap px-1">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

export default SimpleBarChart;