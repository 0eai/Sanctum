// src/services/counter.js
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, increment, getDocs 
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';
import { getNextDate } from '../lib/dateUtils';

// --- Listeners ---

export const listenToCounters = (userId, cryptoKey, callback) => {
  const q = query(collection(db, 'artifacts', appId, 'users', userId, 'counters'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, async (snapshot) => {
    const data = await Promise.all(snapshot.docs.map(async doc => {
      const raw = doc.data();
      const decrypted = await decryptData(raw, cryptoKey);
      return { 
          id: doc.id, 
          ...raw, 
          ...decrypted,
          dueDate: raw.dueDate || decrypted.dueDate || null,
          repeat: raw.repeat || decrypted.repeat || 'none'
      };
    }));
    callback(data);
  });
};

export const listenToEntries = (userId, counterId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'counters', counterId, 'entries'), 
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(q, async (snapshot) => {
    const data = await Promise.all(snapshot.docs.map(async doc => {
      const d = doc.data();
      const decryptedData = await decryptData(d, cryptoKey);
      return { 
        id: doc.id, 
        ...decryptedData,
        timestamp: d.timestamp?.toDate ? d.timestamp.toDate() : null,
        endTimestamp: d.endTimestamp?.toDate ? d.endTimestamp.toDate() : null,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : null
      };
    }));
    callback(data);
  });
};

// --- Actions ---

export const saveCounter = async (userId, cryptoKey, data, counterId = null) => {
  const { title, dueDate, repeat, ...rest } = data;
  const encrypted = await encryptData({ title, dueDate, repeat }, cryptoKey);
  const payload = { ...encrypted, ...rest, updatedAt: serverTimestamp() };

  if (counterId) {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'counters', counterId), payload);
  } else {
    await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'counters'), {
      ...payload, count: 0, createdAt: serverTimestamp()
    });
  }
};

export const saveEntry = async (userId, counterId, cryptoKey, entryData, counterMeta) => {
  // FIX: Destructure 'id' out so it is NOT included in 'timestamps'
  const { id, note, tags, location, ...timestamps } = entryData;
  
  const encrypted = await encryptData({ note, tags, location }, cryptoKey);
  
  // Ensure no undefined values slip into the payload
  const payload = { ...encrypted, ...timestamps };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

  if (id) {
    // Update existing using the extracted 'id'
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'counters', counterId, 'entries', id), payload);
  } else {
    // Create new
    payload.createdAt = serverTimestamp();
    await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'counters', counterId, 'entries'), payload);
    
    // Increment Count & Handle Repeat Logic
    const counterUpdates = { count: increment(1) };
    if (counterMeta.repeat && counterMeta.repeat !== 'none' && counterMeta.dueDate) {
        const nextDate = getNextDate(counterMeta.dueDate, counterMeta.repeat);
        const encryptedMeta = await encryptData({ 
            title: counterMeta.title, 
            dueDate: nextDate, 
            repeat: counterMeta.repeat 
        }, cryptoKey);
        Object.assign(counterUpdates, encryptedMeta);
    }
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'counters', counterId), counterUpdates);
  }
};

export const startTimer = async (userId, counterId) => {
  await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'counters', counterId, 'entries'), {
    timestamp: serverTimestamp(), createdAt: serverTimestamp(), endTimestamp: null 
  });
  await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'counters', counterId), { count: increment(1) });
};

export const stopTimer = async (userId, counterId, entryId, counterMeta, cryptoKey) => {
  await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'counters', counterId, 'entries', entryId), {
    endTimestamp: serverTimestamp()
  });
  
  // Handle Repeat Logic on Stop
  if (counterMeta.repeat && counterMeta.repeat !== 'none' && counterMeta.dueDate) {
      const nextDate = getNextDate(counterMeta.dueDate, counterMeta.repeat);
      const encryptedMeta = await encryptData({ 
          title: counterMeta.title, 
          dueDate: nextDate, 
          repeat: counterMeta.repeat 
      }, cryptoKey);
      await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'counters', counterId), encryptedMeta);
  }
};

