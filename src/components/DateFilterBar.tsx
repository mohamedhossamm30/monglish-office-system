import React from 'react';
import { Calendar, X, Filter } from 'lucide-react';
import { getCurrentYearMonth, getLocalDateIso } from '../utils/storage';

export type DateFilterPreset = 'all' | 'today' | 'this_week' | 'this_month' | 'last_month' | 'custom';

export interface DateFilterValue {
  preset: DateFilterPreset;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  selectedMonth?: string; // YYYY-MM
}

interface DateFilterBarProps {
  value: DateFilterValue;
  onChange: (newValue: DateFilterValue) => void;
  showMonthPickerOnly?: boolean;
  label?: string;
  className?: string;
}

export const DateFilterBar: React.FC<DateFilterBarProps> = ({
  value,
  onChange,
  showMonthPickerOnly = false,
  label = 'فلترة حسب التاريخ والفترة',
  className = ''
}) => {
  const currentMonthStr = getCurrentYearMonth();
  const todayStr = getLocalDateIso();

  const handlePresetChange = (preset: DateFilterPreset) => {
    const now = new Date();
    if (preset === 'all') {
      onChange({ preset: 'all', startDate: '', endDate: '' });
    } else if (preset === 'today') {
      onChange({ preset: 'today', startDate: todayStr, endDate: todayStr });
    } else if (preset === 'this_week') {
      const day = now.getDay(); // 0 is Sunday, 6 is Saturday
      // Egypt week starts on Saturday (day 6) or Sunday
      const diffToSaturday = (day + 1) % 7;
      const start = new Date(now);
      start.setDate(now.getDate() - diffToSaturday);
      // End of week (Friday)
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      onChange({
        preset: 'this_week',
        startDate: getLocalDateIso(start),
        endDate: getLocalDateIso(end)
      });
    } else if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      onChange({
        preset: 'this_month',
        startDate: getLocalDateIso(start),
        endDate: getLocalDateIso(end),
        selectedMonth: getCurrentYearMonth(now)
      });
    } else if (preset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      onChange({
        preset: 'last_month',
        startDate: getLocalDateIso(start),
        endDate: getLocalDateIso(end),
        selectedMonth: getCurrentYearMonth(start)
      });
    } else if (preset === 'custom') {
      onChange({
        preset: 'custom',
        startDate: value.startDate || todayStr,
        endDate: value.endDate || todayStr
      });
    }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      preset: 'custom',
      startDate: e.target.value
    });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      preset: 'custom',
      endDate: e.target.value
    });
  };

  const handleReset = () => {
    onChange({ preset: 'all', startDate: '', endDate: '' });
  };

  const hasActiveFilter = value.preset !== 'all' || !!value.startDate || !!value.endDate;

  return (
    <div
      className={`bg-white rounded-2xl p-3 text-stone-800 text-sm shadow-xs border border-stone-200 flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      {/* Preset Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1.5 text-xs text-stone-500 ml-1 font-bold">
          <Calendar className="w-3.5 h-3.5 text-[#075073]" />
          <span>{label}:</span>
        </div>

        <button
          type="button"
          onClick={() => handlePresetChange('all')}
          className={`px-3 py-1.5 text-xs rounded-xl font-bold transition-all cursor-pointer ${
            value.preset === 'all'
              ? 'bg-[#075073] text-white shadow-xs'
              : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
          }`}
        >
          الكل
        </button>

        <button
          type="button"
          onClick={() => handlePresetChange('today')}
          className={`px-3 py-1.5 text-xs rounded-xl font-bold transition-all cursor-pointer ${
            value.preset === 'today'
              ? 'bg-[#075073] text-white shadow-xs'
              : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
          }`}
        >
          اليوم
        </button>

        <button
          type="button"
          onClick={() => handlePresetChange('this_week')}
          className={`px-3 py-1.5 text-xs rounded-xl font-bold transition-all cursor-pointer ${
            value.preset === 'this_week'
              ? 'bg-[#075073] text-white shadow-xs'
              : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
          }`}
        >
          هذا الأسبوع
        </button>

        <button
          type="button"
          onClick={() => handlePresetChange('this_month')}
          className={`px-3 py-1.5 text-xs rounded-xl font-bold transition-all cursor-pointer ${
            value.preset === 'this_month'
              ? 'bg-[#075073] text-white shadow-xs'
              : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
          }`}
        >
          هذا الشهر
        </button>

        <button
          type="button"
          onClick={() => handlePresetChange('last_month')}
          className={`px-3 py-1.5 text-xs rounded-xl font-bold transition-all cursor-pointer ${
            value.preset === 'last_month'
              ? 'bg-[#075073] text-white shadow-xs'
              : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
          }`}
        >
          الشهر السابق
        </button>

        <button
          type="button"
          onClick={() => handlePresetChange('custom')}
          className={`px-3 py-1.5 text-xs rounded-xl font-bold transition-all cursor-pointer ${
            value.preset === 'custom'
              ? 'bg-[#075073] text-white shadow-xs'
              : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
          }`}
        >
          تاريخ مخصص
        </button>
      </div>

      {/* Date Pickers (From / To) */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-stone-50 px-2.5 py-1 rounded-xl border border-stone-200">
          <span className="text-[11px] text-stone-500 font-bold">من:</span>
          <input
            type="date"
            value={value.startDate || ''}
            onChange={handleStartDateChange}
            className="bg-transparent text-xs text-stone-800 outline-none font-mono cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-stone-50 px-2.5 py-1 rounded-xl border border-stone-200">
          <span className="text-[11px] text-stone-500 font-bold">إلى:</span>
          <input
            type="date"
            value={value.endDate || ''}
            onChange={handleEndDateChange}
            className="bg-transparent text-xs text-stone-800 outline-none font-mono cursor-pointer"
          />
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
            title="إلغاء الفلترة وعرض الكل"
          >
            <X className="w-3.5 h-3.5" />
            <span className="text-[11px]">إلغاء الفلتر</span>
          </button>
        )}
      </div>
    </div>
  );
};
