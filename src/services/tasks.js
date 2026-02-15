// src/services/tasks.js
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, writeBatch, getDocs
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase'; // Ensure appId is imported correctly
import { encryptData, decryptData } from '../lib/crypto';
import { getNextDate } from '../lib/dateUtils';

// --- Listeners ---

export const listenToTaskFolders = (userId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'task_folders'), 
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, async (snapshot) => {
    const decrypted = await Promise.all(snapshot.docs.map(async d => {
      const data = await decryptData(d.data(), cryptoKey);
      return { id: d.id, ...data };
    }));
    callback(decrypted);
  });
};

export const listenToTasks = (userId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'tasks'), 
    orderBy('order', 'desc')
  );
  return onSnapshot(q, async (snapshot) => {
    const decrypted = await Promise.all(snapshot.docs.map(async d => {
      const data = await decryptData(d.data(), cryptoKey);
      return { 
        id: d.id, 
        ...data, 
        subtasks: data.subtasks || [],
        order: d.data().order || 0
      };
    }));
    callback(decrypted);
  });
};

// --- Actions ---

export const saveTaskFolder = async (userId, cryptoKey, name) => {
  const encrypted = await encryptData({ name }, cryptoKey);
  const ref = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'task_folders'), {
    ...encrypted, createdAt: serverTimestamp()
  });
  return ref.id;
};

export const saveTask = async (userId, cryptoKey, taskData) => {
  const order = taskData.order || Date.now();
  
  const payload = {
    title: taskData.title || "", // Ensure this is empty string, not "Untitled Task" if you want clean auto-delete
    folderId: taskData.folderId || null,
    completed: taskData.completed || false,
    isPinned: taskData.isPinned || false,
    dueDate: taskData.dueDate || "",
    hasTime: taskData.hasTime || false, 
    repeat: taskData.repeat || "none", 
    deadline: taskData.deadline || "", 
    notes: taskData.notes || "",
    subtasks: taskData.subtasks || []
  };

  const encrypted = await encryptData(payload, cryptoKey);
  
  if (taskData.id) {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'tasks', taskData.id), { 
        ...encrypted 
    });
    return taskData.id; // Return the existing ID
  } else {
    // FIX: Capture the reference and return the ID
    const ref = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'tasks'), {
      ...encrypted, order, createdAt: serverTimestamp()
    });
    return ref.id; // Return the new ID
  }
};

export const toggleTaskCompletion = async (userId, cryptoKey, task) => {
  // Repeat Logic
  if (!task.completed && task.repeat && task.repeat !== 'none') {
      const nextDate = getNextDate(task.dueDate, task.repeat);
      const encrypted = await encryptData({ 
          ...task, 
          completed: false, // Keep active
          dueDate: nextDate // Move forward
      }, cryptoKey);
      
      await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'tasks', task.id), { ...encrypted });
      return true; // Indicates task repeated
  } else {
      const encrypted = await encryptData({ ...task, completed: !task.completed }, cryptoKey);
      await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'tasks', task.id), { ...encrypted });
      return false;
  }
};

export const deleteTaskEntity = async (userId, entity, allTasks) => {
  if (entity.type === 'folder') {
    const batch = writeBatch(db);
    const folderTasks = allTasks.filter(t => t.folderId === entity.id);
    folderTasks.forEach(t => batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'tasks', t.id)));
    batch.delete(doc(db, 'artifacts', appId, 'users', userId, 'task_folders', entity.id));
    await batch.commit();
  } else {
    // Standard task deletion
    await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'tasks', entity.id));
  }
};

export const reorderTasks = async (userId, draggedTask, targetTask) => {
  const batch = writeBatch(db);
  // Swap Order Fields
  batch.update(doc(db, 'artifacts', appId, 'users', userId, 'tasks', draggedTask.id), { order: targetTask.order });
  batch.update(doc(db, 'artifacts', appId, 'users', userId, 'tasks', targetTask.id), { order: draggedTask.order });
  await batch.commit();
};

export const exportTasks = async (userId, cryptoKey) => {
  // 1. Fetch Folders
  const folderQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'task_folders'));
  const folderSnap = await getDocs(folderQuery);
  const folders = await Promise.all(folderSnap.docs.map(async (d) => {
    const data = await decryptData(d.data(), cryptoKey);
    return { id: d.id, ...data };
  }));

  // 2. Fetch Tasks
  const taskQuery = query(collection(db, 'artifacts', appId, 'users', userId, 'tasks'));
  const taskSnap = await getDocs(taskQuery);
  const tasks = await Promise.all(taskSnap.docs.map(async (d) => {
    const raw = d.data();
    const data = await decryptData(raw, cryptoKey);
    return { 
      id: d.id, 
      ...data,
      subtasks: data.subtasks || [],
      createdAt: raw.createdAt?.toDate?.()?.toISOString() || null
    };
  }));

  return { folders, tasks };
};

export const importTasks = async (userId, cryptoKey, data) => {
  if (!data || !data.folders || !data.tasks) throw new Error("Invalid format");

  const { folders, tasks } = data;
  const folderIdMap = {};
  let count = 0;

  // 1. Import Folders First
  for (const folder of folders) {
    const oldId = folder.id;
    const encrypted = await encryptData({ name: folder.name }, cryptoKey);
    const ref = await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'task_folders'), {
      ...encrypted, createdAt: serverTimestamp()
    });
    folderIdMap[oldId] = ref.id;
  }

  // 2. Import Tasks
  for (const task of tasks) {
    const { id, createdAt, folderId, ...taskData } = task;
    
    // Map old folder ID to new folder ID (or null if it was root/inbox)
    const newFolderId = folderId && folderIdMap[folderId] ? folderIdMap[folderId] : null;

    const payload = {
      title: taskData.title || "",
      folderId: newFolderId,
      completed: taskData.completed || false,
      isPinned: taskData.isPinned || false,
      dueDate: taskData.dueDate || "",
      hasTime: taskData.hasTime || false, 
      repeat: taskData.repeat || "none", 
      deadline: taskData.deadline || "", 
      notes: taskData.notes || "",
      subtasks: taskData.subtasks || []
    };

    const encrypted = await encryptData(payload, cryptoKey);
    await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'tasks'), {
      ...encrypted, 
      order: Date.now(), // Reset order to "now" to push to top
      createdAt: serverTimestamp()
    });
    count++;
  }
  return count;
};