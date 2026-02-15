// src/apps/finance/components/StatsView.jsx
import React, { useState, useMemo } from 'react';
import { DollarSign, Sprout, Settings } from 'lucide-react';
import { calculateStats } from '../../../services/finance';

const CURRENCY_LOCALES = { KRW: 'ko-KR', INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP' };
const formatCurrency = (amount, code) => new Intl.NumberFormat(CURRENCY_LOCALES[code] || 'en-US', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(amount);

const ProgressBar = ({ label, value, max, colorClass, currency }) => (
    <div className="mt-3">
        <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500 font-medium">{label}</span>
            <span className="font-bold text-gray-700">{formatCurrency(value, currency)}</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.min((value / (max || 1)) * 100, 100)}%` }} />
        </div>
    </div>
);

const StatsView = ({ items, currentCurrency }) => {
    const [timeframe, setTimeframe] = useState('all');
    const stats = useMemo(() => calculateStats(items, currentCurrency, timeframe), [items, currentCurrency, timeframe]);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Dashboard</h3>
                <div className="flex bg-gray-200/60 p-1 rounded-xl">
                    {['month', 'year', 'all'].map((t) => (
                        <button key={t} onClick={() => setTimeframe(t)} className={`px-4 py-1 rounded-lg text-[10px] font-bold capitalize transition-all ${timeframe === t ? 'bg-white text-[#4285f4] shadow-sm scale-105' : 'text-gray-500 hover:text-gray-700'}`}>{t}</button>
                    ))}
                </div>
            </div>

            {/* Net Worth Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
                <span className="text-blue-200 text-xs font-bold uppercase tracking-wider flex items-center gap-2">Net Worth ({currentCurrency})</span>
                <h2 className="text-3xl font-bold mt-1 mb-4">{formatCurrency(stats.netWorth, currentCurrency)}</h2>
                <div className="flex gap-4 text-xs">
                    <div className="bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-sm"><span className="text-blue-200 block">Assets</span><span className="font-mono">{formatCurrency(stats.currentTotal + stats.lent + Math.max(0, stats.income - stats.expenses), currentCurrency)}</span></div>
                    <div className="bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-sm"><span className="text-blue-200 block">Liabilities</span><span className="font-mono">{formatCurrency(stats.borrowed, currentCurrency)}</span></div>
                </div>
            </div>

            {/* Cash Flow & Investments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><DollarSign size={18} className="text-green-500" /> Cash Flow</h3>
                    <ProgressBar label="Income" value={stats.income} max={Math.max(stats.income, stats.expenses)} colorClass="bg-green-500" currency={currentCurrency} />
                    <ProgressBar label="Expenses" value={stats.expenses} max={Math.max(stats.income, stats.expenses)} colorClass="bg-red-500" currency={currentCurrency} />
                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center"><span className="text-xs text-gray-500">Savings Rate</span><span className={`text-sm font-bold ${stats.savingsRate > 0 ? 'text-green-600' : 'text-red-500'}`}>{stats.savingsRate.toFixed(1)}%</span></div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><Sprout size={18} className="text-blue-500" /> Investments</h3>
                    <div className="mt-4 flex items-center justify-between">
                        <div><p className="text-xs text-gray-400 uppercase font-bold text-[10px]">Invested</p><p className="text-lg font-bold text-gray-700">{formatCurrency(stats.investedTotal, currentCurrency)}</p></div>
                        <div className="text-right"><p className="text-xs text-gray-400 uppercase font-bold text-[10px]">Current Value</p><p className={`text-lg font-bold ${stats.currentTotal >= stats.investedTotal ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(stats.currentTotal, currentCurrency)}</p></div>
                    </div>
                    <div className="mt-4 pt-2 border-t border-gray-100"><p className={`text-sm text-center font-bold ${stats.currentTotal >= stats.investedTotal ? 'text-green-600' : 'text-red-500'}`}>{stats.currentTotal >= stats.investedTotal ? '+' : ''}{formatCurrency(stats.currentTotal - stats.investedTotal, currentCurrency)} ({stats.roiPercentage.toFixed(1)}%)</p></div>
                </div>
            </div>

            {/* Quick Stats & Health */}
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm"><p className="text-[10px] uppercase font-bold text-gray-400">Debt Ratio</p><p className={`text-sm font-bold ${stats.debtRatio > 40 ? 'text-orange-500' : 'text-green-600'}`}>{stats.debtRatio.toFixed(1)}%</p></div>
                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] uppercase font-bold text-gray-400">Fixed Subs</p><p className="text-sm font-bold text-purple-600">{formatCurrency(stats.monthlySubs, currentCurrency)}</p></div>
                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-right"><p className="text-[10px] uppercase font-bold text-gray-400">Asset Split</p><p className="text-sm font-bold text-blue-500">{stats.investPercent.toFixed(0)}% Inv</p></div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4"><Settings size={18} className="text-gray-400" /> Financial Health</h3>
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-xs mb-1"><span className="text-gray-500 font-medium">Expense-to-Income Ratio</span><span className="font-bold text-gray-700">{stats.expenseRatio.toFixed(1)}%</span></div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full"><div className={`h-full rounded-full transition-all duration-500 ${stats.expenseRatio > 80 ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(stats.expenseRatio, 100)}%` }} /></div>
                    </div>
                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                        <div><p className="text-[10px] uppercase font-bold text-gray-400">Cash Runway</p><p className="text-lg font-bold text-gray-800">{timeframe === 'month' ? Math.floor(stats.bufferDays) : '--'} Days</p></div>
                        <div className="text-right"><p className="text-[10px] uppercase font-bold text-gray-400">Status</p><p className={`text-sm font-bold ${stats.netWorth > 0 ? 'text-green-600' : 'text-red-500'}`}>{stats.netWorth > 0 ? 'Surplus' : 'Deficit'}</p></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatsView;