// src/AppRegistry.js
// Centralized lazy-load registry for all app modules.
// Adding a new app requires only one line here + one route in App.jsx.
import React from 'react';

const registry = {
    checklist: React.lazy(() => import('./apps/checklist/Checklist')),
    counter: React.lazy(() => import('./apps/counter/Counter')),
    bookmarks: React.lazy(() => import('./apps/bookmarks/Bookmarks')),
    notes: React.lazy(() => import('./apps/notes/Notes')),
    tasks: React.lazy(() => import('./apps/tasks/Tasks')),
    passwords: React.lazy(() => import('./apps/passwords/Passwords')),
    alerts: React.lazy(() => import('./apps/alerts/Alerts')),
    banking: React.lazy(() => import('./apps/banking/Banking')),
    finance: React.lazy(() => import('./apps/finance/Finance')),
    settings: React.lazy(() => import('./apps/settings/Settings')),
    markdown: React.lazy(() => import('./apps/markdown/Markdown')),
    reminders: React.lazy(() => import('./apps/reminders/Reminders')),
    contacts: React.lazy(() => import('./apps/contacts/Contacts')),
    authenticator: React.lazy(() => import('./apps/authenticator/Authenticator')),
    secureshare: React.lazy(() => import('./apps/secureshare/SecureShare')),
    research: React.lazy(() => import('./apps/research/ResearchApp')),
};

/** Shared Note viewer (separate — renders without auth) */
export const SharedNote = React.lazy(() => import('./apps/SharedNote'));

export default registry;
