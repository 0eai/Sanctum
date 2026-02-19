import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

const MarkdownViewer = ({ content }) => {
  if (!content) {
    return <div className="text-gray-300 italic p-4">Nothing to preview...</div>;
  }

  function makeListsLoose(md) {
    // Split by fenced blocks so we don't modify inside ```...```
    const parts = md.split(/(```[\s\S]*?```)/g);
    return parts
      .map((p) => (p.startsWith("```") ? p : p.replace(/(\n)([*-] )/g, "\n\n$2")))
      .join("");
  }

  const safeContent = typeof content === "string" ? makeListsLoose(content) : "";

  return (
    <>
      <style>{`
        /* Inline code pill */
        :not(pre) > code.md-code {
          background-color: #f3f4f6;
          color: #db2777;
          padding: 2px 5px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.9em;
          border: 1px solid #e5e7eb;
        }

        /* Block code reset */
        pre > code.md-code {
          background-color: transparent;
          color: inherit;
          padding: 0;
          border: none;
          font-size: 1em;
        }

        /* KaTeX overflow handling */
        .katex-display {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 0.25rem 0;
        }
      `}</style>

      <article className="prose prose-slate max-w-none break-words text-gray-800">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1: ({ node, ...props }) => (
              <h1 className="text-3xl font-bold pb-2 border-b border-gray-200 mt-8 mb-4 text-gray-900" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-2xl font-bold pb-2 border-b border-gray-200 mt-6 mb-3 text-gray-900" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-xl font-bold mt-4 mb-2 text-gray-900" {...props} />
            ),

            a: ({ node, ...props }) => (
              <a className="text-blue-600 hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />
            ),

            ul: ({ node, ...props }) => <ul className="list-disc list-outside my-3 space-y-1 pl-5" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal list-outside my-3 space-y-1 pl-5" {...props} />,
            li: ({ node, ...props }) => <li className="marker:text-gray-500 pl-1" {...props} />,

            pre: ({ node, ...props }) => (
              <pre className="bg-[#0d1117] text-gray-100 p-4 rounded-lg my-4 overflow-x-auto border border-gray-700/50" {...props} />
            ),

            code({ node, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");

              if (match) {
                return (
                  <div className="rounded-lg overflow-hidden my-4 shadow-sm border border-gray-700/50">
                    <SyntaxHighlighter
                      {...props}
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{ margin: 0, padding: "1.25rem", backgroundColor: "#0d1117" }}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  </div>
                );
              }

              return (
                <code className={`md-code ${className || ""}`} {...props}>
                  {children}
                </code>
              );
            },

            blockquote: ({ node, ...props }) => (
              <blockquote className="border-l-4 border-gray-300 pl-4 py-1 my-4 italic text-gray-600" {...props} />
            ),
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-6 border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200" {...props} />
              </div>
            ),
            th: ({ node, ...props }) => (
              <th className="bg-gray-50 px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b" {...props} />
            ),
            td: ({ node, ...props }) => (
              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 border-b last:border-0" {...props} />
            ),
            img: ({ node, ...props }) => (
              <img className="rounded-lg shadow-md border border-gray-200 max-h-[500px] mx-auto my-4" {...props} />
            ),
          }}
        >
          {safeContent}
        </ReactMarkdown>
      </article>
    </>
  );
};

export default MarkdownViewer;