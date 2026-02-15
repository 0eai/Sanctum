// src/apps/finance/components/FinanceRows.jsx
import React from 'react';
import { 
  Wallet, TrendingDown, ArrowUpRight, ArrowDownLeft, 
  DollarSign, Landmark, Sprout, Edit2, Trash2, Repeat 
} from 'lucide-react';
import { formatDate } from '../../../lib/dateUtils';

const CURRENCY_LOCALES = {
  KRW: 'ko-KR', INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP'
};

const formatCurrency = (amount, code) => {
  return new Intl.NumberFormat(CURRENCY_LOCALES[code] || 'en-US', { 
    style: 'currency', currency: code, maximumFractionDigits: code === 'KRW' || code === 'JPY' ? 0 : 2 
  }).format(amount);
};

export const IncomeRow = ({ data, onDelete, onEdit }) => (
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

export const ExpenseRow = ({ data, onDelete, onEdit }) => (
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

export const DebtRow = ({ data, onDelete, onEdit }) => {
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

export const InvestmentCard = ({ data, onDelete, onEdit }) => {
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

export const SubscriptionCard = ({ data, onDelete, onEdit }) => (
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