// src/hooks/useHashRoute.js
import { useState, useEffect } from 'react';

export function useHashRoute() {
  const parseHash = () => {
    // Remove the '#' and split by '?'
    const rawHash = window.location.hash.replace(/^#/, '');
    const [pathString, queryString] = rawHash.split('?');
    
    // Split the path: markdown / doc / 123 / edit
    const segments = pathString.split('/').filter(Boolean);
    const params = new URLSearchParams(queryString || '');

    return {
      appId: segments[0] || 'launcher',
      resource: segments[1] || null,   // e.g., 'folder', 'doc'
      resourceId: segments[2] || null, // e.g., 'folder_123'
      action: segments[3] || null,     // e.g., 'edit'
      query: Object.fromEntries(params.entries()) // e.g., { modal: 'add_calendar' }
    };
  };

  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const handleHashChange = () => setRoute(parseHash());
    // Listen to hash changes instead of popstate. This handles back/forward automatically.
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Helper function to update the URL cleanly
  const navigate = (path) => {
    window.location.hash = path;
  };

  return { route, navigate };
}