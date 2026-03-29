// Single source of truth for Firestore sub-collection names under
// artifacts/{appId}/users/{uid}/

// All app + system collections — used for vault reset and full account wipe
export const APP_COLLECTIONS = [
  'notes', 'markdown', 'bookmarks', 'checklists', 'counters',
  'tasks', 'passwords', 'banking', 'finance', 'reminders',
  'contacts', 'authenticator', 'research', 'alerts',
  'devices', 'activity_log', 'transfer_devices'
];

// App data collections eligible for export / import / per-app wipe
// (excludes system collections: devices, activity_log, transfer_devices, alerts)
export const TARGET_COLLECTIONS = [
  'notes', 'markdown', 'bookmarks', 'checklists', 'counters',
  'tasks', 'passwords', 'banking', 'finance', 'reminders',
  'contacts', 'authenticator', 'research'
];

// Collections tracked for launcher badge counts
export const STATS_COLLECTIONS = [
  'counters', 'checklists', 'tasks', 'passwords',
  'banking', 'finance', 'reminders', 'authenticator'
];
