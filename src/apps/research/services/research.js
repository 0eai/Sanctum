import { collection, doc, setDoc, getDocs, onSnapshot, deleteDoc, serverTimestamp, addDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { encryptData, decryptData } from '../../../lib/crypto';
import '@citation-js/plugin-bibtex';
import { Cite } from '@citation-js/core';

export const listenToPapers = (userId, cryptoKey, callback) => {
    const q = collection(db, 'artifacts', appId, 'users', userId, 'research');
    return onSnapshot(q, async (snapshot) => {
        const decrypted = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const raw = docSnap.data();
            try {
                const data = await decryptData(raw, cryptoKey);
                return {
                    id: docSnap.id,
                    ...raw, // mixin unencrypted like type, parentId, createdAt, updatedAt
                    ...data,
                    type: raw.type || 'paper',
                    parentId: raw.parentId || null,
                    pdfHash: data.pdfHash || null
                };
            } catch (error) {
                console.error('Failed to decrypt paper', docSnap.id, error);
                return { id: docSnap.id, title: 'Encrypted Data (Decryption Failed)', type: raw.type || 'paper', parentId: raw.parentId || null };
            }
        }));

        // Sort descending by when they were added/updated
        decrypted.sort((a, b) => {
            const timeA = a.type === 'folder' ? a.updatedAt?.toMillis?.() || 0 : new Date(a.addedAt || 0).getTime();
            const timeB = b.type === 'folder' ? b.updatedAt?.toMillis?.() || 0 : new Date(b.addedAt || 0).getTime();
            return timeB - timeA;
        });

        callback(decrypted);
    });
};

export const savePaper = async (userId, cryptoKey, paper, parentId = null) => {
    const paperRef = paper.id
        ? doc(db, 'artifacts', appId, 'users', userId, 'research', paper.id)
        : doc(collection(db, 'artifacts', appId, 'users', userId, 'research'));

    const payload = {
        title: paper.title || '',
        authors: paper.authors || '',
        year: paper.year || '',
        venue: paper.venue || '',
        url: paper.url || '',
        bibtex: paper.bibtex || '',
        isPrivate: paper.isPrivate || false,
        hasPdf: paper.hasPdf || false,
        pdfPath: paper.pdfPath || null,
        pdfWrappingKey: paper.pdfWrappingKey || null, // AES-GCM local wrapping key
        pdfHash: paper.pdfHash || null, // Deduplication SHA-256 hash
        driveFileId: paper.driveFileId || null,
        isEncrypted: paper.isEncrypted || false,
        aiSummary: paper.aiSummary || null, // Contains { summary, architectures, metrics, datasets }
        tags: paper.tags || [],
        addedAt: paper.addedAt || new Date().toISOString()
    };

    const encrypted = await encryptData(payload, cryptoKey);
    const meta = {
        type: 'paper',
        parentId: paper.parentId || parentId || null,
        updatedAt: serverTimestamp()
    };

    if (!paper.id) {
        meta.createdAt = serverTimestamp();
    }

    await setDoc(paperRef, { ...encrypted, ...meta }, { merge: true });
    return paperRef.id;
};

export const createFolder = async (userId, cryptoKey, title, parentId) => {
    const encrypted = await encryptData({ title }, cryptoKey);
    await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'research'), {
        ...encrypted,
        type: 'folder',
        parentId: parentId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
};

export const updateFolder = async (userId, cryptoKey, folderId, title, parentId = undefined) => {
    const encrypted = await encryptData({ title }, cryptoKey);
    const update = { ...encrypted, updatedAt: serverTimestamp() };
    if (parentId !== undefined) update.parentId = parentId;
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'research', folderId), update);
};

export const deletePaper = async (userId, paperId, isFolder = false, allItems = []) => {
    if (isFolder) {
        // Recursive delete for folder contents
        const batch = writeBatch(db);
        const children = allItems.filter(i => i.parentId === paperId);
        children.forEach(c => batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'research', c.id)));
        batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'research', paperId));
        await batch.commit();
    } else {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'research', paperId));
    }
};

// --- BibTeX & Citation Handling ---

export const parseBibTeX = (bibtexString) => {
    try {
        const cite = new Cite(bibtexString);
        const data = cite.data[0];
        if (!data) return null;

        // Extract clean authors
        let authorsString = '';
        if (data.author && Array.isArray(data.author)) {
            authorsString = data.author.map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', ');
        }

        return {
            title: data.title || '',
            authors: authorsString,
            year: data.issued ? data.issued['date-parts']?.[0]?.[0]?.toString() : '',
            venue: data['container-title'] || data.publisher || '',
            url: data.URL || (data.DOI ? `https://doi.org/${data.DOI}` : '')
        };
    } catch (e) {
        console.error("Failed to parse BibTeX", e);
        return null; // Silent fail if invalid bibtex
    }
};

export const formatCitation = (paper, style) => {
    // We rely on the raw bibtex field if it exists to generate high fidelity citations.
    // If it doesn't exist, we must build a faux CSL-JSON object.

    let cite;
    if (paper.bibtex) {
        try {
            cite = new Cite(paper.bibtex);
        } catch { /* Fallback below */ }
    }

    if (!cite) {
        const fauxData = {
            id: 'item1',
            type: 'article-journal',
            title: paper.title,
            author: (paper.authors || '').split(',').map(a => {
                const parts = a.trim().split(' ');
                return { family: parts.pop(), given: parts.join(' ') };
            }),
            issued: { 'date-parts': [[parseInt(paper.year) || new Date().getFullYear()]] },
            'container-title': paper.venue || '',
            URL: paper.url || ''
        };
        cite = new Cite(fauxData);
    }

    try {
        switch (style) {
            case 'APA':
                return cite.format('bibliography', { format: 'text', template: 'apa', lang: 'en-US' }).trim();
            case 'IEEE':
                // Note: Citation.js natively supports generic harvard/vancouver styles easily,
                // full IEEE requires specific CSL files, but we'll use a close approximation if IEEE is missing.
                return cite.format('bibliography', { format: 'text', template: 'vancouver', lang: 'en-US' }).trim();
            case 'MLA':
                return cite.format('bibliography', { format: 'text', template: 'mla', lang: 'en-US' }).trim();
            case 'BibTeX':
            default:
                return cite.format('bibtex');
        }
    } catch (e) {
        console.error("Citation format error:", e);
        return "Error formatting citation. Please check metadata.";
    }
};
