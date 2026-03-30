// src/apps/research/components/PdfThumbnail.jsx
// Renders a thumbnail of the first page of an encrypted PDF stored in Firebase Storage.
// pdfjs-dist is loaded dynamically inside useEffect so it is kept out of the main bundle.
import React, { useEffect, useRef, useState } from 'react';
import { downloadEncryptedFileBlob, downloadNormalFileBlob } from '../../../services/firebaseStorage';

let pdfjsLib = null;
const loadPdfjsLib = async () => {
    if (pdfjsLib) return pdfjsLib;
    const mod = await import('pdfjs-dist');
    mod.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).href;
    pdfjsLib = mod;
    return pdfjsLib;
};

const PdfThumbnail = ({ driveFileId, cryptoKey, isEncrypted, className = '' }) => {
    const [thumbnailUrl, setThumbnailUrl] = useState(null);

    useEffect(() => {
        if (!driveFileId || !cryptoKey) return;
        let cancelled = false;

        const render = async () => {
            try {
                const pdfjs = await loadPdfjsLib();

                const blob = isEncrypted
                    ? await downloadEncryptedFileBlob(driveFileId, cryptoKey, null, 'research')
                    : await downloadNormalFileBlob(driveFileId, cryptoKey, null, 'research');

                if (cancelled) return;

                const arrayBuffer = await blob.arrayBuffer();
                const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
                if (cancelled) { pdf.destroy(); return; }

                const page = await pdf.getPage(1);
                if (cancelled) { pdf.destroy(); return; }

                // Scale to 160px wide so the thumbnail fits in the card
                const baseViewport = page.getViewport({ scale: 1 });
                const scale = 160 / baseViewport.width;
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

                pdf.destroy();

                if (!cancelled) {
                    setThumbnailUrl(canvas.toDataURL('image/jpeg', 0.75));
                }
            } catch {
                // Silently skip if download/decrypt/render fails
            }
        };

        render();
        return () => { cancelled = true; };
    }, [driveFileId, cryptoKey, isEncrypted]);

    if (!thumbnailUrl) return null;

    return (
        <img
            src={thumbnailUrl}
            alt=""
            aria-hidden="true"
            className={className}
        />
    );
};

export default PdfThumbnail;
