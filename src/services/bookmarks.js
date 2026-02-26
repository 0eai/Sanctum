import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  updateDoc, doc, deleteDoc, writeBatch
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';
import { normalizeUrl } from '../lib/bookmarkUtils';

// --- Listeners ---

export const listenToBookmarks = (userId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'bookmarks'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, async (snapshot) => {
    const data = await Promise.all(snapshot.docs.map(async doc => {
      const raw = doc.data();
      const decrypted = await decryptData(raw, cryptoKey);
      return {
        id: doc.id,
        ...raw,
        ...decrypted,
        type: raw.type || 'bookmark',
        parentId: raw.parentId || null
      };
    }));
    callback(data);
  });
};

// --- Actions ---

export const saveBookmarkItem = async (userId, cryptoKey, itemData) => {
  const payload = { title: itemData.title, type: itemData.type };
  payload.parentId = itemData.parentId;

  if (itemData.type === 'bookmark') payload.url = normalizeUrl(itemData.url);

  const encrypted = await encryptData(payload, cryptoKey);

  if (itemData.id) {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'bookmarks', itemData.id), {
      ...encrypted,
      updatedAt: serverTimestamp()
    });
  } else {
    await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'bookmarks'), {
      ...encrypted,
      type: itemData.type,
      parentId: itemData.parentId,
      createdAt: serverTimestamp()
    });
  }
};

export const deleteBookmarkItem = async (userId, item, allItems) => {
  if (item.type === 'folder') {
    const batch = writeBatch(db);
    const children = allItems.filter(i => i.parentId === item.id);
    children.forEach(child => {
      batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'bookmarks', child.id));
    });
    batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'bookmarks', item.id));
    await batch.commit();
  } else {
    await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'bookmarks', item.id));
  }
};

// --- Import Logic ---

export const importBookmarksFromHtml = async (userId, cryptoKey, rootElement, currentFolderId) => {
  const batchSize = 400;
  let currentBatch = writeBatch(db);
  let opCount = 0;

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
          const encrypted = await encryptData({ title, url: normalizeUrl(url), parentId, type: 'bookmark' }, cryptoKey);
          const ref = doc(collection(db, 'artifacts', appId, 'users', userId, 'bookmarks'));
          currentBatch.set(ref, { ...encrypted, type: 'bookmark', parentId, createdAt: serverTimestamp() });

          opCount++;
          if (opCount >= batchSize) { await currentBatch.commit(); currentBatch = writeBatch(db); opCount = 0; }
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