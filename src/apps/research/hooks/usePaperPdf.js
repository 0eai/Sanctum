// src/apps/research/hooks/usePaperPdf.js
import { useState } from 'react';
import {
    uploadEncryptedFile as uploadToFirebase,
    downloadEncryptedFileBlob as downloadBlobFirebase,
    uploadNormalFile as uploadNormalFirebase,
    downloadNormalFileBlob as downloadNormalBlobFirebase,
} from '../../../services/firebaseStorage';

/**
 * Manages PDF upload, storage, and download for a research paper.
 * pdfBlob holds the raw decrypted Blob (not a blob URL) so FileViewer can
 * pass it directly to PDF.js without a fetch() call that would violate connect-src CSP.
 */
const usePaperPdf = ({ paper, cryptoKey, user, papers, internalPaperId }) => {
    const [hasPdf, setHasPdf] = useState(paper?.hasPdf || false);
    const [pdfHash, setPdfHash] = useState(paper?.pdfHash || null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [driveFileId, setDriveFileId] = useState(paper?.driveFileId || null);
    const [isEncrypted, setIsEncrypted] = useState(paper?.isEncrypted ?? false);
    const [tempPdfPath, setTempPdfPath] = useState(paper?.pdfPath || null);
    const [tempWrappingKey] = useState(paper?.pdfWrappingKey || null);
    const [pdfBlob, setPdfBlob] = useState(null); // raw Blob, not a blob URL
    const [isDecrypting, setIsDecrypting] = useState(false);

    const handlePdfUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || file.type !== 'application/pdf') return;

        if (file.size > 50 * 1024 * 1024) {
            alert("File is too large. Maximum size is 50MB.");
            e.target.value = null;
            return;
        }

        setIsUploading(true);
        setUploadProgress('Checking for duplicates...');

        try {
            const { default: SparkMD5 } = await import('spark-md5');
            const arrayBuffer = await file.arrayBuffer();
            const hash = SparkMD5.ArrayBuffer.hash(arrayBuffer);

            const existingPaper = papers?.find(p => p?.pdfHash === hash && p?.id !== internalPaperId);
            if (existingPaper) {
                const proceed = window.confirm(`A PDF with the same content already exists in your library (in "${existingPaper.title || 'Untitled Paper'}"). Upload anyway?`);
                if (!proceed) {
                    setIsUploading(false);
                    setUploadProgress('');
                    return;
                }
            }

            setPdfHash(hash);
            setUploadProgress('Encrypting and uploading...');

            const collabId = paper.collabShareId || paper.sharedId;
            const scope = collabId
                ? `shared_docs/${collabId}`
                : (paper.workspaceId ? `workspaces/${paper.workspaceId}/research` : `users/${user.uid}/research`);

            let fileId;
            if (isEncrypted || paper?.isPrivate) {
                const res = await uploadToFirebase(file, cryptoKey, null, scope);
                fileId = res.id;
            } else {
                fileId = await uploadNormalFirebase(file, cryptoKey, null, scope);
            }

            setDriveFileId(fileId);
            setHasPdf(true);
            setUploadProgress('');

            return file.name;
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Upload failed. Please try again.');
        }

        setIsUploading(false);
    };

    const handleReadPdf = async () => {
        if (pdfBlob) return; // already loaded
        setIsDecrypting(true);
        try {
            const fileKey = (paper?.isSharedDoc && paper?.docKey) ? paper.docKey : cryptoKey;
            let blob;
            if (driveFileId) {
                if (paper?.isEncrypted || paper?.isPrivate || paper?.isSharedDoc) {
                    blob = await downloadBlobFirebase(driveFileId, fileKey, null, 'research');
                } else {
                    blob = await downloadNormalBlobFirebase(driveFileId, fileKey, null, 'research');
                }
            } else if (tempPdfPath) {
                blob = await downloadBlobFirebase(tempPdfPath, fileKey, null, 'research');
            }

            if (blob) {
                // Store as plain Blob with correct MIME type — no blob URL created here.
                // FileViewer passes this directly to PDF.js (.arrayBuffer()) without fetch().
                const pdfMimeBlob = blob.type === 'application/pdf'
                    ? blob
                    : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' });
                setPdfBlob(pdfMimeBlob);
            }
        } catch (error) {
            console.error('Failed to decrypt PDF:', error);
            alert('Failed to decrypt PDF.');
        }
        setIsDecrypting(false);
    };

    return {
        hasPdf, setHasPdf,
        pdfHash,
        isUploading,
        uploadProgress,
        driveFileId, setDriveFileId,
        isEncrypted, setIsEncrypted,
        tempPdfPath, setTempPdfPath,
        tempWrappingKey,
        pdfBlob, setPdfBlob,
        isDecrypting,
        handlePdfUpload,
        handleReadPdf,
    };
};

export default usePaperPdf;
