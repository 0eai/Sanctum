// src/services/finance.js

import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, getDoc, getDocs
} from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

// --- Default Configuration ---
const DEFAULT_CATEGORIES = {
    income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'],
    expenses: ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Entertainment', 'Education'],
    investments: ['Stock', 'Crypto', 'Real Estate', 'Gold', 'Mutual Fund'],
    subscriptions: ['Streaming', 'Software', 'Gym', 'Internet']
};

// --- Listeners ---

export const listenToFinanceItems = (userId, cryptoKey, callback) => {
  const q = query(
    collection(db, 'artifacts', appId, 'users', userId, 'finance'), 
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, async (snap) => {
    const data = await Promise.all(snap.docs.map(async d => {
      const raw = d.data();
      const decrypted = await decryptData(raw, cryptoKey);
      return { id: d.id, ...decrypted };
    }));
    callback(data);
  });
};

export const fetchFinanceConfig = async (userId, cryptoKey) => {
  const docRef = doc(db, 'artifacts', appId, 'users', userId, 'finance_settings', 'config');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = await decryptData(snap.data(), cryptoKey);
    if(data) return data;
  }
  return { activeCurrencies: ['KRW'], categories: DEFAULT_CATEGORIES };
};

// --- Actions ---

export const saveFinanceItem = async (userId, cryptoKey, itemData, type, currency) => {
  const payload = { ...itemData, type, currency };
  const encrypted = await encryptData(payload, cryptoKey);

  if (itemData.id) {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'finance', itemData.id), {
      ...encrypted, updatedAt: serverTimestamp()
    });
  } else {
    await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'finance'), {
      ...encrypted, createdAt: serverTimestamp()
    });
  }
};

export const deleteFinanceItem = async (userId, itemId) => {
  await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'finance', itemId));
};

// --- Import / Export ---

export const exportFinanceData = async (userId, cryptoKey) => {
  const q = query(collection(db, 'artifacts', appId, 'users', userId, 'finance'));
  const snapshot = await getDocs(q);
  
  return Promise.all(snapshot.docs.map(async (doc) => {
    const raw = doc.data();
    const decrypted = await decryptData(raw, cryptoKey);
    return {
      ...decrypted,
      createdAt: raw.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: raw.updatedAt?.toDate?.()?.toISOString() || null,
      // Ensure date fields are strings
      date: decrypted.date || null,
      nextDate: decrypted.nextDate || null,
      startDate: decrypted.startDate || null,
      dueDate: decrypted.dueDate || null
    };
  }));
};

export const importFinanceData = async (userId, cryptoKey, data) => {
  if (!Array.isArray(data)) throw new Error("Invalid format");
  let count = 0;
  for (const item of data) {
    if (!item.type) continue;
    
    // Sanitize
    const { id, createdAt, updatedAt, ...cleanItem } = item;
    
    // Encrypt
    const encrypted = await encryptData(cleanItem, cryptoKey);
    
    // Save
    await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'finance'), {
      ...encrypted,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    count++;
  }
  return count;
};

// --- Stats Calculation Logic ---

export const calculateStats = (items, currentCurrency, timeframe = 'all') => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const viewItems = items.filter(i => {
        if (i.currency !== currentCurrency) return false;
        
        // Handle varying date fields
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
        case 'debts':
            const lent = monthlyItems.filter(i => i.type === 'debts' && i.subType === 'lent').reduce((sum, i) => sum + Number(i.amount), 0);
            const borrowed = monthlyItems.filter(i => i.type === 'debts' && i.subType === 'borrowed').reduce((sum, i) => sum + Number(i.amount), 0);
            return { lent, borrowed }; 
        default:
            return 0;
    }
};