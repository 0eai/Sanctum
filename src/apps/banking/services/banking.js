// src/services/banking.js
// Refactored to use createEncryptedCRUD for standard operations.
import createEncryptedCRUD from '../../../services/createEncryptedCRUD';

const crud = createEncryptedCRUD('banking');

// --- Standard CRUD (delegated to factory) ---

export const listenToBankingItems = (userId, cryptoKey, callback) =>
  crud.listen(userId, cryptoKey, callback);

export const saveBankingItem = async (userId, cryptoKey, itemData, type) => {
  const payload = { ...itemData, type };
  return crud.save(userId, cryptoKey, payload);
};

export const deleteBankingItem = async (userId, itemId) =>
  crud.remove(userId, itemId);

// --- Import / Export ---

export const exportBankingData = async (userId, cryptoKey) =>
  crud.exportAll(userId, cryptoKey);

export const importBankingData = async (userId, cryptoKey, data) =>
  crud.importAll(userId, cryptoKey, data, null, null);