// src/services/finance.js
// Refactored: CRUD operations delegated to createEncryptedCRUD.
// Domain-specific logic (fetchFinanceConfig, calculateStats, calculateMonthlySummary) retained.
import { doc, getDoc } from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { decryptData } from '../../../lib/crypto';
import createEncryptedCRUD from '../../../services/createEncryptedCRUD';

const crud = createEncryptedCRUD('finance', {
  cleanExport: (raw, decrypted) => ({
    ...decrypted,
    createdAt: raw.createdAt?.toDate?.()?.toISOString() || null,
    updatedAt: raw.updatedAt?.toDate?.()?.toISOString() || null,
    date: decrypted.date || null,
    nextDate: decrypted.nextDate || null,
    startDate: decrypted.startDate || null,
    dueDate: decrypted.dueDate || null
  }),
  validateImport: (item) => !!item.type
});

// --- Default Configuration ---
const DEFAULT_CATEGORIES = {
  income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'],
  expenses: ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Entertainment', 'Education'],
  investments: ['Stock', 'Crypto', 'Real Estate', 'Gold', 'Mutual Fund'],
  subscriptions: ['Streaming', 'Software', 'Gym', 'Internet']
};

// --- Standard CRUD ---

export const listenToFinanceItems = (userId, cryptoKey, callback) =>
  crud.listen(userId, cryptoKey, callback);

export const saveFinanceItem = async (userId, cryptoKey, itemData, type, currency) => {
  const payload = { ...itemData, type, currency };
  return crud.save(userId, cryptoKey, payload);
};

export const deleteFinanceItem = async (userId, itemId) =>
  crud.remove(userId, itemId);

export const exportFinanceData = async (userId, cryptoKey) =>
  crud.exportAll(userId, cryptoKey);

export const importFinanceData = async (userId, cryptoKey, data) =>
  crud.importAll(userId, cryptoKey, data);

// --- Finance-Specific: Config fetch (separate collection) ---

export const fetchFinanceConfig = async (userId, cryptoKey) => {
  const docRef = doc(db, 'artifacts', appId, 'users', userId, 'finance_settings', 'config');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = await decryptData(snap.data(), cryptoKey);
    if (data) return data;
  }
  return { activeCurrencies: ['KRW'], categories: DEFAULT_CATEGORIES };
};

// --- Stats Calculation Logic (pure computation, no Firestore) ---

export const calculateStats = (items, currentCurrency, timeframe = 'all') => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const viewItems = items.filter(i => {
    if (i.currency !== currentCurrency) return false;
    const dateValue = i.date || (i.createdAt?.toDate ? i.createdAt.toDate() : i.createdAt);
    const itemDate = new Date(dateValue);
    if (timeframe === 'month') return itemDate >= startOfMonth;
    if (timeframe === 'year') return itemDate >= startOfYear;
    return true;
  });

  const income = viewItems.filter(i => i.type === 'income').reduce((s, i) => s + Number(i.amount), 0);
  const expenses = viewItems.filter(i => i.type === 'expenses').reduce((s, i) => s + Number(i.amount), 0);
  const investments = viewItems.filter(i => i.type === 'investments');
  const investedTotal = investments.reduce((s, i) => s + Number(i.investedAmount), 0);
  const currentTotal = investments.reduce((s, i) => s + Number(i.currentValue), 0);
  const lent = viewItems.filter(i => i.type === 'debts' && i.subType === 'lent').reduce((s, i) => s + Number(i.amount), 0);
  const borrowed = viewItems.filter(i => i.type === 'debts' && i.subType === 'borrowed').reduce((s, i) => s + Number(i.amount), 0);

  const liquidCash = income - expenses;
  const netWorth = (liquidCash + currentTotal + lent) - borrowed;
  const savingsRate = income > 0 ? (liquidCash / income) * 100 : 0;
  const totalAssets = currentTotal + lent + Math.max(0, liquidCash);
  const debtRatio = totalAssets > 0 ? (borrowed / totalAssets) * 100 : 0;
  const roiPercentage = investedTotal > 0 ? ((currentTotal - investedTotal) / investedTotal) * 100 : 0;
  const expenseRatio = income > 0 ? (expenses / income) * 100 : 0;
  const investPercent = totalAssets > 0 ? (currentTotal / totalAssets) * 100 : 0;
  const dailyBurn = expenses / 30;
  const bufferDays = dailyBurn > 0 ? Math.max(0, liquidCash / dailyBurn) : 0;
  const monthlySubs = viewItems
    .filter(i => i.type === 'subscriptions')
    .reduce((s, i) => {
      const amt = Number(i.amount);
      return s + (i.cycle === 'Yearly' ? amt / 12 : amt);
    }, 0);

  return {
    income, expenses, investedTotal, currentTotal, lent, borrowed,
    netWorth, savingsRate, debtRatio, roiPercentage, monthlySubs,
    expenseRatio, bufferDays, investPercent
  };
};

export const calculateMonthlySummary = (items, activeTab, currentCurrency) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthlyItems = items.filter(i => {
    const dateValue = i.date || i.dueDate || i.nextDate || (i.createdAt?.toDate ? i.createdAt.toDate() : i.createdAt);
    const itemDate = new Date(dateValue);
    return i.currency === currentCurrency && itemDate >= startOfMonth;
  });

  switch (activeTab) {
    case 'income':
      return monthlyItems.filter(i => i.type === 'income').reduce((sum, i) => sum + Number(i.amount), 0);
    case 'expenses':
      return monthlyItems.filter(i => i.type === 'expenses').reduce((sum, i) => sum + Number(i.amount), 0);
    case 'investments':
      return monthlyItems.filter(i => i.type === 'investments').reduce((sum, i) => sum + Number(i.investedAmount), 0);
    case 'subscriptions':
      return monthlyItems.filter(i => i.type === 'subscriptions').reduce((sum, i) => {
        const amt = Number(i.amount);
        return sum + (i.cycle === 'Yearly' ? amt / 12 : amt);
      }, 0);
    case 'debts': {
      const l = monthlyItems.filter(i => i.type === 'debts' && i.subType === 'lent').reduce((sum, i) => sum + Number(i.amount), 0);
      const b = monthlyItems.filter(i => i.type === 'debts' && i.subType === 'borrowed').reduce((sum, i) => sum + Number(i.amount), 0);
      return { lent: l, borrowed: b };
    }
    default:
      return 0;
  }
};