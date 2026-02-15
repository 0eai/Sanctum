export const DEFAULT_CURRENCIES = [
    { code: 'KRW', name: 'South Korean Won' },
    { code: 'INR', name: 'Indian Rupee' },
    { code: 'USD', name: 'US Dollar' },
    { code: 'EUR', name: 'Euro' },
    { code: 'JPY', name: 'Japanese Yen' },
    { code: 'GBP', name: 'British Pound' }
];

export const DEFAULT_CATEGORIES = {
    income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'],
    expenses: ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Entertainment', 'Education'],
    investments: ['Stock', 'Crypto', 'Real Estate', 'Gold', 'Mutual Fund'],
    subscriptions: ['Streaming', 'Software', 'Gym', 'Internet']
};

// New Constants for App Management
// export const AVAILABLE_APPS = [
//     { id: 'alerts', name: 'Alerts', icon: 'Bell' },
//     { id: 'banking', name: 'Banking', icon: 'CreditCard' },
//     { id: 'bookmarks', name: 'Bookmarks', icon: 'Bookmark' },
//     { id: 'checklist', name: 'Checklists', icon: 'CheckSquare' },
//     { id: 'counter', name: 'Counters', icon: 'TrendingUp' },
//     { id: 'finance', name: 'Finance', icon: 'PieChart' },
//     { id: 'notes', name: 'Notes', icon: 'FileText' },
//     { id: 'passwords', name: 'Passwords', icon: 'Key' },
//     { id: 'tasks', name: 'Tasks', icon: 'List' }
// ];

export const AVAILABLE_APPS = [
  { id: 'vault', name: 'Secure Vault', icon: 'Shield', isSystem: true },
  { id: 'notes', name: 'Notes', icon: 'FileText' },
  { id: 'tasks', name: 'Tasks', icon: 'CheckSquare' },
  { id: 'finance', name: 'Finance', icon: 'PieChart' },
  { id: 'bookmarks', name: 'Bookmarks', icon: 'Bookmark' },
  { id: 'passwords', name: 'Passwords', icon: 'Key' },
  { id: 'checklist', name: 'Checklist', icon: 'ListChecks' },
  { id: 'counter', name: 'Counters', icon: 'PlusSquare' },
  { id: 'markdown', name: 'Markdown', icon: 'FileCode' },
  { id: 'settings', name: 'Settings', icon: 'Settings', isSystem: true },
];
// Collections map for Export/Import/Wipe
export const DATA_COLLECTIONS = [
    'alerts', 'banking', 'bookmarks', 'checklists', 'counters', 
    'finance', 'notes', 'passwords', 'tasks', 'calendar_events',
    'task_folders' // Helper collection
];