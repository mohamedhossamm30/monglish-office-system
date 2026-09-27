import React, { useState, useEffect, useMemo } from 'react';
import {
  MaintenanceTicket,
  MobileLine,
  PettyCashExpense,
  PurchaseOrder,
  RecurringTemplate,
  RoleKey,
  InventoryItem,
  StockMove
} from '../types';
import {
  uid,
  today,
  isoToday,
  getLocalDateIso,
  getCurrentYearMonth,
  normalizeDateToIso,
  isDateInYearMonth,
  isDateInRange,
  formatDateDisplay,
  saveData,
  loadData,
  logActivity,
  getNextDocumentSequence
} from '../utils/storage';
import { DocumentSequenceBadge } from './DocumentSequenceBadge';
import { DateFilterBar, DateFilterValue } from './DateFilterBar';
import {
  AlertCircle,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coffee,
  CreditCard,
  Download,
  Edit2,
  FileSpreadsheet,
  History,
  PieChart,
  Plus,
  Printer,
  Receipt,
  Repeat,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wrench,
  X
} from 'lucide-react';

interface CostsViewProps {
  proc: PurchaseOrder[];
  maint: MaintenanceTicket[];
  lines: MobileLine[];
  recurring: RecurringTemplate[];
  pettyCash?: PettyCashExpense[];
  moves?: StockMove[];
  items?: InventoryItem[];
  currentRole: RoleKey;
  onSaveRecurring?: (newRecurring: RecurringTemplate[]) => void;
  onSavePettyCash?: (newPetty: PettyCashExpense[]) => void;
  onExportCSV: (type: string) => void;
  showToast: (msg: string) => void;
}

export const CostsView: React.FC<CostsViewProps> = ({
  proc = [],
  maint = [],
  lines = [],
  recurring = [],
  pettyCash = [],
  moves = [],
  items = [],
  currentRole,
  onSaveRecurring,
  onSavePettyCash,
  onExportCSV,
  showToast
}) => {
  const isMgr = currentRole === 'manager';
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'opex' | 'installments' | 'petty_cash' | 'stock_consumption'
  >('overview');
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'month'>('all');

  // Petty Cash Local State & Synchronization
  const [localPettyCash, setLocalPettyCash] = useState<PettyCashExpense[]>(() => {
    return pettyCash && pettyCash.length ? pettyCash : loadData<PettyCashExpense[]>('PETTY_CASH');
  });

  useEffect(() => {
    if (pettyCash && pettyCash.length > 0) {
      setLocalPettyCash(pettyCash);
    }
  }, [pettyCash]);

  // Petty Cash Add Modal State
  const [showAddPettyModal, setShowAddPettyModal] = useState(false);
  const [pettyTitle, setPettyTitle] = useState('');
  const [pettyAmount, setPettyAmount] = useState('');
  const [pettyCategory, setPettyCategory] = useState<PettyCashExpense['category']>('ضيافة_وطوارئ');
  const [pettyDate, setPettyDate] = useState(isoToday());
  const [pettyPaidBy, setPettyPaidBy] = useState(isMgr ? 'المدير العام' : 'مسؤول العهدة');
  const [pettyDepartment, setPettyDepartment] = useState('الإدارة');
  const [pettyMethod, setPettyMethod] = useState<PettyCashExpense['paymentMethod']>('عهدة_نقدية');
  const [pettyReceiptNo, setPettyReceiptNo] = useState('');
  const [pettyNotes, setPettyNotes] = useState('');
  const [pettyCategoryFilter, setPettyCategoryFilter] = useState<string>('all');
  const [pettySearch, setPettySearch] = useState<string>('');

  // Add / Edit Recurring Commitment Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [supplier, setSupplier] = useState('');
  const [estCost, setEstCost] = useState('');
  const [commitType, setCommitType] = useState<'installment_monthly' | 'installment_annual' | 'rent' | 'subscription' | 'contract' | 'other'>('installment_monthly');
  const [period, setPeriod] = useState<'monthly' | 'weekly' | 'quarterly' | 'yearly'>('monthly');
  const [totalInstallments, setTotalInstallments] = useState('');
  const [remainingInstallments, setRemainingInstallments] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('شيك بنكي');
  const [notes, setNotes] = useState('');

  // Payment Recording Modal
  const [payingItem, setPayingItem] = useState<RecurringTemplate | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(isoToday());
  const [payReceiptNo, setPayReceiptNo] = useState('');
  const [payMethod, setPayMethod] = useState('تحويل بنكي');
  const [payBy, setPayBy] = useState('المدير العام');
  const [payNote, setPayNote] = useState('');

  // Payment History Modal
  const [viewingHistoryItem, setViewingHistoryItem] = useState<RecurringTemplate | null>(null);

  const currMonthPrefix = getCurrentYearMonth(); // e.g. "2026-09"
  const [selectedMonth, setSelectedMonth] = useState<string>(currMonthPrefix);
  const [installmentViewMode, setInstallmentViewMode] = useState<'by_date' | 'grouped' | 'table'>('by_date');
  const [dateGroupFilter, setDateGroupFilter] = useState<'all' | 'selected_month'>('all');
  const [installmentStatusFilter, setInstallmentStatusFilter] = useState<'all' | 'due_this_month' | 'paid' | 'active'>('all');

  // Generate accessible list of months in local calendar spanning 36 months back to 18 months forward
  const availableMonths = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    const now = new Date();
    for (let offset = -36; offset <= 18; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const id = `${year}-${month}`;
      const label = d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
      list.push({ id, label });
    }
    return list;
  }, []);

  const handlePrevMonth = () => {
    if (selectedMonth === 'all') {
      setSelectedMonth(currMonthPrefix);
      return;
    }
    const [yStr, mStr] = selectedMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = new Date(y, m - 2, 1);
    const nextY = d.getFullYear();
    const nextM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${nextY}-${nextM}`);
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
    const nextY = d.getFullYear();
    const nextM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${nextY}-${nextM}`);
  };

  // 1. OPEX: Purchases filtered by the selected month
  const filteredProc = useMemo(() => {
    return proc.filter((o) => {
      if (o.status !== 'مكتمل') return false;
      if (selectedMonth === 'all') return true;
      const orderDate = o.isoDate || (o.date ? normalizeDateToIso(o.date) : '');
      return orderDate ? isDateInYearMonth(orderDate, selectedMonth) : false;
    });
  }, [proc, selectedMonth]);

  let stationerySpend = 0;
  let buffetSpend = 0;
  let cleaningSpend = 0;
  let otherProcSpend = 0;

  filteredProc.forEach((o) => {
    (o.lines || []).forEach((l) => {
      const lineTax = l.taxable ? (l.qty * l.price * ((l.taxRate !== undefined ? l.taxRate : (o.taxRate !== undefined ? o.taxRate : 14)) / 100)) : 0;
      const lineTotal = l.qty * l.price + lineTax;
      if (l.cat === 'BUFF') buffetSpend += lineTotal;
      else if (l.cat === 'CLN') cleaningSpend += lineTotal;
      else if (l.cat === 'STAT' || l.cat === 'OFF') stationerySpend += lineTotal;
      else otherProcSpend += lineTotal;
    });
  });

  // 2. OPEX: Maintenance costs filtered by selected month
  const maintSpend = useMemo(() => {
    return maint
      .filter((t) => {
        if (t.status !== 'مغلق' || !(t.cost && t.cost > 0)) return false;
        if (selectedMonth === 'all') return true;
        const ticketDate = t.isoDate || (t.date ? normalizeDateToIso(t.date) : '');
        return ticketDate ? isDateInYearMonth(ticketDate, selectedMonth) : false;
      })
      .reduce((a, t) => a + (t.cost || 0), 0);
  }, [maint, selectedMonth]);

  // 3. Telecom: Mobile Lines monthly cost
  const mobileSpend = lines
    .filter((l) => l.status !== 'معطل')
    .reduce((a, l) => a + (l.monthlyCost || 0), 0);

  const [pettyDateFilter, setPettyDateFilter] = useState<DateFilterValue>({
    preset: 'all',
    startDate: '',
    endDate: ''
  });

  // Petty Cash filtered for the selected month
  const monthlyPettyCash = useMemo(() => {
    return localPettyCash.filter((p) => {
      if (selectedMonth === 'all') return true;
      return isDateInYearMonth(p.date, selectedMonth);
    });
  }, [localPettyCash, selectedMonth]);

  const totalPettyCashSpend = useMemo(() => {
    return monthlyPettyCash.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [monthlyPettyCash]);

  // Overall petty cash for table filtering in Petty Cash Tab
  const displayPettyCash = useMemo(() => {
    return localPettyCash.filter((p) => {
      const matchDate =
        pettyDateFilter.preset !== 'all' || pettyDateFilter.startDate || pettyDateFilter.endDate
          ? isDateInRange(p.date, pettyDateFilter.startDate, pettyDateFilter.endDate)
          : selectedMonth === 'all' || isDateInYearMonth(p.date, selectedMonth);

      const matchCat = pettyCategoryFilter === 'all' || p.category === pettyCategoryFilter;
      const matchSearch =
        !pettySearch ||
        p.title.toLowerCase().includes(pettySearch.toLowerCase()) ||
        (p.paidBy && p.paidBy.toLowerCase().includes(pettySearch.toLowerCase())) ||
        (p.receiptNo && p.receiptNo.toLowerCase().includes(pettySearch.toLowerCase())) ||
        (p.department && p.department.toLowerCase().includes(pettySearch.toLowerCase()));
      return matchDate && matchCat && matchSearch;
    });
  }, [localPettyCash, selectedMonth, pettyDateFilter, pettyCategoryFilter, pettySearch]);

  // Total OPEX (including petty cash for the current month)
  const totalOpex = stationerySpend + buffetSpend + cleaningSpend + otherProcSpend + maintSpend + totalPettyCashSpend;

  const activeRecurring = recurring.filter((r) => r.active);

  // Stock Consumption Valuation State & Filters (تقدير استهلاك المخزون المنصرف - غير نقدي)
  const [stockConsumptionDateFilter, setStockConsumptionDateFilter] = useState<DateFilterValue>({
    preset: 'this_month',
    startDate: '',
    endDate: '',
    selectedMonth: currMonthPrefix
  });
  const [stockConsumptionDeptFilter, setStockConsumptionDeptFilter] = useState<'all' | 'buffet' | 'cleaning' | 'other'>('all');
  const [stockConsumptionSearch, setStockConsumptionSearch] = useState<string>('');
  const [stockConsumptionViewMode, setStockConsumptionViewMode] = useState<'items' | 'moves'>('items');

  // Filtered Out Moves for Stock Consumption (Non-adjustment 'out' moves only)
  const consumptionOutMoves = useMemo(() => {
    const rawMoves = Array.isArray(moves) ? moves : [];
    return rawMoves.filter((m) => {
      // Must be 'out' and NOT adjustment
      if (m.type !== 'out' || m.adjustment) return false;

      // Date filtering
      if (
        stockConsumptionDateFilter.preset !== 'all' ||
        stockConsumptionDateFilter.startDate ||
        stockConsumptionDateFilter.endDate
      ) {
        const mDate = m.date ? normalizeDateToIso(m.date) : '';
        if (mDate && !isDateInRange(mDate, stockConsumptionDateFilter.startDate, stockConsumptionDateFilter.endDate)) {
          return false;
        }
      }

      // Department filtering
      const isBuffet =
        m.cat === 'BUFF' ||
        (m.department && (m.department.includes('بوفيه') || m.department.toLowerCase().includes('buff')));
      const isCleaning =
        m.cat === 'CLN' ||
        (m.department && (m.department.includes('نظاف') || m.department.toLowerCase().includes('clean')));

      if (stockConsumptionDeptFilter === 'buffet' && !isBuffet) return false;
      if (stockConsumptionDeptFilter === 'cleaning' && !isCleaning) return false;
      if (stockConsumptionDeptFilter === 'other' && (isBuffet || isCleaning)) return false;

      // Search filtering
      if (stockConsumptionSearch.trim()) {
        const q = stockConsumptionSearch.toLowerCase();
        const matchName = m.itemName && m.itemName.toLowerCase().includes(q);
        const matchCode = m.code && m.code.toLowerCase().includes(q);
        const matchPerson = m.person && m.person.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchPerson) return false;
      }

      return true;
    });
  }, [moves, stockConsumptionDateFilter, stockConsumptionDeptFilter, stockConsumptionSearch]);

  // Overall statistics for Stock Consumption
  const stockConsumptionStats = useMemo(() => {
    const rawMoves = Array.isArray(moves) ? moves : [];
    const periodOutMoves = rawMoves.filter((m) => {
      if (m.type !== 'out' || m.adjustment) return false;
      if (
        stockConsumptionDateFilter.preset !== 'all' ||
        stockConsumptionDateFilter.startDate ||
        stockConsumptionDateFilter.endDate
      ) {
        const mDate = m.date ? normalizeDateToIso(m.date) : '';
        if (mDate && !isDateInRange(mDate, stockConsumptionDateFilter.startDate, stockConsumptionDateFilter.endDate)) {
          return false;
        }
      }
      return true;
    });

    let totalOutVal = 0;
    let buffetOutVal = 0;
    let cleaningOutVal = 0;
    let otherOutVal = 0;
    let totalQty = 0;

    periodOutMoves.forEach((m) => {
      let cost = Number(m.cost) || 0;
      if (cost <= 0) {
        const itemObj = items.find((it) => String(it.id) === String(m.itemId));
        if (itemObj && Number(itemObj.cost) > 0) {
          cost = +(Number(itemObj.cost) * (Number(m.qty) || 0)).toFixed(2);
        }
      }
      const qty = Number(m.qty) || 0;
      totalOutVal += cost;
      totalQty += qty;

      const isBuffet =
        m.cat === 'BUFF' ||
        (m.department && (m.department.includes('بوفيه') || m.department.toLowerCase().includes('buff')));
      const isCleaning =
        m.cat === 'CLN' ||
        (m.department && (m.department.includes('نظاف') || m.department.toLowerCase().includes('clean')));

      if (isBuffet) buffetOutVal += cost;
      else if (isCleaning) cleaningOutVal += cost;
      else otherOutVal += cost;
    });

    // Aggregate by item
    const itemMap = new Map<
      string,
      {
        itemId: string;
        itemName: string;
        code: string;
        cat: string;
        department: string;
        totalQty: number;
        totalCost: number;
        movesCount: number;
        unitCost: number;
      }
    >();

    consumptionOutMoves.forEach((m) => {
      let cost = Number(m.cost) || 0;
      if (cost <= 0) {
        const itemObj = items.find((it) => String(it.id) === String(m.itemId));
        if (itemObj && Number(itemObj.cost) > 0) {
          cost = +(Number(itemObj.cost) * (Number(m.qty) || 0)).toFixed(2);
        }
      }
      const qty = Number(m.qty) || 0;
      const key = String(m.itemId || m.itemName);
      const existing = itemMap.get(key);

      const isBuffet =
        m.cat === 'BUFF' ||
        (m.department && (m.department.includes('بوفيه') || m.department.toLowerCase().includes('buff')));
      const isCleaning =
        m.cat === 'CLN' ||
        (m.department && (m.department.includes('نظاف') || m.department.toLowerCase().includes('clean')));

      const deptLabel = isBuffet
        ? 'بوفيه وضيافة'
        : isCleaning
        ? 'نظافة وخدمات'
        : m.department || 'مخازن عامة';

      if (existing) {
        existing.totalQty += qty;
        existing.totalCost += cost;
        existing.movesCount += 1;
      } else {
        const itemObj = items.find((it) => String(it.id) === String(m.itemId));
        const unitCost = itemObj ? Number(itemObj.cost || 0) : qty > 0 ? +(cost / qty).toFixed(2) : 0;
        itemMap.set(key, {
          itemId: String(m.itemId),
          itemName: m.itemName,
          code: m.code || '—',
          cat: m.cat || '—',
          department: deptLabel,
          totalQty: qty,
          totalCost: cost,
          movesCount: 1,
          unitCost
        });
      }
    });

    const aggregatedItems = Array.from(itemMap.values()).sort((a, b) => b.totalCost - a.totalCost);

    return {
      totalOutVal,
      buffetOutVal,
      cleaningOutVal,
      otherOutVal,
      totalQty,
      periodMovesCount: periodOutMoves.length,
      aggregatedItems
    };
  }, [moves, items, stockConsumptionDateFilter, consumptionOutMoves]);

  // Date-Centric grouping: Grouping installments by due date (تجميع حسب تاريخ الاستحقاق)
  const dateGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        formattedDate: string;
        daysDiff: number;
        items: {
          rec: RecurringTemplate;
          dueAmount: number;
          paidAmount: number;
          isFullyPaid: boolean;
        }[];
        totalDue: number;
        totalPaid: number;
        totalRemaining: number;
      }
    >();

    const todayIso = isoToday();
    const todayDate = new Date(todayIso);

    recurring.forEach((rec) => {
      const dStr = rec.nextDue ? normalizeDateToIso(rec.nextDue) : 'غير محدد';
      if (!map.has(dStr)) {
        let diff = 0;
        let formatted = 'مستمر / غير محدد التاريخ';
        if (dStr !== 'غير محدد') {
          const itemD = new Date(dStr);
          diff = Math.ceil((itemD.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
          formatted = formatDateDisplay(dStr);
        }
        map.set(dStr, {
          date: dStr,
          formattedDate: formatted,
          daysDiff: diff,
          items: [],
          totalDue: 0,
          totalPaid: 0,
          totalRemaining: 0
        });
      }

      const g = map.get(dStr)!;
      const isFullyPaid = rec.remainingInstallments !== undefined && rec.remainingInstallments === 0;
      const dueAmount = isFullyPaid ? 0 : rec.estCost;
      const paidInTarget = (rec.history || [])
        .filter((h) => dStr === 'غير محدد' || h.date === dStr || isDateInYearMonth(h.date, dStr.substring(0, 7)))
        .reduce((sum, h) => sum + (h.amount || 0), 0);

      g.items.push({
        rec,
        dueAmount,
        paidAmount: paidInTarget,
        isFullyPaid
      });

      g.totalDue += dueAmount;
      g.totalPaid += paidInTarget;
      g.totalRemaining = Math.max(0, g.totalDue - g.totalPaid);
    });

    const list = Array.from(map.values()).sort((a, b) => {
      if (a.date === 'غير محدد') return 1;
      if (b.date === 'غير محدد') return -1;
      return a.date.localeCompare(b.date);
    });

    if (dateGroupFilter === 'selected_month' && selectedMonth !== 'all') {
      return list.filter((g) => g.date !== 'غير محدد' && isDateInYearMonth(g.date, selectedMonth));
    }

    return list;
  }, [recurring, dateGroupFilter, selectedMonth]);

  // Supplier-Centric grouping with monthly calculation & multi-installment clarity
  const supplierGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierName: string;
        items: RecurringTemplate[];
        monthDue: number;
        monthPaid: number;
        monthRemaining: number;
        totalRemainingLiability: number;
        activeCount: number;
      }
    >();

    recurring.forEach((rec) => {
      const sName = (rec.supplier || '').trim() || 'التزامات عامة / بدون مورد محدد';
      if (!map.has(sName)) {
        map.set(sName, {
          supplierName: sName,
          items: [],
          monthDue: 0,
          monthPaid: 0,
          monthRemaining: 0,
          totalRemainingLiability: 0,
          activeCount: 0
        });
      }
      const g = map.get(sName)!;
      g.items.push(rec);

      const isFullyPaid = rec.remainingInstallments !== undefined && rec.remainingInstallments === 0;

      if (rec.active && !isFullyPaid) {
        g.activeCount++;
        let itemMonthDue = 0;
        if (!rec.period || rec.period === 'monthly' || rec.type === 'installment_monthly') {
          itemMonthDue = rec.estCost;
        } else if (rec.period === 'yearly' || rec.type === 'installment_annual') {
          itemMonthDue = rec.nextDue && isDateInYearMonth(rec.nextDue, selectedMonth) ? rec.estCost : rec.estCost / 12;
        } else if (rec.period === 'quarterly') {
          itemMonthDue = rec.nextDue && isDateInYearMonth(rec.nextDue, selectedMonth) ? rec.estCost : rec.estCost / 3;
        } else {
          itemMonthDue = rec.estCost;
        }
        g.monthDue += itemMonthDue;

        const remCount = rec.remainingInstallments ?? (rec.totalInstallments || 1);
        g.totalRemainingLiability += remCount * rec.estCost;
      }

      const paidInMonth = (rec.history || [])
        .filter((h) => selectedMonth === 'all' || isDateInYearMonth(h.date, selectedMonth))
        .reduce((s, h) => s + (h.amount || 0), 0);
      g.monthPaid += paidInMonth;
      g.monthRemaining = Math.max(0, g.monthDue - g.monthPaid);
    });

    return Array.from(map.values()).sort((a, b) => b.monthDue - a.monthDue);
  }, [recurring, selectedMonth]);

  // Aggregate monthly figures for selectedMonth
  const monthTotalDue = supplierGroups.reduce((s, g) => s + g.monthDue, 0);
  const monthTotalPaid = supplierGroups.reduce((s, g) => s + g.monthPaid, 0);
  const monthTotalRemaining = Math.max(0, monthTotalDue - monthTotalPaid);
  const overallTotalRemainingLiabilities = supplierGroups.reduce((s, g) => s + g.totalRemainingLiability, 0);

  const totalMonthlyCommitments = monthTotalDue;
  const recurringSpend = monthTotalDue;

  // Grand Total
  const grandTotal = totalOpex + mobileSpend + totalMonthlyCommitments;

  const getPct = (val: number) => (grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : '0');

  const costCategories = [
    {
      name: 'أدوات مكتبية وقرطاسية (مخازن)',
      amount: stationerySpend,
      color: '#075073',
      icon: '📦',
      group: 'opex',
      pct: getPct(stationerySpend)
    },
    {
      name: 'بوفيه وضيافة',
      amount: buffetSpend,
      color: '#c9920a',
      icon: '☕',
      group: 'opex',
      pct: getPct(buffetSpend)
    },
    {
      name: 'نظافة ومستهلكات خدمية',
      amount: cleaningSpend,
      color: '#059669',
      icon: '🧴',
      group: 'opex',
      pct: getPct(cleaningSpend)
    },
    {
      name: 'المصروفات النثرية والعهدة السريعة',
      amount: totalPettyCashSpend,
      color: '#0891b2',
      icon: '💵',
      group: 'opex',
      pct: getPct(totalPettyCashSpend)
    },
    {
      name: 'صيانة وإصلاح أعطال',
      amount: maintSpend,
      color: '#dc2626',
      icon: '🛠️',
      group: 'opex',
      pct: getPct(maintSpend)
    },
    {
      name: 'فواتير خطوط المحمول (شهرياً)',
      amount: mobileSpend,
      color: '#7c3aed',
      icon: '📞',
      group: 'telecom',
      pct: getPct(mobileSpend)
    },
    {
      name: 'أقساط والتزامات دورية وإيجارات',
      amount: totalMonthlyCommitments,
      color: '#d97706',
      icon: '🗓️',
      group: 'capex',
      pct: getPct(totalMonthlyCommitments)
    }
  ];

  const handleOpenAdd = (defaultSupplier?: string) => {
    setEditingItem(null);
    setTitle('');
    setSupplier(defaultSupplier || '');
    setEstCost('');
    setCommitType('installment_monthly');
    setPeriod('monthly');
    setTotalInstallments('12');
    setRemainingInstallments('12');
    setNextDue(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    setPaymentMethod('شيك بنكي');
    setNotes('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: RecurringTemplate) => {
    setEditingItem(item);
    setTitle(item.title);
    setSupplier(item.supplier || '');
    setEstCost(String(item.estCost || '0'));
    setCommitType(item.type || 'installment_monthly');
    setPeriod(item.period || 'monthly');
    setTotalInstallments(String(item.totalInstallments || ''));
    setRemainingInstallments(String(item.remainingInstallments || ''));
    setNextDue(item.nextDue || '');
    setPaymentMethod(item.paymentMethod || 'شيك بنكي');
    setNotes(item.notes || '');
    setShowAddModal(true);
  };

  const handleSaveCommitment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !estCost) {
      showToast('يرجى كتابة عنوان الالتزام والمبلغ');
      return;
    }

    const costNum = parseFloat(estCost) || 0;
    const totNum = parseInt(totalInstallments, 10) || undefined;
    const remNum = parseInt(remainingInstallments, 10) || undefined;

    if (editingItem) {
      const updated = recurring.map((r) =>
        r.id === editingItem.id
          ? {
              ...r,
              title: title.trim(),
              supplier: supplier.trim() || undefined,
              estCost: costNum,
              type: commitType,
              period,
              totalInstallments: totNum,
              remainingInstallments: remNum,
              nextDue: nextDue || undefined,
              paymentMethod,
              notes: notes.trim() || undefined
            }
          : r
      );
      saveData('RECURRING', updated);
      if (onSaveRecurring) onSaveRecurring(updated);
      logActivity({
        dept: 'المالية',
        action: 'تعديل التزام مالي',
        details: `تحديث بيانات الالتزام "${title.trim()}" — القسط: ${costNum.toLocaleString('ar-EG')} ج.م`,
        amount: costNum,
        by: currentRole === 'manager' ? 'المدير العام' : 'الإدارة المالية',
        type: 'system'
      });
      showToast('تم تحديث بيانات الالتزام/القسط وحفظها في السجل السحابي ✓');
    } else {
      const newItem: RecurringTemplate = {
        id: uid(),
        title: title.trim(),
        supplier: supplier.trim() || undefined,
        estCost: costNum,
        type: commitType,
        period,
        active: true,
        totalInstallments: totNum,
        remainingInstallments: remNum,
        nextDue: nextDue || undefined,
        paymentMethod,
        notes: notes.trim() || undefined,
        history: []
      };
      const updated = [newItem, ...recurring];
      saveData('RECURRING', updated);
      if (onSaveRecurring) onSaveRecurring(updated);
      logActivity({
        dept: 'المالية',
        action: 'إضافة التزام مالي جديد',
        details: `تسجيل التزام جديد: "${title.trim()}" بقيمة قسط ${costNum.toLocaleString('ar-EG')} ج.م — ${supplier.trim() || 'بدون مورد'}`,
        amount: costNum,
        by: currentRole === 'manager' ? 'المدير العام' : 'الإدارة المالية',
        type: 'system'
      });
      showToast('تمت إضافة القسط/الالتزام الجديد بنجاح وحفظه في السجل السحابي ✓');
    }

    setShowAddModal(false);
  };

  const handleDeleteCommitment = (id: string) => {
    const item = recurring.find((r) => r.id === id);
    if (!window.confirm(`هل أنت متأكد من حذف الالتزام "${item?.title || ''}"؟`)) return;
    const filtered = recurring.filter((r) => r.id !== id);
    saveData('RECURRING', filtered);
    if (onSaveRecurring) onSaveRecurring(filtered);
    logActivity({
      dept: 'المالية',
      action: 'حذف التزام مالي',
      details: `تم حذف الالتزام "${item?.title || ''}"`,
      by: currentRole === 'manager' ? 'المدير العام' : 'الإدارة المالية',
      type: 'system'
    });
    showToast('تم حذف الالتزام بنجاح');
  };

  const handleToggleActive = (id: string) => {
    const updated = recurring.map((r) =>
      r.id === id ? { ...r, active: !r.active } : r
    );
    saveData('RECURRING', updated);
    if (onSaveRecurring) onSaveRecurring(updated);
    showToast('تم تحديث حالة الالتزام وحفظها');
  };

  const handleOpenPay = (item: RecurringTemplate) => {
    setPayingItem(item);
    setPayAmount(String(item.estCost));
    setPayDate(isoToday());
    setPayReceiptNo(`REC-${Date.now().toString().slice(-4)}`);
    setPayMethod(item.paymentMethod || 'تحويل بنكي');
    setPayBy(currentRole === 'manager' ? 'المدير العام' : 'الإدارة المالية');
    setPayNote(`سداد قسط استحقاق ${item.nextDue || isoToday()}`);
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingItem) return;

    const amt = parseFloat(payAmount) || payingItem.estCost;
    const currentRem = payingItem.remainingInstallments ?? (payingItem.totalInstallments ? payingItem.totalInstallments : 1);
    const newRem = Math.max(0, currentRem - 1);
    const cleanPayDate = normalizeDateToIso(payDate || isoToday());

    // Calculate next due date
    let nextDate = payingItem.nextDue;
    if (nextDate) {
      const d = new Date(nextDate);
      if (payingItem.period === 'yearly' || payingItem.type === 'installment_annual') {
        d.setFullYear(d.getFullYear() + 1);
      } else if (payingItem.period === 'quarterly') {
        d.setMonth(d.getMonth() + 3);
      } else if (payingItem.period === 'weekly') {
        d.setDate(d.getDate() + 7);
      } else {
        d.setMonth(d.getMonth() + 1);
      }
      nextDate = d.toISOString().split('T')[0];
    }

    const payRecord = {
      id: uid(),
      date: cleanPayDate,
      amount: amt,
      by: payBy.trim() || (currentRole === 'manager' ? 'المدير العام' : 'الإدارة المالية'),
      note: payNote.trim() || undefined,
      receiptNo: payReceiptNo.trim() || `REC-${Date.now().toString().slice(-4)}`,
      method: payMethod
    };

    const isNowFullyPaid = newRem === 0 && Boolean(payingItem.totalInstallments && payingItem.totalInstallments > 0);

    const updated = recurring.map((r) =>
      r.id === payingItem.id
        ? {
            ...r,
            lastOrdered: cleanPayDate,
            remainingInstallments: newRem,
            active: isNowFullyPaid ? false : r.active,
            nextDue: isNowFullyPaid ? null : nextDate,
            history: [payRecord, ...(r.history || [])]
          }
        : r
    );

    saveData('RECURRING', updated);
    if (onSaveRecurring) onSaveRecurring(updated);

    logActivity({
      dept: 'المالية',
      action: 'سداد قسط مالي',
      details: `تم سداد قسط بقيمة ${amt.toLocaleString('ar-EG')} ج.م للالتزام "${payingItem.title}" — إيصال: ${payRecord.receiptNo} (${payMethod})`,
      amount: amt,
      by: payRecord.by,
      type: 'system'
    });

    setPayingItem(null);
    showToast(`تم تسجيل سداد القسط بمبلغ ${amt.toLocaleString('ar-EG')} ج.م وإضافته لسجل السدادات السحابي ✓`);
  };

  // Petty Cash Handlers
  const handleSavePettyExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(pettyAmount);
    if (!pettyTitle.trim() || isNaN(amt) || amt <= 0) {
      showToast('يرجى إدخال بيان المصروف وقيمته بشكل صحيح');
      return;
    }

    const cleanDate = normalizeDateToIso(pettyDate || isoToday());
    const expenseMonth = cleanDate.substring(0, 7);
    const expSeq = getNextDocumentSequence('EXP');

    const newExpense: PettyCashExpense = {
      id: expSeq,
      voucherNo: expSeq,
      title: pettyTitle.trim(),
      amount: amt,
      category: pettyCategory,
      date: cleanDate,
      month: expenseMonth,
      paidBy: pettyPaidBy.trim() || (isMgr ? 'المدير العام' : 'مسؤول العهدة'),
      department: pettyDepartment.trim() || 'الإدارة',
      paymentMethod: pettyMethod,
      receiptNo: pettyReceiptNo.trim() || expSeq,
      notes: pettyNotes.trim() || undefined,
      ts: Date.now()
    };

    const updated = [newExpense, ...localPettyCash];
    setLocalPettyCash(updated);
    saveData('PETTY_CASH', updated);
    if (onSavePettyCash) onSavePettyCash(updated);

    logActivity({
      dept: newExpense.department,
      action: 'تسجيل وتوثيق مصروف نثري / عهدة',
      details: `صرف مبلغ ${amt.toLocaleString('ar-EG')} ج.م لبند "${newExpense.title}" (إذن/إيصال: ${newExpense.receiptNo})`,
      amount: amt,
      by: newExpense.paidBy,
      type: 'system',
      severity: amt > 1000 ? 'warning' : 'info'
    });

    setShowAddPettyModal(false);
    setPettyTitle('');
    setPettyAmount('');
    setPettyReceiptNo('');
    setPettyNotes('');
    showToast(`✓ تم تسجيل المصروف النثري برقم تسلسلي [${newExpense.receiptNo}] بقيمة ${amt.toLocaleString('ar-EG')} ج.م`);
  };

  const handleDeletePettyExpense = (id: string) => {
    const item = localPettyCash.find((p) => p.id === id);
    if (!window.confirm(`هل أنت متأكد من حذف البند "${item?.title || ''}" من المصروفات النثرية؟`)) return;
    const filtered = localPettyCash.filter((p) => p.id !== id);
    setLocalPettyCash(filtered);
    saveData('PETTY_CASH', filtered);
    if (onSavePettyCash) onSavePettyCash(filtered);
    logActivity({
      dept: item?.department || 'المالية',
      action: 'حذف مصروف نثري من العهدة',
      details: `تم حذف بند "${item?.title || ''}" بقيمة ${(item?.amount || 0).toLocaleString('ar-EG')} ج.م`,
      by: isMgr ? 'المدير العام' : 'مسؤول العهدة',
      type: 'system'
    });
    showToast('تم حذف البند من المصروفات النثرية بنجاح');
  };

  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">💰 إدارة التكاليف والأقساط الدورية</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            فصل دقيق بين المصروفات التشغيلية (OPEX) والأقساط السنوية والشهرية والالتزامات الثابتة
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Subtabs Selector */}
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold flex-wrap gap-1">
            <button
              onClick={() => setActiveSubTab('overview')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeSubTab === 'overview'
                  ? 'bg-[#075073] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              📊 نظرة شاملة
            </button>
            <button
              onClick={() => setActiveSubTab('opex')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeSubTab === 'opex'
                  ? 'bg-[#075073] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              🛒 تشغيلي (OPEX)
            </button>
            <button
              onClick={() => setActiveSubTab('petty_cash')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'petty_cash'
                  ? 'bg-[#075073] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>💵 النثريات والعهدة</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500 text-white font-black">
                {monthlyPettyCash.length}
              </span>
            </button>
            <button
              onClick={() => setActiveSubTab('installments')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'installments'
                  ? 'bg-[#075073] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>🗓️ الأقساط والالتزامات</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-[#075073] font-black">
                {activeRecurring.length}
              </span>
            </button>
            <button
              onClick={() => setActiveSubTab('stock_consumption')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'stock_consumption'
                  ? 'bg-[#075073] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>📦 استهلاك المخزون (دفترية)</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-600 text-white font-black">
                {consumptionOutMoves.length}
              </span>
            </button>
          </div>

          {activeSubTab === 'petty_cash' && (
            <button
              onClick={() => {
                setPettyTitle('');
                setPettyAmount('');
                setPettyDate(isoToday());
                setPettyReceiptNo(`PC-${Date.now().toString().slice(-4)}`);
                setPettyNotes('');
                setShowAddPettyModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ تسجيل مصروف نثري</span>
            </button>
          )}

          {activeSubTab === 'installments' && isMgr && (
            <button
              onClick={() => handleOpenAdd()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة قسط / التزام جديد</span>
            </button>
          )}

          <button
            onClick={() => onExportCSV('costs')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-stone-600" />
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      {/* Global Monthly Segmentation & Quick Navigation Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#075073] text-amber-400 flex items-center justify-center font-bold">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-[#075073]">
                فترة التحليل المالي:{' '}
                {selectedMonth === 'all'
                  ? 'كافة الفترات (سجل تراكمي شامل)'
                  : (availableMonths.find((m) => m.id === selectedMonth)?.label || selectedMonth)}
              </span>
              {selectedMonth === currMonthPrefix && (
                <span className="text-[10px] px-2 py-0.2 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  الشهر الحالي
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-500">
              تصفية كافة بنود التكاليف، النثريات، والالتزامات شهرياً مع إمكانية الرجوع للشهور السابقة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="px-2.5 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-100 text-xs font-bold text-stone-700 transition-all cursor-pointer flex items-center gap-1"
            title="الانتقال للشهر السابق"
          >
            <span>‹ الشهر السابق</span>
          </button>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-stone-300 bg-stone-50 text-xs font-bold text-[#075073] focus:ring-2 focus:ring-[#075073] outline-none cursor-pointer"
          >
            <option value="all">📊 كافة الفترات (سجل تراكمي شامل)</option>
            {availableMonths.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} {m.id === currMonthPrefix ? '⭐ (الحالي)' : ''}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleNextMonth}
            className="px-2.5 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-100 text-xs font-bold text-stone-700 transition-all cursor-pointer flex items-center gap-1"
            title="الانتقال للشهر التالي"
          >
            <span>الشهر التالي ›</span>
          </button>

          {selectedMonth !== currMonthPrefix && (
            <button
              type="button"
              onClick={() => setSelectedMonth(currMonthPrefix)}
              className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all cursor-pointer"
            >
              📅 الشهر الحالي
            </button>
          )}

          {selectedMonth !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedMonth('all')}
              className="px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 text-xs font-bold transition-all cursor-pointer"
            >
              📊 كل الفترات
            </button>
          )}
        </div>
      </div>

      {/* Hero Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* OPEX */}
        <div className="bg-gradient-to-br from-[#075073] to-[#03151F] text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-bold text-stone-300 mb-1">
            <span>المصروفات التشغيلية (OPEX)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-stone-200">شامل العهدة</span>
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-white mt-1">
            {totalOpex.toLocaleString('ar-EG')}{' '}
            <span className="text-xs font-sans font-bold text-amber-400">ج.م</span>
          </div>
          <p className="text-[11px] text-stone-300 mt-2 truncate">
            بوفيه ({buffetSpend.toLocaleString('ar-EG')}) + نظافة ({cleaningSpend.toLocaleString('ar-EG')}) + قرطاسية وصيانة
          </p>
        </div>

        {/* Petty Cash */}
        <div className="bg-gradient-to-br from-[#065f46] to-[#047857] text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-100 mb-1">
            <span>المصروفات النثرية والعهدة</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 text-emerald-100">
              {monthlyPettyCash.length} حركات
            </span>
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-white mt-1">
            {totalPettyCashSpend.toLocaleString('ar-EG')}{' '}
            <span className="text-xs font-sans font-bold text-emerald-200">ج.م</span>
          </div>
          <p className="text-[11px] text-emerald-100 mt-2">
            مصروفات طارئة، ضيافة، انتقال، وشحن طرود للشهر الحالي
          </p>
        </div>

        {/* Installments & Fixed Overheads */}
        <div className="bg-gradient-to-br from-[#c9920a] to-[#966b04] text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-bold text-amber-100 mb-1">
            <span>الأقساط والالتزامات الثابتة</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 text-amber-100">شهري / سنوي</span>
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-white mt-1">
            {totalMonthlyCommitments.toLocaleString('ar-EG')}{' '}
            <span className="text-xs font-sans font-bold text-amber-200">ج.م / شهر</span>
          </div>
          <p className="text-[11px] text-amber-100 mt-2 truncate">
            {activeRecurring.length} التزام نشط · أقساط أجهزة، إيجارات، واشتراكات
          </p>
        </div>

        {/* Telecom & Communications */}
        <div className="bg-gradient-to-br from-[#4c1d95] to-[#311068] text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-bold text-purple-200 mb-1">
            <span>فواتير الاتصالات والخطوط</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-purple-200">فودافون</span>
          </div>
          <div className="text-2xl font-black font-mono tracking-tight text-white mt-1">
            {mobileSpend.toLocaleString('ar-EG')}{' '}
            <span className="text-xs font-sans font-bold text-purple-300">ج.م</span>
          </div>
          <p className="text-[11px] text-purple-200 mt-2 truncate">
            {lines.filter((l) => l.status !== 'معطل').length} خط محمول نشط مسند للموظفين
          </p>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Visual Multi-Segment Breakdown Bar */}
          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-[#075073]">
              <span>توزيع النفقات التراكمية كنسبة مئوية:</span>
              <span className="text-stone-400 font-normal">إجمالي: {grandTotal.toLocaleString('ar-EG')} ج.م</span>
            </div>

            <div className="w-full h-4 bg-stone-100 rounded-full overflow-hidden flex shadow-inner">
              {costCategories.map((c, idx) => {
                const width = parseFloat(c.pct);
                if (width <= 0) return null;
                return (
                  <div
                    key={idx}
                    style={{ width: `${width}%`, backgroundColor: c.color }}
                    className="h-full transition-all duration-300 hover:opacity-80"
                    title={`${c.name}: ${c.amount.toLocaleString('ar-EG')} ج.م (${c.pct}%)`}
                  />
                );
              })}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
              {costCategories.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-stone-700 truncate">{c.name}</span>
                  <span className="font-mono font-bold text-stone-900 mr-auto">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cost Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {costCategories.map((cat, idx) => (
              <div
                key={idx}
                className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{cat.icon}</span>
                    <h4 className="text-xs font-bold text-stone-900">{cat.name}</h4>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                    style={{ backgroundColor: `${cat.color}15`, color: cat.color }}
                  >
                    {cat.pct}%
                  </span>
                </div>

                <div className="mt-4 flex items-baseline justify-between border-t border-stone-100 pt-3">
                  <span className="text-xs text-stone-500 font-medium">المبلغ:</span>
                  <span className="text-lg font-black font-mono text-stone-900">
                    {cat.amount.toLocaleString('ar-EG')}{' '}
                    <span className="text-xs font-sans font-normal text-stone-500">ج.م</span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Distinct Inventory Consumption Valuation Section (Non-Cash / Separate from Cash Outflows) */}
          <div className="bg-gradient-to-r from-sky-50 via-slate-50 to-amber-50/40 p-5 rounded-2xl border border-sky-200 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📦</span>
                <div>
                  <h4 className="text-sm font-black text-sky-950">
                    تقدير قيمة استهلاك المخزون (أصل مستهلك دفترياً)
                  </h4>
                  <p className="text-[11px] text-sky-800">
                    * قيمة الأصناف المنصرفة فعلياً من المخزن (بوفيه / نظافة / قرطاسية) بناءً على سعر الشراء وقت الصرف — <strong className="underline">ليس خروج نقدية فعلي</strong> ولا يمس العهدة.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('stock_consumption')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-sky-700 hover:bg-sky-800 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>عرض تفاصيل الاستهلاك</span>
                <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-sky-100">
                <div className="text-[11px] font-bold text-stone-500">إجمالي استهلاك المخزون</div>
                <div className="text-xl font-black font-mono text-sky-900 mt-1">
                  {stockConsumptionStats.totalOutVal.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span>
                </div>
                <div className="text-[10px] text-stone-400 mt-0.5">{stockConsumptionStats.totalQty} وحدة منصرفة</div>
              </div>
              <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-amber-100">
                <div className="text-[11px] font-bold text-amber-800">استهلاك البوفيه والضيافة ☕</div>
                <div className="text-xl font-black font-mono text-amber-900 mt-1">
                  {stockConsumptionStats.buffetOutVal.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span>
                </div>
                <div className="text-[10px] text-stone-400 mt-0.5">مشروبات وسكر وضيافة</div>
              </div>
              <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-cyan-100">
                <div className="text-[11px] font-bold text-cyan-800">استهلاك مستلزمات النظافة 🧴</div>
                <div className="text-xl font-black font-mono text-cyan-900 mt-1">
                  {stockConsumptionStats.cleaningOutVal.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span>
                </div>
                <div className="text-[10px] text-stone-400 mt-0.5">منظفات ومطهرات وأكياس</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OPEX BREAKDOWN */}
      {activeSubTab === 'opex' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-black text-[#075073] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>تفاصيل المصروفات التشغيلية المباشرة (OPEX)</span>
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              تشمل هذه القائمة كافة مشتريات التوريد المباشرة المكتملة للبوفيه، أدوات النظافة والخدمات، المستلزمات المكتبية ومستهلكات الطباعة، بالإضافة إلى فواتير الصيانة والإصلاحات الطارئة.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200">
                <span className="text-xs font-bold text-amber-800">☕ بوفيه وضيافة</span>
                <div className="text-xl font-black font-mono text-amber-900 mt-1">
                  {buffetSpend.toLocaleString('ar-EG')} ج.م
                </div>
              </div>

              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200">
                <span className="text-xs font-bold text-emerald-800">🧴 نظافة ومطهرات</span>
                <div className="text-xl font-black font-mono text-emerald-900 mt-1">
                  {cleaningSpend.toLocaleString('ar-EG')} ج.م
                </div>
              </div>

              <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200">
                <span className="text-xs font-bold text-blue-800">📦 أدوات وقرطاسية</span>
                <div className="text-xl font-black font-mono text-blue-900 mt-1">
                  {stationerySpend.toLocaleString('ar-EG')} ج.م
                </div>
              </div>

              <div className="p-4 bg-rose-50/60 rounded-xl border border-rose-200">
                <span className="text-xs font-bold text-rose-800">🛠️ صيانة ومرافق</span>
                <div className="text-xl font-black font-mono text-rose-900 mt-1">
                  {maintSpend.toLocaleString('ar-EG')} ج.م
                </div>
              </div>
            </div>

            {/* Direct Purchases Table for this Month */}
            <div className="pt-2">
              <h4 className="text-xs font-bold text-stone-800 mb-2.5">
                أوامر التوريد المكتملة في فترة ({selectedMonth === 'all' ? 'كافة الفترات' : selectedMonth}):
              </h4>
              {filteredProc.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#f4efe2] text-[#075073] font-bold">
                      <tr>
                        <th className="py-2.5 px-3">رقم الأمر</th>
                        <th className="py-2.5 px-3">التاريخ</th>
                        <th className="py-2.5 px-3">المورد</th>
                        <th className="py-2.5 px-3">الأصناف والتصنيف</th>
                        <th className="py-2.5 px-3">الإجمالي</th>
                        <th className="py-2.5 px-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 bg-white">
                      {filteredProc.map((o) => {
                        const total = (o.lines || []).reduce((sum, l) => {
                          const tax = l.taxable ? (l.qty * l.price * ((l.taxRate ?? o.taxRate ?? 14) / 100)) : 0;
                          return sum + (l.qty * l.price + tax);
                        }, 0);
                        return (
                          <tr key={o.id} className="hover:bg-stone-50">
                            <td className="py-2.5 px-3 font-mono font-bold text-[#075073]">{o.id}</td>
                            <td className="py-2.5 px-3 font-mono text-stone-600">{o.date || o.isoDate}</td>
                            <td className="py-2.5 px-3 font-semibold">{o.supplier || '—'}</td>
                            <td className="py-2.5 px-3 text-stone-700">
                              {(o.lines || []).map((l) => `${l.itemName} (${l.qty})`).join('، ') || '—'}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-stone-900">
                              {total.toLocaleString('ar-EG')} ج.م
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                مكتمل
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-stone-400 bg-stone-50 rounded-xl border border-stone-200">
                  لا توجد أوامر توريد مشتريات مكتملة مسجلة في هذا الشهر
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INSTALLMENTS & RECURRING COMMITMENTS */}
      {activeSubTab === 'installments' && (
        <div className="space-y-6">
          {/* Monthly Filter & Control Banner */}
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[#075073]">
                  🗓️ حساب الأقساط والالتزامات شهرياً وتجميع الموردين
                </h3>
                <p className="text-xs text-stone-500">
                  حساب دقيق لالتزامات كل شهر مع تجميع كافة عقود وأقساط كل مورد على حدة بمبالغها المتباينة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Month Selector */}
              <div className="flex items-center gap-1.5 bg-[#faf7f0] px-3 py-1.5 rounded-xl border border-stone-200">
                <span className="text-xs font-bold text-stone-600">الشهر المالي:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-white border border-stone-300 text-xs font-bold text-[#075073] rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#075073]"
                >
                  {availableMonths.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} {m.id === currMonthPrefix ? '(الشهر الحالي)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Mode Toggle */}
              <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold flex-wrap gap-1">
                <button
                  onClick={() => setInstallmentViewMode('by_date')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    installmentViewMode === 'by_date'
                      ? 'bg-[#075073] text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>📅 تجميع بالتاريخ</span>
                </button>
                <button
                  onClick={() => setInstallmentViewMode('grouped')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    installmentViewMode === 'grouped'
                      ? 'bg-[#075073] text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>🏢 تجميع بالموردين</span>
                </button>
                <button
                  onClick={() => setInstallmentViewMode('table')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    installmentViewMode === 'table'
                      ? 'bg-[#075073] text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <span>📋 جدول شامل</span>
                </button>
              </div>

              {isMgr && (
                <button
                  onClick={() => handleOpenAdd()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>+ قسط / التزام جديد</span>
                </button>
              )}
            </div>
          </div>

          {/* Monthly KPI Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
              <div className="text-[11px] font-bold text-stone-500 mb-1">مستحق السداد لشهر ({selectedMonth})</div>
              <div className="text-2xl font-black font-mono text-[#075073]">
                {monthTotalDue.toLocaleString('ar-EG')}{' '}
                <span className="text-xs font-sans font-bold text-stone-500">ج.م</span>
              </div>
              <div className="text-[10px] text-stone-400 mt-1">إجمالي أقساط الشهر لكافة الموردين</div>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 shadow-sm">
              <div className="text-[11px] font-bold text-emerald-800 mb-1">المسدد فعلياً خلال الشهر</div>
              <div className="text-2xl font-black font-mono text-emerald-700">
                {monthTotalPaid.toLocaleString('ar-EG')}{' '}
                <span className="text-xs font-sans font-bold text-emerald-800">ج.م</span>
              </div>
              <div className="text-[10px] text-emerald-600 mt-1">دفعات موثقة بإيصالات سداد</div>
            </div>

            <div
              className={`p-4 rounded-xl border shadow-sm ${
                monthTotalRemaining > 0
                  ? 'bg-amber-50/80 border-amber-200'
                  : 'bg-stone-50 border-stone-200'
              }`}
            >
              <div className="text-[11px] font-bold text-stone-600 mb-1">المتبقي سداده هذا الشهر</div>
              <div
                className={`text-2xl font-black font-mono ${
                  monthTotalRemaining > 0 ? 'text-amber-700' : 'text-stone-700'
                }`}
              >
                {monthTotalRemaining.toLocaleString('ar-EG')}{' '}
                <span className="text-xs font-sans font-bold text-stone-500">ج.م</span>
              </div>
              <div className="text-[10px] text-stone-500 mt-1">
                {monthTotalRemaining > 0 ? '⚠️ يتطلب إصدار شيكات / تحويل' : '✓ تم سداد التزامات الشهر بالكامل'}
              </div>
            </div>

            <div className="bg-purple-50/70 p-4 rounded-xl border border-purple-200 shadow-sm">
              <div className="text-[11px] font-bold text-purple-800 mb-1">إجمالي الالتزامات الكلية المتبقية</div>
              <div className="text-2xl font-black font-mono text-purple-900">
                {overallTotalRemainingLiabilities.toLocaleString('ar-EG')}{' '}
                <span className="text-xs font-sans font-bold text-purple-800">ج.م</span>
              </div>
              <div className="text-[10px] text-purple-600 mt-1">الرصيد المتبقي على مدار كافة الأشهر القادمة</div>
            </div>
          </div>

          {/* VIEW MODE 1: DATE GROUPED (تجميع حسب تاريخ الاستحقاق) */}
          {installmentViewMode === 'by_date' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-stone-50 p-3 rounded-xl border border-stone-200 flex-wrap gap-2">
                <div className="text-xs font-bold text-[#075073] flex items-center gap-1.5">
                  <span>📅 استحقاقات مجمعة حسب تاريخ السداد:</span>
                  <span className="font-mono text-stone-500">({dateGroups.length} تواريخ استحقاق)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-600 font-medium">عرض:</span>
                  <button
                    type="button"
                    onClick={() => setDateGroupFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      dateGroupFilter === 'all'
                        ? 'bg-[#075073] text-white shadow-2xs'
                        : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    كافة التواريخ ({recurring.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateGroupFilter('selected_month')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      dateGroupFilter === 'selected_month'
                        ? 'bg-[#075073] text-white shadow-2xs'
                        : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    الشهر المحدد فقط ({selectedMonth === 'all' ? 'الكل' : selectedMonth})
                  </button>
                </div>
              </div>

              {dateGroups.length > 0 ? (
                dateGroups.map((group) => {
                  const isPast = group.daysDiff < 0 && group.totalRemaining > 0;
                  const isToday = group.daysDiff === 0 && group.totalRemaining > 0;
                  const isCompleted = group.totalDue > 0 && group.totalRemaining === 0;

                  return (
                    <div
                      key={group.date}
                      className={`bg-white rounded-2xl border transition-all shadow-sm overflow-hidden ${
                        isPast
                          ? 'border-rose-300 ring-1 ring-rose-100'
                          : isToday
                          ? 'border-amber-400 ring-2 ring-amber-200'
                          : isCompleted
                          ? 'border-emerald-300'
                          : 'border-stone-200'
                      }`}
                    >
                      {/* Date Header Card */}
                      <div
                        className={`p-4 border-b flex items-center justify-between flex-wrap gap-3 ${
                          isPast
                            ? 'bg-rose-50/70 border-rose-200'
                            : isToday
                            ? 'bg-amber-50 border-amber-200'
                            : isCompleted
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : 'bg-[#faf7f0] border-stone-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2.5 rounded-xl text-white ${
                              isPast
                                ? 'bg-rose-600'
                                : isToday
                                ? 'bg-amber-600'
                                : isCompleted
                                ? 'bg-emerald-600'
                                : 'bg-[#075073]'
                            }`}
                          >
                            <Calendar className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-base font-black text-[#075073]">
                                {group.date === 'غير محدد' ? 'مستمر / غير محدد التاريخ' : group.formattedDate}
                              </h4>
                              {group.date !== 'غير محدد' && (
                                <span className="font-mono text-xs text-stone-500 font-bold bg-white px-2 py-0.5 rounded-lg border border-stone-200">
                                  {group.date}
                                </span>
                              )}
                              {/* Status Badge */}
                              {group.date !== 'غير محدد' &&
                                (isCompleted ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    ✓ تم السداد بالكامل
                                  </span>
                                ) : isPast ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                                    ⚠️ متأخر بمقدار {Math.abs(group.daysDiff)} يوم
                                  </span>
                                ) : isToday ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-900 border border-amber-400">
                                    ⚡ مستحق اليوم
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                    ⏱️ متبقي {group.daysDiff} يوم
                                  </span>
                                ))}
                            </div>
                            <div className="text-xs text-stone-500 mt-1">
                              يشمل <strong>{group.items.length}</strong> التزامات وأقساط مستحقة في هذا اليوم
                            </div>
                          </div>
                        </div>

                        {/* Aggregated totals for this date */}
                        <div className="flex items-center gap-4 bg-white/90 px-4 py-2 rounded-xl border border-stone-200/80 shadow-2xs flex-wrap">
                          <div className="text-center sm:text-left">
                            <div className="text-[10px] font-bold text-stone-400">إجمالي المستحق</div>
                            <div className="text-base font-black font-mono text-[#075073]">
                              {group.totalDue.toLocaleString('ar-EG')}{' '}
                              <span className="text-[10px] font-sans">ج.م</span>
                            </div>
                          </div>
                          <div className="h-6 w-px bg-stone-200" />
                          <div className="text-center sm:text-left">
                            <div className="text-[10px] font-bold text-emerald-600">المسدد</div>
                            <div className="text-base font-black font-mono text-emerald-700">
                              {group.totalPaid.toLocaleString('ar-EG')}{' '}
                              <span className="text-[10px] font-sans">ج.م</span>
                            </div>
                          </div>
                          <div className="h-6 w-px bg-stone-200" />
                          <div className="text-center sm:text-left">
                            <div className="text-[10px] font-bold text-amber-600">المتبقي في هذا التاريخ</div>
                            <div className="text-base font-black font-mono text-amber-700">
                              {group.totalRemaining.toLocaleString('ar-EG')}{' '}
                              <span className="text-[10px] font-sans">ج.م</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Items list for this date */}
                      <div className="divide-y divide-stone-100 p-2 sm:p-3">
                        {group.items.map(({ rec, dueAmount, paidAmount, isFullyPaid }) => {
                          const rem = rec.remainingInstallments;
                          const tot = rec.totalInstallments;
                          const hasInstallments = rem !== undefined && tot !== undefined && tot > 0;
                          const paidCount = hasInstallments ? Math.max(0, tot - rem) : 0;
                          const pctPaid = hasInstallments ? Math.round((paidCount / tot) * 100) : 0;

                          return (
                            <div
                              key={rec.id}
                              className="p-3 hover:bg-stone-50/80 rounded-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h5 className="text-sm font-bold text-stone-900">{rec.title}</h5>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">
                                    {rec.type === 'installment_monthly'
                                      ? 'قسط شهري'
                                      : rec.type === 'installment_annual'
                                      ? 'قسط سنوي'
                                      : rec.type === 'rent'
                                      ? 'إيجار دوري'
                                      : rec.type === 'subscription'
                                      ? 'اشتراك دوري'
                                      : 'التزام مالي'}
                                  </span>
                                  {rec.supplier && (
                                    <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1">
                                      <Building2 className="w-3 h-3 text-amber-700" />
                                      <span>{rec.supplier}</span>
                                    </span>
                                  )}
                                  {isFullyPaid && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      ✓ مسدد بالكامل
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-stone-500 flex-wrap">
                                  <span>
                                    طريقة الدفع:{' '}
                                    <strong className="text-stone-700">{rec.paymentMethod || 'شيك بنكي'}</strong>
                                  </span>
                                  {rec.notes && <span>· {rec.notes}</span>}
                                  {paidAmount > 0 && (
                                    <span className="text-emerald-700 font-bold">
                                      ✓ تم سداد {paidAmount.toLocaleString('ar-EG')} ج.م
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-6 self-end md:self-center">
                                <div className="text-left">
                                  <div className="text-[10px] text-stone-400 font-bold">قيمة القسط</div>
                                  <div className="text-lg font-black font-mono text-[#075073]">
                                    {rec.estCost.toLocaleString('ar-EG')}{' '}
                                    <span className="text-xs font-sans font-bold text-stone-500">ج.م</span>
                                  </div>
                                </div>

                                {hasInstallments && (
                                  <div className="w-24 space-y-1">
                                    <div className="flex justify-between text-[10px] text-stone-600 font-bold">
                                      <span>متبقي: {rem}</span>
                                      <span>من {tot}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          isFullyPaid ? 'bg-emerald-600' : 'bg-amber-500'
                                        }`}
                                        style={{ width: `${pctPaid}%` }}
                                      />
                                    </div>
                                    <div className="text-[9px] text-stone-400 text-center font-mono">
                                      {pctPaid}% مسدد
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => setViewingHistoryItem(rec)}
                                    className="px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-all cursor-pointer flex items-center gap-1"
                                    title="عرض سجل الدفعات"
                                  >
                                    <History className="w-3 h-3 text-indigo-600" />
                                    <span>السجل ({rec.history?.length || 0})</span>
                                  </button>

                                  {isMgr && !isFullyPaid && (
                                    <button
                                      onClick={() => handleOpenPay(rec)}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                                      title="تسجيل سداد القسط"
                                    >
                                      <CreditCard className="w-3 h-3 text-white" />
                                      <span>سداد قسط</span>
                                    </button>
                                  )}

                                  {isMgr && (
                                    <button
                                      onClick={() => handleOpenEdit(rec)}
                                      className="p-1 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-all cursor-pointer"
                                      title="تعديل"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {isMgr && (
                                    <button
                                      onClick={() => handleDeleteCommitment(rec.id)}
                                      className="p-1 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all cursor-pointer"
                                      title="حذف"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-stone-400 text-xs">
                  لا توجد أقساط أو التزامات مسجلة تطابق التصفية الحالية
                </div>
              )}
            </div>
          )}

          {/* VIEW MODE 2: SUPPLIER GROUPED (كل مورد تحته كل ما يخصه) */}
          {installmentViewMode === 'grouped' && (
            <div className="space-y-4">
              {supplierGroups.length > 0 ? (
                supplierGroups.map((g) => {
                  const isSupplierFullyPaidThisMonth = g.monthDue > 0 && g.monthRemaining === 0;
                  return (
                    <div
                      key={g.supplierName}
                      className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"
                    >
                      {/* Supplier Card Header */}
                      <div className="p-4 bg-[#f8f5ee] border-b border-stone-200 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-[#075073] text-white">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-black text-[#075073]">{g.supplierName}</h4>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                {g.items.length} بنود / عقود
                              </span>
                              {isSupplierFullyPaidThisMonth && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ✓ مسدد لشهر ({selectedMonth})
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-3 flex-wrap">
                              <span>
                                مستحق هذا الشهر:{' '}
                                <strong className="font-mono text-stone-800 font-bold">
                                  {g.monthDue.toLocaleString('ar-EG')} ج.م
                                </strong>
                              </span>
                              <span>·</span>
                              <span>
                                مسدد:{' '}
                                <strong className="font-mono text-emerald-700 font-bold">
                                  {g.monthPaid.toLocaleString('ar-EG')} ج.م
                                </strong>
                              </span>
                              <span>·</span>
                              <span>
                                المتبقي هذا الشهر:{' '}
                                <strong
                                  className={`font-mono font-bold ${
                                    g.monthRemaining > 0 ? 'text-amber-700' : 'text-emerald-700'
                                  }`}
                                >
                                  {g.monthRemaining.toLocaleString('ar-EG')} ج.م
                                </strong>
                              </span>
                              <span>·</span>
                              <span>
                                المتبقي الكلي لكافة الأقساط:{' '}
                                <strong className="font-mono text-purple-900 font-bold">
                                  {g.totalRemainingLiability.toLocaleString('ar-EG')} ج.م
                                </strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {isMgr && (
                          <button
                            onClick={() => handleOpenAdd(g.supplierName)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-stone-100 text-[#075073] border border-stone-300 shadow-2xs transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-amber-600" />
                            <span>+ إضافة قسط لهذا المورد</span>
                          </button>
                        )}
                      </div>

                      {/* Items under this supplier */}
                      <div className="divide-y divide-stone-100">
                        {g.items.map((rec) => {
                          const rem = rec.remainingInstallments;
                          const tot = rec.totalInstallments;
                          const hasInstallments = rem !== undefined && tot !== undefined && tot > 0;
                          const paidCount = hasInstallments ? Math.max(0, tot - rem) : 0;
                          const pctPaid = hasInstallments ? Math.round((paidCount / tot) * 100) : 0;
                          const isFullyPaid = hasInstallments && rem === 0;

                          // Month-specific paid for this item
                          const itemPaidThisMonth = (rec.history || [])
                            .filter((h) => (h.date || '').startsWith(selectedMonth))
                            .reduce((s, h) => s + (h.amount || 0), 0);

                          return (
                            <div
                              key={rec.id}
                              className="p-4 hover:bg-[#fcfaf5] transition-colors flex items-center justify-between flex-wrap gap-4"
                            >
                              <div className="space-y-1.5 flex-1 min-w-[260px]">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-black text-sm text-stone-900">{rec.title}</span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">
                                    {rec.type === 'installment_monthly'
                                      ? 'قسط شهري'
                                      : rec.type === 'installment_annual'
                                      ? 'قسط سنوي'
                                      : rec.type === 'rent'
                                      ? 'إيجار دوري'
                                      : rec.type === 'subscription'
                                      ? 'اشتراك خدمات'
                                      : 'التزام ثابت'}
                                  </span>
                                  {rec.history && rec.history.length > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 font-mono font-bold">
                                      {rec.history.length} سدادات سابقة
                                    </span>
                                  )}
                                </div>
                                {rec.notes && <p className="text-xs text-stone-500">{rec.notes}</p>}
                                <div className="flex items-center gap-4 text-xs text-stone-600 flex-wrap">
                                  <span>
                                    طريقة السداد: <strong>{rec.paymentMethod || 'شيك بنكي'}</strong>
                                  </span>
                                  <span>·</span>
                                  <span>
                                    الاستحقاق:{' '}
                                    <strong className="font-mono text-stone-800">{rec.nextDue || 'شهري'}</strong>
                                  </span>
                                  {itemPaidThisMonth > 0 && (
                                    <span className="text-emerald-700 font-bold">
                                      ✓ تم سداد {itemPaidThisMonth.toLocaleString('ar-EG')} ج.م في شهر ({selectedMonth})
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Amount & Progress */}
                              <div className="flex items-center gap-6">
                                <div className="text-left space-y-1">
                                  <div className="text-xs text-stone-400 font-bold">قيمة القسط</div>
                                  <div className="text-lg font-black font-mono text-[#075073]">
                                    {rec.estCost.toLocaleString('ar-EG')}{' '}
                                    <span className="text-xs font-sans font-bold text-stone-500">ج.م</span>
                                  </div>
                                  {hasInstallments && (
                                    <div className="text-[10px] text-purple-700 font-bold">
                                      المتبقي:{' '}
                                      <span className="font-mono">
                                        {((rem ?? 0) * rec.estCost).toLocaleString('ar-EG')} ج.م
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {hasInstallments && (
                                  <div className="w-28 space-y-1">
                                    <div className="flex justify-between text-[10px] text-stone-600 font-bold">
                                      <span>متبقي: {rem}</span>
                                      <span>من {tot}</span>
                                    </div>
                                    <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          isFullyPaid ? 'bg-emerald-600' : 'bg-amber-500'
                                        }`}
                                        style={{ width: `${pctPaid}%` }}
                                      />
                                    </div>
                                    <div className="text-[9px] text-stone-400 text-center font-mono">
                                      {pctPaid}% مسدد
                                    </div>
                                  </div>
                                )}

                                {/* Action buttons */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => setViewingHistoryItem(rec)}
                                    className="px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-all cursor-pointer flex items-center gap-1"
                                    title="عرض سجل الدفعات"
                                  >
                                    <History className="w-3 h-3 text-indigo-600" />
                                    <span>السجل ({rec.history?.length || 0})</span>
                                  </button>

                                  {isMgr && !isFullyPaid && (
                                    <button
                                      onClick={() => handleOpenPay(rec)}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                                      title="تسجيل سداد القسط"
                                    >
                                      <CreditCard className="w-3 h-3 text-white" />
                                      <span>سداد قسط</span>
                                    </button>
                                  )}

                                  {isMgr && (
                                    <button
                                      onClick={() => handleOpenEdit(rec)}
                                      className="p-1 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-all cursor-pointer"
                                      title="تعديل"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {isMgr && (
                                    <button
                                      onClick={() => handleDeleteCommitment(rec.id)}
                                      className="p-1 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all cursor-pointer"
                                      title="حذف"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-stone-400 text-xs">
                  لا توجد أقساط أو التزامات مسجلة حالياً
                </div>
              )}
            </div>
          )}

          {/* VIEW MODE 2: TABLE VIEW */}
          {installmentViewMode === 'table' && (
            <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#f4efe2] text-[#075073] border-b border-stone-200 font-bold">
                    <tr>
                      <th className="py-3 px-3.5">بند الالتزام / القسط</th>
                      <th className="py-3 px-3.5">النوع</th>
                      <th className="py-3 px-3.5">الجهة / المورد</th>
                      <th className="py-3 px-3.5">قيمة القسط</th>
                      <th className="py-3 px-3.5">الأقساط المتبقية</th>
                      <th className="py-3 px-3.5">الاستحقاق القادم</th>
                      <th className="py-3 px-3.5">طريقة السداد</th>
                      <th className="py-3 px-3.5">الحالة والمزامنة</th>
                      <th className="py-3 px-3.5 text-center">إجراءات وسجل السدادات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {recurring.length > 0 ? (
                      recurring.map((rec) => {
                        const rem = rec.remainingInstallments;
                        const tot = rec.totalInstallments;
                        const hasInstallments = rem !== undefined && tot !== undefined && tot > 0;
                        const paidCount = hasInstallments ? Math.max(0, tot - rem) : 0;
                        const pctPaid = hasInstallments ? Math.round((paidCount / tot) * 100) : 0;
                        const isFullyPaid = hasInstallments && rem === 0;

                        return (
                          <tr key={rec.id} className="hover:bg-[#fbf8f1] transition-colors">
                            <td className="py-3 px-3.5">
                              <div className="font-bold text-stone-900 flex items-center gap-1.5">
                                <span>{rec.title}</span>
                                {rec.history && rec.history.length > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 font-mono">
                                    {rec.history.length} سداد
                                  </span>
                                )}
                              </div>
                              {rec.notes && <div className="text-[10px] text-stone-500 mt-0.5">{rec.notes}</div>}
                            </td>
                            <td className="py-3 px-3.5">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">
                                {rec.type === 'installment_monthly'
                                  ? 'قسط شهري'
                                  : rec.type === 'installment_annual'
                                  ? 'قسط سنوي'
                                  : rec.type === 'rent'
                                  ? 'إيجار دوري'
                                  : rec.type === 'subscription'
                                  ? 'اشتراك خدمات'
                                  : 'التزام ثابت'}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 font-semibold text-stone-700">{rec.supplier || '—'}</td>
                            <td className="py-3 px-3.5 font-mono font-bold text-sm text-[#075073]">
                              {rec.estCost.toLocaleString('ar-EG')} ج.م
                            </td>
                            <td className="py-3 px-3.5">
                              {hasInstallments ? (
                                <div className="space-y-1 max-w-[120px]">
                                  <div className="flex justify-between text-[10px] text-stone-600 font-bold">
                                    <span>متبقي: {rem}</span>
                                    <span>من {tot}</span>
                                  </div>
                                  <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        isFullyPaid ? 'bg-emerald-600' : 'bg-amber-500'
                                      }`}
                                      style={{ width: `${pctPaid}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-stone-400 font-normal">دوري مستمر</span>
                              )}
                            </td>
                            <td className="py-3 px-3.5">
                              <span
                                className={`font-mono font-bold px-2 py-0.5 rounded border ${
                                  isFullyPaid
                                    ? 'text-stone-400 bg-stone-50 border-stone-200'
                                    : 'text-stone-800 bg-amber-50 border-amber-200'
                                }`}
                              >
                                {isFullyPaid ? 'مكتمل' : rec.nextDue || '—'}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-stone-600">{rec.paymentMethod || 'كاش'}</td>
                            <td className="py-3 px-3.5">
                              <div className="flex flex-col gap-1 items-start">
                                {isFullyPaid ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <CheckCircle2 className="w-3 h-3" /> مسدد بالكامل
                                  </span>
                                ) : rec.active ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                                    <Clock className="w-3 h-3" /> ساري ونشط
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                                    متوقف
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  🟢 متزامن (Synced)
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => setViewingHistoryItem(rec)}
                                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-all cursor-pointer flex items-center gap-1"
                                  title="عرض سجل السدادات والدفعات السابقة"
                                >
                                  <History className="w-3 h-3 text-indigo-600" />
                                  <span>سجل السدادات ({rec.history?.length || 0})</span>
                                </button>

                                {isMgr && !isFullyPaid && (
                                  <button
                                    onClick={() => handleOpenPay(rec)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-all cursor-pointer flex items-center gap-1"
                                    title="تسجيل سداد القسط الحالي"
                                  >
                                    <CreditCard className="w-3 h-3 text-emerald-600" />
                                    <span>سداد قسط</span>
                                  </button>
                                )}
                                {isMgr && (
                                  <button
                                    onClick={() => handleOpenEdit(rec)}
                                    className="p-1 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-all cursor-pointer"
                                    title="تعديل"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {isMgr && (
                                  <button
                                    onClick={() => handleDeleteCommitment(rec.id)}
                                    className="p-1 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all cursor-pointer"
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-stone-400">
                          لا توجد أقساط أو التزامات دورية مسجلة حالياً
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: PETTY CASH (العهدة والمصروفات النثرية) */}
      {activeSubTab === 'petty_cash' && (
        <div className="space-y-4">
          {/* Date Range Filter Bar */}
          <DateFilterBar
            value={pettyDateFilter}
            onChange={setPettyDateFilter}
            label="فلترة تاريخ المصروفات النثرية"
          />

          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            {/* Filter Categories */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs font-bold text-stone-500 ml-2">التصنيف:</span>
              {[
                { id: 'all', label: 'الكل' },
                { id: 'ضيافة_وطوارئ', label: 'ضيافة وطوارئ' },
                { id: 'نقل_ومشاوير', label: 'نقل ومشاوير' },
                { id: 'أدوات_ومستلزمات', label: 'أدوات ومستلزمات' },
                { id: 'شحن_وطرود', label: 'شحن وطرود' },
                { id: 'صيانة_عاجلة', label: 'صيانة عاجلة' },
                { id: 'مكتبية_وطباعة', label: 'مكتبية وطباعة' },
                { id: 'أخرى', label: 'أخرى' }
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setPettyCategoryFilter(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    pettyCategoryFilter === c.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Search & Month */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <input
                  type="text"
                  value={pettySearch}
                  onChange={(e) => setPettySearch(e.target.value)}
                  placeholder="بحث في البيان، الإيصال، الإدارة..."
                  className="py-1.5 px-3 rounded-lg border border-stone-200 text-xs w-56 focus:border-emerald-600 focus:outline-none"
                />
                {pettySearch && (
                  <button
                    onClick={() => setPettySearch('')}
                    className="absolute left-2 top-2 text-stone-400 hover:text-stone-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-stone-500">الشهر:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="py-1.5 px-3 rounded-lg border border-stone-200 text-xs font-bold text-[#075073] focus:border-emerald-600 focus:outline-none"
                >
                  {availableMonths.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => {
                  setPettyTitle('');
                  setPettyAmount('');
                  setPettyDate(isoToday());
                  setPettyReceiptNo(`PC-${Date.now().toString().slice(-4)}`);
                  setPettyNotes('');
                  setShowAddPettyModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ تسجيل مصروف</span>
              </button>
            </div>
          </div>

          {/* KPI Mini-Cards for Petty Cash */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl">
              <div className="text-[11px] font-bold text-emerald-800">إجمالي المصروفات النثرية لهذا الشهر</div>
              <div className="text-2xl font-black font-mono text-emerald-950 mt-1">
                {totalPettyCashSpend.toLocaleString('ar-EG')} <span className="text-xs font-sans">ج.م</span>
              </div>
              <div className="text-[10px] text-emerald-700 mt-1">
                عن شهر {availableMonths.find((m) => m.id === selectedMonth)?.label || selectedMonth}
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl">
              <div className="text-[11px] font-bold text-stone-600">عدد العمليات المسجلة</div>
              <div className="text-2xl font-black font-mono text-stone-900 mt-1">
                {displayPettyCash.length} <span className="text-xs font-sans">حركة</span>
              </div>
              <div className="text-[10px] text-stone-500 mt-1">
                {pettyCategoryFilter !== 'all' ? `مفلترة حسب: ${pettyCategoryFilter}` : 'كافة التصنيفات المعتمدة'}
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl">
              <div className="text-[11px] font-bold text-stone-600">متوسط قيمة المصروف</div>
              <div className="text-2xl font-black font-mono text-stone-900 mt-1">
                {(displayPettyCash.length > 0 ? Math.round(totalPettyCashSpend / displayPettyCash.length) : 0).toLocaleString('ar-EG')}{' '}
                <span className="text-xs font-sans">ج.م</span>
              </div>
              <div className="text-[10px] text-stone-500 mt-1">
                معدل الصرف اليومي والطارئ
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-[#075073]">سجل حركات العهدة والمصروفات النثرية</h3>
                <p className="text-xs text-stone-500 mt-0.5">توثيق العمليات والمستندات المصروفة مباشرة نقداً أو إلكترونياً</p>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 bg-stone-100 text-stone-700 rounded-lg">
                {displayPettyCash.length} سجل
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-3.5">تاريخ الصرف</th>
                    <th className="py-3 px-3.5">بيان المصروف</th>
                    <th className="py-3 px-3.5">التصنيف</th>
                    <th className="py-3 px-3.5">المبلغ (ج.م)</th>
                    <th className="py-3 px-3.5">القائم بالصرف</th>
                    <th className="py-3 px-3.5">الإدارة المستفيدة</th>
                    <th className="py-3 px-3.5">طريقة الدفع / الإيصال</th>
                    <th className="py-3 px-3.5">ملاحظات</th>
                    <th className="py-3 px-3.5 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-medium">
                  {displayPettyCash.length > 0 ? (
                    displayPettyCash.map((item) => (
                      <tr key={item.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="py-3 px-3.5 font-mono text-stone-700 font-bold whitespace-nowrap">
                          {formatDateDisplay(item.date)}
                        </td>
                        <td className="py-3 px-3.5 font-bold text-[#075073]">
                          {item.title}
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                            {item.category.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-mono font-black text-emerald-700 text-sm whitespace-nowrap">
                          {item.amount.toLocaleString('ar-EG')} ج.م
                        </td>
                        <td className="py-3 px-3.5 text-stone-700">
                          {item.paidBy || '—'}
                        </td>
                        <td className="py-3 px-3.5 text-stone-600">
                          {item.department || 'الإدارة'}
                        </td>
                        <td className="py-3 px-3.5 text-stone-600 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold">{item.paymentMethod.replace('_', ' ')}</span>
                            <DocumentSequenceBadge code={item.receiptNo || item.id} type="EXP" size="sm" />
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-stone-500 max-w-xs truncate">
                          {item.notes || '—'}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <button
                            onClick={() => handleDeletePettyExpense(item.id)}
                            className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                            title="حذف المصروف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-stone-400">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Wallet className="w-8 h-8 text-stone-300" />
                          <p className="font-bold">لا توجد مصروفات نثرية مسجلة لهذا الشهر</p>
                          <p className="text-[11px] text-stone-400">
                            اضغط على زر "+ تسجيل مصروف نثري" لإضافة عملية جديدة إلى العهدة
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STOCK CONSUMPTION / INVENTORY EXPENSES (خسائر ومصروفات استهلاك المخزون) */}
      {activeSubTab === 'stock_consumption' && (
        <div className="space-y-5">
          {/* Date Filter Bar */}
          <DateFilterBar
            value={stockConsumptionDateFilter}
            onChange={setStockConsumptionDateFilter}
            label="فترة تقرير استهلاك المخزون المنصرف"
          />

          {/* Prominent Accounting Clarification Alert Banner */}
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-black text-sm text-amber-900 flex items-center gap-2">
                <span>تنبيه وإيضاح محاسبي: تقدير قيمة استهلاك مخزون (قيد دفتري)</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                  غير نقدي
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-amber-900 font-medium">
                الأرقام والتقارير في هذا القسم تمثل <strong>"تقدير قيمة استهلاك مخزون"</strong> بناءً على تكلفة شراء الأصناف وقت الصرف الفعلي لأقسام الأكاديمية (البوفيه، النظافة، القرطاسية والمكاتب). <strong>هذا ليس "مصروفاً نقدياً فعلياً"</strong> من الخزينة أو البنك، ولا يمس أو يخفض رصيد العهدة النقدية (Petty Cash)، بل هو استهلاك لأصول ومواد سبق شراؤها وتوريدها للمخزن.
              </p>
            </div>
          </div>

          {/* Metric KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs border-r-4 border-r-sky-600">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500">إجمالي استهلاك المخزون</span>
                <span className="text-lg">📦</span>
              </div>
              <div className="text-2xl font-black font-mono text-sky-800 mt-1">
                {stockConsumptionStats.totalOutVal.toLocaleString('ar-EG')}{' '}
                <span className="text-xs font-sans font-normal text-stone-500">ج.م</span>
              </div>
              <div className="text-[11px] text-stone-400 mt-1">
                {stockConsumptionStats.totalQty} وحدة منصرفة · {stockConsumptionStats.periodMovesCount} حركة
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs border-r-4 border-r-amber-500">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500">استهلاك البوفيه والضيافة</span>
                <span className="text-lg">☕</span>
              </div>
              <div className="text-2xl font-black font-mono text-amber-700 mt-1">
                {stockConsumptionStats.buffetOutVal.toLocaleString('ar-EG')}{' '}
                <span className="text-xs font-sans font-normal text-stone-500">ج.م</span>
              </div>
              <div className="text-[11px] text-stone-400 mt-1">
                {stockConsumptionStats.totalOutVal > 0
                  ? `${Math.round((stockConsumptionStats.buffetOutVal / stockConsumptionStats.totalOutVal) * 100)}% من إجمالي الاستهلاك`
                  : 'مشروبات وضيافة'}
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs border-r-4 border-r-cyan-600">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500">استهلاك النظافة والخدمات</span>
                <span className="text-lg">🧴</span>
              </div>
              <div className="text-2xl font-black font-mono text-cyan-700 mt-1">
                {stockConsumptionStats.cleaningOutVal.toLocaleString('ar-EG')}{' '}
                <span className="text-xs font-sans font-normal text-stone-500">ج.م</span>
              </div>
              <div className="text-[11px] text-stone-400 mt-1">
                {stockConsumptionStats.totalOutVal > 0
                  ? `${Math.round((stockConsumptionStats.cleaningOutVal / stockConsumptionStats.totalOutVal) * 100)}% من إجمالي الاستهلاك`
                  : 'منظفات ومستهلكات'}
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs border-r-4 border-r-purple-600">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500">استهلاك مكاتب وأخرى</span>
                <span className="text-lg">🏢</span>
              </div>
              <div className="text-2xl font-black font-mono text-purple-700 mt-1">
                {stockConsumptionStats.otherOutVal.toLocaleString('ar-EG')}{' '}
                <span className="text-xs font-sans font-normal text-stone-500">ج.م</span>
              </div>
              <div className="text-[11px] text-stone-400 mt-1">أدوات مكتبية وقرطاسية</div>
            </div>
          </div>

          {/* Filtering & Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            {/* Department Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-stone-500 ml-2">تصفية حسب القسم:</span>
              {[
                { id: 'all', label: 'كافة الأقسام' },
                { id: 'buffet', label: '☕ بوفيه وضيافة' },
                { id: 'cleaning', label: '🧴 نظافة وخدمات' },
                { id: 'other', label: '🏢 أقسام أخرى' }
              ].map((d) => (
                <button
                  key={d.id}
                  onClick={() => setStockConsumptionDeptFilter(d.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    stockConsumptionDeptFilter === d.id
                      ? 'bg-sky-700 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* View Mode Toggle and Search */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setStockConsumptionViewMode('items')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    stockConsumptionViewMode === 'items'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  📊 تجميع حسب الأصناف
                </button>
                <button
                  type="button"
                  onClick={() => setStockConsumptionViewMode('moves')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    stockConsumptionViewMode === 'moves'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  📝 حركات الصرف المفصلة ({consumptionOutMoves.length})
                </button>
              </div>

              <input
                type="text"
                value={stockConsumptionSearch}
                onChange={(e) => setStockConsumptionSearch(e.target.value)}
                placeholder="بحث بصنف أو كود أو مستلم..."
                className="py-1.5 px-3 rounded-lg border border-stone-200 text-xs focus:border-sky-600 focus:outline-none w-48"
              />
            </div>
          </div>

          {/* VIEW MODE 1: AGGREGATED ITEMS */}
          {stockConsumptionViewMode === 'items' && (
            <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-stone-200 bg-[#f4efe2] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-[#075073]">
                    تفصيل استهلاك الأصناف (الاسم، الكمية المصروفة، إجمالي القيمة)
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    مرتب تنازلياً حسب إجمالي القيمة المستهلكة
                  </p>
                </div>
                <div className="text-xs font-bold text-stone-600">
                  {stockConsumptionStats.aggregatedItems.length} صنف مستهلك
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-3.5">#</th>
                      <th className="py-3 px-3.5">اسم الصنف</th>
                      <th className="py-3 px-3.5">الكود</th>
                      <th className="py-3 px-3.5">القسم المستهلك</th>
                      <th className="py-3 px-3.5 text-center">تكلفة الوحدة</th>
                      <th className="py-3 px-3.5 text-center">الكمية المصروفة</th>
                      <th className="py-3 px-3.5 text-center">عدد أذونات الصرف</th>
                      <th className="py-3 px-3.5 text-left">إجمالي القيمة المستهلكة (تقدير)</th>
                      <th className="py-3 px-3.5 text-center">نسبة الاستهلاك</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {stockConsumptionStats.aggregatedItems.length > 0 ? (
                      stockConsumptionStats.aggregatedItems.map((it, idx) => {
                        const pct =
                          stockConsumptionStats.totalOutVal > 0
                            ? ((it.totalCost / stockConsumptionStats.totalOutVal) * 100).toFixed(1)
                            : '0';
                        return (
                          <tr key={it.itemId || idx} className="hover:bg-stone-50/70 transition-colors">
                            <td className="py-3 px-3.5 font-mono text-stone-400">{idx + 1}</td>
                            <td className="py-3 px-3.5 font-bold text-stone-900">{it.itemName}</td>
                            <td className="py-3 px-3.5 font-mono text-stone-500">{it.code}</td>
                            <td className="py-3 px-3.5">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">
                                {it.department}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-center font-mono font-bold text-stone-600">
                              {it.unitCost.toLocaleString('ar-EG')} ج.م
                            </td>
                            <td className="py-3 px-3.5 text-center font-mono font-bold text-stone-800">
                              {it.totalQty.toLocaleString('ar-EG')}
                            </td>
                            <td className="py-3 px-3.5 text-center font-mono text-stone-500">
                              {it.movesCount}
                            </td>
                            <td className="py-3 px-3.5 text-left font-mono font-black text-sky-900">
                              {it.totalCost.toLocaleString('ar-EG')} ج.م
                            </td>
                            <td className="py-3 px-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="font-mono text-[11px] font-bold text-stone-700">{pct}%</span>
                                <div className="w-12 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-sky-600 rounded-full"
                                    style={{ width: `${Math.min(100, parseFloat(pct))}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-stone-400">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <span className="text-3xl">📦</span>
                            <p className="font-bold text-stone-600">لا توجد حركات صرف مخزون مسجلة في هذه الفترة</p>
                            <p className="text-[11px] text-stone-400">
                              يتم تجميع حركات الصرف المسجلة من شاشات البوفيه والنظافة والمخزن
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {stockConsumptionStats.aggregatedItems.length > 0 && (
                    <tfoot className="bg-stone-50 border-t-2 border-stone-200 font-black">
                      <tr>
                        <td colSpan={5} className="py-3 px-3.5 text-stone-800">
                          الإجمالي التقديري لاستهلاك المخزون للفترة المحددة:
                        </td>
                        <td className="py-3 px-3.5 text-center font-mono text-stone-900">
                          {stockConsumptionStats.totalQty.toLocaleString('ar-EG')} وحدة
                        </td>
                        <td className="py-3 px-3.5 text-center font-mono text-stone-500">
                          {consumptionOutMoves.length}
                        </td>
                        <td className="py-3 px-3.5 text-left font-mono text-sky-900 text-sm">
                          {stockConsumptionStats.totalOutVal.toLocaleString('ar-EG')} ج.م
                        </td>
                        <td className="py-3 px-3.5 text-center font-mono text-stone-600">100%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: DETAILED MOVES LOG */}
          {stockConsumptionViewMode === 'moves' && (
            <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-stone-200 bg-[#f4efe2] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-[#075073]">
                    سجل حركات الصرف التفصيلية (Stock-Out Moves)
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    كل عملية صرف مسجلة مع القيمة وتاريخ الصرف والمستلم
                  </p>
                </div>
                <div className="text-xs font-bold text-stone-600">
                  {consumptionOutMoves.length} حركة صرف
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-3.5">التاريخ</th>
                      <th className="py-3 px-3.5">الصنف</th>
                      <th className="py-3 px-3.5">الكود</th>
                      <th className="py-3 px-3.5">القسم المستلم</th>
                      <th className="py-3 px-3.5">المستلم / الشخص</th>
                      <th className="py-3 px-3.5 text-center">الكمية المصروفة</th>
                      <th className="py-3 px-3.5 text-left">التكلفة الإجمالية (تقدير)</th>
                      <th className="py-3 px-3.5">القائم بالصرف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {consumptionOutMoves.length > 0 ? (
                      consumptionOutMoves.map((m) => {
                        let cost = Number(m.cost) || 0;
                        if (cost <= 0) {
                          const itemObj = items.find((it) => String(it.id) === String(m.itemId));
                          if (itemObj && Number(itemObj.cost) > 0) {
                            cost = +(Number(itemObj.cost) * (Number(m.qty) || 0)).toFixed(2);
                          }
                        }
                        const isBuffet =
                          m.cat === 'BUFF' ||
                          (m.department && (m.department.includes('بوفيه') || m.department.toLowerCase().includes('buff')));
                        const isCleaning =
                          m.cat === 'CLN' ||
                          (m.department && (m.department.includes('نظاف') || m.department.toLowerCase().includes('clean')));

                        return (
                          <tr key={m.id} className="hover:bg-stone-50/70 transition-colors">
                            <td className="py-3 px-3.5 font-mono text-stone-600">
                              {formatDateDisplay(m.date)}
                            </td>
                            <td className="py-3 px-3.5 font-bold text-stone-900">{m.itemName}</td>
                            <td className="py-3 px-3.5 font-mono text-stone-500">{m.code || '—'}</td>
                            <td className="py-3 px-3.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isBuffet
                                    ? 'bg-amber-100 text-amber-800'
                                    : isCleaning
                                    ? 'bg-cyan-100 text-cyan-800'
                                    : 'bg-stone-100 text-stone-700'
                                }`}
                              >
                                {m.department || (isBuffet ? 'قسم البوفيه' : isCleaning ? 'قسم النظافة' : 'مخازن')}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-stone-700">{m.person || '—'}</td>
                            <td className="py-3 px-3.5 text-center font-mono font-bold text-stone-800">
                              {m.qty}
                            </td>
                            <td className="py-3 px-3.5 text-left font-mono font-bold text-sky-900">
                              {cost.toLocaleString('ar-EG')} ج.م
                            </td>
                            <td className="py-3 px-3.5 text-stone-500">{m.by || '—'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-stone-400">
                          لا توجد حركات صرف مخزون مطابقة للبحث أو الفترة المحددة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Commitment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#075073]">
                {editingItem ? '✏️ تعديل الالتزام / القسط' : '+ تسجيل التزام دوري أو قسط جديد'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCommitment} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم البند / الالتزام *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: قسط أجهزة معمل الكمبيوتر / إيجار مقر لوران"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">نوع الالتزام</label>
                  <select
                    value={commitType}
                    onChange={(e: any) => setCommitType(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  >
                    <option value="installment_monthly">قسط شهري</option>
                    <option value="installment_annual">قسط سنوي</option>
                    <option value="rent">إيجار مقر / عقار</option>
                    <option value="subscription">اشتراك سنوي / خدمات</option>
                    <option value="contract">عقد صيانة دوري</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الجهة / المورد المستحق</label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="مثال: شركة النور / مالك العقار"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                  />
                  {supplierGroups.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <span className="text-[10px] text-stone-400">موردون مسجلون:</span>
                      {supplierGroups
                        .filter((g) => g.supplierName && !g.supplierName.includes('بدون مورد'))
                        .slice(0, 4)
                        .map((g) => (
                          <button
                            key={g.supplierName}
                            type="button"
                            onClick={() => setSupplier(g.supplierName)}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 transition-all cursor-pointer"
                          >
                            {g.supplierName}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">قيمة القسط / الدفعة (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={estCost}
                    onChange={(e) => setEstCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ الاستحقاق القادم</label>
                  <input
                    type="date"
                    value={nextDue}
                    onChange={(e) => setNextDue(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">إجمالي الأقساط</label>
                  <input
                    type="number"
                    value={totalInstallments}
                    onChange={(e) => setTotalInstallments(e.target.value)}
                    placeholder="12"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-[#075073] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الأقساط المتبقية</label>
                  <input
                    type="number"
                    value={remainingInstallments}
                    onChange={(e) => setRemainingInstallments(e.target.value)}
                    placeholder="12"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-[#075073] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">طريقة السداد</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  >
                    <option value="شيك بنكي">شيك بنكي</option>
                    <option value="تحويل بنكي">تحويل بنكي</option>
                    <option value="نقداً (كاش)">نقداً (كاش)</option>
                    <option value="خصم مباشر">خصم مباشر</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="رقم الشيك، تاريخ انتهاء العقد، إلخ..."
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer"
                >
                  {editingItem ? 'حفظ التعديلات' : 'إضافة الالتزام'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Installment Modal */}
      {payingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-emerald-500 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">💳 تسجيل سداد قسط</h3>
                <p className="text-xs text-stone-500 mt-0.5">{payingItem.title}</p>
              </div>
              <button
                onClick={() => setPayingItem(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex justify-between items-center">
                <span>المتبقي حالياً:</span>
                <span className="font-mono font-bold">
                  {payingItem.remainingInstallments || 1} قسط
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">المبلغ المسدد (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold text-lg text-emerald-700 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ السداد *</label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">طريقة الدفع</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="تحويل بنكي">تحويل بنكي</option>
                    <option value="شيك بنكي">شيك بنكي</option>
                    <option value="نقداً (كاش)">نقداً (كاش)</option>
                    <option value="فودافون كاش / إنستاباي">فودافون كاش / إنستاباي</option>
                    <option value="خصم تلقائي">خصم تلقائي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">رقم الإيصال / الحوالة</label>
                  <input
                    type="text"
                    value={payReceiptNo}
                    onChange={(e) => setPayReceiptNo(e.target.value)}
                    placeholder="REC-1024"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">القائم بالسداد / المسؤول</label>
                <input
                  type="text"
                  value={payBy}
                  onChange={(e) => setPayBy(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات وبيان السداد</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="سداد القسط عن شهر..."
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setPayingItem(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md cursor-pointer"
                >
                  تأكيد سداد القسط وحفظ الإيصال ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {viewingHistoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-indigo-600 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#075073]">سجل سدادات الالتزام المالي</h3>
                  <p className="text-xs text-stone-500 font-bold">{viewingHistoryItem.title} — {viewingHistoryItem.supplier || 'بدون مورد'}</p>
                </div>
              </div>
              <button
                onClick={() => setViewingHistoryItem(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-1">
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                <div className="text-[10px] text-indigo-800 font-bold">إجمالي ما تم سداده</div>
                <div className="text-sm font-black font-mono text-indigo-900 mt-0.5">
                  {((viewingHistoryItem.history || []).reduce((sum, h) => sum + (h.amount || 0), 0)).toLocaleString('ar-EG')} ج.م
                </div>
              </div>

              <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                <div className="text-[10px] text-emerald-800 font-bold">عدد الدفعات المسددة</div>
                <div className="text-sm font-black font-mono text-emerald-900 mt-0.5">
                  {(viewingHistoryItem.history || []).length} دفعة
                </div>
              </div>

              <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                <div className="text-[10px] text-amber-800 font-bold">الأقساط المتبقية</div>
                <div className="text-sm font-black font-mono text-amber-900 mt-0.5">
                  {viewingHistoryItem.remainingInstallments ?? '—'} قسط
                </div>
              </div>

              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                <div className="text-[10px] text-stone-600 font-bold">قيمة القسط الفردي</div>
                <div className="text-sm font-black font-mono text-stone-900 mt-0.5">
                  {viewingHistoryItem.estCost.toLocaleString('ar-EG')} ج.م
                </div>
              </div>
            </div>

            {/* History Table */}
            <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#f4efe2] text-[#075073] sticky top-0 font-bold border-b border-stone-200">
                  <tr>
                    <th className="py-2.5 px-3">رقم الإيصال</th>
                    <th className="py-2.5 px-3">التاريخ</th>
                    <th className="py-2.5 px-3">المبلغ المسدد</th>
                    <th className="py-2.5 px-3">طريقة الدفع</th>
                    <th className="py-2.5 px-3">القائم بالدفع</th>
                    <th className="py-2.5 px-3">البيان والملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {viewingHistoryItem.history && viewingHistoryItem.history.length > 0 ? (
                    viewingHistoryItem.history.map((h, i) => (
                      <tr key={h.id || i} className="hover:bg-indigo-50/30">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                          {(h as any).receiptNo || `REC-${i + 1}`}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-stone-600">
                          {h.date}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                          {h.amount.toLocaleString('ar-EG')} ج.م
                        </td>
                        <td className="py-2.5 px-3 text-stone-700">
                          {(h as any).method || 'تحويل بنكي'}
                        </td>
                        <td className="py-2.5 px-3 text-stone-700 font-medium">
                          {h.by || 'المدير العام'}
                        </td>
                        <td className="py-2.5 px-3 text-stone-500">
                          {h.note || 'سداد معتمد ومقيد في الحسابات'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-stone-400">
                        لم تسجل أي سدادات سابقة لهذا الالتزام حتى الآن.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-stone-500">
                جميع السدادات مقيدة سحابياً ومتزامنة ومسجلة في تقارير النشاط.
              </span>
              <button
                onClick={() => setViewingHistoryItem(null)}
                className="py-2 px-5 rounded-xl text-xs font-bold text-[#075073] bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Petty Cash Modal */}
      {showAddPettyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-emerald-600 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">💵 تسجيل وتوثيق مصروف نثري / عهدة</h3>
                <p className="text-xs text-stone-500 mt-0.5">صرف عاجل، نثريات، طوارئ، أو مستلزمات سريعة</p>
              </div>
              <button
                onClick={() => setShowAddPettyModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePettyExpense} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">بيان المصروف *</label>
                <input
                  type="text"
                  required
                  value={pettyTitle}
                  onChange={(e) => setPettyTitle(e.target.value)}
                  placeholder="مثال: شراء مأكولات ضيافة اجتماع مجلس الإدارة / مشوار تاكسي عاجل"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">المبلغ (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={pettyAmount}
                    onChange={(e) => setPettyAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold text-emerald-700 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">التصنيف *</label>
                  <select
                    value={pettyCategory}
                    onChange={(e: any) => setPettyCategory(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="ضيافة_وطوارئ">ضيافة وطوارئ</option>
                    <option value="نقل_ومشاوير">نقل وانتقالات</option>
                    <option value="أدوات_ومستلزمات">أدوات ومستلزمات فورية</option>
                    <option value="شحن_وطرود">شحن ونقل طرود</option>
                    <option value="صيانة_عاجلة">صيانة عاجلة</option>
                    <option value="مكتبية_وطباعة">مكتبية وتصوير</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ الصرف *</label>
                  <input
                    type="date"
                    required
                    value={pettyDate}
                    onChange={(e) => setPettyDate(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">القائم بالصرف</label>
                  <input
                    type="text"
                    value={pettyPaidBy}
                    onChange={(e) => setPettyPaidBy(e.target.value)}
                    placeholder="اسم المسؤول"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الإدارة المستفيدة</label>
                  <select
                    value={pettyDepartment}
                    onChange={(e) => setPettyDepartment(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="الإدارة">الإدارة العامة</option>
                    <option value="البوفيه">البوفيه والضيافة</option>
                    <option value="النظافة">النظافة والخدمات</option>
                    <option value="المخازن">المخازن واللوجستيات</option>
                    <option value="الصيانة">الصيانة والدعم الفني</option>
                    <option value="المالية">الإدارة المالية</option>
                    <option value="المشتريات">المشتريات</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">طريقة الصرف</label>
                  <select
                    value={pettyMethod}
                    onChange={(e: any) => setPettyMethod(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="عهدة_نقدية">نقداً من العهدة (كاش)</option>
                    <option value="تحويل_فوري">إنستاباي / فودافون كاش</option>
                    <option value="دفع_إلكتروني">بطاقة بنكية / فيزا</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">رقم الإيصال / الفاتورة</label>
                  <input
                    type="text"
                    value={pettyReceiptNo}
                    onChange={(e) => setPettyReceiptNo(e.target.value)}
                    placeholder="PC-1024"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات إضافية</label>
                  <input
                    type="text"
                    value={pettyNotes}
                    onChange={(e) => setPettyNotes(e.target.value)}
                    placeholder="مرفق صورة الفاتورة / سبب الصرف"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddPettyModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md cursor-pointer"
                >
                  حفظ وتوثيق المصروف ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
