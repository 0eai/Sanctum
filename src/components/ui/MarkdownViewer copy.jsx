import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders Markdown content with GitHub Flavored Markdown support.
 * styling is applied via Tailwind typography utility classes (prose).
 */
const MarkdownViewer = ({ content, className = "" }) => {
  if (!content) return <p className="text-gray-400 italic">No content.</p>;

  return (
    <div className={`prose prose-sm md:prose-base prose-blue max-w-none text-gray-800 break-words ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom overrides for specific elements if needed
          a: ({node, ...props}) => <a {...props} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" />,
          code: ({node, inline, className, children, ...props}) => {
            return inline ? (
              <code className="bg-gray-100 text-red-500 px-1 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
            ) : (
              <div className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto my-2 text-sm font-mono">
                <code {...props}>{children}</code>
              </div>
            )
          },
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600" {...props} />,
          table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="min-w-full divide-y divide-gray-200 border" {...props} /></div>,
          th: ({node, ...props}) => <th className="bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border" {...props} />,
          td: ({node, ...props}) => <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 border" {...props} />,
          img: ({node, ...props}) => <img {...props} className="rounded-lg shadow-sm max-h-96 object-contain" alt={props.alt || ''} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownViewer;