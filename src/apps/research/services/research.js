import {
    collection, doc, setDoc, onSnapshot, deleteDoc, serverTimestamp,
    addDoc, updateDoc, writeBatch, increment, deleteField
} from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { encryptData, decryptData } from '../../../lib/crypto';

// @citation-js/core has internal circular ESM dependencies that cause a TDZ crash
// in Rollup's production build. Load it lazily so it is imported after all module
// initializers have completed, avoiding the initialization-order issue.
let _Cite = null;
const loadCite = async () => {
    if (_Cite) return _Cite;
    await import('@citation-js/plugin-bibtex');
    const { Cite } = await import('@citation-js/core');
    _Cite = Cite;
    return _Cite;
};

// --- Workspace Context Helper ---
const getResearchCol = (userId, ctx) =>
    ctx?.workspaceId
        ? collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'research')
        : collection(db, 'artifacts', appId, 'users', userId, 'research');

const getResearchDoc = (userId, docId, ctx) =>
    ctx?.workspaceId
        ? doc(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'research', docId)
        : doc(db, 'artifacts', appId, 'users', userId, 'research', docId);

const getKey = (cryptoKey, ctx) => ctx?.key || cryptoKey;

// --- Decrypt Helper ---
// Handles both new field-level format (encryptedTitle, …) and legacy single-blob format.
const decryptPaperDoc = async (raw, key) => {
    if (raw.encryptedTitle !== undefined || raw.encryptedContent !== undefined) {
        const title = raw.encryptedTitle
            ? await decryptData(raw.encryptedTitle, key).catch(() => '') : '';
        if (raw.type === 'folder') return { title };
        const [aiSummary, tags, meta] = await Promise.all([
            raw.encryptedContent ? decryptData(raw.encryptedContent, key).catch(() => null) : null,
            raw.encryptedTags ? decryptData(raw.encryptedTags, key).catch(() => []) : [],
            raw.encryptedMeta ? decryptData(raw.encryptedMeta, key).catch(() => ({})) : {},
        ]);
        return { title, aiSummary, tags, ...(meta || {}) };
    }
    return decryptData(raw, key); // Legacy single-blob
};

export const listenToPapers = (userId, cryptoKey, callback, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const q = getResearchCol(userId, ctx);
    return onSnapshot(q, async (snapshot) => {
        const decrypted = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const raw = docSnap.data();
            try {
                const data = await decryptPaperDoc(raw, key);
                // Strip encrypted blobs from the spread so they don't pollute app state
                const { encryptedTitle: _et, encryptedContent: _ec, encryptedTags: _etg,
                        encryptedMeta: _em, data: _d, iv: _iv, ...rawMeta } = raw;
                return {
                    id: docSnap.id,
                    ...rawMeta,
                    ...(data || {}),
                    type: raw.type || 'paper',
                    parentId: raw.parentId || null,
                    pdfHash: data?.pdfHash || null
                };
            } catch (error) {
                console.warn('Failed to decrypt paper', docSnap.id, error.message || error);
                return {
                    id: docSnap.id,
                    title: 'Encrypted Data (Decryption Failed)',
                    type: raw.type || 'paper',
                    parentId: raw.parentId || null,
                    pdfHash: null
                };
            }
        }));

        decrypted.sort((a, b) => {
            const timeA = a.type === 'folder' ? a.updatedAt?.toMillis?.() || 0 : new Date(a.addedAt || 0).getTime();
            const timeB = b.type === 'folder' ? b.updatedAt?.toMillis?.() || 0 : new Date(b.addedAt || 0).getTime();
            return timeB - timeA;
        });

        callback(decrypted);
    });
};

export const savePaper = async (userId, cryptoKey, paper, parentId = null, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const paperRef = paper.id
        ? getResearchDoc(userId, paper.id, ctx)
        : doc(getResearchCol(userId, ctx));

    const [encryptedTitle, encryptedContent, encryptedTags, encryptedMeta] = await Promise.all([
        encryptData(paper.title || '', key),
        encryptData(paper.aiSummary || null, key),
        encryptData(paper.tags || [], key),
        encryptData({
            authors: paper.authors || '',
            year: paper.year || '',
            venue: paper.venue || '',
            url: paper.url || '',
            bibtex: paper.bibtex || '',
            isPrivate: paper.isPrivate || false,
            hasPdf: paper.hasPdf || false,
            pdfPath: paper.pdfPath || null,
            pdfWrappingKey: paper.pdfWrappingKey || null,
            pdfHash: paper.pdfHash || null,
            driveFileId: paper.driveFileId || null,
            isEncrypted: paper.isEncrypted || false,
            addedAt: paper.addedAt || new Date().toISOString(),
            sharedId: paper.sharedId || null,
            shareUrlKey: paper.shareUrlKey || null,
            collabShareId: paper.collabShareId || null,
            status: paper.status || null,
            markdownIds: paper.markdownIds || []
        }, key),
    ]);

    const fieldData = { encryptedTitle, encryptedContent, encryptedTags, encryptedMeta };

    const meta = {
        type: 'paper',
        parentId: paper.parentId || parentId || null,
        isPinned: paper.isPinned || false,
        updatedAt: serverTimestamp(),
        versionId: increment(1)
    };

    if (!paper.id) {
        meta.createdAt = serverTimestamp();
    }

    await setDoc(paperRef, {
        ...fieldData, ...meta,
        data: deleteField(), iv: deleteField() // clear legacy single-blob fields
    }, { merge: true });
    return paperRef.id;
};

export const createFolder = async (userId, cryptoKey, title, parentId, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const encryptedTitle = await encryptData(title, key);
    await addDoc(getResearchCol(userId, ctx), {
        encryptedTitle,
        type: 'folder',
        parentId: parentId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
};

export const updateFolder = async (userId, cryptoKey, folderId, title, parentId = undefined, ctx = null) => {
    const key = getKey(cryptoKey, ctx);
    const encryptedTitle = await encryptData(title, key);
    const update = {
        encryptedTitle, updatedAt: serverTimestamp(),
        data: deleteField(), iv: deleteField()
    };
    if (parentId !== undefined) update.parentId = parentId;
    await updateDoc(getResearchDoc(userId, folderId, ctx), update);
};

export const deletePaper = async (userId, paperId, isFolder = false, allItems = [], ctx = null) => {
    if (isFolder) {
        const batch = writeBatch(db);
        const children = allItems.filter(i => i.parentId === paperId);
        children.forEach(c => batch.delete(getResearchDoc(userId, c.id, ctx)));
        batch.delete(getResearchDoc(userId, paperId, ctx));
        await batch.commit();
    } else {
        await deleteDoc(getResearchDoc(userId, paperId, ctx));
    }
};

// --- BibTeX & Citation Handling ---

const cslEntryToFields = (data) => {
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
};

export const parseBibTeX = async (bibtexString) => {
    const Cite = await loadCite();
    try {
        const cite = new Cite(bibtexString);
        const data = cite.data[0];
        if (!data) return null;
        return cslEntryToFields(data);
    } catch (e) {
        console.error("Failed to parse BibTeX", e);
        return null;
    }
};

/**
 * Parse a multi-entry BibTeX file and return an array of paper field objects.
 * Each entry also carries a `bibtex` field containing its raw source text.
 */
export const parseMultiBibTeX = async (bibtexString) => {
    const Cite = await loadCite();
    try {
        const cite = new Cite(bibtexString);
        if (!cite.data.length) return [];

        return cite.data.map((data) => {
            const fields = cslEntryToFields(data);
            let rawBibtex = '';
            try {
                rawBibtex = new Cite(data).format('bibtex');
            } catch (_) { /* skip raw bibtex if re-serialisation fails */ }
            return { ...fields, bibtex: rawBibtex };
        });
    } catch (e) {
        console.error("Failed to parse multi-entry BibTeX", e);
        return [];
    }
};

export const formatCitation = async (paper, style) => {
    const Cite = await loadCite();

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
            case 'IEEE': {
                const d = cite.data?.[0] || {};
                const authors = (d.author || []).map(a => {
                    if (!a.family) return (a.literal || '').trim();
                    const initials = (a.given || '').split(/\s+/).filter(Boolean).map(p => p[0] + '.').join(' ');
                    return `${initials} ${a.family}`.trim();
                }).join(', ');
                const year = d.issued?.['date-parts']?.[0]?.[0] || '';
                const title = d.title || '';
                const venue = d['container-title'] || '';
                return [authors, `"${title},"`, venue, year ? year + '.' : ''].filter(Boolean).join(' ');
            }
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
