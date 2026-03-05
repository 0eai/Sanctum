import { useState, useRef, useEffect } from 'react';

export const useClipboard = (timeout = 30000) => {
  const [copiedId, setCopiedId] = useState(null);
  const timeoutRef = useRef(null);

  const copy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);

    // Clear UI indicator after 2 seconds
    setTimeout(() => setCopiedId(null), 2000);

    // Securely clear OS clipboard after the specified timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      navigator.clipboard.writeText('');
    }, timeout);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, []);

  return { copy, copiedId };
};