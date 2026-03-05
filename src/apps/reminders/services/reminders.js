// src/services/reminders.js
// Refactored to use createEncryptedCRUD for standard operations.
import createEncryptedCRUD from '../../../services/createEncryptedCRUD';

const crud = createEncryptedCRUD('reminders', {
    orderByField: 'updatedAt',  // reminders don't have a consistent createdAt sort
    orderDir: 'desc'
});

// --- Standard CRUD (delegated to factory) ---

export const listenToReminders = (uid, cryptoKey, callback) =>
    crud.listen(uid, cryptoKey, callback, null, { orderByField: 'updatedAt' });

export const saveReminder = async (uid, cryptoKey, reminderData) => {
    return crud.save(uid, cryptoKey, reminderData);
};

export const deleteReminder = async (uid, id) =>
    crud.remove(uid, id);

export const exportReminders = async (uid, cryptoKey) =>
    crud.exportAll(uid, cryptoKey);

export const importReminders = async (uid, cryptoKey, jsonData) =>
    crud.importAll(uid, cryptoKey, jsonData, null, (item) => {
        if (!item.title) return null; // skip invalid
        const { id, ...rest } = item;
        return rest;
    });