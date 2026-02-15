import React from 'react';

export const Input = ({ label, ...props }) => (
  <div className="flex flex-col gap-1 mb-4">
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    <input className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4285f4] focus:border-[#4285f4] outline-none transition-all w-full" {...props} />
  </div>
);