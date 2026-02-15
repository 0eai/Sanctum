import { 
  collection, query, orderBy, onSnapshot, addDoc, getDocs, serverTimestamp, 
  updateDoc, doc, increment, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';
import { getNextDate } from '../lib/dateUtils';

// --- Listeners ---

export const listenToChecklists = (userId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'checklists'), 
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, async (snap) => {
    const lists = await Promise.all(snap.docs.map(async (d) => {
      const raw = d.data();
      const decrypted = await decryptData(raw, cryptoKey);
      return { 
          id: d.id, 
          ...raw, 
          ...decrypted,
          dueDate: decrypted.dueDate || null,
          repeat: decrypted.repeat || 'none'
      }; 
    }));
    callback(lists);
  });
};

export const listenToItems = (userId, listId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items'), 
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(q, async (snap) => {
    const items = await Promise.all(snap.docs.map(async (d) => {
      const rawData = d.data();
      const decrypted = await decryptData(rawData, cryptoKey);
      return { 
        id: d.id, 
        ...decrypted,
        dueDate: decrypted.dueDate || null,
        repeat: decrypted.repeat || 'none',
        isCompleted: rawData.isCompleted ?? decrypted.isCompleted ?? false 
      };
    }));
    callback(items);
  });
};

// --- Actions ---

export const createChecklist = async (userId, cryptoKey, { title, dueDate, repeat }) => {
  const encryptedData = await encryptData({ title, dueDate, repeat }, cryptoKey);
  await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'checklists'), {
    ...encryptedData,
    createdAt: serverTimestamp(), 
    itemCount: 0, 
    completedCount: 0
  });
};

export const updateChecklistEntity = async (userId, listId, itemId, cryptoKey, payload, isList) => {
  const encrypted = await encryptData(payload, cryptoKey);
  if (isList) {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId), encrypted);
  } else {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items', itemId), encrypted);
  }
};

export const addChecklistItem = async (userId, listId, cryptoKey, { text, dueDate, repeat }) => {
  const encryptedContent = await encryptData({ text, dueDate, repeat }, cryptoKey);
  
  const batch = writeBatch(db);
  const itemRef = doc(collection(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items'));
  const listRef = doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId);

  batch.set(itemRef, { ...encryptedContent, isCompleted: false, createdAt: serverTimestamp() });
  batch.update(listRef, { itemCount: increment(1) });
  
  await batch.commit();
};

export const toggleChecklistItem = async (userId, listId, item, cryptoKey) => {
  // Logic: If repeating item is checked, reschedule it instead of completing it
  if (!item.isCompleted && item.dueDate && item.repeat && item.repeat !== 'none') {
      const nextDate = getNextDate(item.dueDate, item.repeat);
      const payload = { ...item, dueDate: nextDate };
      delete payload.id; delete payload.isCompleted; // Cleanup before encrypt
      
      const encrypted = await encryptData(payload, cryptoKey);
      await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items', item.id), {
          ...encrypted, isCompleted: false
      });
  } else {
      const newStatus = !item.isCompleted;
      const batch = writeBatch(db);
      const itemRef = doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items', item.id);
      const listRef = doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId);

      batch.update(itemRef, { isCompleted: newStatus });
      batch.update(listRef, { completedCount: increment(newStatus ? 1 : -1) });
      
      await batch.commit();
  }
};

export const resetChecklist = async (userId, listId, items, listMeta, cryptoKey) => {
  const batch = writeBatch(db);
  
  // 1. Reset all items
  items.forEach(item => {
      if (item.isCompleted) {
          const ref = doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items', item.id);
          batch.update(ref, { isCompleted: false });
      }
  });

  // 2. Update list metadata (Next Date)
  const nextDate = getNextDate(listMeta.dueDate, listMeta.repeat);
  const payload = { ...listMeta, dueDate: nextDate };
  delete payload.id; delete payload.itemCount; delete payload.completedCount; delete payload.createdAt;
  
  const encrypted = await encryptData(payload, cryptoKey);
  const listRef = doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId);
  
  batch.update(listRef, { ...encrypted, completedCount: 0 });
  await batch.commit();
  
  return nextDate; // Return new date to update local state immediately if needed
};

export const deleteChecklistEntity = async (userId, listId, itemId, isCompleted) => {
  if (itemId) {
      // Delete Item
      const batch = writeBatch(db);
      const itemRef = doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId, 'items', itemId);
      const listRef = doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId);

      batch.delete(itemRef);
      batch.update(listRef, { 
          itemCount: increment(-1),
          completedCount: increment(isCompleted ? -1 : 0)
      });
      await batch.commit();
  } else {
      // Delete List
      await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'checklists', listId));
  }
};

export const exportChecklists = async (userId, cryptoKey) => {
  const listsQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'checklists'));
  const listsSnapshot = await getDocs(listsQuery);
  
  const exportData = await Promise.all(listsSnapshot.docs.map(async (listDoc) => {
    const listRaw = listDoc.data();
    const listDecrypted = await decryptData(listRaw, cryptoKey);
    
    // Fetch items for this list
    const itemsQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'checklists', listDoc.id, 'items'));
    const itemsSnapshot = await getDocs(itemsQuery);
    
    const items = await Promise.all(itemsSnapshot.docs.map(async (itemDoc) => {
      const itemRaw = itemDoc.data();
      const itemDecrypted = await decryptData(itemRaw, cryptoKey);
      return { 
        ...itemRaw, 
        ...itemDecrypted,
        // Ensure dates are strings for JSON
        dueDate: itemRaw.dueDate || itemDecrypted.dueDate || null,
        createdAt: itemRaw.createdAt?.toDate?.()?.toISOString() || null
      };
    }));

    return {
      ...listRaw,
      ...listDecrypted,
      dueDate: listRaw.dueDate || listDecrypted.dueDate || null,
      items: items
    };
  }));

  return exportData;
};

export const importChecklists = async (userId, cryptoKey, data) => {
  if (!Array.isArray(data)) throw new Error("Invalid format");

  let count = 0;
  for (const list of data) {
    // 1. Create the List
    const listId = await createChecklist(userId, cryptoKey, {
      title: list.title || "Untitled List",
      dueDate: list.dueDate,
      repeat: list.repeat
    });

    // 2. Add all items to this list
    if (list.items && Array.isArray(list.items)) {
      // We process items sequentially to maintain some order order, or Promise.all for speed
      await Promise.all(list.items.map(async (item) => {
         // We reuse addChecklistItem but need to support isCompleted override
         // If your addChecklistItem doesn't support isCompleted, we might need a direct DB call here
         // Assuming addChecklistItem allows passing extra props:
         await addChecklistItem(userId, listId, cryptoKey, {
           text: item.text,
           dueDate: item.dueDate,
           repeat: item.repeat,
           isCompleted: item.isCompleted || false
         });
      }));
    }
    count++;
  }
  return count;
};