export const deleteCounterEntity = async (userId, counterId, entryId = null) => {
  if (entryId) {
    await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'counters', counterId, 'entries', entryId));
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'counters', counterId), { count: increment(-1) });
  } else {
    await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'counters', counterId));
  }
};

export const exportCounterData = async (userId, counter, cryptoKey) => {
  const q = query(collection(db, 'artifacts', appId, 'users', userId, 'counters', counter.id, 'entries'));
  const snapshot = await getDocs(q);
  const entries = await Promise.all(snapshot.docs.map(async doc => {
    const d = doc.data();
    const decrypted = await decryptData(d, cryptoKey);
    return { ...d, ...decrypted, timestamp: d.timestamp?.toDate ? d.timestamp.toDate().toISOString() : null };
  }));
  return { counter, entries };
};

export const exportAllCounters = async (userId, cryptoKey) => {
  // 1. Get all counters
  const countersQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'counters'));
  const countersSnapshot = await getDocs(countersQuery);

  // 2. Map over each counter to get its details AND its sub-collection entries
  const exportData = await Promise.all(countersSnapshot.docs.map(async (counterDoc) => {
    const raw = counterDoc.data();
    const decrypted = await decryptData(raw, cryptoKey);
    
    // Fetch entries sub-collection
    const entriesQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'counters', counterDoc.id, 'entries'));
    const entriesSnapshot = await getDocs(entriesQuery);
    
    const entries = await Promise.all(entriesSnapshot.docs.map(async (entryDoc) => {
      const eRaw = entryDoc.data();
      const eDecrypted = await decryptData(eRaw, cryptoKey);
      return {
        ...eRaw,
        ...eDecrypted,
        // Convert Timestamps to ISO strings for JSON
        timestamp: eRaw.timestamp?.toDate?.()?.toISOString() || null,
        endTimestamp: eRaw.endTimestamp?.toDate?.()?.toISOString() || null,
        createdAt: eRaw.createdAt?.toDate?.()?.toISOString() || null
      };
    }));

    return {
      ...raw,
      ...decrypted,
      // Normalize counter dates
      dueDate: raw.dueDate || decrypted.dueDate || null,
      createdAt: raw.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: raw.updatedAt?.toDate?.()?.toISOString() || null,
      entries: entries
    };
  }));

  return exportData;
};

export const importCounters = async (userId, cryptoKey, data) => {
  if (!Array.isArray(data)) throw new Error("Invalid data format");

  let count = 0;
  for (const counter of data) {
    // 1. Create the Counter
    // We reuse saveCounter logic manually to ensure we get the ID back for sub-collections
    const { title, dueDate, repeat, entries, ...rest } = counter;
    
    // Encrypt main counter data
    const encrypted = await encryptData({ title, dueDate, repeat }, cryptoKey);
    
    // Add to Firestore
    const counterRef = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'counters'), {
      ...encrypted,
      mode: rest.mode || 'date',
      groupBy: rest.groupBy || 'none',
      useTags: rest.useTags ?? true,
      useNotes: rest.useNotes ?? true,
      count: entries ? entries.length : 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // 2. Add Entries
    if (entries && Array.isArray(entries)) {
        // Process in parallel chunks for speed, or Promise.all if dataset is reasonable size
        await Promise.all(entries.map(async (entry) => {
            const { note, tags, location, timestamp, endTimestamp, createdAt } = entry;
            const entryEncrypted = await encryptData({ note, tags, location }, cryptoKey);
            
            await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'counters', counterRef.id, 'entries'), {
                ...entryEncrypted,
                timestamp: timestamp ? new Date(timestamp) : serverTimestamp(),
                endTimestamp: endTimestamp ? new Date(endTimestamp) : null,
                createdAt: createdAt ? new Date(createdAt) : serverTimestamp()
            });
        }));
    }
    count++;
  }
  return count;
};