// src/apps/alerts/components/AlertCard.jsx
import React from 'react';
import { 
  CheckCircle, FileText, CheckSquare, TrendingUp, CalendarDays, Repeat, CreditCard, 
  Bell, ExternalLink, ArrowRight, Clock, FileCode, BellRing 
} from 'lucide-react';
import { getRelativeTime } from '../../../lib/dateUtils'; 

const getSourceIcon = (source) => {
    switch (source) {
        case 'task': return <CheckCircle size={20} />;
        case 'note': return <FileText size={20} />;
        case 'markdown': return <FileCode size={20} />; 
        case 'checklist': return <CheckSquare size={20} />;
        case 'counter': return <TrendingUp size={20} />;
        case 'calendar': return <CalendarDays size={20} />;
        case 'finance_sub': return <Repeat size={20} />;
        case 'finance_bill': return <CreditCard size={20} />;
        case 'reminder': return <BellRing size={20} />; 
        default: return <Bell size={20} />;
    }
};

const getSourceColor = (source) => {
    if (source.startsWith('finance')) return 'bg-emerald-50 text-emerald-600';
    switch (source) {
        case 'task': return 'bg-blue-50 text-blue-500';
        case 'note': return 'bg-yellow-50 text-yellow-600';
        case 'markdown': return 'bg-cyan-50 text-cyan-600'; 
        case 'checklist': return 'bg-green-50 text-green-600';
        case 'counter': return 'bg-purple-50 text-purple-600';
        case 'calendar': return 'bg-orange-50 text-orange-500';
        case 'reminder': return 'bg-rose-50 text-rose-500'; 
        default: return 'bg-gray-50 text-gray-500';
    }
};

const getSourceLabel = (source) => {
    switch (source) {
        case 'task': return 'My Tasks';
        case 'note': return 'Notes';
        case 'markdown': return 'Markdown Docs'; 
        case 'checklist': return 'Checklists';
        case 'counter': return 'Counters';
        case 'calendar': return 'Google Calendar';
        case 'finance_sub': return 'Subscriptions';
        case 'finance_bill': return 'Bills & Debts';
        case 'reminder': return 'Reminders'; 
        default: return 'System';
    }
};

const AlertCard = ({ item, onAction, onSnooze, onNavigate }) => {
    // FIXED: Reminders are also actionable right from the dashboard!
    const isActionable = ['task', 'reminder'].includes(item.source); 
    const isInternal = item.source !== 'calendar';
    const isOverdue = new Date(item.date) < new Date();

    return (
        <div className={`relative bg-white p-4 rounded-2xl border transition-all active:scale-[0.98] cursor-pointer ${isOverdue ? 'border-red-100 bg-red-50/20' : 'border-gray-100 shadow-sm'}`} onClick={() => onNavigate(item)}>
            <div className="flex items-start gap-4">
                <div className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getSourceColor(item.source)}`}>
                    {getSourceIcon(item.source)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h3 className={`font-bold text-gray-800 truncate pr-2 ${isOverdue ? 'text-red-600' : ''}`}>
                            {item.title}
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                            {getRelativeTime(item.date)}
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1">
                        {getSourceLabel(item.source)}
                        {!isInternal && <ExternalLink size={10} />}
                    </p>
                </div>
            </div>
            <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
                {isActionable ? (
                    <button onClick={(e) => { e.stopPropagation(); onAction(item); }} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-gray-50 text-green-600 hover:bg-green-50 transition-colors">
                        <CheckCircle size={14} /> Done
                    </button>
                ) : (
                    <button onClick={(e) => { e.stopPropagation(); onNavigate(item); }} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors">
                        {item.source === 'calendar' ? <ExternalLink size={14} /> : <ArrowRight size={14} />} Open
                    </button>
                )}
                {isInternal && (
                    <button onClick={(e) => { e.stopPropagation(); onSnooze(item); }} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-gray-50 text-blue-600 hover:bg-blue-50 transition-colors">
                        <Clock size={14} /> Snooze
                    </button>
                )}
            </div>
        </div>
    );
};

export default AlertCard;