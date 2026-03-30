// src/components/ui/FileViewer.jsx
import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { X, Download, Music, File, Loader } from 'lucide-react';

// ---------------------------------------------------------------------------
// PDF canvas renderer — uses pdfjs-dist (already bundled for PdfThumbnail).
// Avoids <iframe>/<embed> which are blocked by frame-src/object-src CSP.
// ---------------------------------------------------------------------------
let pdfjsLib = null;
const loadPdfjs = async () => {
  if (pdfjsLib) return pdfjsLib;
  const mod = await import('pdfjs-dist');
  mod.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).href;
  pdfjsLib = mod;
  return pdfjsLib;
};

// Single page canvas — renders lazily when scrolled into view.
const PdfPage = ({ pdf, pageNumber, scale }) => {
  const canvasRef = useRef(null);
  const taskRef = useRef(null);
  const renderedScaleRef = useRef(null);

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current) return;
    if (renderedScaleRef.current === scale) return; // already rendered at this scale
    try {
      if (taskRef.current) { taskRef.current.cancel(); taskRef.current = null; }
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      taskRef.current = task;
      await task.promise;
      renderedScaleRef.current = scale;
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.warn('PDF page render error', e);
    }
  }, [pdf, pageNumber, scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) renderPage(); },
      { threshold: 0.01 }
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [renderPage]);

  // Re-render when scale changes and the page is visible
  useEffect(() => {
    renderedScaleRef.current = null; // invalidate cached scale
    renderPage();
  }, [scale, renderPage]);

  return (
    <div className="flex justify-center">
      <canvas ref={canvasRef} className="shadow-md bg-white block" />
    </div>
  );
};

const PdfCanvasViewer = ({ src, onDownload }) => {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pdfRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const pdfjs = await loadPdfjs();
        // src is a Blob — call arrayBuffer() directly to avoid fetch() which
        // is blocked by the connect-src CSP directive for blob: URLs.
        const arrayBuffer = await src.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) { pdf.destroy(); return; }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(e.message || 'Failed to load PDF'); setLoading(false); }
      }
    };
    load();
    return () => {
      cancelled = true;
      pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [src]);

  if (error) return (
    <div className="bg-white rounded-lg p-8 text-center text-red-500 max-w-md">
      <p className="font-medium">Failed to render PDF</p>
      <p className="text-xs text-gray-400 mt-1">{error}</p>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center w-64 h-64">
      <Loader size={32} className="text-white animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-[100dvh] w-screen">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-3 bg-black/80 backdrop-blur-md px-4 py-2 text-white text-sm select-none shrink-0 pr-24">
        <span className="opacity-70">{numPages} page{numPages !== 1 ? 's' : ''}</span>
        <span className="border-l border-white/20 pl-3 flex items-center gap-1">
          <button onClick={() => setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)))} className="hover:opacity-70 px-2 py-1">−</button>
          <span className="w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, +(s + 0.25).toFixed(2)))} className="hover:opacity-70 px-2 py-1">+</button>
        </span>
        {onDownload && (
          <button onClick={onDownload} className="border-l border-white/20 pl-3 hover:opacity-70 flex items-center gap-1">
            <Download size={14} /> Download
          </button>
        )}
      </div>

      {/* Scrollable page list — fills remaining height */}
      <div className="flex-1 overflow-y-auto overflow-x-auto flex flex-col items-center gap-4 py-4 px-2">
        {Array.from({ length: numPages }, (_, i) => (
          <PdfPage key={i} pdf={pdfRef.current} pageNumber={i + 1} scale={scale} />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const FileViewer = ({ file, onClose }) => {
  if (!file) return null;

  // Convert data URL to blob URL for video/audio (data URLs fail for large files)
  const mediaBlobUrl = useMemo(() => {
    if (!file.data) return null;
    const type = file.type || '';
    if (!(type.startsWith('video/') || type.startsWith('audio/'))) return null;

    try {
      const byteString = atob(file.data.split(',')[1]);
      const mimeType = file.data.match(/data:(.*?);/)?.[1] || type;
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error("Failed to create blob URL for media", e);
      return file.data;
    }
  }, [file.data, file.type]);

  useEffect(() => {
    return () => {
      if (mediaBlobUrl && mediaBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(mediaBlobUrl);
      }
    };
  }, [mediaBlobUrl]);

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
        <video
          controls
          autoPlay
          playsInline
          className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
          src={mediaBlobUrl}
        />
      );
    }

    if (type.startsWith('audio/')) {
      return (
        <div className="bg-white p-8 rounded-2xl flex flex-col items-center gap-4 min-w-[300px]">
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
            <Music size={32} />
          </div>
          <h3 className="font-medium text-gray-800 text-center break-all">{file.name}</h3>
          <audio controls src={mediaBlobUrl} className="w-full" />
        </div>
      );
    }

    if (type === 'application/pdf') {
      // PDF.js canvas rendering — avoids <iframe>/<embed> CSP restrictions
      return <PdfCanvasViewer src={file.data} onDownload={handleDownload} />;
    }

    if (type.startsWith('text/') || type === 'application/json') {
      let content = "Preview unavailable";
      try {
        content = atob(file.data.split(',')[1]);
      } catch (e) { }

      return (
        <div className="bg-white p-6 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          <h3 className="font-bold border-b pb-2 mb-2">{file.name}</h3>
          <pre className="overflow-auto flex-1 text-xs bg-gray-50 p-2 rounded border">{content}</pre>
        </div>
      );
    }

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

  const isPdf = file.type === 'application/pdf';

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 flex items-center justify-center"
      onClick={isPdf ? undefined : onClose}
    >
      {/* Close / Download — always top-right */}
      <div className="absolute top-4 right-4 flex gap-3 z-10">
        {!isPdf && (
          <button
            onClick={handleDownload}
            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
            title="Download"
          >
            <Download size={20} />
          </button>
        )}
        <button
          onClick={onClose}
          className="p-3 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 rounded-full transition-colors backdrop-blur-md"
        >
          <X size={20} />
        </button>
      </div>

      {isPdf ? (
        /* PDF takes the entire overlay — no centering wrapper */
        <div className="absolute inset-0" onClick={(e) => e.stopPropagation()}>
          {renderContent()}
        </div>
      ) : (
        /* Other media centered as before */
        <div
          className="relative max-w-full max-h-full"
          onClick={(e) => e.stopPropagation()}
        >
          {renderContent()}
        </div>
      )}
    </div>
  );
};

export default FileViewer;
