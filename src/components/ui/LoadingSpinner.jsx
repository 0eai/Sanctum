import React from 'react';

export const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-full text-[#4285f4]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
  </div>
);