import React, { useState, useMemo } from 'react';
import { SystemActivity } from '../types';
import {
  ShieldCheck,
  Search,
  Download,
  Filter,
  Trash2,
  X,
  Calendar,
  User,
  Building2,
  Clock,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet
} from 'lucide-react';
import { today } from '../utils/storage';

interface AuditLogModalProps {
  activities: SystemActivity[];
  onClearActivities?: () => void;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({
  activities,
  onClearActivities,
  onClose,
  showToast
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'WEEK'>('ALL');

  // Extract unique departments and actions for filter dropdowns
  const departments = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((a) => {
      if (a.dept) set.add(a.dept);
    });
    return Array.from(set);
  }, [activities]);

  const actions = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((a) => {
      if (a.action) set.add(a.action);
    });
    return Array.from(set);
  }, [activities]);

  const todayStr = today();

  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (deptFilter !== 'ALL' && act.dept !== deptFilter) return false;
      if (actionFilter !== 'ALL' && act.action !== actionFilter) return false;
      if (severityFilter !== 'ALL' && act.severity !== severityFilter) return false;

      if (dateFilter === 'TODAY' && act.date !== todayStr) return false;
      if (dateFilter === 'WEEK') {
        const now = Date.now();
        const diffDays = (now - act.ts) / (1000 * 3600 * 24);
        if (diffDays > 7) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${act.dept} ${act.action} ${act.by} ${act.details} ${act.amount || ''} ${act.date} ${act.time}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [activities, deptFilter, actionFilter, severityFilter, dateFilter, search, todayStr]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredActivities.length === 0) {
      if (showToast) showToast('لا توجد بيانات لتصديرها');
      return;
    }

    const headers = ['التاريخ', 'الوقت', 'القسم', 'نوع العملية', 'اسم المستخدم', 'البيان والتفاصيل', 'القيمة المالية (ج.م)', 'الكمية'];
    const rows = filteredActivities.map((a) => [
      a.date,
      a.time,
      a.dept,
      a.action,
      a.by,
      a.details,
      a.amount || 0,
      a.quantity || ''
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monglish_audit_log_${todayStr.replace(/\//g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (showToast) showToast('تم تصدير سجل التدقيق والأحداث بنجاح (CSV) ✓');
  };

  const getDeptColor = (dept: string) => {
    if (dept.includes('مخازن') || dept.includes('المخزن')) return 'bg-amber-100 text-amber-900 border-amber-300';
    if (dept.includes('مشتريات')) return 'bg-blue-100 text-blue-900 border-blue-300';
    if (dept.includes('صيانة')) return 'bg-orange-100 text-orange-900 border-orange-300';
    if (dept.includes('بوفيه')) return 'bg-amber-100 text-amber-800 border-amber-300';
    if (dept.includes('نظافة')) return 'bg-teal-100 text-teal-900 border-teal-300';
    if (dept.includes('استقبال') || dept.includes('خطوط')) return 'bg-indigo-100 text-indigo-900 border-indigo-300';
    return 'bg-stone-100 text-stone-800 border-stone-300';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#03151F]/80 backdrop-blur-xs" dir="rtl">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[94dvh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#075073] to-[#03151F] text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E68131]/20 border border-[#E68131]/40 flex items-center justify-center text-[#E68131] shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>سجل أحداث وتدقيق النظام (Audit Log)</span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-amber-200 border border-white/15">
                  شفافية كاملة
                </span>
              </h2>
              <p className="text-xs text-white/70">
                توثيق فوري لجميع العمليات: اسم القسم، نوع العملية، واسم المستخدم المنفذ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="تصدير السجل إلى ملف Excel/CSV"
            >
              <Download className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">تصدير CSV / Excel</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="p-3 sm:p-4 bg-stone-50 border-b border-stone-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {/* Search Input */}
            <div className="relative sm:col-span-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث باسم القسم، المستخدم، البيان، الصنف..."
                className="w-full bg-white pr-9 pl-3 py-2 rounded-xl border border-stone-200 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-[#075073] focus:ring-1 focus:ring-[#075073]"
              />
              <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>

            {/* Department Filter */}
            <div>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full bg-white px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:outline-none focus:border-[#075073]"
              >
                <option value="ALL">🏢 كل الأقسام ({departments.length})</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Date Filter */}
            <div>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="w-full bg-white px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:outline-none focus:border-[#075073]"
              >
                <option value="ALL">📅 كل التواريخ</option>
                <option value="TODAY">أحداث اليوم فقط</option>
                <option value="WEEK">آخر 7 أيام</option>
              </select>
            </div>
          </div>

          {/* Quick Summary Pill Bar */}
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium pt-1">
            <div className="flex items-center gap-3">
              <span>إجمالي العمليات المعروضة: <strong className="text-stone-800 font-bold font-mono">{filteredActivities.length}</strong></span>
              <span>•</span>
              <span>أحداث اليوم: <strong className="text-emerald-700 font-bold font-mono">{activities.filter((a) => a.date === todayStr).length}</strong></span>
            </div>

            {onClearActivities && activities.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('هل أنت متأكد من رغبتك في أرشفة ومسح سجل التدقيق بالكامل؟ لا يمكن التراجع عن هذا الإجراء.')) {
                    onClearActivities();
                    if (showToast) showToast('تم مسح سجل الأحداث بنجاح');
                  }
                }}
                className="text-rose-600 hover:text-rose-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>مسح وأرشفة السجل</span>
              </button>
            )}
          </div>
        </div>

        {/* Audit Log Table Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-stone-50/50">
          {filteredActivities.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-stone-700">لا توجد عمليات تطابق معايير البحث</h4>
              <p className="text-xs text-stone-500 mt-1">
                جرب تغيير خيارات التصفية أو إفراغ خانة البحث.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#f4efe2] text-[#075073] border-b border-stone-200 font-black">
                    <tr>
                      <th className="py-3 px-3.5 whitespace-nowrap">التوقيت والتاريخ</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">اسم القسم</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">نوع العملية</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">المستخدم المنفذ</th>
                      <th className="py-3 px-3.5">البيان والتفاصيل</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">القيمة / الكمية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium">
                    {filteredActivities.map((act) => {
                      const colorClass = getDeptColor(act.dept);
                      return (
                        <tr key={act.id} className="hover:bg-stone-50 transition-colors">
                          <td className="py-3 px-3.5 whitespace-nowrap text-stone-500 font-mono text-[11px]">
                            <div>{act.date}</div>
                            <div className="text-stone-400 text-[10px]">{act.time}</div>
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${colorClass}`}>
                              {act.dept}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="font-bold text-stone-900 flex items-center gap-1.5">
                              {act.severity === 'critical' && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>}
                              {act.severity === 'warning' && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>}
                              <span>{act.action}</span>
                            </div>
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="font-bold text-[#075073] flex items-center gap-1">
                              <User className="w-3 h-3 text-stone-400" />
                              <span>{act.by}</span>
                            </div>
                          </td>

                          <td className="py-3 px-3.5 text-stone-700 max-w-md break-words leading-relaxed text-xs">
                            {act.details}
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap font-mono text-xs">
                            {act.amount !== undefined && act.amount > 0 ? (
                              <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                {act.amount.toLocaleString()} ج.م
                              </span>
                            ) : act.quantity !== undefined ? (
                              <span className="font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                {act.quantity}
                              </span>
                            ) : (
                              <span className="text-stone-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-stone-200 flex items-center justify-between gap-3">
          <div className="text-xs text-stone-500 font-medium">
            جميع الأحداث مسجلة ومحفوظة تلقائياً لتعزيز الرقابة والحوكمة المؤسسية.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors cursor-pointer"
          >
            إغلاق السجل
          </button>
        </div>
      </div>
    </div>
  );
};
