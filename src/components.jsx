import React from 'react';
import { X } from 'lucide-react';

export const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-full text-[#4285f4]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
  </div>
);

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

export const Input = ({ label, ...props }) => (
  <div className="flex flex-col gap-1 mb-4">
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    <input className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4285f4] focus:border-[#4285f4] outline-none transition-all w-full" {...props} />
  </div>
);

export const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white z-10">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500"><X size={20} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};