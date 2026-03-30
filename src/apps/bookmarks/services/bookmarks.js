import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  updateDoc, doc, deleteDoc, writeBatch
} from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { encryptData, decryptData } from '../../../lib/crypto';
import { normalizeUrl } from '../../../lib/bookmarkUtils';

// --- Workspace Context Helper ---
const getBmCol = (userId, ctx) =>
  ctx?.workspaceId
    ? collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'bookmarks')
    : collection(db, 'artifacts', appId, 'users', userId, 'bookmarks');

const getBmDoc = (userId, docId, ctx) =>
  ctx?.workspaceId
    ? doc(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'bookmarks', docId)
    : doc(db, 'artifacts', appId, 'users', userId, 'bookmarks', docId);

const getKey = (cryptoKey, ctx) => ctx?.key || cryptoKey;

// --- Listeners ---

export const listenToBookmarks = (userId, cryptoKey, callback, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  const q = query(
    getBmCol(userId, ctx),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, async (snapshot) => {
    const data = await Promise.all(snapshot.docs.map(async doc => {
      const raw = doc.data();
      try {
        const decrypted = await decryptData(raw, key);
        return {
          id: doc.id,
          ...raw,
          ...(decrypted || {}),
          type: raw.type || 'bookmark',
          parentId: raw.parentId || null
        };
      } catch (error) {
        console.warn('Failed to decrypt bookmark doc', doc.id, error.message || error);
        return {
          id: doc.id,
          title: 'Encrypted Data (Decryption Failed)',
          url: '',
          type: raw.type || 'bookmark',
          parentId: raw.parentId || null
        };
      }
    }));
    callback(data);
  });
};

// --- Actions ---

export const saveBookmarkItem = async (userId, cryptoKey, itemData, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  const payload = {
    title: itemData.title,
    type: itemData.type,
    sharedId: itemData.sharedId || null,
    shareUrlKey: itemData.shareUrlKey || null,
    collabShareId: itemData.collabShareId || null
  };
  payload.parentId = itemData.parentId;

  if (itemData.type === 'bookmark') payload.url = normalizeUrl(itemData.url);

  const encrypted = await encryptData(payload, key);

  if (itemData.id) {
    await updateDoc(getBmDoc(userId, itemData.id, ctx), {
      ...encrypted,
      updatedAt: serverTimestamp()
    });
  } else {
    await addDoc(getBmCol(userId, ctx), {
      ...encrypted,
      type: itemData.type,
      parentId: itemData.parentId,
      createdAt: serverTimestamp()
    });
  }
};

export const deleteBookmarkItem = async (userId, item, allItems, ctx = null) => {
  if (item.type === 'folder') {
    const batch = writeBatch(db);
    const children = allItems.filter(i => i.parentId === item.id);
    children.forEach(child => {
      batch.delete(getBmDoc(userId, child.id, ctx));
    });
    batch.delete(getBmDoc(userId, item.id, ctx));
    await batch.commit();
  } else {
    await deleteDoc(getBmDoc(userId, item.id, ctx));
  }
};

// --- Import Logic ---

export const importBookmarksFromHtml = async (userId, cryptoKey, rootElement, currentFolderId) => {
  const batchSize = 400;
  let currentBatch = writeBatch(db);
  let opCount = 0;

  // Fetch existing bookmarks for deduplication
  const existingColRef = collection(db, 'artifacts', appId, 'users', userId, 'bookmarks');
  const existingSnap = await getDocs(existingColRef);
  const existingFingerprints = new Set();

  for (const d of existingSnap.docs) {
    try {
      const decrypted = await decryptData(d.data(), cryptoKey);
      if (decrypted) {
        const fingerprint = `${decrypted.url || ''}|${decrypted.title || ''}`;
        existingFingerprints.add(fingerprint);
      }
    } catch (e) {
      // Ignore decryption errors
    }
  }

  const traverse = async (element, parentId) => {
    const nodes = Array.from(element.children);

    for (let node of nodes) {
      if (node.tagName === 'DT') {
        const h3 = node.querySelector('h3');
        const a = node.querySelector('a');
        let dl = node.querySelector('dl');

        if (h3) {
          // Folder
          const title = h3.textContent;
          const encrypted = await encryptData({ title, parentId, type: 'folder' }, cryptoKey);
          const ref = doc(collection(db, 'artifacts', appId, 'users', userId, 'bookmarks'));
          currentBatch.set(ref, { ...encrypted, type: 'folder', parentId, createdAt: serverTimestamp() });
          opCount++;
          if (opCount >= batchSize) { await currentBatch.commit(); currentBatch = writeBatch(db); opCount = 0; }

          if (!dl && node.nextElementSibling?.tagName === 'DL') dl = node.nextElementSibling;
          if (dl) await traverse(dl, ref.id);
        } else if (a) {
          // Bookmark
          const title = a.textContent;
          const url = a.getAttribute('href');

          const fingerprint = `${normalizeUrl(url) || ''}|${title || ''}`;
          if (!existingFingerprints.has(fingerprint)) {
            existingFingerprints.add(fingerprint);

            const encrypted = await encryptData({ title, url: normalizeUrl(url), parentId, type: 'bookmark' }, cryptoKey);
            const ref = doc(collection(db, 'artifacts', appId, 'users', userId, 'bookmarks'));
            currentBatch.set(ref, { ...encrypted, type: 'bookmark', parentId, createdAt: serverTimestamp() });

            opCount++;
            if (opCount >= batchSize) { await currentBatch.commit(); currentBatch = writeBatch(db); opCount = 0; }
          }
        }
      }
    }
  };

  await traverse(rootElement, currentFolderId);
  if (opCount > 0) await currentBatch.commit();
};

// --- HTML Export (Netscape Bookmark Format) ---

export const exportBookmarksHtml = (bookmarks) => {
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten. DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>\n`;

  const buildTree = (items, parentId, indent) => {
    const children = items.filter(i => i.parentId === parentId);
    const pad = '    '.repeat(indent);
    children.forEach(item => {
      if (item.type === 'folder') {
        html += `${pad}<DT><H3>${escapeHtml(item.title || 'Untitled')}</H3>\n`;
        html += `${pad}<DL><p>\n`;
        buildTree(items, item.id, indent + 1);
        html += `${pad}</DL><p>\n`;
      } else {
        html += `${pad}<DT><A HREF="${escapeHtml(item.url || '')}">${escapeHtml(item.title || 'Untitled')}</A>\n`;
      }
    });
  };

  buildTree(bookmarks, null, 1);
  html += '</DL><p>\n';
  return html;
};

const escapeHtml = (str) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};