import React from 'react';
import { Cpu } from 'lucide-react';
import MarkdownViewer from '../../../components/ui/MarkdownViewer';

const PaperAiSection = ({ isPrivate, aiSummary }) => (
    <div className="mt-8 border-t border-gray-100 pt-8">
        <h2 className="text-base font-semibold text-indigo-900 flex items-center gap-2 mb-4">
            <Cpu size={18} className="text-indigo-600" />
            AI Review
        </h2>

        {isPrivate ? (
            <div className="text-sm text-rose-800 p-4 bg-rose-50 rounded-lg">
                AI processing is disabled for private drafts to ensure zero-knowledge local encryption.
            </div>
        ) : typeof aiSummary === 'string' ? (
            <div className="space-y-4">
                <div className="text-sm text-gray-800 leading-relaxed prose prose-indigo max-w-none">
                    <MarkdownViewer content={aiSummary} />
                </div>
            </div>
        ) : (
            <div className="text-sm text-gray-500 text-center py-10 italic">
                No AI analysis generated yet. Upload a PDF and generate insights using the Meta bar.
            </div>
        )}
    </div>
);

export default PaperAiSection;
