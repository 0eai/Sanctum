import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { 
  FileText, AlertCircle, Loader, Tag, Paperclip, Download, Calendar, X, ZoomIn
} from 'lucide-react';
import { db } from './firebase';
import { decryptData, keyFromUrlString } from './crypto';

const SharedNote = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // NEW: State for the Image Lightbox
  const [viewingImage, setViewingImage] = useState(null);

  useEffect(() => {
    const fetchNote = async () => {
      try {
        const hash = window.location.hash;
        const queryString = hash.includes('?') ? hash.split('?')[1] : ''; 
        const urlParams = new URLSearchParams(queryString);
        
        const docId = urlParams.get('id');
        const keyString = urlParams.get('k');

        if (!docId || !keyString) throw new Error("Invalid Link Parameters");

        const docRef = doc(db, 'shared_notes', docId);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) throw new Error("Note not found or deleted.");

        const shareKey = await keyFromUrlString(keyString);
        const decrypted = await decryptData(snapshot.data().data, shareKey);
        
        if (!decrypted) throw new Error("Decryption failed. Invalid Key.");
        
        setData(decrypted);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchNote();
  }, []);

  const downloadAttachment = (e, att) => {
    e.stopPropagation(); // Prevent opening lightbox when clicking download
    const link = document.createElement('a');
    link.href = att.data;
    link.download = att.name || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Render ---

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
            <Loader className="animate-spin text-blue-500" size={32} />
            <p className="text-gray-400 text-sm font-medium">Decrypting...</p>
        </div>
    </div>
  );

  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-600 p-6 text-center">
        <div className="bg-red-100 p-4 rounded-full mb-4 text-red-500"><AlertCircle size={32} /></div>
        <h2 className="text-xl font-bold text-gray-800">Unable to view note</h2>
        <p className="max-w-md mt-2 text-sm">{error}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-12 font-sans relative">
      
      {/* Lightbox Modal */}
      {viewingImage && (
        <div 
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity"
            onClick={() => setViewingImage(null)}
        >
            <button 
                onClick={() => setViewingImage(null)}
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
                <X size={24} />
            </button>
            <img 
                src={viewingImage.data} 
                alt={viewingImage.name} 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking image itself
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/50 px-4 py-2 rounded-full">
                {viewingImage.name}
            </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        
        {/* Header */}
        <div className="p-8 border-b border-gray-100 bg-white">
            <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">
                {data.title || "Untitled Note"}
            </h1>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2.5 py-1 rounded-md font-medium">
                    <FileText size={14} />
                    <span>Shared via Sanctum</span>
                </div>
                {data.date && (
                    <div className="flex items-center gap-1.5">
                        <Calendar size={14} />
                        <span>{new Date(data.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                    </div>
                )}
            </div>

            {data.tags && data.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                    {data.tags.map((tag, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            <Tag size={10} /> {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>

        {/* Content */}
        <div className="p-8">
            <div className="prose prose-blue max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed text-lg">
                {data.content || <span className="text-gray-300 italic">No text content.</span>}
            </div>
        </div>

        {/* Attachments */}
        {data.attachments && data.attachments.length > 0 && (
            <div className="bg-gray-50 p-8 border-t border-gray-100">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Paperclip size={16} /> Attachments ({data.attachments.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {data.attachments.map((att, i) => {
                        const isImage = att.type && att.type.startsWith('image/');
                        return (
                            <div 
                                key={i} 
                                className={`group relative bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all ${isImage ? 'cursor-pointer' : ''}`}
                                onClick={() => isImage && setViewingImage(att)}
                            >
                                {/* Preview */}
                                <div className="aspect-square flex items-center justify-center bg-gray-100 relative">
                                    {isImage ? (
                                        <>
                                            <img src={att.data} alt={att.name} className="w-full h-full object-cover" />
                                            {/* Hover Overlay for Zoom Icon */}
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-all">
                                                <ZoomIn className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" size={24} />
                                            </div>
                                        </>
                                    ) : (
                                        <FileText size={40} className="text-gray-300" />
                                    )}
                                </div>
                                
                                {/* Footer */}
                                <div className="p-3">
                                    <p className="text-xs font-medium text-gray-700 truncate" title={att.name}>{att.name}</p>
                                    <button 
                                        onClick={(e) => downloadAttachment(e, att)}
                                        className="mt-2 w-full flex items-center justify-center gap-2 text-xs bg-blue-50 text-blue-600 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-semibold"
                                    >
                                        <Download size={12} /> Download
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

      </div>
      
      <div className="text-center mt-8 text-xs text-gray-400">
        <p>This is a secure, end-to-end encrypted note.</p>
      </div>
    </div>
  );
};

export default SharedNote;