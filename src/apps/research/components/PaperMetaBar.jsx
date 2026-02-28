import React from 'react';
import { Tag, X, FileText, Paperclip, Cpu, Settings } from 'lucide-react';

const PaperMetaBar = ({
    tags, setTags, isTagInputVisible, setIsTagInputVisible,
    isPreviewMode, hasPdf, setHasPdf, setTempPdfPath, setAiSummary,
    isDecrypting, handleReadPdf, handlePdfUpload,
    isPrivate, setIsPrivate, isEncrypted, setIsEncrypted,
    isUploading, uploadProgress,
    isGeneratingAi, handleGenerateAi, setIsPromptModalOpen
}) => (
    <div className="flex flex-wrap gap-2 items-center text-xs">
        {/* Tags */}
        {tags.map((tag, i) => (
            <span key={i} className="bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-full flex items-center gap-1 font-medium">
                #{tag}
                {!isPreviewMode && (
                    <button onClick={() => setTags(s => s.filter((_, idx) => idx !== i))} className="hover:text-red-500"><X size={12} /></button>
                )}
            </span>
        ))}
        {!isPreviewMode && (
            isTagInputVisible ? (
                <input autoFocus placeholder="Tag..." className="px-3 py-1.5 rounded-full border border-indigo-500 outline-none w-20 bg-transparent"
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { setTags(s => [...s, e.target.value.trim()]); setIsTagInputVisible(false); } }}
                    onBlur={() => setIsTagInputVisible(false)} />
            ) : (
                <button onClick={() => setIsTagInputVisible(true)} className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-indigo-500 hover:text-indigo-500 transition-colors">
                    <Tag size={12} /> Tag
                </button>
            )
        )}

        {/* PDF Attach / Read Pill */}
        {hasPdf ? (
            <div className="bg-emerald-50 text-emerald-600 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium group relative overflow-hidden">
                <FileText size={12} />
                <span className="cursor-pointer" onClick={isPreviewMode ? handleReadPdf : undefined}>
                    {isDecrypting ? "Decrypting..." : "PDF Attached"}
                </span>
                {!isPreviewMode && (
                    <button onClick={(e) => { e.stopPropagation(); setHasPdf(false); setTempPdfPath(null); setAiSummary(null); }} className="hover:text-red-500 ml-1 z-20"><X size={12} /></button>
                )}
            </div>
        ) : (
            !isPreviewMode && (
                <label className="flex items-center gap-1 text-gray-400 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 hover:border-emerald-500 hover:text-emerald-500 cursor-pointer transition-colors">
                    <Paperclip size={12} /> Attach PDF
                    <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
                </label>
            )
        )}

        {/* Privacy Toggle */}
        {!isPreviewMode && (
            <button
                onClick={() => setIsPrivate(!isPrivate)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full transition-colors border ${isPrivate ? 'bg-rose-50 border-rose-200 text-rose-500' : 'border-dashed border-gray-300 text-gray-400 hover:border-rose-400 hover:text-rose-500'}`}
            >
                Private {isPrivate && 'On'}
            </button>
        )}

        {/* Encryption Toggle */}
        {!isPreviewMode && !hasPdf && (
            <button
                onClick={() => setIsEncrypted(!isEncrypted)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full transition-colors border ${isEncrypted ? 'bg-indigo-50 border-indigo-200 text-indigo-500' : 'border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500'}`}
                title="Zero-Knowledge Encryption"
            >
                Encrypt {isEncrypted && 'On'}
            </button>
        )}

        {/* Upload Progress Indicator */}
        {isUploading && (
            <div className="text-indigo-500 flex items-center gap-1 px-2 py-1">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-500"></div>
                <span className="text-[10px]">{uploadProgress}</span>
            </div>
        )}

        {/* AI Actions */}
        {!isPreviewMode && hasPdf && !isPrivate && (
            <>
                <button
                    onClick={handleGenerateAi}
                    disabled={isGeneratingAi}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors cursor-pointer disabled:opacity-50 font-medium"
                >
                    <Cpu size={12} /> {isGeneratingAi ? "Generating..." : "Generate AI Review"}
                </button>
                <button
                    onClick={() => setIsPromptModalOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-dashed border-gray-300 text-gray-500 rounded-full hover:border-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                    <Settings size={12} /> AI Config
                </button>
            </>
        )}
    </div>
);

export default PaperMetaBar;
