import { useState } from 'react';
import { Users, Calendar, MapPin, ExternalLink, Copy, Pencil, Check } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';

const PaperMetadataForm = ({
    isPreviewMode, readOnly,
    authors, setAuthors, year, setYear, venue, setVenue,
    url, setUrl, bibtex, setBibtex, handleBibtexAutoFill
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Full edit form (used in edit mode, or when expanded in preview mode)
    const editForm = (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm border-l-2 border-indigo-100 pl-4">
            <input placeholder="Authors (e.g. Vaswani et al.)" value={authors} onChange={e => setAuthors(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 w-full outline-none" />
            <div className="grid grid-cols-2 gap-3">
                <input placeholder="Year (e.g. 2017)" value={year} onChange={e => setYear(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 w-full outline-none" />
                <input placeholder="Venue / Journal" value={venue} onChange={e => setVenue(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 w-full outline-none" />
            </div>
            <input placeholder="URL / DOI" type="url" value={url} onChange={e => setUrl(e.target.value)} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 w-full outline-none sm:col-span-2" />
            <div className="sm:col-span-2 space-y-2 mt-1">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">BibTeX Citation</span>
                    <button onClick={handleBibtexAutoFill} className="text-xs text-indigo-600 font-medium hover:text-indigo-800">Auto-Fill Metadata</button>
                </div>
                <TextareaAutosize placeholder="@article{..." value={bibtex} onChange={e => setBibtex(e.target.value)} minRows={2} className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 w-full font-mono text-xs outline-none resize-none" />
            </div>
            {isPreviewMode && (
                <div className="sm:col-span-2 flex justify-end">
                    <button onClick={() => setIsExpanded(false)} className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800">
                        <Check size={13} /> Done
                    </button>
                </div>
            )}
        </div>
    );

    if (!isPreviewMode) return editForm;

    return (
        <>
            {/* Preview pills row */}
            {(authors || year || venue || url || bibtex) && (
                <div className="flex flex-wrap gap-2 items-center text-xs mt-1">
                    {authors && <div className="px-2.5 py-1.5 bg-gray-50 text-gray-600 border border-gray-100 rounded-full flex gap-1.5 font-medium items-center"><Users size={12} /> {authors}</div>}
                    {year && <div className="px-2.5 py-1.5 bg-gray-50 text-gray-600 border border-gray-100 rounded-full flex gap-1.5 font-medium items-center"><Calendar size={12} /> {year}</div>}
                    {venue && <div className="px-2.5 py-1.5 bg-gray-50 text-gray-600 border border-gray-100 rounded-full flex gap-1.5 font-medium items-center"><MapPin size={12} /> {venue}</div>}
                    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 transition-colors rounded-full flex gap-1.5 font-medium items-center"><ExternalLink size={12} /> Source</a>}
                    {bibtex && <button onClick={() => navigator.clipboard.writeText(bibtex)} className="px-2.5 py-1.5 bg-slate-800 text-emerald-400 hover:bg-slate-700 transition-colors border border-slate-700 rounded-full flex gap-1.5 font-medium items-center"><Copy size={12} /> Copy BibTeX</button>}
                    {!readOnly && !isExpanded && (
                        <button onClick={() => setIsExpanded(true)} className="px-2.5 py-1.5 text-gray-400 hover:text-indigo-600 border border-dashed border-gray-200 hover:border-indigo-300 rounded-full flex gap-1.5 items-center transition-colors">
                            <Pencil size={11} /> Edit
                        </button>
                    )}
                </div>
            )}

            {/* Inline edit form when expanded in preview mode */}
            {isExpanded && editForm}
        </>
    );
};

export default PaperMetadataForm;
