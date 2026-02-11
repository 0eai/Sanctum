import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc, getDoc 
} from 'firebase/firestore';
import { 
  ChevronLeft, Plus, Trash2, Edit2, TrendingDown, 
  Repeat, Users, DollarSign, PieChart, ArrowUpRight, ArrowDownLeft,
  BarChart3, Sprout, Wallet, Settings
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input, LoadingSpinner } from './components'; 
import { decryptData, encryptData } from './crypto';

// --- HELPERS ---
const CURRENCY_LOCALES = {
  KRW: 'ko-KR', INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP'
};

const TABS = ['stats', 'income', 'expenses', 'investments', 'subscriptions', 'debts'];

const formatCurrency = (amount, code) => {
  return new Intl.NumberFormat(CURRENCY_LOCALES[code] || 'en-US', { 
    style: 'currency', currency: code, maximumFractionDigits: code === 'KRW' || code === 'JPY' ? 0 : 2 
  }).format(amount);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const IncomeRow = ({ data, onDelete, onEdit }) => (
  <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group transition-all hover:shadow-md">
    <div className="flex items-center gap-2 overflow-hidden">
      <div className="bg-green-50 p-2 rounded-full text-green-600 flex-shrink-0"><Wallet size={18} /></div>
      <div className="min-w-0">
        <h3 className="font-bold text-gray-800 text-sm truncate">{data.source}</h3>
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <span className="bg-gray-100 px-1 py-0.5 rounded uppercase font-medium">{data.category}</span>
          <span>• {formatDate(data.date)}</span>
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
      <span className="font-bold text-sm text-green-600 tabular-nums">+{formatCurrency(data.amount, data.currency)}</span>
      <div className="flex gap-0.5">
        <button onClick={() => onEdit(data)} className="p-1.5 text-gray-400 hover:text-[#4285f4]"><Edit2 size={12} /></button>
        <button onClick={() => onDelete(data)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
      </div>
    </div>
  </div>
);

const ExpenseRow = ({ data, onDelete, onEdit }) => (
  <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group transition-all hover:shadow-md">
    <div className="flex items-center gap-2 overflow-hidden">
      <div className="bg-red-50 p-2 rounded-full text-red-500 flex-shrink-0"><TrendingDown size={18} /></div>
      <div className="min-w-0">
        <h3 className="font-bold text-gray-800 text-sm truncate">{data.title}</h3>
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <span className="bg-gray-100 px-1 py-0.5 rounded uppercase font-medium">{data.category}</span>
          <span>• {formatDate(data.date)}</span>
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
      <span className="font-bold text-sm text-red-600 tabular-nums">-{formatCurrency(data.amount, data.currency)}</span>
      <div className="flex gap-0.5">
        <button onClick={() => onEdit(data)} className="p-1.5 text-gray-400 hover:text-[#4285f4]"><Edit2 size={12} /></button>
        <button onClick={() => onDelete(data)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
      </div>
    </div>
  </div>
);

const DebtRow = ({ data, onDelete, onEdit }) => {
  const isLent = data.subType === 'lent'; 
  return (
    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all group">
      <div className="flex items-center gap-2 overflow-hidden">
        <div className={`p-2 rounded-full flex-shrink-0 ${isLent ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
          {isLent ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-gray-800 text-sm truncate">{data.person}</h3>
          <p className="text-[10px] text-gray-400 font-medium tracking-tight">
            {isLent ? 'Owes you' : 'You owe'} • Due {formatDate(data.dueDate)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className={`font-bold text-sm tabular-nums ${isLent ? 'text-green-600' : 'text-orange-600'}`}>
            {isLent ? '+' : '-'}{formatCurrency(data.amount, data.currency)}
        </span>
        <div className="flex gap-0.5">
            <button onClick={() => onEdit(data)} className="p-1.5 text-gray-400 hover:text-[#4285f4]"><Edit2 size={12} /></button>
            <button onClick={() => onDelete(data)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
};

const InvestmentCard = ({ data, onDelete, onEdit }) => {
    const invested = Number(data.investedAmount || 0);
    const current = Number(data.currentValue || 0);
    const profit = current - invested;
    const isProfit = profit >= 0;
    const percent = invested > 0 ? ((profit / invested) * 100).toFixed(1) : 0;

    return (
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-all group h-full">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                        {data.type === 'Crypto' ? <DollarSign size={16} /> : data.type === 'Real Estate' ? <Landmark size={16} /> : <Sprout size={16} />}
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-xs line-clamp-1">{data.name}</h3>
                        <p className="text-[9px] text-gray-400 uppercase font-bold tracking-tight">{data.type}</p>
                    </div>
                </div>
                <div className="flex">
                    <button onClick={() => onEdit(data)} className="p-1 text-gray-300 hover:text-blue-600"><Edit2 size={12} /></button>
                    <button onClick={() => onDelete(data)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-auto">
                <div>
                    <span className="text-[9px] text-gray-400 uppercase font-bold">Invested</span>
                    <p className="text-xs font-semibold text-gray-600">{formatCurrency(invested, data.currency)}</p>
                </div>
                <div className="text-right">
                    <span className="text-[9px] text-gray-400 uppercase font-bold">Value</span>
                    <p className="text-sm font-bold text-gray-900">{formatCurrency(current, data.currency)}</p>
                </div>
            </div>
            <div className={`mt-2 text-[10px] font-bold px-2 py-1 rounded flex justify-between items-center ${isProfit ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <span>{isProfit ? 'Profit' : 'Loss'}</span>
                <span>{isProfit ? '+' : ''}{formatCurrency(profit, data.currency)} ({percent}%)</span>
            </div>
        </div>
    );
};

const SubscriptionCard = ({ data, onDelete, onEdit }) => (
  <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between h-full hover:shadow-md transition-all group">
    <div className="flex justify-between items-start mb-2">
      <div className="flex items-center gap-2">
        <div className="bg-purple-50 p-2 rounded-lg text-purple-600"><Repeat size={16} /></div>
        <div>
          <h3 className="font-bold text-gray-800 text-xs line-clamp-1">{data.name}</h3>
          <p className="text-[9px] text-gray-400">{data.cycle || 'Monthly'}</p>
        </div>
      </div>
      <div className="flex">
        <button onClick={() => onEdit(data)} className="p-1 text-gray-300 hover:text-purple-600"><Edit2 size={12} /></button>
        <button onClick={() => onDelete(data)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
      </div>
    </div>
    <div className="flex items-end justify-between mt-auto">
      <div className="text-[10px] text-gray-400">Next: <span className="font-medium text-gray-600">{formatDate(data.nextDate)}</span></div>
      <span className="text-sm font-bold text-gray-900">{formatCurrency(data.amount, data.currency)}<span className="text-[10px] text-gray-400 font-normal">/mo</span></span>
    </div>
  </div>
);

// --- STATS VIEW ---
const StatsView = ({ items, currentCurrency }) => {
    const [timeframe, setTimeframe] = useState('all');

    // 1. Filter items by Currency and Timeframe
    const viewItems = useMemo(() => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        return items.filter(i => {
            if (i.currency !== currentCurrency) return false;
            
            // Handle multiple date formats (ISO string or Firestore Timestamp)
            const dateValue = i.date || (i.createdAt?.toDate ? i.createdAt.toDate() : i.createdAt);
            const itemDate = new Date(dateValue);
            
            if (timeframe === 'month') return itemDate >= startOfMonth;
            if (timeframe === 'year') return itemDate >= startOfYear;
            return true;
        });
    }, [items, currentCurrency, timeframe]);

    // 2. Calculate All Stats
    const stats = useMemo(() => {
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

        // Financial Health Metrics
        const totalAssets = currentTotal + lent + Math.max(0, liquidCash);
        const debtRatio = totalAssets > 0 ? (borrowed / totalAssets) * 100 : 0;
        const roiPercentage = investedTotal > 0 ? ((currentTotal - investedTotal) / investedTotal) * 100 : 0;
        const expenseRatio = income > 0 ? (expenses / income) * 100 : 0;
        const investPercent = totalAssets > 0 ? (currentTotal / totalAssets) * 100 : 0;

        // Runway logic (Daily burn based on expenses)
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
    }, [viewItems]);

    const ProgressBar = ({ label, value, max, colorClass }) => (
        <div className="mt-3">
            <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500 font-medium">{label}</span>
                <span className="font-bold text-gray-700">{formatCurrency(value, currentCurrency)}</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.min((value / (max || 1)) * 100, 100)}%` }} />
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Timeframe Picker */}
            <div className="flex justify-between items-center px-1">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Dashboard</h3>
                <div className="flex bg-gray-200/60 p-1 rounded-xl">
                    {['month', 'year', 'all'].map((t) => (
                        <button
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={`px-4 py-1 rounded-lg text-[10px] font-bold capitalize transition-all ${
                                timeframe === t ? 'bg-white text-[#4285f4] shadow-sm scale-105' : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Net Worth Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
                <span className="text-blue-200 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    Net Worth ({currentCurrency})
                </span>
                <h2 className="text-3xl font-bold mt-1 mb-4">{formatCurrency(stats.netWorth, currentCurrency)}</h2>
                <div className="flex gap-4 text-xs">
                    <div className="bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                        <span className="text-blue-200 block">Assets</span>
                        <span className="font-mono">
                            {formatCurrency(stats.currentTotal + stats.lent + Math.max(0, stats.income - stats.expenses), currentCurrency)}
                        </span>
                    </div>
                    <div className="bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                        <span className="text-blue-200 block">Liabilities</span>
                        <span className="font-mono">{formatCurrency(stats.borrowed, currentCurrency)}</span>
                    </div>
                </div>
            </div>

            {/* Cash Flow & Investments Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><DollarSign size={18} className="text-green-500" /> Cash Flow</h3>
                    <ProgressBar label="Income" value={stats.income} max={Math.max(stats.income, stats.expenses)} colorClass="bg-green-500" />
                    <ProgressBar label="Expenses" value={stats.expenses} max={Math.max(stats.income, stats.expenses)} colorClass="bg-red-500" />
                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-xs text-gray-500">Savings Rate</span>
                        <span className={`text-sm font-bold ${stats.savingsRate > 0 ? 'text-green-600' : 'text-red-500'}`}>{stats.savingsRate.toFixed(1)}%</span>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><Sprout size={18} className="text-blue-500" /> Investments</h3>
                    <div className="mt-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold text-[10px]">Invested</p>
                            <p className="text-lg font-bold text-gray-700">{formatCurrency(stats.investedTotal, currentCurrency)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-400 uppercase font-bold text-[10px]">Current Value</p>
                            <p className={`text-lg font-bold ${stats.currentTotal >= stats.investedTotal ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(stats.currentTotal, currentCurrency)}</p>
                        </div>
                    </div>
                    <div className="mt-4 pt-2 border-t border-gray-100">
                        <p className={`text-sm text-center font-bold ${stats.currentTotal >= stats.investedTotal ? 'text-green-600' : 'text-red-500'}`}>
                            {stats.currentTotal >= stats.investedTotal ? '+' : ''}{formatCurrency(stats.currentTotal - stats.investedTotal, currentCurrency)} ({stats.roiPercentage.toFixed(1)}%)
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Debt Ratio</p>
                    <p className={`text-sm font-bold ${stats.debtRatio > 40 ? 'text-orange-500' : 'text-green-600'}`}>
                        {stats.debtRatio.toFixed(1)}%
                    </p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Fixed Subs</p>
                    <p className="text-sm font-bold text-purple-600">
                        {formatCurrency(stats.monthlySubs, currentCurrency)}
                    </p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-right">
                    <p className="text-[10px] uppercase font-bold text-gray-400">Asset Split</p>
                    <p className="text-sm font-bold text-blue-500">{stats.investPercent.toFixed(0)}% Inv</p>
                </div>
            </div>

            {/* Health Check Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                    <Settings size={18} className="text-gray-400" /> Financial Health
                </h3>
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500 font-medium">Expense-to-Income Ratio</span>
                            <span className="font-bold text-gray-700">{stats.expenseRatio.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full">
                            <div 
                                className={`h-full rounded-full transition-all duration-500 ${stats.expenseRatio > 80 ? 'bg-red-500' : 'bg-indigo-500'}`} 
                                style={{ width: `${Math.min(stats.expenseRatio, 100)}%` }} 
                            />
                        </div>
                    </div>

                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                        <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400">Cash Runway</p>
                            <p className="text-lg font-bold text-gray-800">
                                {timeframe === 'month' ? Math.floor(stats.bufferDays) : '--'} Days
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] uppercase font-bold text-gray-400">Status</p>
                            <p className={`text-sm font-bold ${stats.netWorth > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {stats.netWorth > 0 ? 'Surplus' : 'Deficit'}
                            </p>
                        </div>
                    </div>
                    {timeframe !== 'month' && (
                        <p className="text-[10px] text-gray-400 text-center italic">
                            Runway calculation is most accurate in "Month" view.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP ---

const FinanceApp = ({ user, cryptoKey, onExit }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expenses'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // Settings
  const [userCurrencies, setUserCurrencies] = useState(['KRW']);
  const [viewCurrency, setViewCurrency] = useState('KRW');
  const [categories, setCategories] = useState({});

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        setTouchEnd(null); // Reset
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe || isRightSwipe) {
            const currentIndex = TABS.indexOf(activeTab);
            let nextIndex = currentIndex;

            if (isLeftSwipe && currentIndex < TABS.length - 1) {
                nextIndex = currentIndex + 1;
            } else if (isRightSwipe && currentIndex > 0) {
                nextIndex = currentIndex - 1;
            }

            if (nextIndex !== currentIndex) {
                setActiveTab(TABS[nextIndex]);
                // Optional: Provide haptic feedback or scroll tab bar into view
                document.getElementById(`tab-${TABS[nextIndex]}`)?.scrollIntoView({
                    behavior: 'smooth', block: 'nearest', inline: 'center'
                });
            }
        }
    };

  // Load Data
  useEffect(() => {
    if (!user || !cryptoKey) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'finance'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, async (snap) => {
      const decrypted = await Promise.all(snap.docs.map(async d => {
        const raw = d.data();
        const data = await decryptData(raw, cryptoKey);
        return { id: d.id, ...data };
      }));
      setItems(decrypted);
      setLoading(false);
    });

    const configRef = doc(db, 'artifacts', appId, 'users', user.uid, 'finance_settings', 'config');
    getDoc(configRef).then(async (snap) => {
        if (snap.exists()) {
            const data = await decryptData(snap.data(), cryptoKey);
            if(data) {
                if(data.activeCurrencies) {
                    setUserCurrencies(data.activeCurrencies);
                    // Default to first if current view is invalid
                    if(!data.activeCurrencies.includes(viewCurrency) && data.activeCurrencies.length > 0) {
                        setViewCurrency(data.activeCurrencies[0]);
                    }
                }
                if(data.categories) setCategories(data.categories);
            }
        }
    });
    return () => unsub();
  }, [user, cryptoKey, viewCurrency]);

  const filteredItems = useMemo(() => {
      return items.filter(i => i.type === activeTab && i.currency === viewCurrency);
  }, [items, activeTab, viewCurrency]);

  const currentMonthTotal = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Filter items belonging to the current month and current currency
    const monthlyItems = items.filter(i => {
        const dateValue = i.date || i.dueDate || i.nextDate || (i.createdAt?.toDate ? i.createdAt.toDate() : i.createdAt);
        const itemDate = new Date(dateValue);
        return i.currency === viewCurrency && itemDate >= startOfMonth;
    });

    // Calculate based on active tab
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
            return { lent, borrowed }; // Debts return an object since you need both
        default:
            return 0;
    }
  }, [items, activeTab, viewCurrency]);

  const handleSave = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.type = activeTab; 
    data.currency = viewCurrency; 
    const encrypted = await encryptData(data, cryptoKey);

    if (editingItem) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'finance', editingItem.id), { ...encrypted, updatedAt: serverTimestamp() });
    } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'finance'), { ...encrypted, createdAt: serverTimestamp() });
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleDelete = async () => {
    if (deleteConfirm) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'finance', deleteConfirm.id));
        setDeleteConfirm(null);
    }
  };

  const openAddModal = () => { setEditingItem(null); setIsModalOpen(true); };
  const openEditModal = (item) => { setEditingItem(item); setIsModalOpen(true); };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button id={`tab-${id}`} onClick={() => setActiveTab(id)} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${activeTab === id ? 'bg-white text-[#4285f4] shadow-sm' : 'text-blue-100 hover:bg-white/10'}`}>
      <Icon size={16} /> {label}
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50 relative">
      
      {/* Header */}
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 pb-2">
        <div className="max-w-xl md:max-w-3xl mx-auto px-4 pt-4 flex flex-col gap-3">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={onExit} className="p-2 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={20} /></button>
              <h1 className="text-xl font-bold flex items-center gap-2">Finance <PieChart size={18} className="opacity-70" /></h1>
            </div>
            
            {/* Currency Selector (Top Right) */}
            <div className="relative">
                <select 
                    value={viewCurrency} 
                    onChange={(e) => setViewCurrency(e.target.value)}
                    className="bg-white/20 text-white border-none rounded-lg text-sm font-bold py-1.5 pl-3 pr-8 outline-none cursor-pointer hover:bg-white/30 transition-colors appearance-none"
                >
                    {userCurrencies.map(c => <option key={c} value={c} className="text-gray-900">{c}</option>)}
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-70"><ChevronLeft size={12} className="-rotate-90" /></div>
            </div>
          </div>

          <div className="flex p-1 bg-black/20 rounded-xl gap-1 overflow-x-auto no-scrollbar">
              <TabButton id="stats" label="Stats" icon={BarChart3} />
              <TabButton id="income" label="Income" icon={Wallet} />
              <TabButton id="expenses" label="Expenses" icon={TrendingDown} />
              <TabButton id="investments" label="Invest" icon={Sprout} />
              <TabButton id="subscriptions" label="Subs" icon={Repeat} />
              <TabButton id="debts" label="Debts" icon={Users} />
          </div>
          {activeTab !== 'stats' && (
            <div className="mt-3 px-2 py-2 bg-white/10 rounded-xl flex items-center justify-between border border-white/10">
                <div>
                    <p className="text-[10px] uppercase font-black text-blue-100/70 tracking-widest">
                        Current Month {activeTab}
                    </p>
                    <div className="flex items-baseline gap-2">
                        {activeTab === 'debts' ? (
                            <div className="flex gap-4">
                                <span className="text-sm font-bold text-green-300">
                                    Lent: {formatCurrency(currentMonthTotal.lent, viewCurrency)}
                                </span>
                                <span className="text-sm font-bold text-orange-300">
                                    Borrowed: {formatCurrency(currentMonthTotal.borrowed, viewCurrency)}
                                </span>
                            </div>
                        ) : (
                            <span className="text-lg font-bold tabular-nums">
                                {formatCurrency(currentMonthTotal, viewCurrency)}
                                {activeTab === 'subscriptions' && <span className="text-[10px] font-normal opacity-70 ml-1">est.</span>}
                            </span>
                        )}
                    </div>
                </div>
                
                {/* Visual Indicator */}
                <div className="bg-white/20 p-2 rounded-lg">
                    {activeTab === 'income' && <Wallet size={16} />}
                    {activeTab === 'expenses' && <TrendingDown size={16} />}
                    {activeTab === 'investments' && <Sprout size={16} />}
                    {activeTab === 'subscriptions' && <Repeat size={16} />}
                    {activeTab === 'debts' && <Users size={16} />}
                </div>
            </div>
        )}
        </div>
      </header>

      {/* Content */}
      <main 
        className="flex-1 overflow-y-auto scroll-smooth p-4"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="max-w-xl md:max-w-3xl mx-auto pb-20 space-y-4">
            {loading && <div className="flex justify-center py-20"><LoadingSpinner /></div>}
            
            {!loading && activeTab !== 'stats' && filteredItems.length === 0 && (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
                    <div className="bg-white p-4 rounded-full shadow-sm opacity-50"><PieChart size={32} /></div>
                    <p>No {activeTab} in {viewCurrency}.</p>
                </div>
            )}

            {activeTab === 'stats' && <StatsView items={items} currentCurrency={viewCurrency} />}

            <div className={`grid grid-cols-1 ${['investments', 'subscriptions', 'debts'].includes(activeTab) ? 'md:grid-cols-2' : ''} gap-3`}>
                {activeTab === 'income' && filteredItems.map(item => (
                    <IncomeRow key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={openEditModal} />
                ))}
                {activeTab === 'expenses' && filteredItems.map(item => (
                    <ExpenseRow key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={openEditModal} />
                ))}
                {activeTab === 'investments' && filteredItems.map(item => (
                    <InvestmentCard key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={openEditModal} />
                ))}
                {activeTab === 'subscriptions' && filteredItems.map(item => (
                    <SubscriptionCard key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={openEditModal} />
                ))}
                {activeTab === 'debts' && filteredItems.map(item => (
                    <DebtRow key={item.id} data={item} onDelete={setDeleteConfirm} onEdit={openEditModal} />
                ))}
            </div>
        </div>
      </main>

      {activeTab !== 'stats' && (
          <div className="fixed bottom-0 left-0 w-full pointer-events-none z-50 px-4 pb-6">
              <div className="max-w-xl md:max-w-3xl mx-auto flex justify-end">
                  <button 
                    onClick={openAddModal} 
                    className="pointer-events-auto p-4 bg-[#4285f4] text-white rounded-full shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center"
                  >
                      <Plus size={24} strokeWidth={3} />
                  </button>
              </div>
          </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${editingItem ? 'Edit' : 'Add'} ${activeTab}`}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
              
              {/* Note: Amount is implicitly labeled with the viewCurrency */}
              {activeTab === 'income' && (
                  <>
                    <Input name="source" label="Source" placeholder="e.g. Salary" defaultValue={editingItem?.source || ''} required autoFocus />
                    <Input name="amount" label={`Amount (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.amount || ''} required />
                    <Input name="date" label="Date" type="date" defaultValue={editingItem?.date || new Date().toISOString().split('T')[0]} required />
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Category</label>
                        <select name="category" defaultValue={editingItem?.category || ''} className="w-full p-3 border border-gray-300 rounded-lg bg-white">
                            {(categories.income || ['Salary']).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                  </>
              )}

              {activeTab === 'expenses' && (
                  <>
                    <Input name="title" label="Title" placeholder="e.g. Lunch" defaultValue={editingItem?.title || ''} required autoFocus />
                    <Input name="amount" label={`Amount (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.amount || ''} required />
                    <Input name="date" label="Date" type="date" defaultValue={editingItem?.date || new Date().toISOString().split('T')[0]} required />
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Category</label>
                        <select name="category" defaultValue={editingItem?.category || ''} className="w-full p-3 border border-gray-300 rounded-lg bg-white">
                            {(categories.expenses || ['General']).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                  </>
              )}

              {activeTab === 'investments' && (
                  <>
                    <Input name="name" label="Asset Name" placeholder="e.g. Bitcoin" defaultValue={editingItem?.name || ''} required autoFocus />
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Type</label>
                        <select name="type" defaultValue={editingItem?.type || 'Stock'} className="w-full p-3 border border-gray-300 rounded-lg bg-white">
                            {(categories.investments || ['Stock']).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-4">
                        <Input name="investedAmount" label={`Invested (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.investedAmount || ''} required className="w-1/2" />
                        <Input name="currentValue" label={`Current (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.currentValue || ''} required className="w-1/2" />
                    </div>
                  </>
              )}

              {activeTab === 'subscriptions' && (
                  <>
                    <Input name="name" label="Service Name" placeholder="e.g. Netflix" defaultValue={editingItem?.name || ''} required autoFocus />
                    <Input name="amount" label={`Cost (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.amount || ''} required />
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Cycle</label>
                        <select name="cycle" defaultValue={editingItem?.cycle || 'Monthly'} className="w-full p-3 border border-gray-300 rounded-lg bg-white">
                            <option value="Monthly">Monthly</option>
                            <option value="Yearly">Yearly</option>
                        </select>
                    </div>
                    <Input name="nextDate" label="Next Billing Date" type="date" defaultValue={editingItem?.nextDate || ''} required />
                  </>
              )}

              {activeTab === 'debts' && (
                  <>
                    <div className="flex gap-2 p-1 bg-gray-100 rounded-lg mb-2">
                        <label className="flex-1 cursor-pointer">
                            <input type="radio" name="subType" value="lent" defaultChecked={!editingItem || editingItem?.subType === 'lent'} className="peer hidden" />
                            <div className="py-2 text-center text-sm font-bold text-gray-500 rounded-md peer-checked:bg-green-100 peer-checked:text-green-700 transition-all">I Lent</div>
                        </label>
                        <label className="flex-1 cursor-pointer">
                            <input type="radio" name="subType" value="borrowed" defaultChecked={editingItem?.subType === 'borrowed'} className="peer hidden" />
                            <div className="py-2 text-center text-sm font-bold text-gray-500 rounded-md peer-checked:bg-orange-100 peer-checked:text-orange-700 transition-all">I Borrowed</div>
                        </label>
                    </div>
                    <Input name="person" label="Person Name" placeholder="Who?" defaultValue={editingItem?.person || ''} required />
                    <Input name="amount" label={`Amount (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.amount || ''} required />
                    <Input name="dueDate" label="Due Date" type="date" defaultValue={editingItem?.dueDate || ''} />
                  </>
              )}

              <Button type="submit" className="w-full mt-2 bg-[#4285f4] hover:bg-blue-600">Save</Button>
          </form>
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Item">
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure? This cannot be undone.</div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default FinanceApp;