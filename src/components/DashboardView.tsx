import React, { useState, useMemo } from 'react';
import {
  CleaningHistory,
  CleaningTask,
  DepartmentRequest,
  InventoryItem,
  MaintenanceTicket,
  MobileLine,
  PurchaseOrder,
  RecurringTemplate,
  RoleKey,
  StockMove,
  SystemActivity,
  TabKey
} from '../types';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Layers,
  PackageCheck,
  PackageX,
  Phone,
  PhoneCall,
  Search,
  Sparkles,
  TrendingUp,
  UserCheck,
  Wrench,
  Zap
} from 'lucide-react';
import { loadActivities, today } from '../utils/storage';

interface DashboardViewProps {
  items?: InventoryItem[];
  moves?: StockMove[];
  proc?: PurchaseOrder[];
  maint?: MaintenanceTicket[];
  clean?: CleaningTask[];
  cleanHist?: CleaningHistory[];
  lines?: MobileLine[];
  reqs?: DepartmentRequest[];
  recurring?: RecurringTemplate[];
  activities?: SystemActivity[];
  currentRole?: RoleKey | null;
  onNavigateTab?: (tab: TabKey) => void;
  onNavigate?: (tab: TabKey) => void;
  onApproveReq?: (id: string) => void;
  onRejectReq?: (id: string) => void;
  onOpenAuditLog?: () => void;
  onOpenNotifications?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  items = [],
  moves = [],
  proc = [],
  maint = [],
  clean = [],
  cleanHist = [],
  lines = [],
  reqs = [],
  recurring = [],
  activities = [],
  currentRole,
  onNavigateTab,
  onNavigate,
  onApproveReq,
  onRejectReq,
  onOpenAuditLog,
  onOpenNotifications
}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const safeMoves = Array.isArray(moves) ? moves : [];
  const safeProc = Array.isArray(proc) ? proc : [];
  const safeMaint = Array.isArray(maint) ? maint : [];
  const safeClean = Array.isArray(clean) ? clean : [];
  const safeLines = Array.isArray(lines) ? lines : [];
  const safeReqs = Array.isArray(reqs) ? reqs : [];
  const safeRecurring = Array.isArray(recurring) ? recurring : [];

  const systemActivities = activities.length > 0 ? activities : loadActivities();

  const navigate = onNavigateTab || onNavigate || (() => {});

  // Metrics
  const lowStockCount = safeItems.filter((i) => i.balance > 0 && i.balance <= (i.min || 0)).length;
  const outOfStockCount = safeItems.filter((i) => i.balance <= 0).length;
  const pendingReqs = safeReqs.filter((r) => r.status === 'جديد' || (r as any).status === 'pending');
  const openTickets = safeMaint.filter((t) => t.status !== 'مغلق');
  const doneCleanCount = safeClean.filter((c) => c.done).length;

  // Phone Lines & Reception Metrics
  const activeLines = safeLines.filter((l) => l.status !== 'معطل');
  const totalMonthlyPhoneCost = activeLines.reduce(
    (acc, l) => acc + (Number(l.monthlyCost) || 0),
    0
  );
  const unassignedLines = safeLines.filter((l) => !l.employee || l.employee.trim() === '');

  // Procurement & Commitments Metrics
  const totalProcCost = safeProc.reduce((acc, p) => {
    const linesTotal = (p.lines || []).reduce(
      (lAcc, line) => lAcc + (line.qty || 0) * (line.price || 0),
      0
    );
    return acc + linesTotal;
  }, 0);

  // Installments / Recurring Commitments (Due soon)
  const dueCommitments = safeRecurring.slice(0, 5);

  // Stock Consumption Valuation (تقدير استهلاك المخزون المنصرف - غير نقدي)
  const stockConsumptionStats = useMemo(() => {
    const outMoves = safeMoves.filter((m) => m.type === 'out' && !m.adjustment);
    let totalOutVal = 0;
    let buffetOutVal = 0;
    let cleaningOutVal = 0;

    outMoves.forEach((m) => {
      let cost = Number(m.cost) || 0;
      if (cost <= 0) {
        const itemObj = safeItems.find((it) => String(it.id) === String(m.itemId));
        if (itemObj && Number(itemObj.cost) > 0) {
          cost = +(Number(itemObj.cost) * (Number(m.qty) || 0)).toFixed(2);
        }
      }
      totalOutVal += cost;

      const isBuffet =
        m.cat === 'BUFF' ||
        (m.department && (m.department.includes('بوفيه') || m.department.toLowerCase().includes('buff')));
      const isCleaning =
        m.cat === 'CLN' ||
        (m.department && (m.department.includes('نظاف') || m.department.toLowerCase().includes('clean')));

      if (isBuffet) buffetOutVal += cost;
      else if (isCleaning) cleaningOutVal += cost;
    });

    return {
      totalOutVal,
      buffetOutVal,
      cleaningOutVal,
      totalMovesCount: outMoves.length
    };
  }, [safeMoves, safeItems]);

  // Department Inventory State (المخزن مقسم حسب الأقسام للمدير)
  const [invDeptFilter, setInvDeptFilter] = useState<string>('ALL');
  const [invSearch, setInvSearch] = useState('');

  const DEPARTMENTS = [
    { key: 'ALL', name: 'كافة الأقسام', icon: '🏢' },
    { key: 'BUFF', name: 'بوفيه وضيافة', icon: '☕' },
    { key: 'CLN', name: 'نظافة ومستهلكات', icon: '🧴' },
    { key: 'OFF', name: 'أدوات مكتبية وقرطاسية', icon: '📑' },
    { key: 'ELEC', name: 'إلكترونيات وأجهزة', icon: '💻' },
    { key: 'FURN', name: 'أثاث وتجهيزات', icon: '🪑' },
    { key: 'MED', name: 'إسعافات وطوارئ', icon: '🩹' },
  ];

  const deptFilteredItems = safeItems.filter((it) => {
    const matchDept = invDeptFilter === 'ALL' || it.cat === invDeptFilter || (invDeptFilter === 'OFF' && it.cat === 'STAT');
    const matchSearch =
      !invSearch ||
      it.name.includes(invSearch) ||
      it.code.toLowerCase().includes(invSearch.toLowerCase());
    return matchDept && matchSearch;
  });

  const urgentItems = safeItems
    .filter((i) => i.balance <= (i.min || 0))
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 6);

  const pendingPreview = pendingReqs.slice(0, 4);

  // Recent 5 Purchase Orders
  const recentPurchases = [...safeProc]
    .sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">📊 لوحة التحكم الشاملة</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            الرصد المباشر لجميع الأقسام: المخازن، المشتريات، الصيانة، البوفيه، النظافة، والريسيبشن
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('ai')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-xs transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>✨ المستشار الذكي (AI)</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('reports')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-[#075073] border border-stone-300 shadow-xs transition-all cursor-pointer"
          >
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>📈 التقارير الشاملة</span>
          </button>
        </div>
      </div>

      {/* Row 1: Primary Vital KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div
          onClick={() => navigate('inventory')}
          className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-[#075073] shadow-xs cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-bold text-stone-500 mb-1">إجمالي الأصناف بالمخازن</div>
          <div className="text-2xl font-black font-mono text-[#075073]">{safeItems.length}</div>
          <div className="text-[11px] text-stone-400 mt-1">
            {outOfStockCount > 0 ? (
              <span className="text-rose-600 font-bold">⚠️ {outOfStockCount} صنف نفد بالكامل</span>
            ) : (
              'المخزون متوفر ومستقر'
            )}
          </div>
        </div>

        <div
          onClick={() => navigate('procurement')}
          className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-indigo-600 shadow-xs cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-bold text-stone-500 mb-1">أوامر المشتريات والتوريد</div>
          <div className="text-2xl font-black font-mono text-indigo-700">{safeProc.length}</div>
          <div className="text-[11px] text-stone-400 mt-1 font-mono">
            إجمالي الفواتير: {totalProcCost.toLocaleString('ar-EG')} ج.م
          </div>
        </div>

        <div
          onClick={() => navigate('lines')}
          className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-emerald-600 shadow-xs cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-bold text-stone-500 mb-1">الريسيبشن وخطوط الموبايل</div>
          <div className="text-2xl font-black font-mono text-emerald-700">{safeLines.length}</div>
          <div className="text-[11px] text-stone-400 mt-1">
            {activeLines.length} نشط · تكلفة {totalMonthlyPhoneCost.toLocaleString('ar-EG')} ج.م/شهر
          </div>
        </div>

        <div
          onClick={() => navigate('requests')}
          className={`bg-white p-4 rounded-xl border border-stone-200 border-r-4 shadow-xs cursor-pointer hover:shadow-md transition-shadow ${
            pendingReqs.length > 0 ? 'border-r-amber-500' : 'border-r-emerald-600'
          }`}
        >
          <div className="text-xs font-bold text-stone-500 mb-1">طلبات معلقة للمدير</div>
          <div
            className={`text-2xl font-black font-mono ${
              pendingReqs.length > 0 ? 'text-amber-600' : 'text-emerald-700'
            }`}
          >
            {pendingReqs.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">
            {pendingReqs.length > 0 ? 'بانتظار موافقة أو رفض الإدارة' : 'لا توجد طلبات معلقة'}
          </div>
        </div>
      </div>

      {/* Row 2: Secondary Department KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div
          onClick={() => navigate('maintenance')}
          className={`bg-white p-4 rounded-xl border border-stone-200 border-r-4 shadow-xs cursor-pointer hover:shadow-md transition-shadow ${
            openTickets.length > 0 ? 'border-r-rose-600' : 'border-r-emerald-600'
          }`}
        >
          <div className="text-xs font-bold text-stone-500 mb-1">بلاغات صيانة مفتوحة</div>
          <div
            className={`text-2xl font-black font-mono ${
              openTickets.length > 0 ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {openTickets.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">
            من إجمالي {safeMaint.length} بلاغ صيانة
          </div>
        </div>

        <div
          onClick={() => navigate('buffet')}
          className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-amber-500 shadow-xs cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-bold text-stone-500 mb-1">قسم البوفيه والضيافة</div>
          <div className="text-2xl font-black font-mono text-amber-700">
            {safeItems.filter((i) => i.cat === 'BUFF').length} صنف
          </div>
          <div className="text-[11px] text-stone-400 mt-1">مشروبات، شاي، قهوة وسكر</div>
        </div>

        <div
          onClick={() => navigate('cleaning')}
          className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-cyan-600 shadow-xs cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-bold text-stone-500 mb-1">مهام النظافة والخدمات اليوم</div>
          <div className="text-2xl font-black font-mono text-cyan-700">
            {doneCleanCount} / {safeClean.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">
            نسبة الإنجاز اليومي:{' '}
            {safeClean.length > 0 ? Math.round((doneCleanCount / safeClean.length) * 100) : 100}%
          </div>
        </div>

        <div
          onClick={() => navigate('costs')}
          className="bg-white p-4 rounded-xl border border-stone-200 border-r-4 border-r-teal-600 shadow-xs cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-bold text-stone-500 mb-1">أقساط والتزامات دورية</div>
          <div className="text-2xl font-black font-mono text-teal-700">{safeRecurring.length}</div>
          <div className="text-[11px] text-stone-400 mt-1">إيجارات، إنترنت واشتراكات</div>
        </div>
      </div>

      {/* Stock Consumption Valuation Card (تقدير استهلاك المخزون - غير نقدي) */}
      <div
        onClick={() => navigate('costs')}
        className="p-4 rounded-xl bg-gradient-to-r from-sky-50 via-white to-amber-50/50 border border-sky-200 shadow-xs cursor-pointer hover:shadow-md transition-all flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-xl shrink-0">
            📦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-sky-950">
                تقدير قيمة استهلاك المخزون المنصرف (غير نقدي)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                بوفيه ونظافة ومكاتب
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              * تقرير دفتري بقيمة المواد المستهلكة فعلياً بناءً على سعر التكلفة وقت الصرف — لا يؤثر على السيولة النقدية أو العهدة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-left">
            <div className="text-[10px] text-stone-400 font-bold">إجمالي قيمة الاستهلاك</div>
            <div className="text-lg font-black font-mono text-sky-900">
              {stockConsumptionStats.totalOutVal.toLocaleString('ar-EG')} ج.م
            </div>
          </div>
          <div className="text-left hidden sm:block border-r border-stone-200 pr-6">
            <div className="text-[10px] text-amber-700 font-bold">بوفيه وضيافة ☕</div>
            <div className="text-sm font-black font-mono text-amber-900">
              {stockConsumptionStats.buffetOutVal.toLocaleString('ar-EG')} ج.م
            </div>
          </div>
          <div className="text-left hidden sm:block border-r border-stone-200 pr-6">
            <div className="text-[10px] text-cyan-700 font-bold">نظافة ومستهلكات 🧴</div>
            <div className="text-sm font-black font-mono text-cyan-900">
              {stockConsumptionStats.cleaningOutVal.toLocaleString('ar-EG')} ج.م
            </div>
          </div>
          <div className="text-stone-400 font-bold text-xs flex items-center gap-1">
            <span>التفاصيل</span>
            <span>←</span>
          </div>
        </div>
      </div>

      {/* Row 3: Live Alerts (Purchases notifications & Recurring installments) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Purchases Notification for Manager (لو المشتريات عملت عملية شراء يبقى باين للمدير) */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-indigo-700" />
              <h3 className="text-sm font-black text-[#075073]">
                🔔 إشعارات المشتريات والتوريدات الأخيرة
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('procurement')}
              className="text-xs font-bold text-[#075073] hover:text-amber-700 flex items-center gap-1 cursor-pointer"
            >
              <span>تفاصيل المشتريات</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {recentPurchases.length === 0 ? (
              <div className="text-center py-6 text-xs text-stone-400">
                لا توجد أوامر شراء مسجلة حديثاً
              </div>
            ) : (
              recentPurchases.map((po) => {
                const totalLines = (po.lines || []).reduce(
                  (acc, l) => acc + (l.qty || 0) * (l.price || 0),
                  0
                );
                return (
                  <div
                    key={po.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs text-[#075073]">{po.supplier}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            po.status === 'مكتمل'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {po.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        التاريخ: {po.date} · الأصناف:{' '}
                        {po.lines?.map((l) => `${l.itemName} (${l.qty})`).join(', ') || '—'}
                      </div>
                    </div>
                    <div className="text-left font-mono font-black text-xs text-indigo-700 shrink-0">
                      {totalLines.toLocaleString('ar-EG')} ج.م
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Installments & Recurring Commitments Alert (تنبيهات مواعيد أقساط) */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-700" />
              <h3 className="text-sm font-black text-[#075073]">
                ⏰ تنبيهات مواعيد الأقساط والالتزامات الدورية
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('costs')}
              className="text-xs font-bold text-[#075073] hover:text-amber-700 flex items-center gap-1 cursor-pointer"
            >
              <span>إدارة الأقساط</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {dueCommitments.length === 0 ? (
              <div className="text-center py-6 text-xs text-stone-400">
                لا توجد التزامات دورية مسجلة
              </div>
            ) : (
              dueCommitments.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-stone-900">{rec.title}</span>
                      <span className="text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200">
                        {rec.freq === 'monthly' ? 'شهري' : rec.freq === 'quarterly' ? 'ربع سنوي' : 'سنوي'}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      تاريخ الاستحقاق: {rec.nextDue || 'مستحق قريباً'} · المورد / الجهة:{' '}
                      {rec.supplier || '—'}
                    </div>
                  </div>
                  <div className="text-left font-mono font-black text-xs text-teal-700 shrink-0">
                    {(rec.estCost || 0).toLocaleString('ar-EG')} ج.م
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 3.5: Warehouse Inventory Grouped by Department (المخزن يبقى باين فيه الاصناف كلها بس متقسمه حسب الاقسام) */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-[#075073] to-[#03151F] text-white flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#075073]">
                🏢 رصيد وجرد المخزن مقسم حسب الأقسام
              </h3>
              <p className="text-[11px] text-stone-500">
                متابعة أرصدة البوفيه، النظافة، الأدوات المكتبية، والأجهزة في شاشة واحدة للمدير
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('inventory')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-xs transition-all cursor-pointer"
            >
              <span>فتح المخازن والتوريد</span>
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Department Selection Tabs */}
          <div className="flex flex-wrap gap-2">
            {DEPARTMENTS.map((dept) => {
              const deptCount =
                dept.key === 'ALL'
                  ? safeItems.length
                  : safeItems.filter(
                      (i) => i.cat === dept.key || (dept.key === 'OFF' && i.cat === 'STAT')
                    ).length;
              const isSelected = invDeptFilter === dept.key;

              return (
                <button
                  key={dept.key}
                  type="button"
                  onClick={() => setInvDeptFilter(dept.key)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#075073] text-white shadow-sm'
                      : 'bg-stone-100 hover:bg-stone-200/80 text-stone-700'
                  }`}
                >
                  <span>{dept.icon}</span>
                  <span>{dept.name}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {deptCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Search inside Department */}
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="بحث في أصناف هذا القسم بالاسم أو الكود..."
              value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)}
              className="w-full pl-3 pr-10 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-medium focus:bg-white focus:border-[#075073] focus:outline-none transition-colors"
            />
          </div>

          {/* Department Items Table */}
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#faf7f0] text-[#075073] border-b border-stone-200 font-bold">
                <tr>
                  <th className="py-2.5 px-3.5">الصنف</th>
                  <th className="py-2.5 px-3.5">الكود</th>
                  <th className="py-2.5 px-3.5">الرصيد الفعلي</th>
                  <th className="py-2.5 px-3.5">حد الطلب</th>
                  <th className="py-2.5 px-3.5">حالة التوفر</th>
                  <th className="py-2.5 px-3.5 text-center">إجراء سريع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {deptFilteredItems.length > 0 ? (
                  deptFilteredItems.slice(0, 8).map((it) => {
                    const isZero = it.balance <= 0;
                    const isLow = it.balance > 0 && it.balance <= (it.min || 0);

                    return (
                      <tr key={it.id} className="hover:bg-stone-50 transition-colors">
                        <td className="py-2.5 px-3.5 font-bold text-stone-900">{it.name}</td>
                        <td className="py-2.5 px-3.5 font-mono text-stone-500">{it.code}</td>
                        <td
                          className={`py-2.5 px-3.5 font-mono font-bold ${
                            isZero ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-[#075073]'
                          }`}
                        >
                          {it.balance} <span className="text-[10px] text-stone-400 font-normal">{it.unit}</span>
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-stone-500">{it.min}</td>
                        <td className="py-2.5 px-3.5">
                          {isZero ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              نفد من المخزن ❌
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              رصيد منخفض ⚠️
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              متوفر ✅
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => navigate('inventory')}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#075073] hover:bg-stone-100 transition-colors cursor-pointer"
                          >
                            صرف / توريد ⤹
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-stone-400">
                      لا توجد أصناف مسجلة لهذا القسم حالياً
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {deptFilteredItems.length > 8 && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => navigate('inventory')}
                className="text-xs font-bold text-[#075073] hover:text-amber-700 cursor-pointer"
              >
                عرض كل الأصناف المتبقية ({deptFilteredItems.length - 8} صنف إضافي) في صفحة المخازن ←
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Live Activity Feed (سجل النشاط المباشر والتدقيق لجميع الأقسام) */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#075073]" />
            <h3 className="text-sm font-black text-[#075073]">
              ⚡ سجل النشاط والتدقيق المباشر لجميع الأقسام (Live Audit Feed)
            </h3>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              تحديث فوري
            </span>
            {onOpenAuditLog && (
              <button
                type="button"
                onClick={onOpenAuditLog}
                className="text-xs font-bold text-[#075073] hover:text-amber-700 underline cursor-pointer"
              >
                عرض سجل التدقيق الكامل (Audit Log) ←
              </button>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-4 divide-y divide-stone-100 max-h-72 overflow-y-auto">
          {systemActivities.length === 0 ? (
            <div className="text-center py-6 text-xs text-stone-400">
              لا توجد أنشطة مسجلة حتى الآن
            </div>
          ) : (
            systemActivities.slice(0, 10).map((act) => {
              const deptClass =
                act.dept?.includes('مخازن') || act.dept?.includes('المخزن')
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : act.dept?.includes('مشتريات')
                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                  : act.dept?.includes('صيانة')
                  ? 'bg-orange-100 text-orange-900 border-orange-300'
                  : act.dept?.includes('بوفيه')
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : act.dept?.includes('نظافة')
                  ? 'bg-teal-100 text-teal-900 border-teal-300'
                  : act.dept?.includes('استقبال') || act.dept?.includes('خطوط')
                  ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                  : 'bg-stone-100 text-stone-800 border-stone-300';

              return (
                <div key={act.id} className="py-2.5 flex items-center justify-between gap-3 text-xs flex-wrap sm:flex-nowrap hover:bg-stone-50/60 px-2 rounded-xl transition-colors">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border shrink-0 ${deptClass}`}>
                      {act.dept}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-stone-900">{act.action}</span>
                      <span className="text-stone-400 mx-1">·</span>
                      <span className="text-stone-500 font-semibold">{act.by}:</span>
                      <span className="text-stone-700 mr-1.5">{act.details}</span>
                      {act.amount !== undefined && act.amount > 0 && (
                        <span className="font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[10px] font-mono mr-1.5">
                          {act.amount.toLocaleString()} ج.م
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-stone-400 font-mono text-[10px] shrink-0 text-left">
                    <span>{act.time}</span>
                    <span className="text-stone-300 mr-1">({act.date})</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Row 5: Urgent Inventory & Pending Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Inventory Alert Card */}
        {urgentItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-black text-[#075073]">
                  ⚠️ أصناف المخازن الناقصة أو النافدة ({urgentItems.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('inventory')}
                className="text-xs font-bold text-[#075073] hover:text-amber-700 flex items-center gap-1 cursor-pointer"
              >
                <span>المخازن</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#faf7f0] text-[#075073] border-b border-stone-200 font-bold">
                  <tr>
                    <th className="py-2.5 px-3">الصنف</th>
                    <th className="py-2.5 px-3">الرصيد الفعلي</th>
                    <th className="py-2.5 px-3">الحد الأدنى</th>
                    <th className="py-2.5 px-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {urgentItems.map((it) => {
                    const isZero = it.balance <= 0;
                    return (
                      <tr key={it.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-stone-800">{it.name}</td>
                        <td
                          className={`py-2.5 px-3 font-mono font-bold ${
                            isZero ? 'text-rose-600' : 'text-amber-600'
                          }`}
                        >
                          {it.balance}{' '}
                          <span className="text-[10px] text-stone-400 font-normal">{it.unit}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-stone-600">{it.min}</td>
                        <td className="py-2.5 px-3">
                          {isZero ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <PackageX className="w-3 h-3" />
                              نفد
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle className="w-3 h-3" />
                              منخفض
                            </span>
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

        {/* Pending Requests Card */}
        {pendingPreview.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-black text-[#075073]">
                  طلبات بانتظار موافقة المدير ({pendingReqs.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('requests')}
                className="text-xs font-bold text-[#075073] hover:text-amber-700 flex items-center gap-1 cursor-pointer"
              >
                <span>كل الطلبات</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-2.5">
              {pendingPreview.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 transition-colors gap-3 flex-wrap sm:flex-nowrap"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-100/70 text-amber-700 flex items-center justify-center shrink-0 text-base">
                      📋
                    </div>
                    <div>
                      <div className="text-xs font-bold text-stone-900">{r.title}</div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        القسم: <span className="font-semibold text-stone-700">{r.dept}</span> ·
                        بواسطة: <span className="font-semibold text-stone-700">{r.by}</span> · {r.date}
                        {r.note ? ` · ${r.note}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onApproveReq && (
                      <button
                        type="button"
                        onClick={() => onApproveReq(r.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>موافقة</span>
                      </button>
                    )}
                    {onRejectReq && (
                      <button
                        type="button"
                        onClick={() => onRejectReq(r.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all cursor-pointer shadow-xs"
                      >
                        <span>رفض</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
