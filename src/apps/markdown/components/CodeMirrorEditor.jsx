// src/apps/markdown/components/CodeMirrorEditor.jsx
// Wraps CodeMirror 6 for use in MarkdownEditor. Mounts one CM view per component
// instance (destroyed on unmount). Exposes the live EditorView via forwardRef so
// the parent can dispatch format commands from toolbar buttons.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands';

// Shared CM theme — applied once, referenced by both editor instances
const cmTheme = EditorView.theme({
    '&': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '15px',
        height: '100%',
    },
    '.cm-content': {
        padding: '0',
        lineHeight: '1.75',
        caretColor: '#374151',
        paddingBottom: '8rem',
    },
    '.cm-focused': { outline: 'none' },
    '.cm-line': { padding: '0' },
    '.cm-scroller': { overflow: 'auto' },
    // Markdown syntax colours — minimal, readable
    '.tok-heading': { fontWeight: '700', color: '#111827' },
    '.tok-strong': { fontWeight: '700' },
    '.tok-emphasis': { fontStyle: 'italic' },
    '.tok-monospace': { fontFamily: 'ui-monospace, monospace', color: '#b91c1c', background: '#fef2f2', borderRadius: '2px', padding: '0 2px' },
    '.tok-link': { color: '#2563eb', textDecoration: 'underline' },
    '.tok-url': { color: '#2563eb' },
    '.tok-quote': { color: '#6b7280', fontStyle: 'italic' },
    '.tok-comment': { color: '#9ca3af' },
    '.tok-punctuation': { color: '#9ca3af' },
});

/**
 * CodeMirrorEditor
 *
 * Props:
 *   value      {string}   — controlled content; synced into CM when it changes externally
 *   onChange   {function} — called with the new string whenever the doc changes
 *   onShortcut {function} — called with a format type string (e.g. 'bold') for Ctrl+B/I/K
 *   readOnly   {boolean}
 *   className  {string}
 *
 * Ref API (useImperativeHandle):
 *   getView()  — returns the live EditorView (or null before mount)
 */
const CodeMirrorEditor = forwardRef(function CodeMirrorEditor(
    { value, onChange, onShortcut, readOnly = false, className = '' },
    ref
) {
    const containerRef = useRef(null);
    const viewRef = useRef(null);
    // Use refs for callbacks so the effect closure stays stable
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onShortcutRef = useRef(onShortcut);
    onShortcutRef.current = onShortcut;

    useImperativeHandle(ref, () => ({
        getView: () => viewRef.current,
    }));

    useEffect(() => {
        if (!containerRef.current) return;

        const view = new EditorView({
            state: EditorState.create({
                doc: value || '',
                extensions: [
                    history(),
                    keymap.of([
                        // Format shortcuts — delegate to parent's applyFormat via onShortcut
                        { key: 'Ctrl-b', mac: 'Cmd-b', run: () => { onShortcutRef.current?.('bold'); return true; } },
                        { key: 'Ctrl-i', mac: 'Cmd-i', run: () => { onShortcutRef.current?.('italic'); return true; } },
                        { key: 'Ctrl-k', mac: 'Cmd-k', run: () => { onShortcutRef.current?.('link'); return true; } },
                        ...defaultKeymap,
                        ...historyKeymap,
                        indentWithTab,
                    ]),
                    markdown(),
                    cmTheme,
                    EditorView.updateListener.of(update => {
                        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
                    }),
                    EditorView.editable.of(!readOnly),
                    EditorView.lineWrapping,
                ],
            }),
            parent: containerRef.current,
        });

        viewRef.current = view;
        return () => {
            view.destroy();
            viewRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally mount-once; value changes handled below

    // Sync externally-changed value into CM (e.g. loading a different document)
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        const current = view.state.doc.toString();
        if (current !== value) {
            view.dispatch({
                changes: { from: 0, to: current.length, insert: value || '' },
            });
        }
    }, [value]);

    return <div ref={containerRef} className={className} />;
});

export default CodeMirrorEditor;
