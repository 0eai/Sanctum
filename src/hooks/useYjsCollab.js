// src/hooks/useYjsCollab.js
// Manages a Y.Doc lifecycle for shared documents.
// Returns stable refs; components should NOT read .current during render.
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { createYjsProvider } from '../services/yjsCollab';

export const useYjsCollab = ({ shareId, docKey, uid, enabled, field = 'content' }) => {
    const ydocRef     = useRef(null);
    const ytextRef    = useRef(null);
    const providerRef = useRef(null);
    const unsubRef    = useRef(null);

    useEffect(() => {
        if (!enabled || !shareId || !docKey || !uid) return;

        const ydoc  = new Y.Doc();
        const ytext = ydoc.getText(field);
        ydocRef.current  = ydoc;
        ytextRef.current = ytext;

        const provider = createYjsProvider(ydoc, shareId, docKey, uid);
        providerRef.current = provider;
        provider.init().then(unsub => { unsubRef.current = unsub; });

        return () => {
            provider.destroy();
            unsubRef.current?.();
            ydoc.destroy();
            ydocRef.current   = null;
            ytextRef.current  = null;
            providerRef.current = null;
            unsubRef.current  = null;
        };
    }, [enabled, shareId, docKey, uid]);

    return { ydocRef, ytextRef };
};
