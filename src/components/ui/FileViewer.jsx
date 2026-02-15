import React from 'react';
import { X, Download, FileText, Music, Video, File } from 'lucide-react';

const FileViewer = ({ file, onClose }) => {
  if (!file) return null;

  const handleDownload = (e) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = file.data;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderContent = () => {
    const type = file.type;

    if (type.startsWith('image/')) {
      return (
        <img 
          src={file.data} 
          alt={file.name} 
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" 
        />
      );
    }

    if (type.startsWith('video/')) {
      return (
        <video controls className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" autoPlay>
          <source src={file.data} type={type} />
          Your browser does not support the video tag.
        </video>
      );
    }

    if (type.startsWith('audio/')) {
      return (
        <div className="bg-white p-8 rounded-2xl flex flex-col items-center gap-4 min-w-[300px]">
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
            <Music size={32} />
          </div>
          <h3 className="font-medium text-gray-800 text-center break-all">{file.name}</h3>
          <audio controls src={file.data} className="w-full" />
        </div>
      );
    }

    if (type === 'application/pdf') {
      return (
        <iframe 
          src={file.data} 
          className="w-full md:w-[80vw] h-[80vh] bg-white rounded-lg shadow-2xl" 
          title={file.name}
        />
      );
    }

    if (type.startsWith('text/') || type === 'application/json') {
        // Simple Base64 decode for text preview (handles standard base64)
        let content = "Preview unavailable";
        try {
            content = atob(file.data.split(',')[1]);
        } catch(e) {}

        return (
            <div className="bg-white p-6 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <h3 className="font-bold border-b pb-2 mb-2">{file.name}</h3>
                <pre className="overflow-auto flex-1 text-xs bg-gray-50 p-2 rounded border">{content}</pre>
            </div>
        )
    }

    // Default Fallback
    return (
      <div className="bg-white p-8 rounded-2xl flex flex-col items-center gap-4">
        <div className="w-20 h-20 bg-gray-100 text-gray-500 rounded-2xl flex items-center justify-center">
          <File size={40} />
        </div>
        <p className="text-gray-600 font-medium text-center">{file.name}</p>
        <p className="text-xs text-gray-400">Preview not available</p>
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Header Actions */}
      <div className="absolute top-4 right-4 flex gap-3">
        <button 
          onClick={handleDownload}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
          title="Download"
        >
          <Download size={20} />
        </button>
        <button 
          onClick={onClose}
          className="p-3 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 rounded-full transition-colors backdrop-blur-md"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content Area */}
      <div 
        className="relative max-w-full max-h-full" 
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking content
      >
        {renderContent()}
      </div>
    </div>
  );
};

export default FileViewer;