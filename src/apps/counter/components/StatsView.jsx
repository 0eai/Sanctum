// src/apps/counter/components/StatsView.jsx
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, BarChart2 } from 'lucide-react';
import SimpleBarChart from './SimpleBarChart';
import { formatDuration } from '../../../lib/dateUtils';

const StatsView = ({ entries, mode }) => {
  const [calendarDate, setCalendarDate] = useState(new Date());

  const { stats, dailyCounts, chartData, monthlyTotal, yearlyTotal } = useMemo(() => {
    if (!entries.length) return { stats: null, dailyCounts: {}, chartData: [] };
    
    const now = new Date();
    // Time boundaries for rolling stats
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const dCounts = {};
    let totalDurationMs = 0;
    
    // Counters
    let todayC = 0, monthC = 0, yearC = 0;
    let last24Hours = 0, last7Days = 0, last30Days = 0;
    
    // Stats Logic
    entries.forEach(e => {
      if (e.timestamp) {
        // Duration Sum
        if (mode === 'range' && e.endTimestamp) {
            totalDurationMs += (e.endTimestamp - e.timestamp);
        }
        
        // Heatmap Data
        const dateKey = new Date(e.timestamp.getFullYear(), e.timestamp.getMonth(), e.timestamp.getDate()).toLocaleDateString('en-CA');
        dCounts[dateKey] = (dCounts[dateKey] || 0) + 1;

        // Calendar Periods
        if (e.timestamp.toDateString() === now.toDateString()) todayC++;
        if (e.timestamp.getMonth() === now.getMonth() && e.timestamp.getFullYear() === now.getFullYear()) monthC++;
        if (e.timestamp.getFullYear() === now.getFullYear()) yearC++;

        // Rolling Periods (Restored)
        if (e.timestamp >= oneDayAgo) last24Hours++;
        if (e.timestamp >= oneWeekAgo) last7Days++;
        if (e.timestamp >= oneMonthAgo) last30Days++;
      }
    });

    // Chart Data (Last 14 days)
    const chart = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      chart.push({
        label: d.getDate() === now.getDate() ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        value: dCounts[key] || 0
      });
    }

    // Calendar Heatmap Totals (based on currently selected calendar view)
    const calYear = calendarDate.getFullYear();
    const calMonth = calendarDate.getMonth();
    let mTotal = 0, yTotal = 0;
    entries.forEach(e => {
        if(e.timestamp?.getFullYear() === calYear) {
            yTotal++;
            if(e.timestamp.getMonth() === calMonth) mTotal++;
        }
    });

    return {
      stats: { 
          total: entries.length, 
          today: todayC, 
          thisMonth: monthC, 
          thisYear: yearC, 
          last24Hours, // Restored
          last7Days,   // Restored
          last30Days,  // Restored
          totalDuration: totalDurationMs, 
          avgDuration: entries.length ? totalDurationMs / entries.length : 0 
      },
      dailyCounts: dCounts,
      chartData: chart,
      monthlyTotal: mTotal,
      yearlyTotal: yTotal
    };
  }, [entries, mode, calendarDate]);

  const prevMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  const nextMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));

  if (!entries.length) return <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300"><p className="text-gray-500">Add entries to see stats</p></div>;

  return (
    <div className="space-y-4 animate-in slide-in-from-right-4 duration-200 fade-in">
        {/* Bar Chart */}
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-800 text-sm mb-2">Activity (Last 14 Days)</h3>
            <SimpleBarChart data={chartData} />
        </div>

        {/* Heatmap Calendar */}
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="font-bold text-gray-800 text-lg leading-tight">{calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                    <p className="text-xs text-gray-500 font-semibold mt-0.5">{monthlyTotal} this month • {yearlyTotal} in {calendarDate.getFullYear()}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} className="text-gray-600" /></button>
                    <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight size={20} className="text-gray-600" /></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">{['S','M','T','W','T','F','S'].map((d, i) => (<div key={i} className="text-xs text-gray-400 font-bold">{d}</div>))}</div>
            <div className="grid grid-cols-7 gap-1">
                {(() => {
                    const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
                    const firstDay = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay();
                    const days = [];
                    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-10" />);
                    for (let i = 1; i <= daysInMonth; i++) {
                        const key = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), i).toLocaleDateString('en-CA');
                        const count = dailyCounts[key] || 0;
                        days.push(
                            <div key={i} className="flex flex-col items-center justify-center h-10 relative">
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all ${count > 0 ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-700'}`}>
                                    {i}
                                    {count > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full border-2 border-white">{count}</span>}
                                </div>
                            </div>
                        );
                    }
                    return days;
                })()}
            </div>
        </div>

        {/* Quick Stats Grid: Calendar Based */}
        <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">Today</p><p className="text-xl font-bold text-gray-800">{stats?.today || 0}</p></div>
            <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">Month</p><p className="text-xl font-bold text-gray-800">{stats?.thisMonth || 0}</p></div>
            <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">Year</p><p className="text-xl font-bold text-gray-800">{stats?.thisYear || 0}</p></div>
        </div>

        {/* RESTORED: Rolling Stats Grid */}
        <div className="grid grid-cols-3 gap-2">
            <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">24 Hours</p><p className="text-xl font-bold text-gray-800">{stats?.last24Hours || 0}</p></div>
            <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">7 Days</p><p className="text-xl font-bold text-gray-800">{stats?.last7Days || 0}</p></div>
            <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">30 Days</p><p className="text-xl font-bold text-gray-800">{stats?.last30Days || 0}</p></div>
        </div>

        {/* Time Analysis (Conditional) */}
        {mode === 'range' && (
            <div className="bg-[#4285f4] p-5 rounded-2xl text-white shadow-md">
                <div className="flex items-center gap-2 mb-4 opacity-90"><Clock size={20} /><span className="font-semibold">Time Analysis</span></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-xs opacity-70 uppercase font-bold mb-1">Total Time</p><p className="text-xl font-bold">{formatDuration(stats?.totalDuration)}</p></div>
                    <div><p className="text-xs opacity-70 uppercase font-bold mb-1">Avg / Entry</p><p className="text-xl font-bold">{formatDuration(stats?.avgDuration)}</p></div>
                </div>
            </div>
        )}

        {/* All Time Total */}
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div><p className="text-xs text-gray-500 font-semibold uppercase mb-1">All Time Entries</p><p className="text-2xl font-bold text-gray-800">{stats?.total || 0}</p></div>
            <div className="bg-blue-50 p-3 rounded-full text-[#4285f4]"><BarChart2 size={24} /></div>
        </div>
    </div>
  );
};

export default StatsView;