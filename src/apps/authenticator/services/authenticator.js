// src/services/authenticator.js
// Refactored to use createEncryptedCRUD for standard operations.
import createEncryptedCRUD from '../../../services/createEncryptedCRUD';

const crud = createEncryptedCRUD('authenticator');

// --- Standard CRUD (delegated to factory) ---

export const listenToAuthenticators = (userId, cryptoKey, callback) =>
    crud.listen(userId, cryptoKey, callback);

export const saveAuthenticator = async (userId, cryptoKey, authData) =>
    crud.save(userId, cryptoKey, authData);

export const deleteAuthenticator = async (userId, id) =>
    crud.remove(userId, id);

export const exportAuthenticators = async (userId, cryptoKey) =>
    crud.exportAll(userId, cryptoKey);

export const importAuthenticators = async (userId, cryptoKey, authenticators) =>
    crud.importAll(userId, cryptoKey, authenticators);
