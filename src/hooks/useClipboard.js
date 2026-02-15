import { useState } from 'react';

export const useClipboard = (timeout = 2000) => {
  const [copiedId, setCopiedId] = useState(null);

  const copy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), timeout);
  };

  return { copy, copiedId };
};