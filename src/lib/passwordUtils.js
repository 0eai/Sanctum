export const generateStrongPassword = (length = 16) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  const n = charset.length;
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  let retVal = "";
  for (let i = 0; i < length; i++) {
    retVal += charset.charAt(randomValues[i] % n);
  }
  return retVal;
};

export const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};