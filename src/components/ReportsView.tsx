import React, { useMemo, useState } from 'react';
import {
  CleaningHistory,
  CleaningTask,
  DepartmentRequest,
  InventoryItem,
  MaintenanceTicket,
  MobileLine,
  PurchaseOrder,
  RoleKey,
  StockMove
} from '../types';
import {
  exportAllDataJson,
  fmtDuration,
  getCurrentYearMonth,
  isDateInYearMonth,
  normalizeDateToIso,
  today
} from '../utils/storage';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Package,
  PhoneCall,
  Printer,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Wrench,
  AlertTriangle,
  Clock
} from 'lucide-react';

interface ReportsViewProps {
  items: InventoryItem[];
  moves: StockMove[];
  proc: PurchaseOrder[];
  maint: MaintenanceTicket[];
  clean: CleaningTask[];
  cleanHist: CleaningHistory[];
  lines: MobileLine[];
  reqs: DepartmentRequest[];
  currentRole: RoleKey;
  onExportCSV: (type: string) => void;
  onImportBackupJson: (jsonData: any) => void;
  showToast: (msg: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  items = [],
  moves = [],
  proc = [],
  maint = [],
  clean = [],
  cleanHist = [],
  lines = [],
  reqs = [],
  currentRole,
  onExportCSV,
  onImportBackupJson,
  showToast
}) => {
  // Load saved reconciliation data if available
  const [lastRecon] = useState(() => {
    try {
      const raw = localStorage.getItem('monglish_last_recon');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Monthly filtering state — default to 'all' so reports immediately reflect actual total branch records
  const currMonthPrefix = getCurrentYearMonth();
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  // Available months generator: 36 months back to 18 months forward + 'all'
  const availableMonths = useMemo(() => {
    const list: { id: string; label: string }[] = [
      { id: 'all', label: '📊 كافة الفترات / إجمالي الفرع بالكامل (عرض الكل)' }
    ];
    const now = new Date();
    for (let offset = 18; offset >= -36; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const id = `${year}-${month}`;
      const monthNameAr = d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
      const isCurrent = id === currMonthPrefix;
      list.push({
        id,
        label: `${monthNameAr} (${id})${isCurrent ? ' — الشهر الحالي ⭐' : ''}`
      });
    }
    return list;
  }, [currMonthPrefix]);

  const handlePrevMonth = () => {
    if (selectedMonth === 'all') {
      setSelectedMonth(currMonthPrefix);
      return;
    }
    const [yStr, mStr] = selectedMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = new Date(y, m - 2, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
  };

  const handleNextMonth = () => {
    if (selectedMonth === 'all') {
      setSelectedMonth(currMonthPrefix);
      return;
    }
    const [yStr, mStr] = selectedMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = new Date(y, m, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
  };

  // Inventory valuation (current state)
  const totalStockValuation = items.reduce((a, i) => a + i.balance * (i.cost || 0), 0);
  const lowStockItems = items.filter((i) => i.balance < i.min);
  const outOfStockItems = items.filter((i) => i.balance <= 0);
  const stockHealthyPct = items.length ? Math.round(((items.length - lowStockItems.length) / items.length) * 100) : 100;

  // Helper for extracting clean ISO date from maintenance ticket
  const getTicketDate = (t: MaintenanceTicket): string => {
    if (t.isoDate && typeof t.isoDate === 'string' && t.isoDate.trim()) {
      const norm = normalizeDateToIso(t.isoDate);
      if (norm) return norm;
    }
    if (t.date && typeof t.date === 'string' && t.date.trim()) {
      const norm = normalizeDateToIso(t.date);
      if (norm) return norm;
    }
    if (t.createdTs && typeof t.createdTs === 'number' && t.createdTs > 0) {
      return normalizeDateToIso(t.createdTs);
    }
    return '';
  };

  // Monthly filtered datasets
  const filteredProc = useMemo(() => {
    return proc.filter((p) => {
      if (selectedMonth === 'all') return true;
      const d = p.isoDate || (p.date ? normalizeDateToIso(p.date) : '');
      return d ? isDateInYearMonth(d, selectedMonth) : false;
    });
  }, [proc, selectedMonth]);

  const filteredMaint = useMemo(() => {
    return maint.filter((t) => {
      if (selectedMonth === 'all') return true;
      const d = getTicketDate(t);
      return d ? isDateInYearMonth(d, selectedMonth) : false;
    });
  }, [maint, selectedMonth]);

  const filteredCleanHist = useMemo(() => {
    return cleanHist.filter((h) => {
      if (selectedMonth === 'all') return true;
      return isDateInYearMonth(h.date, selectedMonth);
    });
  }, [cleanHist, selectedMonth]);

  const filteredReqs = useMemo(() => {
    return reqs.filter((r) => {
      if (selectedMonth === 'all') return true;
      const d = r.date ? normalizeDateToIso(r.date) : '';
      return d ? isDateInYearMonth(d, selectedMonth) : false;
    });
  }, [reqs, selectedMonth]);

  // Procurement metrics (filtered by selected month)
  const completedProc = filteredProc.filter((p) => p.status === 'مكتمل');
  const totalProcSpend = completedProc.reduce(
    (a, o) => a + (o.lines || []).reduce((la, l) => la + l.qty * l.price, 0),
    0
  );
  const procFulfillmentPct = filteredProc.length ? Math.round((completedProc.length / filteredProc.length) * 100) : 100;

  // Supplier spend ranking for selected month
  const supplierSpendMap: Record<string, number> = {};
  completedProc.forEach((o) => {
    const s = o.supplier || 'غير محدد';
    const sum = (o.lines || []).reduce((la, l) => la + l.qty * l.price, 0);
    supplierSpendMap[s] = (supplierSpendMap[s] || 0) + sum;
  });

  const topSuppliers = Object.entries(supplierSpendMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Global all-time maintenance metrics (for absolute transparency)
  const allMaintCount = maint.length;
  const allClosedTickets = maint.filter((t) => t.status === 'مغلق');
  const allUnrepairableTickets = maint.filter((t) => t.status === 'غير قابل للإصلاح');
  const allOpenTickets = maint.filter((t) => t.status !== 'مغلق' && t.status !== 'غير قابل للإصلاح');
  const allMaintCost = allClosedTickets.reduce((a, t) => a + (t.cost || 0), 0);

  // Maintenance metrics for selected month
  const closedTickets = filteredMaint.filter((t) => t.status === 'مغلق');
  const unrepairableTickets = filteredMaint.filter((t) => t.status === 'غير قابل للإصلاح');
  const openTickets = filteredMaint.filter((t) => t.status !== 'مغلق' && t.status !== 'غير قابل للإصلاح');
  const totalMaintCost = closedTickets.reduce((a, t) => a + (t.cost || 0), 0);
  const resolvedOrDecidedCount = closedTickets.length + unrepairableTickets.length;
  const maintResolutionPct = filteredMaint.length ? Math.round((resolvedOrDecidedCount / filteredMaint.length) * 100) : 100;
  const avgResolutionTime = closedTickets.length
    ? closedTickets.reduce(
        (a, t) => (t.closedTs && t.createdTs ? a + (t.closedTs - t.createdTs) : a),
        0
      ) / closedTickets.length
    : 0;

  // Cleaning performance for selected month
  const avgCleanPct = filteredCleanHist.length
    ? Math.round(filteredCleanHist.reduce((a, h) => a + h.pct, 0) / filteredCleanHist.length)
    : clean.length
    ? Math.round((clean.filter((c) => c.done).length / clean.length) * 100)
    : 0;

  // Mobile Lines
  const activeLines = lines.filter((l) => l.status !== 'معطل' && l.employee && l.employee.trim());
  const totalTelecomBill = lines
    .filter((l) => l.status !== 'معطل')
    .reduce((a, l) => a + (l.monthlyCost || 0), 0);

  // Department Requests for selected month
  const completedReqs = filteredReqs.filter((r) => r.status === 'منجز' || (r.status as string) === 'مكتمل');
  const reqsFulfillmentPct = filteredReqs.length ? Math.round((completedReqs.length / filteredReqs.length) * 100) : 100;

  // Historical Monthly Performance Breakdown (last 6 months comparison)
  const monthlyHistoryStats = useMemo(() => {
    const historyList: {
      id: string;
      label: string;
      procSpend: number;
      procCount: number;
      maintCost: number;
      maintCount: number;
      maintTotalCount: number;
      reqsCount: number;
      cleanScore: number;
    }[] = [];

    const now = new Date();
    for (let offset = 0; offset >= -5; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const mId = `${year}-${month}`;
      const label = d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });

      // proc in mId
      const mProc = proc.filter((p) => {
        const pD = p.isoDate || (p.date ? normalizeDateToIso(p.date) : '');
        return pD && isDateInYearMonth(pD, mId) && p.status === 'مكتمل';
      });
      const mProcSpend = mProc.reduce((a, o) => a + (o.lines || []).reduce((la, l) => la + l.qty * l.price, 0), 0);

      // all maint tickets in mId
      const allMonthMaint = maint.filter((t) => {
        const tD = getTicketDate(t);
        return tD && isDateInYearMonth(tD, mId);
      });
      const mMaint = allMonthMaint.filter((t) => t.status === 'مغلق');
      const mMaintCost = mMaint.reduce((a, t) => a + (t.cost || 0), 0);

      // reqs in mId
      const mReqs = reqs.filter((r) => {
        const rD = r.date ? normalizeDateToIso(r.date) : '';
        return rD && isDateInYearMonth(rD, mId) && (r.status === 'منجز' || (r.status as string) === 'مكتمل');
      });

      // clean in mId
      const mClean = cleanHist.filter((h) => isDateInYearMonth(h.date, mId));
      const cleanScore = mClean.length ? Math.round(mClean.reduce((a, h) => a + h.pct, 0) / mClean.length) : 0;

      historyList.push({
        id: mId,
        label,
        procSpend: mProcSpend,
        procCount: mProc.length,
        maintCost: mMaintCost,
        maintCount: mMaint.length,
        maintTotalCount: allMonthMaint.length,
        reqsCount: mReqs.length,
        cleanScore
      });
    }

    return historyList;
  }, [proc, maint, reqs, cleanHist]);

  // Backup handlers
  const handleBackupDownload = () => {
    exportAllDataJson();
    showToast('تم تحميل ملف النسخة الاحتياطية الكاملة (JSON) ✓');
  };

  const handleBackupUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        onImportBackupJson(parsed);
        showToast('تمت استعادة البيانات من النسخة الاحتياطية بنجاح ✓');
      } catch (err) {
        showToast('⚠️ ملف النسخة الاحتياطية غير صالح');
      }
    };
    reader.readAsText(file);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">📊 التقارير ومؤشرات الأداء التشغيلي (KPIs)</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            التقرير التنفيذي لأداء فرع الإسكندرية ومطابقة خطوط الاتصالات — محدث بتاريخ: {today()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-[#075073] border border-stone-300 shadow-sm transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-stone-600" />
            <span>طباعة التقرير (Print / PDF)</span>
          </button>
          <button
            onClick={() => onExportCSV('all')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير مصنف Excel كامل</span>
          </button>
        </div>
      </div>

      {/* Printable Header */}
      <div className="hidden print:block border-b-2 border-[#075073] pb-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-[#075073]">أكاديمية مونجلش الدولية - مقر الإسكندرية</h1>
            <p className="text-sm font-bold text-stone-600">التقرير الإداري والتشغيلي الشامل ومؤشرات الأداء</p>
          </div>
          <div className="text-left text-xs font-mono text-stone-500">
            تاريخ الطباعة: {today()}
          </div>
        </div>
      </div>

      {/* Global Monthly Navigation Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#075073] text-white">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-[#075073]">
                🗓️ تصفية التقارير ومؤشرات الأداء شهرياً
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                {selectedMonth === 'all'
                  ? 'عرض تراكمي (كافة الفترات)'
                  : `فترة شهر: ${selectedMonth}`}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              فصل تقارير ومؤشرات كل شهر على حدة مع سهولة الرجوع للشهور السابقة ومقارنة الأداء
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick prev month button */}
          <button
            type="button"
            onClick={handlePrevMonth}
            className="px-2.5 py-1.5 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 text-xs font-bold text-stone-700 transition-all cursor-pointer"
            title="الشهر السابق"
          >
            ‹ الشهر السابق
          </button>

          {/* Month Dropdown */}
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 rounded-xl border-2 border-[#075073] bg-white text-xs font-black text-[#075073] shadow-2xs focus:ring-2 focus:ring-[#075073]/20 cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quick next month button */}
          <button
            type="button"
            onClick={handleNextMonth}
            className="px-2.5 py-1.5 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 text-xs font-bold text-stone-700 transition-all cursor-pointer"
            title="الشهر التالي"
          >
            الشهر التالي ›
          </button>

          {/* Current Month button */}
          {selectedMonth !== currMonthPrefix && (
            <button
              type="button"
              onClick={() => setSelectedMonth(currMonthPrefix)}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
            >
              📅 الشهر الحالي
            </button>
          )}

          {/* Show all button */}
          {selectedMonth !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedMonth('all')}
              className="px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-all cursor-pointer"
            >
              عرض الكل
            </button>
          )}
        </div>
      </div>

      {/* Executive Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-[#075073] shadow-sm">
          <div className="text-xs font-bold text-stone-500 mb-1">قيمة المخزون الإجمالية</div>
          <div className="text-2xl font-black font-mono text-[#075073]">
            {totalStockValuation.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span>
          </div>
          <div className="text-[11px] text-stone-400 mt-1">
            {items.length} صنف ({lowStockItems.length} تحت الحد الأدنى)
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-emerald-600 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-stone-500 mb-1">
            <span>المشتريات المعتمدة</span>
            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {selectedMonth === 'all' ? 'كافة الفترات' : selectedMonth}
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-700">
            {totalProcSpend.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span>
          </div>
          <div className="text-[11px] text-stone-400 mt-1">{completedProc.length} أمر شراء مكتمل</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-blue-600 shadow-sm">
          <div className="text-xs font-bold text-stone-500 mb-1">فاتورة خطوط الاتصالات</div>
          <div className="text-2xl font-black font-mono text-blue-700">
            {totalTelecomBill.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span>
          </div>
          <div className="text-[11px] text-stone-400 mt-1">
            {activeLines.length} خط نشط من إجمالي {lines.length} خط
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-rose-600 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-stone-500 mb-1">
              <span className="flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-rose-600" />
                تكلفة وبلاغات الصيانة
              </span>
              <span className="text-[10px] font-mono text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                {selectedMonth === 'all' ? 'كافة الفترات' : selectedMonth}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <div className="text-2xl font-black font-mono text-rose-600">
                {totalMaintCost.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span>
              </div>
              <div className="text-xs font-bold font-mono text-[#075073] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                {filteredMaint.length} بلاغ صيانة {selectedMonth !== 'all' ? `(إجمالي الفرع: ${allMaintCount})` : ''}
              </div>
            </div>
          </div>
          <div className="text-[11px] text-stone-600 mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between flex-wrap gap-1">
            <span>
              <strong className="text-emerald-700 font-mono">{closedTickets.length}</strong> تم إصلاحه · <strong className="text-amber-700 font-mono">{openTickets.length}</strong> قيد المتابعة {unrepairableTickets.length > 0 ? `· ${unrepairableTickets.length} قرار فني` : ''}
            </span>
            <span className="text-stone-400 text-[10px]">
              {selectedMonth !== 'all' && allMaintCount > filteredMaint.length
                ? `الفرع به ${allMaintCount} بلاغ كلياً`
                : avgResolutionTime ? `متوسط ${fmtDuration(avgResolutionTime)}` : 'تحديث دوري'}
            </span>
          </div>
        </div>
      </div>

      {/* Operational KPIs (مؤشرات الأداء التشغيلي الشاملة) */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Target className="w-5 h-5 text-[#075073]" />
            <h3 className="text-base font-black text-[#075073]">
              🎯 بطاقة الأداء التشغيلي ومطابقة الأقسام (Operational KPI Scorecard)
            </h3>
          </div>
          <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2.5 py-1 rounded-full">
            تحديث حي وتلقائي من قاعدة البيانات
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* KPI 1: Telecom Lines Reconciliation */}
          <div className="p-4 rounded-xl bg-[#faf8f4] border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                مطابقة خطوط الاتصالات والفواتير
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {lastRecon ? `${lastRecon.matchedCount || 0} مطابق` : 'جاهز للمطابقة'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-[#075073]">
                {lastRecon ? `${Math.round(((lastRecon.matchedCount || 0) / (lines.length || 1)) * 100)}%` : '100%'}
              </span>
              <span className="text-xs text-stone-500">
                {lines.length} خط مسجل بالفرع
              </span>
            </div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{
                  width: `${lastRecon ? Math.min(100, Math.round(((lastRecon.matchedCount || 0) / (lines.length || 1)) * 100)) : 100}%`
                }}
              />
            </div>
            <p className="text-[11px] text-stone-500 leading-normal">
              {lastRecon
                ? `آخر مطابقة: ${lastRecon.matchedCount} مطابق | ${lastRecon.missingCount || 0} غير موجود بالفاتورة | ${lastRecon.unknownCount || 0} أرقام غريبة`
                : 'يتم فحص وتدقيق كل رقم مع ملفات Excel و PDF فور رفعها.'}
            </p>
          </div>

          {/* KPI 2: Inventory Safety */}
          <div className="p-4 rounded-xl bg-[#faf8f4] border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-emerald-600" />
                سلامة وتوفر المخزون
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${lowStockItems.length === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {lowStockItems.length === 0 ? 'مستقر تماماً' : `${lowStockItems.length} نواقص`}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-[#075073]">{stockHealthyPct}%</span>
              <span className="text-xs text-stone-500">{items.length - lowStockItems.length} / {items.length} صنف كافي</span>
            </div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${stockHealthyPct}%` }} />
            </div>
            <p className="text-[11px] text-stone-500 leading-normal">
              نسبة الأصناف المتوفرة برصيد أعلى من حد الأمان المطلوب داخل المخزن والبوفيه والنظافة.
            </p>
          </div>

          {/* KPI 3: Maintenance Efficiency */}
          <div className="p-4 rounded-xl bg-[#faf8f4] border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-amber-600" />
                كفاءة حل بلاغات الصيانة
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {closedTickets.length} إصلاح من {filteredMaint.length} بلاغ {selectedMonth !== 'all' && `(إجمالي مسجل: ${allMaintCount})`}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-[#075073]">{maintResolutionPct}%</span>
              <span className="text-xs text-stone-500">
                {openTickets.length > 0 ? `${openTickets.length} بلاغ قيد المتابعة` : 'كافة الأعطال محلولة'}
              </span>
            </div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div className="bg-amber-600 h-2 rounded-full" style={{ width: `${maintResolutionPct}%` }} />
            </div>
            <p className="text-[11px] text-stone-500 leading-normal">
              إجمالي {filteredMaint.length} بلاغ صيانة {selectedMonth !== 'all' ? `خلال شهر ${selectedMonth}` : 'مسجل بكافة الفترات'} ({closedTickets.length} منجز، {openTickets.length} قيد التنفيذ، بتكلفة {totalMaintCost.toLocaleString('ar-EG')} ج.م).
            </p>
          </div>

          {/* KPI 4: Cleaning & Facilities Completion */}
          <div className="p-4 rounded-xl bg-[#faf8f4] border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                معدل إنجاز النظافة والتعقيم
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                {avgCleanPct}% إنجاز
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-[#075073]">{avgCleanPct}%</span>
              <span className="text-xs text-stone-500">{clean.filter(c => c.done).length} من {clean.length} مهام اليوم</span>
            </div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${avgCleanPct}%` }} />
            </div>
            <p className="text-[11px] text-stone-500 leading-normal">
              التزام فريق النظافة بالجدول الدوري للأدوار وقاعات المحاضرات والمرافق المشتركة.
            </p>
          </div>

          {/* KPI 5: Department Requests Fulfillment */}
          <div className="p-4 rounded-xl bg-[#faf8f4] border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                تلبية طلبات واحتياجات الأقسام
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                {completedReqs.length} مكتمل
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-[#075073]">{reqsFulfillmentPct}%</span>
              <span className="text-xs text-stone-500">{completedReqs.length} من {filteredReqs.length} طلب</span>
            </div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div className="bg-teal-600 h-2 rounded-full" style={{ width: `${reqsFulfillmentPct}%` }} />
            </div>
            <p className="text-[11px] text-stone-500 leading-normal">
              سرعة الاستجابة لطلبات البوفيه والمخازن والصيانة والمشتريات وتوريد المستلزمات.
            </p>
          </div>

          {/* KPI 6: Procurement Approval */}
          <div className="p-4 rounded-xl bg-[#faf8f4] border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                اعتماد وتنفيذ أوامر الشراء
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {procFulfillmentPct}% معتمد
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-[#075073]">{procFulfillmentPct}%</span>
              <span className="text-xs text-stone-500">{completedProc.length} من {filteredProc.length} أمر شراء</span>
            </div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${procFulfillmentPct}%` }} />
            </div>
            <p className="text-[11px] text-stone-500 leading-normal">
              تنفيذ أوامر التوريد ومتابعة الأسعار الرسمية المعتمدة مع الموردين.
            </p>
          </div>
        </div>
      </div>

      {/* Historical Monthly Performance Breakdown (مقارنة أداء الشهور والرجوع للشهور السابقة) */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-[#075073]" />
            <div>
              <h3 className="text-base font-black text-[#075073]">
                📈 سجل مقارنة أداء الشهور والرجوع للشهور السابقة
              </h3>
              <p className="text-xs text-stone-500">
                مقارنة شهرية تفصيلية لكل شهر على حدة (مشتريات، صيانة، طلبات، ونظافة) مع إمكانية التبديل المباشر
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-stone-500 bg-[#faf7f0] border border-stone-200 px-3 py-1 rounded-xl">
            آخر 6 أشهر
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#f4efe2] text-[#075073] font-black">
              <tr>
                <th className="py-3 px-3.5">الشهر المالي</th>
                <th className="py-3 px-3.5">مشتريات التوريد (المبلغ)</th>
                <th className="py-3 px-3.5">أوامر التوريد المعتمدة</th>
                <th className="py-3 px-3.5">تكلفة الصيانة</th>
                <th className="py-3 px-3.5">بلاغات الصيانة (المنجز / الإجمالي)</th>
                <th className="py-3 px-3.5">طلبات الأقسام المنفذة</th>
                <th className="py-3 px-3.5">متوسط تقييم النظافة</th>
                <th className="py-3 px-3.5 text-center">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 bg-white">
              {monthlyHistoryStats.map((st) => {
                const isCurrent = st.id === currMonthPrefix;
                const isSelected = st.id === selectedMonth;

                return (
                  <tr
                    key={st.id}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-amber-50/70 font-semibold'
                        : 'hover:bg-stone-50'
                    }`}
                  >
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900">{st.label}</span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                            الشهر الحالي
                          </span>
                        )}
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#075073] text-white">
                            مُعاين الآن
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-stone-400 block">{st.id}</span>
                    </td>
                    <td className="py-3 px-3.5 font-mono font-bold text-emerald-700">
                      {st.procSpend.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="py-3 px-3.5 font-mono text-stone-700">
                      {st.procCount} أمر
                    </td>
                    <td className="py-3 px-3.5 font-mono font-bold text-rose-600">
                      {st.maintCost.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="py-3 px-3.5 font-mono text-stone-700">
                      <span className="font-bold text-emerald-700">{st.maintCount}</span>
                      <span className="text-stone-400 text-[11px]"> / {st.maintTotalCount} بلاغ</span>
                    </td>
                    <td className="py-3 px-3.5 font-mono text-teal-700">
                      {st.reqsCount} طلب
                    </td>
                    <td className="py-3 px-3.5">
                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded-full text-[11px] ${
                          st.cleanScore >= 90
                            ? 'bg-emerald-100 text-emerald-800'
                            : st.cleanScore >= 75
                            ? 'bg-blue-100 text-blue-800'
                            : st.cleanScore > 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'text-stone-400'
                        }`}
                      >
                        {st.cleanScore ? `${st.cleanScore}%` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedMonth(st.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-stone-200 text-stone-600 cursor-default'
                            : 'bg-[#075073] hover:bg-[#03151F] text-white shadow-2xs'
                        }`}
                      >
                        {isSelected ? 'المحدد حالياً' : 'عرض هذا الشهر ↗'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analytical Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Suppliers Spend */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
            <h3 className="text-sm font-black text-[#075073]">🏢 أكثر الموردين تعاملاً بالمصروفات</h3>
            <span className="text-[11px] text-stone-400 font-bold">أعلى 5 موردين</span>
          </div>

          <div className="space-y-2.5">
            {topSuppliers.map(([sup, amount], idx) => {
              const p = totalProcSpend > 0 ? ((amount / totalProcSpend) * 100).toFixed(1) : '0';
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-stone-800">{sup}</span>
                    <span className="font-mono font-bold text-stone-900">
                      {amount.toLocaleString('ar-EG')} ج.م ({p}%)
                    </span>
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-[#075073] h-1.5 rounded-full" style={{ width: `${p}%` }} />
                  </div>
                </div>
              );
            })}
            {topSuppliers.length === 0 && (
              <div className="py-6 text-center text-stone-400 text-xs">لا توجد مشتريات معتمدة بعد</div>
            )}
          </div>
        </div>

        {/* Low Stock & Shortage Alerts */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
            <h3 className="text-sm font-black text-[#075073]">⚠️ تنبيهات النواقص والأصناف الحرجة</h3>
            <span className="text-[11px] font-mono font-bold text-rose-600">
              {lowStockItems.length} صنف يحتاج تعبئة
            </span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {lowStockItems.map((it) => (
              <div
                key={it.id}
                className="p-2 bg-stone-50 rounded-lg flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-stone-900">{it.name}</span>
                  <span className="text-[10px] text-stone-400 block">الحد الأدنى المطلوب: {it.min}</span>
                </div>
                <div className="text-right">
                  <span
                    className={`font-mono font-black ${
                      it.balance <= 0 ? 'text-rose-600' : 'text-amber-600'
                    }`}
                  >
                    {it.balance} {it.unit}
                  </span>
                  <span className="text-[10px] block text-stone-400">
                    {it.balance <= 0 ? 'نفد تماماً' : 'منخفض'}
                  </span>
                </div>
              </div>
            ))}
            {lowStockItems.length === 0 && (
              <div className="py-6 text-center text-emerald-600 font-bold text-xs">
                ✅ جميع الأصناف في المخزن والبوفيه والنظافة أعلى من الحد الأدنى
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Maintenance Operations & Department Reality Check Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-5 h-5 text-rose-600" />
            <div>
              <h3 className="text-base font-black text-[#075073]">
                🛠️ حصر وواقع بلاغات الصيانة الميدانية (كافة البلاغات المسجلة: {allMaintCount} بلاغ)
              </h3>
              <p className="text-xs text-stone-500">
                مطابقة دقيقة وشاملة لجميع الأعطال المسجلة بالنظام مع التكلفة وتوزيع الحالات
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-700 bg-stone-100 px-3 py-1 rounded-xl">
              {selectedMonth === 'all' ? `عرض كافة الفترات (${allMaintCount} بلاغ)` : `الفترة المحددة (${filteredMaint.length} من ${allMaintCount} بلاغ)`}
            </span>
            {selectedMonth !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedMonth('all')}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-xl transition-all cursor-pointer"
              >
                عرض كل الـ {allMaintCount} بلاغ ↗
              </button>
            )}
          </div>
        </div>

        {/* Status Breakdown Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
            <div className="text-xs text-stone-500 font-bold">إجمالي البلاغات المسجلة</div>
            <div className="text-xl font-black font-mono text-[#075073] mt-1">
              {filteredMaint.length} <span className="text-xs font-normal text-stone-400">بلاغ</span>
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">إجمالي الفرع التراكمي: {allMaintCount}</div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <div className="text-xs text-emerald-800 font-bold">تم الإصلاح والمطابقة</div>
            <div className="text-xl font-black font-mono text-emerald-700 mt-1">
              {closedTickets.length} <span className="text-xs font-normal text-emerald-600">بلاغ</span>
            </div>
            <div className="text-[10px] text-emerald-600 mt-0.5">تكلفة: {totalMaintCost.toLocaleString('ar-EG')} ج.م</div>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
            <div className="text-xs text-amber-800 font-bold">قيد المتابعة والإصلاح</div>
            <div className="text-xl font-black font-mono text-amber-700 mt-1">
              {openTickets.length} <span className="text-xs font-normal text-amber-600">بلاغ</span>
            </div>
            <div className="text-[10px] text-amber-600 mt-0.5">تحت إشراف فريق الصيانة</div>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
            <div className="text-xs text-purple-800 font-bold">غير قابل للإصلاح (قرار فني)</div>
            <div className="text-xl font-black font-mono text-purple-700 mt-1">
              {unrepairableTickets.length} <span className="text-xs font-normal text-purple-600">بلاغ</span>
            </div>
            <div className="text-[10px] text-purple-600 mt-0.5">يحتاج استبدال وتكهين</div>
          </div>
        </div>

        {/* Tickets Table */}
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#f4efe2] text-[#075073] font-black">
              <tr>
                <th className="py-2.5 px-3">العطل / البلاغ</th>
                <th className="py-2.5 px-3">الموقع / القاعة</th>
                <th className="py-2.5 px-3">الحالة</th>
                <th className="py-2.5 px-3">الأولوية</th>
                <th className="py-2.5 px-3">التاريخ</th>
                <th className="py-2.5 px-3">التكلفة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 bg-white">
              {(selectedMonth === 'all' ? maint : filteredMaint).map((t) => (
                <tr key={t.id} className="hover:bg-stone-50 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-stone-900">{t.title}</td>
                  <td className="py-2.5 px-3 text-stone-600">{t.location || 'المقر'}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        t.status === 'مغلق'
                          ? 'bg-emerald-100 text-emerald-800'
                          : t.status === 'غير قابل للإصلاح'
                          ? 'bg-purple-100 text-purple-800'
                          : t.status === 'قيد الإصلاح'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[11px] text-stone-700">{t.priority}</td>
                  <td className="py-2.5 px-3 font-mono text-stone-500 text-[11px]">{t.date || '—'}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-stone-900">
                    {t.cost ? `${t.cost.toLocaleString('ar-EG')} ج.م` : '0 ج.م'}
                  </td>
                </tr>
              ))}
              {(selectedMonth === 'all' ? maint : filteredMaint).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-stone-400">
                    لا توجد بلاغات مسجلة في هذه الفترة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backup & System Safety Card (Only in Manager view & hidden on print) */}
      {currentRole === 'manager' && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4 print:hidden">
          <div className="flex items-center gap-2 text-[#075073]">
            <Database className="w-5 h-5 text-[#c9920a]" />
            <h3 className="text-sm font-black">💾 النسخ الاحتياطي واستعادة قاعدة البيانات</h3>
          </div>

          <p className="text-xs text-stone-600 leading-relaxed">
            يتم حفظ جميع البيانات تلقائياً وفورياً في متصفحك. لحماية إضافية ونقل البيانات بين الأجهزة، يمكنك تنزيل
            نسخة احتياطية كاملة بصيغة JSON أو استرجاع نسخة محفوظة مسبقاً في أي وقت.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={handleBackupDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white transition-all shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>تحميل نسخة احتياطية كاملة (JSON)</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 transition-all shadow-sm cursor-pointer">
              <Upload className="w-4 h-4 text-stone-600" />
              <span>استعادة نسخة احتياطية من ملف JSON</span>
              <input type="file" accept=".json" onChange={handleBackupUpload} className="hidden" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
