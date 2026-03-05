// src/services/tasks.js
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  updateDoc, doc, deleteDoc, writeBatch, getDocs
} from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { encryptData, decryptData } from '../../../lib/crypto';
import { getNextDate } from '../../../lib/dateUtils';

// --- Workspace Context Helper ---
const getTasksCol = (userId, ctx) =>
  ctx?.workspaceId
    ? collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'tasks')
    : collection(db, 'artifacts', appId, 'users', userId, 'tasks');

const getTaskDoc = (userId, taskId, ctx) =>
  ctx?.workspaceId
    ? doc(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'tasks', taskId)
    : doc(db, 'artifacts', appId, 'users', userId, 'tasks', taskId);

const getFoldersCol = (userId, ctx) =>
  ctx?.workspaceId
    ? collection(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'task_folders')
    : collection(db, 'artifacts', appId, 'users', userId, 'task_folders');

const getFolderDoc = (userId, folderId, ctx) =>
  ctx?.workspaceId
    ? doc(db, 'artifacts', appId, 'workspaces', ctx.workspaceId, 'task_folders', folderId)
    : doc(db, 'artifacts', appId, 'users', userId, 'task_folders', folderId);

const getKey = (cryptoKey, ctx) => ctx?.key || cryptoKey;

// --- Listeners ---

export const listenToTaskFolders = (userId, cryptoKey, callback, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  const q = query(getFoldersCol(userId, ctx), orderBy('createdAt', 'asc'));
  return onSnapshot(q, async (snapshot) => {
    const decrypted = await Promise.all(snapshot.docs.map(async d => {
      const data = await decryptData(d.data(), key);
      return { id: d.id, ...data };
    }));
    callback(decrypted);
  });
};

export const listenToTasks = (userId, cryptoKey, callback, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  const q = query(getTasksCol(userId, ctx), orderBy('order', 'desc'));
  return onSnapshot(q, async (snapshot) => {
    const decrypted = await Promise.all(snapshot.docs.map(async d => {
      try {
        const data = await decryptData(d.data(), key);
        return {
          id: d.id,
          ...(data || {}),
          subtasks: data?.subtasks || [],
          order: d.data().order || 0
        };
      } catch (error) {
        console.warn('Failed to decrypt task doc', d.id, error.message || error);
        return {
          id: d.id,
          title: 'Encrypted Data (Decryption Failed)',
          subtasks: [],
          order: d.data().order || 0
        };
      }
    }));
    callback(decrypted);
  });
};

// --- Actions ---

export const saveTaskFolder = async (userId, cryptoKey, name, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  const encrypted = await encryptData({ name }, key);
  const ref = await addDoc(getFoldersCol(userId, ctx), {
    ...encrypted, createdAt: serverTimestamp()
  });
  return ref.id;
};

export const saveTask = async (userId, cryptoKey, taskData, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  const order = taskData.order || Date.now();

  const payload = {
    title: taskData.title || "",
    folderId: taskData.folderId || null,
    completed: taskData.completed || false,
    isPinned: taskData.isPinned || false,
    dueDate: taskData.dueDate || "",
    hasTime: taskData.hasTime || false,
    repeat: taskData.repeat || "none",
    deadline: taskData.deadline || "",
    notes: taskData.notes || "",
    subtasks: taskData.subtasks || [],
    sharedId: taskData.sharedId || null,
    shareUrlKey: taskData.shareUrlKey || null
  };

  const encrypted = await encryptData(payload, key);

  if (taskData.id) {
    await updateDoc(getTaskDoc(userId, taskData.id, ctx), { ...encrypted });
    return taskData.id;
  } else {
    const ref = await addDoc(getTasksCol(userId, ctx), {
      ...encrypted, order, createdAt: serverTimestamp()
    });
    return ref.id;
  }
};

export const toggleTaskCompletion = async (userId, cryptoKey, task, ctx = null) => {
  const key = getKey(cryptoKey, ctx);
  if (!task.completed && task.repeat && task.repeat !== 'none') {
    const nextDate = getNextDate(task.dueDate, task.repeat);
    const encrypted = await encryptData({
      ...task, completed: false, dueDate: nextDate
    }, key);
    await updateDoc(getTaskDoc(userId, task.id, ctx), { ...encrypted });
    return true;
  } else {
    const encrypted = await encryptData({ ...task, completed: !task.completed }, key);
    await updateDoc(getTaskDoc(userId, task.id, ctx), { ...encrypted });
    return false;
  }
};

export const deleteTaskEntity = async (userId, entity, allTasks, ctx = null) => {
  if (entity.type === 'folder') {
    const batch = writeBatch(db);
    const folderTasks = allTasks.filter(t => t.folderId === entity.id);
    folderTasks.forEach(t => batch.delete(getTaskDoc(userId, t.id, ctx)));
    batch.delete(getFolderDoc(userId, entity.id, ctx));
    await batch.commit();
  } else {
    await deleteDoc(getTaskDoc(userId, entity.id, ctx));
  }
};

export const reorderTasks = async (userId, draggedTask, targetTask, ctx = null) => {
  const batch = writeBatch(db);
  batch.update(getTaskDoc(userId, draggedTask.id, ctx), { order: targetTask.order });
  batch.update(getTaskDoc(userId, targetTask.id, ctx), { order: draggedTask.order });
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