// src/apps/markdown/components/WysiwygEditor.jsx
// Rich-text WYSIWYG editor powered by TipTap v3.
// Storage format is always Markdown (tiptap-markdown handles serialization).
// When `ydoc` prop is provided, Y.js Collaboration extension takes over as
// source of truth — content prop and onChange are ignored.
import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Link from '@tiptap/extension-link';
import Collaboration from '@tiptap/extension-collaboration';

// Toolbar button inside the editor surface
const Btn = ({ onClick, active, title, children }) => (
    <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        title={title}
        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
        }`}
    >
        {children}
    </button>
);

// `ydoc` — optional Y.Doc; when provided, Collaboration extension owns the content.
const WysiwygEditor = ({ content, onChange, readOnly = false, className = '', ydoc = null }) => {
    const editor = useEditor({
        extensions: [
            // Disable built-in history when Y.js UndoManager handles it
            StarterKit.configure({ history: !ydoc }),
            Markdown.configure({ html: false, tightLists: true }),
            Link.configure({ openOnClick: false }),
            ...(ydoc ? [Collaboration.configure({ document: ydoc })] : []),
        ],
        // When CRDT active, Y.js is source of truth — do not seed from content prop
        content: ydoc ? undefined : (content || ''),
        editable: !readOnly,
        onUpdate: ({ editor: e }) => {
            // In CRDT mode, Y.js propagates changes — no need to call onChange
            if (!ydoc) onChange(e.storage.markdown.getMarkdown());
        },
    });

    // Sync external content changes in non-CRDT mode only.
    // Pass `false` to setContent so the update event is not emitted → no onChange loop.
    useEffect(() => {
        if (ydoc || !editor || editor.isDestroyed) return;
        const current = editor.storage.markdown.getMarkdown();
        if (current !== (content || '')) {
            editor.commands.setContent(content || '', false);
        }
    }, [content, editor, ydoc]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        editor.setEditable(!readOnly);
    }, [readOnly, editor]);

    return (
        <>
            <style>{`
                .wysiwyg-surface .ProseMirror {
                    outline: none;
                    min-height: 60vh;
                    padding: 0.25rem 0 8rem;
                }
                .wysiwyg-surface .ProseMirror p.is-empty:first-child::before {
                    content: "Start writing…";
                    color: #d1d5db;
                    pointer-events: none;
                    float: left;
                    height: 0;
                }
            `}</style>

            <div className={`flex flex-col gap-2 ${className}`}>
                {/* Formatting toolbar — hidden when readOnly */}
                {!readOnly && editor && (
                    <div className="flex items-center gap-0.5 border-b border-gray-100 pb-2 flex-wrap">
                        <Btn
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            active={editor.isActive('bold')}
                            title="Bold"
                        ><strong>B</strong></Btn>
                        <Btn
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            active={editor.isActive('italic')}
                            title="Italic"
                        ><em>I</em></Btn>
                        <div className="w-px h-4 bg-gray-200 mx-0.5" />
                        <Btn
                            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                            active={editor.isActive('heading', { level: 1 })}
                            title="Heading 1"
                        >H1</Btn>
                        <Btn
                            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                            active={editor.isActive('heading', { level: 2 })}
                            title="Heading 2"
                        >H2</Btn>
                        <Btn
                            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                            active={editor.isActive('heading', { level: 3 })}
                            title="Heading 3"
                        >H3</Btn>
                        <div className="w-px h-4 bg-gray-200 mx-0.5" />
                        <Btn
                            onClick={() => editor.chain().focus().toggleCode().run()}
                            active={editor.isActive('code')}
                            title="Inline code"
                        ><code className="font-mono">{'{}'}</code></Btn>
                        <Btn
                            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                            active={editor.isActive('codeBlock')}
                            title="Code block"
                        ><code className="font-mono text-[10px]">{'```'}</code></Btn>
                        <Btn
                            onClick={() => editor.chain().focus().toggleBlockquote().run()}
                            active={editor.isActive('blockquote')}
                            title="Blockquote"
                        >"</Btn>
                        <div className="w-px h-4 bg-gray-200 mx-0.5" />
                        <Btn
                            onClick={() => editor.chain().focus().toggleBulletList().run()}
                            active={editor.isActive('bulletList')}
                            title="Bullet list"
                        >• —</Btn>
                        <Btn
                            onClick={() => editor.chain().focus().toggleOrderedList().run()}
                            active={editor.isActive('orderedList')}
                            title="Numbered list"
                        >1.</Btn>
                        <div className="w-px h-4 bg-gray-200 mx-0.5" />
                        <Btn
                            onClick={() => {
                                const href = window.prompt('URL');
                                if (href) editor.chain().focus().setLink({ href }).run();
                            }}
                            active={editor.isActive('link')}
                            title="Link"
                        >🔗</Btn>
                        <Btn
                            onClick={() => editor.chain().focus().setHorizontalRule().run()}
                            active={false}
                            title="Horizontal rule"
                        >—</Btn>
                    </div>
                )}

                {/* Editor surface */}
                <div className="wysiwyg-surface prose prose-slate max-w-none flex-1">
                    <EditorContent editor={editor} />
                </div>
            </div>
        </>
    );
};

export default WysiwygEditor;
