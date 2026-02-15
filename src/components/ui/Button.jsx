import React from 'react';

export const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-[#4285f4] text-white hover:bg-[#3367d6]",
    secondary: "bg-white text-[#4285f4] border border-[#4285f4] hover:bg-blue-50",
    danger: "bg-red-500 text-white hover:bg-red-600",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100 shadow-none",
    google: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50",
    success: "bg-green-500 text-white hover:bg-green-600"
  };
  return <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>{children}</button>;
};