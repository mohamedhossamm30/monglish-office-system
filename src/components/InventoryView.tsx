import React, { useState, useMemo } from 'react';
import { CategoryKey, InventoryItem, PurchaseOrder, RoleKey, StockMove, AuthUser } from '../types';
import { CATEGORIES } from '../data/seedData';
import {
  normName,
  normArabic,
  isDuplicateItemName,
  isDuplicateItemCode,
  isDateInRange,
  today,
  uid,
  getNextItemCode,
  getNextDocumentSequence
} from '../utils/storage';
import { DocumentSequenceBadge } from './DocumentSequenceBadge';
import { DateFilterBar, DateFilterValue } from './DateFilterBar';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  FileText,
  Package,
  PackageCheck,
  Plus,
  Printer,
  Search,
  Trash2,
  Truck,
  Upload,
  X
} from 'lucide-react';
import { PrintVoucherData } from './PrintVoucherModal';

interface InventoryViewProps {
  items?: InventoryItem[];
  moves?: StockMove[];
  proc?: PurchaseOrder[];
  currentRole: RoleKey;
  authUser?: AuthUser | null;
  onSaveItems: (newItems: InventoryItem[]) => void;
  onSaveMoves: (newMoves: StockMove[], newItems?: InventoryItem[]) => void;
  onSaveProc?: (newProc: PurchaseOrder[]) => void;
  onExportCSV: (type: string) => void;
  onOpenExcelImport: (type: 'items' | 'lines' | 'proc') => void;
  onOpenNewReq?: (title: string, note?: string) => void;
  onPrintVoucher?: (data: PrintVoucherData) => void;
  showToast: (msg: string) => void;
}

const DEPARTMENTS_LIST = [
  { id: 'BUFF', name: 'قسم البوفيه والضيافة', icon: '☕' },
  { id: 'CLN', name: 'قسم النظافة والخدمات', icon: '🧴' },
  { id: 'MAINT', name: 'قسم الصيانة والتشغيل', icon: '🔧' },
  { id: 'RECEPT', name: 'الاستقبال وخدمة العملاء', icon: '📞' },
  { id: 'SALES', name: 'المبيعات والتسويق', icon: '📈' },
  { id: 'ADMIN', name: 'الشؤون الإدارية والأكاديمية', icon: '🎓' },
  { id: 'OTHER', name: 'إدارة أخرى (مخصصة)', icon: '🏢' }
];

export const InventoryView: React.FC<InventoryViewProps> = ({
  items = [],
  moves = [],
  proc = [],
  currentRole,
  authUser,
  onSaveItems,
  onSaveMoves,
  onSaveProc,
  onExportCSV,
  onOpenExcelImport,
  onOpenNewReq,
  onPrintVoucher,
  showToast
}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const safeMoves = Array.isArray(moves) ? moves : [];
  const safeProc = Array.isArray(proc) ? proc : [];
  const isMgr = currentRole === 'manager';
  const canWriteItems = isMgr || (authUser?.canWrite ? authUser.canWrite.includes('items') : currentRole === 'warehouse');
  const canWriteMoves = isMgr || (authUser?.canWrite ? (authUser.canWrite.includes('moves') || authUser.canWrite.includes('items')) : true) || (authUser?.canStockMove ?? true);

  // Sub-tabs: 'items' | 'receipts' | 'history'
  const [activeSubTab, setActiveSubTab] = useState<'items' | 'receipts' | 'history'>('items');

  // Search & Filter in Items Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('ALL');

  // Bulk Selection in Items Tab
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customSelectCount, setCustomSelectCount] = useState('');

  // Move Modal State
  const [moveItem, setMoveItem] = useState<InventoryItem | null>(null);
  const [moveType, setMoveType] = useState<'in' | 'out'>('out');
  const [moveQty, setMoveQty] = useState('');
  const [moveDept, setMoveDept] = useState<string>('BUFF');
  const [moveCustomDept, setMoveCustomDept] = useState('');
  const [movePerson, setMovePerson] = useState('');
  const [moveNote, setMoveNote] = useState('');

  // Add Item Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCat, setAddCat] = useState<CategoryKey>('OFF');
  const [addCode, setAddCode] = useState('');
  const [addUnit, setAddUnit] = useState('عدد');
  const [addBalance, setAddBalance] = useState('0');
  const [addMin, setAddMin] = useState('5');
  const [addCost, setAddCost] = useState('0');

  // Edit Item Modal State
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editBalance, setEditBalance] = useState('');
  const [editMin, setEditMin] = useState('');
  const [editCost, setEditCost] = useState('');

  // Low Stock Modal
  const [showLowModal, setShowLowModal] = useState(false);

  // Warehouse Receipt Modal (from Procurement)
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [receiptReceiver, setReceiptReceiver] = useState(isMgr ? 'المدير' : 'أمين المخزن');
  const [receiptNote, setReceiptNote] = useState('');
  const [receiptInvoiceNumber, setReceiptInvoiceNumber] = useState('');

  // History Tab Filters
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'in' | 'out'>('ALL');
  const [historyDeptFilter, setHistoryDeptFilter] = useState<string>('ALL');
  const [historySearch, setHistorySearch] = useState('');

  // Receipts Tab Filter
  const [receiptsStatusFilter, setReceiptsStatusFilter] = useState<'ALL' | 'pending' | 'completed'>('ALL');
  const [receiptsSearch, setReceiptsSearch] = useState<string>('');

  // Filtered items
  const filteredItems = useMemo(() => {
    return safeItems.filter((it) => {
      const matchCat = selectedCat === 'ALL' || it.cat === selectedCat;
      const matchQuery =
        !searchQuery ||
        it.name.includes(searchQuery) ||
        it.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [safeItems, selectedCat, searchQuery]);

  const isAllSelected = filteredItems.length > 0 && filteredItems.every((it) => selectedIds.includes(it.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((i) => i.id));
    }
  };

  const handleSelectCount = (count: number) => {
    const idsToSelect = filteredItems.slice(0, count).map((i) => i.id);
    setSelectedIds(idsToSelect);
    showToast(`تم تحديد أول ${idsToSelect.length} صنف`);
  };

  const handleApplyCustomSelect = () => {
    const n = parseInt(customSelectCount, 10);
    if (!n || n <= 0) {
      showToast('يرجى إدخال عدد صحيح أكبر من صفر');
      return;
    }
    handleSelectCount(n);
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`⚠️ تحذير: هل أنت متأكد من رغبتك في حذف ${selectedIds.length} صنف نهائياً من المخزن؟`)) return;

    const remaining = safeItems.filter((it) => !selectedIds.includes(it.id));
    onSaveItems(remaining);
    setSelectedIds([]);
    showToast(`تم حذف ${selectedIds.length} صنف بنجاح ✓`);
  };

  const lowItems = useMemo(() => safeItems.filter((i) => i.balance < i.min), [safeItems]);
  const outItems = useMemo(() => safeItems.filter((i) => i.balance <= 0), [safeItems]);
  const pendingReceiptsCount = useMemo(
    () => safeProc.filter((p) => p.status !== 'مكتمل' && p.status !== 'تم الاستلام' && p.status !== 'ملغي').length,
    [safeProc]
  );

  const getNextCode = (cat: CategoryKey) => {
    return getNextItemCode(cat, safeItems);
  };

  const handleOpenAdd = () => {
    setAddName('');
    setAddCat('OFF');
    setAddCode(getNextItemCode('OFF', safeItems));
    setAddUnit('عدد');
    setAddBalance('0');
    setAddMin('5');
    setAddCost('0');
    setShowAddModal(true);
  };

  const handleCatChange = (cat: CategoryKey) => {
    setAddCat(cat);
    setAddCode(getNextItemCode(cat, safeItems));
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addCode.trim()) {
      showToast('يرجى كتابة اسم الصنف والكود');
      return;
    }
    if (isDuplicateItemName(addName, safeItems)) {
      showToast(`⚠️ هذا الصنف [${addName.trim()}] موجود مسبقاً في المخازن لمنع التكرار`);
      return;
    }
    if (isDuplicateItemCode(addCode, safeItems)) {
      const nextSafe = getNextItemCode(addCat, safeItems);
      showToast(`⚠️ هذا الكود مستخدم بالفعل. الكود المقترح التالي: ${nextSafe}`);
      setAddCode(nextSafe);
      return;
    }

    const initialBal = parseFloat(addBalance) || 0;
    const newItem: InventoryItem = {
      id: uid(),
      code: addCode.trim(),
      name: addName.trim(),
      cat: addCat,
      unit: addUnit.trim() || 'عدد',
      balance: initialBal,
      min: parseFloat(addMin) || 5,
      cost: parseFloat(addCost) || 0,
      loc: 'مخزن رئيسي'
    };

    onSaveItems([newItem, ...safeItems]);
    if (initialBal > 0) {
      const openingMove: StockMove = {
        id: uid(),
        itemId: newItem.id,
        itemName: newItem.name,
        code: newItem.code,
        cat: newItem.cat,
        type: 'in',
        qty: initialBal,
        cost: +(initialBal * (newItem.cost || 0)).toFixed(2),
        person: 'رصيد افتتاحي',
        note: 'تسجيل رصيد افتتاحي عند إنشاء الصنف',
        date: today(),
        ts: Date.now(),
        by: isMgr ? 'المدير' : currentRole === 'warehouse' ? 'المخازن' : 'أمين المخزن',
        adjustment: true
      };
      onSaveMoves([openingMove, ...safeMoves]);
    }

    setShowAddModal(false);
    showToast('تمت إضافة الصنف بنجاح ✓');
  };

  const handleOpenEdit = (it: InventoryItem) => {
    setEditItem(it);
    setEditName(it.name);
    setEditBalance(String(it.balance));
    setEditMin(String(it.min));
    setEditCost(String(it.cost || 0));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;

    const targetBal = parseFloat(editBalance) || 0;
    const diff = +(targetBal - editItem.balance).toFixed(2);

    const updatedItems = safeItems.map((i) =>
      i.id === editItem.id
        ? {
            ...i,
            name: editName.trim() || i.name,
            min: parseFloat(editMin) || 5,
            cost: parseFloat(editCost) || 0
          }
        : i
    );

    onSaveItems(updatedItems);

    if (diff !== 0) {
      const adjMove: StockMove = {
        id: uid(),
        itemId: editItem.id,
        itemName: editName.trim() || editItem.name,
        code: editItem.code,
        cat: editItem.cat,
        type: diff > 0 ? 'in' : 'out',
        qty: Math.abs(diff),
        cost: 0,
        person: 'تسوية يدوية',
        note: `تعديل يدوي للرصيد من (${editItem.balance}) إلى (${targetBal})`,
        date: today(),
        ts: Date.now(),
        by: isMgr ? 'المدير' : currentRole === 'warehouse' ? 'المخازن' : 'أمين المخزن',
        adjustment: true
      };
      onSaveMoves([adjMove, ...safeMoves]);
    }

    setEditItem(null);
    showToast('تم تحديث بيانات الصنف بنجاح ✓');
  };

  const handleDeleteItem = (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الصنف نهائياً من المخزن؟')) return;
    onSaveItems(safeItems.filter((i) => i.id !== id));
    setEditItem(null);
    showToast('تم حذف الصنف ✓');
  };

  const handleOpenMove = (it: InventoryItem, type: 'in' | 'out') => {
    setMoveItem(it);
    setMoveType(type);
    setMoveQty('');
    setMoveDept('BUFF');
    setMoveCustomDept('');
    setMovePerson('');
    setMoveNote('');
  };

  const handleSaveMove = (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveItem) return;
    const q = parseFloat(moveQty);
    if (!q || q <= 0) {
      showToast('يرجى إدخال كمية صحيحة');
      return;
    }

    if (moveType === 'out' && q > (moveItem.balance || 0)) {
      showToast(`⚠️ الرصيد غير كافٍ للصرف. الرصيد المتاح حالياً: ${moveItem.balance || 0} ${moveItem.unit || 'وحدة'}`);
      return;
    }

    const currentItem = safeItems.find((i) => i.id === moveItem.id) || moveItem;
    const unitCost = Number(currentItem.cost !== undefined ? currentItem.cost : moveItem.cost || 0);
    const moveTotalCost = +(unitCost * q).toFixed(2);

    let resolvedDept = 'المخازن العامة';
    if (moveType === 'out') {
      if (moveDept === 'OTHER') {
        resolvedDept = moveCustomDept.trim() || 'إدارة أخرى';
      } else {
        const found = DEPARTMENTS_LIST.find((d) => d.id === moveDept);
        resolvedDept = found ? found.name : moveDept;
      }
    }

    const docType = moveType === 'out' ? 'ISU' : 'GRN';
    const seqVoucher = getNextDocumentSequence(docType);

    const newMove: StockMove = {
      id: seqVoucher,
      voucherNo: seqVoucher,
      docType,
      itemId: moveItem.id,
      itemName: moveItem.name,
      code: moveItem.code,
      cat: moveItem.cat,
      type: moveType,
      qty: q,
      cost: moveTotalCost,
      department: moveType === 'out' ? resolvedDept : undefined,
      person: movePerson.trim() || undefined,
      note: moveNote.trim() || undefined,
      date: today(),
      ts: Date.now(),
      by: isMgr ? 'المدير' : currentRole === 'warehouse' ? 'المخازن' : 'أمين المخزن'
    };

    onSaveMoves([newMove, ...safeMoves]);

    // Offer / open printable voucher
    if (onPrintVoucher) {
      onPrintVoucher({
        title: moveType === 'out' ? 'إذن صرف وتوجيه أصناف مخزنية' : 'إذن توريد واستلام مخزني',
        subtitle: moveType === 'out' ? `توجيه معتمد لقسم: ${resolvedDept}` : 'بضاعة واردة للمخازن المركزية',
        voucherNumber: seqVoucher,
        date: today(),
        department: resolvedDept,
        person: movePerson.trim() || (moveType === 'out' ? 'المستلم المسؤول' : 'المورد'),
        by: isMgr ? 'المدير' : 'أمين المخزن',
        notes: moveNote.trim() || undefined,
        totalCost: moveTotalCost,
        items: [
          {
            code: moveItem.code,
            name: moveItem.name,
            unit: moveItem.unit,
            qty: q,
            price: unitCost,
            total: moveTotalCost,
            notes: moveType === 'out' ? `موجه لقسم: ${resolvedDept}` : 'توريد مخزني'
          }
        ]
      });
    }

    setMoveItem(null);
    showToast(`تم تسجيل ${moveType === 'in' ? 'التوريد' : 'الصرف'} برقم تسلسلي [${seqVoucher}] وتجهيز إذن الصرف الرسمي ✓`);
  };

  // Warehouse Receipt Modal Workflow for Purchase Orders
  const handleOpenReceiveOrder = (order: PurchaseOrder) => {
    setReceivingOrder(order);
    setReceiptReceiver(isMgr ? 'المدير' : 'أمين المخزن');
    setReceiptNote(order.note || '');
    setReceiptInvoiceNumber(order.invoiceNumber || '');
  };

  const handleConfirmReceiveOrder = () => {
    if (!receivingOrder) return;

    if (receivingOrder.status === 'مكتمل' || receivingOrder.status === 'تم الاستلام') {
      showToast('⚠️ أمر الشراء مستلم ومورد للمخزن مسبقاً بالفعل لمنع التكرار');
      setReceivingOrder(null);
      return;
    }

    const receiverName = receiptReceiver.trim() || (isMgr ? 'المدير' : 'أمين المخزن');
    const grnSeq = getNextDocumentSequence('GRN');
    const orderCostTotal = (receivingOrder.lines || []).reduce(
      (sum, l) => sum + Number(l.qty || 0) * Number(l.price || 0),
      0
    );

    if (onSaveProc) {
      const updatedOrders = safeProc.map((o) =>
        o.id === receivingOrder.id
          ? {
              ...o,
              status: 'مكتمل' as const,
              receivedDate: today(),
              receivedBy: receiverName,
              receiptNote: receiptNote.trim() || undefined,
              invoiceNumber: receiptInvoiceNumber.trim() || o.invoiceNumber
            }
          : o
      );
      onSaveProc(updatedOrders);
    }

    // Launch official Goods Receipt Voucher
    if (onPrintVoucher) {
      onPrintVoucher({
        title: 'إذن استلام وتوريد مخزني (بضاعة واردة من المشتريات)',
        subtitle: `أمر شراء [${receivingOrder.orderNumber || receivingOrder.id}]${receiptInvoiceNumber ? ` | فاتورة مورد رقم: ${receiptInvoiceNumber}` : ''}`,
        voucherNumber: grnSeq,
        date: today(),
        department: 'المخازن المركزية',
        person: receivingOrder.supplier || 'المورد',
        by: receiverName,
        notes: receiptNote.trim() || undefined,
        totalCost: orderCostTotal,
        items: (receivingOrder.lines || []).map((l) => ({
          name: l.itemName,
          unit: l.unit,
          qty: l.qty,
          price: l.price,
          total: (Number(l.qty) || 0) * (Number(l.price) || 0)
        }))
      });
    }

    setReceivingOrder(null);
  };

  // Quick Print of an existing StockMove
  const handlePrintPastMove = (move: StockMove) => {
    if (!onPrintVoucher) return;
    const isOut = move.type === 'out';
    const resolvedVoucher = move.voucherNo || move.id;
    onPrintVoucher({
      title: isOut ? 'إذن صرف وتوجيه أصناف مخزنية' : 'إذن استلام وتوريد مخزني',
      subtitle: isOut ? `موجه إلى: ${move.department || 'القسم المعني'}` : 'توريد وارد للمخزن',
      voucherNumber: resolvedVoucher,
      date: move.date || today(),
      department: move.department || (isOut ? 'الأقسام التشغيلية' : 'المخازن العامة'),
      person: move.person || (isOut ? 'المستلم' : 'المورد'),
      by: move.by || 'أمين المخزن',
      notes: move.note || undefined,
      totalCost: move.cost || 0,
      items: [
        {
          code: move.code,
          name: move.itemName,
          unit: 'عدد',
          qty: move.qty,
          price: move.cost && move.qty ? +(move.cost / move.qty).toFixed(2) : undefined,
          total: move.cost || undefined,
          notes: move.note || (isOut ? `صرف إلى: ${move.department || 'القسم'}` : 'توريد')
        }
      ]
    });
  };

  // Filtered History
  const [movesDateFilter, setMovesDateFilter] = useState<DateFilterValue>({
    preset: 'all',
    startDate: '',
    endDate: ''
  });

  const filteredMoves = useMemo(() => {
    return safeMoves.filter((m) => {
      if (movesDateFilter.preset !== 'all' || movesDateFilter.startDate || movesDateFilter.endDate) {
        if (!isDateInRange(m.date, movesDateFilter.startDate, movesDateFilter.endDate)) {
          return false;
        }
      }
      const matchType = historyTypeFilter === 'ALL' || m.type === historyTypeFilter;
      const matchDept =
        historyDeptFilter === 'ALL' ||
        (m.department && m.department.includes(historyDeptFilter));
      const matchSearch =
        !historySearch ||
        m.itemName.toLowerCase().includes(historySearch.toLowerCase()) ||
        (m.person && m.person.toLowerCase().includes(historySearch.toLowerCase())) ||
        (m.note && m.note.toLowerCase().includes(historySearch.toLowerCase()));
      return matchType && matchDept && matchSearch;
    });
  }, [safeMoves, movesDateFilter, historyTypeFilter, historyDeptFilter, historySearch]);

  // Filtered Procurement in Receipts Tab
  const filteredReceiptOrders = useMemo(() => {
    return safeProc.filter((p) => {
      const isDone = p.status === 'مكتمل' || p.status === 'تم الاستلام';
      const isCancelled = p.status === 'ملغي';
      if (receiptsStatusFilter === 'pending') {
        if (isDone || isCancelled) return false;
      } else if (receiptsStatusFilter === 'completed') {
        if (!isDone) return false;
      }

      if (receiptsSearch) {
        const q = receiptsSearch.toLowerCase();
        const matchId = (p.id || '').toLowerCase().includes(q) || (p.orderNumber || '').toLowerCase().includes(q);
        const matchSup = (p.supplier || '').toLowerCase().includes(q);
        const matchInv = (p.invoiceNumber || '').toLowerCase().includes(q);
        const matchLines = (p.lines || []).some((l) => l.itemName.toLowerCase().includes(q) || (l.code || '').toLowerCase().includes(q));
        if (!matchId && !matchSup && !matchInv && !matchLines) {
          return false;
        }
      }

      return true;
    });
  }, [safeProc, receiptsStatusFilter, receiptsSearch]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">📦 إدارة المخازن والتوجيه</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            إدارة أرصدة الأصناف، استلام توريدات المشتريات، وتوجيه الصرف للأقسام مع أذون رسمية
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMgr && (
            <>
              <button
                onClick={() => onExportCSV('inv')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير Excel</span>
              </button>
              <button
                onClick={() => setShowLowModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-xs transition-all cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>تقرير النقص ({lowItems.length})</span>
              </button>
              <button
                onClick={() => onOpenExcelImport('items')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-xs transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>استيراد Excel</span>
              </button>
              <button
                onClick={handleOpenAdd}
                disabled={!canWriteItems}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-all ${
                  canWriteItems
                    ? 'bg-[#075073] hover:bg-[#03151F] text-white cursor-pointer'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }`}
                title={canWriteItems ? 'إضافة صنف جديد' : 'ليس لديك صلاحية إضافة الأصناف'}
              >
                <Plus className="w-4 h-4" />
                <span>صنف جديد</span>
              </button>
            </>
          )}
          {onOpenNewReq && (
            <button
              onClick={() => onOpenNewReq('طلب شراء مستلزمات مخازن')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-[#075073] border border-stone-300 shadow-xs transition-all cursor-pointer"
            >
              <span>📋 طلب شراء</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Sub-tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveSubTab('items')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'items'
              ? 'bg-[#075073] text-white shadow-sm'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>أرصدة الأصناف بالمخزن</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${activeSubTab === 'items' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'}`}>
            {safeItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('receipts')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'receipts'
              ? 'bg-[#075073] text-white shadow-sm'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <Truck className="w-4 h-4 text-emerald-600" />
          <span>استلام من المشتريات والتوريد</span>
          {pendingReceiptsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-[#03151F] animate-pulse">
              {pendingReceiptsCount} بانتظار الاستلام
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'history'
              ? 'bg-[#075073] text-white shadow-sm'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <ClipboardList className="w-4 h-4 text-indigo-600" />
          <span>سجل الاستلام والصرف والتوجيه</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${activeSubTab === 'history' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'}`}>
            {safeMoves.length}
          </span>
        </button>
      </div>

      {/* SUBTAB 1: ITEMS INVENTORY */}
      {activeSubTab === 'items' && (
        <div className="space-y-4">
          {/* Prominent Intake Alert for Pending Purchase Orders */}
          {pendingReceiptsCount > 0 && (
            <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-[#E68131] text-white p-3.5 sm:p-4 rounded-2xl shadow-sm flex items-center justify-between flex-wrap gap-3 border border-amber-400">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-white shrink-0">
                  <Truck className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h4 className="font-black text-sm">
                    📦 يوجد ({pendingReceiptsCount}) أمر شراء جديد بانتظار استلام وتوريد المخزن
                  </h4>
                  <p className="text-xs text-white/90 mt-0.5">
                    بمجرد استلام أمين المخزن للأمر، ستضاف الأصناف والكميات فوراً لرصيد المخزن ويصدر إذن توريد رسمي دون أي تكرار.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab('receipts');
                  setReceiptsStatusFilter('pending');
                }}
                className="px-4 py-2 rounded-xl bg-white text-stone-900 hover:bg-stone-100 font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <span>عرض واستلام التوريدات الآن ({pendingReceiptsCount})</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ابحث بالاسم أو الكود (مثال: شاي، ورق، كود)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-3 pr-9 py-2.5 bg-white rounded-xl border border-stone-200 text-xs font-medium focus:border-[#075073] focus:outline-none transition-colors shadow-xs"
              />
            </div>
            <select
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
              className="py-2.5 px-3 bg-white rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:border-[#075073] focus:outline-none transition-colors shadow-xs cursor-pointer"
            >
              <option value="ALL">كل الفئات ({safeItems.length})</option>
              {(Object.entries(CATEGORIES) as [CategoryKey, typeof CATEGORIES[CategoryKey]][]).map(([k, c]) => (
                <option key={k} value={k}>
                  {c.icon} {c.n} ({safeItems.filter((it) => it.cat === k).length})
                </option>
              ))}
            </select>
          </div>

          {/* Department/Category Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCat('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedCat === 'ALL'
                  ? 'bg-[#075073] text-white shadow-xs'
                  : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <span>📦</span>
              <span>كل الأصناف</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${selectedCat === 'ALL' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500'}`}>
                {safeItems.length}
              </span>
            </button>

            {(Object.entries(CATEGORIES) as [CategoryKey, typeof CATEGORIES[CategoryKey]][]).map(([k, c]) => {
              const count = safeItems.filter((it) => it.cat === k).length;
              const isSelected = selectedCat === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelectedCat(k)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#075073] text-white shadow-xs'
                      : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                  }`}
                >
                  <span>{c.icon}</span>
                  <span>{c.n}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${isSelected ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Count Selection Bar */}
          <div className="bg-[#fcfaf5] p-3 rounded-xl border border-stone-200 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-stone-700">تحديد سريع للأصناف:</span>
              <button
                type="button"
                onClick={() => handleSelectCount(5)}
                className="px-2.5 py-1 rounded-lg bg-white border border-stone-300 font-bold hover:bg-stone-100 text-stone-800 cursor-pointer"
              >
                5 أصناف
              </button>
              <button
                type="button"
                onClick={() => handleSelectCount(10)}
                className="px-2.5 py-1 rounded-lg bg-white border border-stone-300 font-bold hover:bg-stone-100 text-stone-800 cursor-pointer"
              >
                10 أصناف
              </button>
              <button
                type="button"
                onClick={() => handleSelectCount(25)}
                className="px-2.5 py-1 rounded-lg bg-white border border-stone-300 font-bold hover:bg-stone-100 text-stone-800 cursor-pointer"
              >
                25 صنفاً
              </button>
              <button
                type="button"
                onClick={() => handleSelectCount(50)}
                className="px-2.5 py-1 rounded-lg bg-white border border-stone-300 font-bold hover:bg-stone-100 text-stone-800 cursor-pointer"
              >
                50 صنفاً
              </button>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max={filteredItems.length}
                  placeholder="عدد..."
                  value={customSelectCount}
                  onChange={(e) => setCustomSelectCount(e.target.value)}
                  className="w-16 px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomSelect}
                  className="px-2.5 py-1 rounded-lg bg-[#075073] text-white font-bold hover:bg-[#03151F] cursor-pointer"
                >
                  تحديد
                </button>
              </div>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="px-2.5 py-1 rounded-lg bg-stone-200 hover:bg-stone-300 font-bold text-stone-800 cursor-pointer"
              >
                {isAllSelected ? 'إلغاء الكل' : 'تحديد الكل'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 font-bold text-stone-800 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-stone-600" />
                <span>طباعة كشف الجرد</span>
              </button>
            </div>
          </div>

          {/* Bulk Action Toolbar */}
          {selectedIds.length > 0 && (
            <div className="bg-[#075073] text-white px-4 py-3 rounded-xl shadow-lg border border-white/10 flex items-center justify-between flex-wrap gap-3 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs font-black">
                  تم تحديد <span className="font-mono text-amber-300 font-black text-sm">{selectedIds.length}</span> صنف
                  من أصل {filteredItems.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isMgr && (
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف الأصناف المحددة بالجملة ({selectedIds.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
                >
                  إلغاء التحديد
                </button>
              </div>
            </div>
          )}

          {/* Items Table Card */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#f4efe2] text-[#075073] border-b border-stone-200 font-bold">
                  <tr>
                    <th className="py-3 px-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        title="تحديد كل الأصناف المعروضة"
                        className="w-4 h-4 rounded text-[#075073] border-stone-300 focus:ring-[#075073] cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3.5">الصنف</th>
                    <th className="py-3 px-3.5">الكود</th>
                    <th className="py-3 px-3.5">الفئة</th>
                    <th className="py-3 px-3.5">الرصيد الفعلي</th>
                    <th className="py-3 px-3.5">الحد الأدنى</th>
                    <th className="py-3 px-3.5">التكلفة (ج.م)</th>
                    <th className="py-3 px-3.5">الحالة</th>
                    <th className="py-3 px-3.5 text-center">إجراءات سريعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredItems.length > 0 ? (
                    filteredItems.map((it) => {
                      const isZero = it.balance <= 0;
                      const isLow = it.balance > 0 && it.balance <= it.min;
                      const isChecked = selectedIds.includes(it.id);

                      return (
                        <tr
                          key={it.id}
                          className={`transition-colors ${
                            isChecked
                              ? 'bg-amber-50/70'
                              : isZero
                              ? 'bg-rose-50/40 hover:bg-rose-50/70'
                              : isLow
                              ? 'bg-amber-50/30 hover:bg-amber-50/60'
                              : 'hover:bg-stone-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectOne(it.id)}
                              className="w-4 h-4 rounded text-[#075073] border-stone-300 focus:ring-[#075073] cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-3.5 font-bold text-stone-900">{it.name}</td>
                          <td className="py-3 px-3.5 font-mono text-stone-500">{it.code}</td>
                          <td className="py-3 px-3.5 text-stone-600">
                            {CATEGORIES[it.cat]?.icon} {CATEGORIES[it.cat]?.n || it.cat}
                          </td>
                          <td className="py-3 px-3.5 font-mono font-bold text-stone-900">
                            <span className={isZero ? 'text-rose-600 font-black' : isLow ? 'text-amber-600 font-black' : 'text-[#075073]'}>
                              {it.balance}
                            </span>{' '}
                            <span className="text-[11px] font-normal text-stone-500">{it.unit}</span>
                          </td>
                          <td className="py-3 px-3.5 font-mono text-stone-500">
                            {it.min} {it.unit}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-stone-700">
                            {(it.cost || 0).toLocaleString('ar-EG')}
                          </td>
                          <td className="py-3 px-3.5">
                            {isZero ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                نفد ❌
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                منخفض ⚠️
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                متوفر ✓
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {canWriteMoves ? (
                                <>
                                  <button
                                    onClick={() => handleOpenMove(it, 'in')}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-all cursor-pointer flex items-center gap-1"
                                  >
                                    <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                                    <span>وارد +</span>
                                  </button>
                                  <button
                                    onClick={() => handleOpenMove(it, 'out')}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-all cursor-pointer flex items-center gap-1"
                                  >
                                    <ArrowUpRight className="w-3 h-3 text-amber-600" />
                                    <span>صرف وتوجيه −</span>
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] text-stone-400 font-semibold px-2 py-0.5 rounded bg-stone-100">
                                  عرض فقط
                                </span>
                              )}
                              {canWriteItems && (
                                <button
                                  onClick={() => handleOpenEdit(it)}
                                  className="px-2 py-1 rounded-lg text-[11px] font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>تعديل</span>
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
                        لا توجد أصناف مطابقة للبحث أو الفئة المحددة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: WAREHOUSE GOODS RECEIPTS FROM PROCUREMENT */}
      {activeSubTab === 'receipts' && (
        <div className="space-y-4">
          <div className="bg-emerald-50/70 border border-emerald-300 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-emerald-950">
                  دورة استلام توريدات المشتريات بالمخزن
                </h3>
                <p className="text-xs text-emerald-800 mt-0.5">
                  أمين المخزن يستلم الأوامر الموردة، يراجع الأصناف والكميات، ويقوم بإصدار إذن استلام رسمي مع إضافة الرصيد للمخزن
                </p>
              </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-emerald-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setReceiptsStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  receiptsStatusFilter === 'ALL' ? 'bg-[#075073] text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                كل الأوامر ({safeProc.length})
              </button>
              <button
                type="button"
                onClick={() => setReceiptsStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  receiptsStatusFilter === 'pending' ? 'bg-amber-500 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                بانتظار الاستلام ({pendingReceiptsCount})
              </button>
              <button
                type="button"
                onClick={() => setReceiptsStatusFilter('completed')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  receiptsStatusFilter === 'completed' ? 'bg-emerald-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                مكتملة ومستلمة ({safeProc.filter((p) => p.status === 'مكتمل' || p.status === 'تم الاستلام').length})
              </button>
            </div>
          </div>

          {/* Receipts Search Bar */}
          <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ابحث برقم أمر الشراء، المورد، الفاتورة، أو اسم الصنف..."
                value={receiptsSearch}
                onChange={(e) => setReceiptsSearch(e.target.value)}
                className="w-full pl-3 pr-9 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-medium focus:bg-white focus:border-[#075073] focus:outline-none"
              />
              {receiptsSearch && (
                <button
                  type="button"
                  onClick={() => setReceiptsSearch('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="text-xs text-stone-500 flex items-center gap-2">
              <span>الأوامر المعروضة: <strong className="text-[#075073] font-mono font-bold">{filteredReceiptOrders.length}</strong> أمر</span>
            </div>
          </div>

          {/* Orders Awaiting Intake */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredReceiptOrders.map((order) => {
              const isReceived = order.status === 'مكتمل' || order.status === 'تم الاستلام';
              const isCancelled = order.status === 'ملغي';
              const orderTotalCost = (order.lines || []).reduce((sum, l) => sum + (l.qty || 0) * (l.price || 0), 0);

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border p-5 shadow-xs transition-all space-y-4 ${
                    isReceived
                      ? 'border-emerald-200'
                      : isCancelled
                      ? 'border-rose-200 opacity-60'
                      : 'border-amber-300 ring-2 ring-amber-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono bg-stone-100 text-[#075073] font-black px-2 py-0.5 rounded text-xs">
                          {order.orderNumber || order.id}
                        </span>
                        <h4 className="text-sm font-black text-[#075073]">{order.supplier}</h4>
                      </div>
                      <p className="text-[11px] text-stone-500 mt-1">
                        تاريخ الطلب: {order.date} · المنشئ: {order.by || 'المشتريات'}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isReceived
                          ? 'bg-emerald-100 text-emerald-800'
                          : isCancelled
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>

                  {/* Order Items List */}
                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-xs space-y-1.5">
                    <div className="font-bold text-stone-600 text-[11px] mb-1">الأصناف المطلوب توريدها:</div>
                    {(order.lines || []).map((l, idx) => (
                      <div key={idx} className="flex justify-between items-center text-stone-800">
                        <span>
                          • {l.itemName} <span className="font-mono text-stone-500">({l.qty} {l.unit})</span>
                        </span>
                        <span className="font-mono font-bold text-stone-700">
                          {((l.qty || 0) * (l.price || 0)).toLocaleString('ar-EG')} ج.م
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-stone-200 flex justify-between font-black text-[#075073]">
                      <span>إجمالي التكلفة:</span>
                      <span className="font-mono text-sm">{orderTotalCost.toLocaleString('ar-EG')} ج.م</span>
                    </div>
                  </div>

                  {/* Receipt Metadata if already received */}
                  {isReceived && (
                    <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 text-[11px] text-emerald-900 space-y-0.5">
                      <div>
                        ✓ <strong>تم الاستلام بواسطة:</strong> {order.receivedBy || 'أمين المخزن'} بتاريخ {order.receivedDate || order.date}
                      </div>
                      {order.invoiceNumber && (
                        <div>
                          📄 <strong>رقم الفاتورة:</strong> {order.invoiceNumber}
                        </div>
                      )}
                      {order.receiptNote && (
                        <div>
                          📝 <strong>ملاحظات الاستلام:</strong> {order.receiptNote}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {!isReceived && !isCancelled && (
                      <button
                        type="button"
                        onClick={() => handleOpenReceiveOrder(order)}
                        className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>استلام بالمخزن وتوريد الأصناف</span>
                      </button>
                    )}
                    {onPrintVoucher && (
                      <button
                        type="button"
                        onClick={() => {
                          onPrintVoucher({
                            title: isReceived ? 'إذن استلام وتوريد مخزني (معتمد)' : 'أمر شراء وبضاعة قيد التوريد',
                            subtitle: `أمر شراء #${order.orderNumber || order.id}${order.invoiceNumber ? ` | فاتورة #${order.invoiceNumber}` : ''}`,
                            voucherNumber: order.orderNumber || order.id,
                            date: order.receivedDate || order.date,
                            department: 'المخازن العامة',
                            person: order.supplier || 'المورد',
                            by: order.receivedBy || order.by || 'أمين المخزن',
                            notes: order.receiptNote || order.note,
                            totalCost: orderTotalCost,
                            items: (order.lines || []).map((l) => ({
                              name: l.itemName,
                              unit: l.unit,
                              qty: l.qty,
                              price: l.price,
                              total: l.qty * l.price
                            }))
                          });
                        }}
                        className="py-2 px-3 rounded-xl text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-stone-600" />
                        <span>طباعة الإذن</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredReceiptOrders.length === 0 && (
              <div className="col-span-2 py-12 text-center text-stone-400 bg-white rounded-2xl border border-stone-200">
                لا توجد أوامر شراء مطابقة للتصفية الحالية
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: FULL MOVEMENTS AND DISPATCH LOG */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* Date Filter Bar */}
          <DateFilterBar
            value={movesDateFilter}
            onChange={setMovesDateFilter}
            label="فلترة تاريخ حركات المخزن والتوجيه"
          />

          {/* History Search & Filters */}
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ابحث في السجل بالصنف، المستلم، المورد، أو الملاحظات..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-medium focus:bg-white focus:border-[#075073] focus:outline-none"
                />
              </div>

              {/* Type Filter */}
              <select
                value={historyTypeFilter}
                onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
                className="py-2 px-3 bg-stone-50 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:bg-white cursor-pointer"
              >
                <option value="ALL">كل أنواع الحركات ({safeMoves.length})</option>
                <option value="in">وارد فقط (توريدات واستلامات)</option>
                <option value="out">منصرف فقط (توجيه للأقسام)</option>
              </select>

              {/* Department Filter */}
              <select
                value={historyDeptFilter}
                onChange={(e) => setHistoryDeptFilter(e.target.value)}
                className="py-2 px-3 bg-stone-50 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:bg-white cursor-pointer"
              >
                <option value="ALL">كل الأقسام والإدارات</option>
                {DEPARTMENTS_LIST.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.icon} {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {isMgr && (
                <button
                  onClick={() => onExportCSV('moves')}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-[#075073] text-white hover:bg-[#03151F] flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير سجل الحركات</span>
                </button>
              )}
            </div>
          </div>

          {/* Full Movements Table */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#f4efe2] text-[#075073] border-b border-stone-200 font-bold">
                  <tr>
                    <th className="py-3 px-3.5">رقم الإذن / السكونس</th>
                    <th className="py-3 px-3.5">الصنف</th>
                    <th className="py-3 px-3.5">نوع الحركة</th>
                    <th className="py-3 px-3.5">الكمية</th>
                    <th className="py-3 px-3.5">القسم / الوجهة</th>
                    <th className="py-3 px-3.5">المستلم / المورد</th>
                    <th className="py-3 px-3.5">التكلفة الإجمالية</th>
                    <th className="py-3 px-3.5">التاريخ</th>
                    <th className="py-3 px-3.5">المسؤول</th>
                    <th className="py-3 px-3.5 text-center">الإذن الرسمي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredMoves.map((m) => (
                    <tr key={m.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-3.5">
                        <DocumentSequenceBadge
                          code={m.voucherNo || m.id}
                          type={m.type === 'in' ? 'GRN' : 'ISU'}
                          size="sm"
                          onPrint={() => handlePrintPastMove(m)}
                        />
                      </td>
                      <td className="py-3 px-3.5 font-bold text-stone-900">{m.itemName}</td>
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            m.type === 'in' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {m.type === 'in' ? 'توريد وارد ↓' : 'صرف وتوجيه ↑'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 font-mono font-bold text-stone-900">{m.qty}</td>
                      <td className="py-3 px-3.5 font-semibold text-stone-700">
                        {m.department || (m.type === 'out' ? 'قسم غير محدد' : 'المخازن العامة')}
                      </td>
                      <td className="py-3 px-3.5 text-stone-600">{m.person || '—'}</td>
                      <td className="py-3 px-3.5 font-mono font-bold text-[#075073]">
                        {(m.cost || 0).toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="py-3 px-3.5 text-stone-500 font-mono text-[11px]">{m.date}</td>
                      <td className="py-3 px-3.5 text-stone-400 text-[11px]">{m.by || 'أمين المخزن'}</td>
                      <td className="py-3 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handlePrintPastMove(m)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#075073] bg-stone-100 hover:bg-[#075073] hover:text-white transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          <span>طباعة</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredMoves.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-stone-400">
                        لا توجد حركات مسجلة مطابقة للبحث أو التصفية
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MOVE MODAL (INWARD / OUTWARD DISPATCH TO DEPARTMENTS) */}
      {moveItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#c9920a] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">{moveItem.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  الرصيد بالمخزن: <span className="font-mono font-bold text-stone-800">{moveItem.balance} {moveItem.unit}</span> · تكلفة الوحدة: <span className="font-mono text-stone-800 font-bold">{moveItem.cost || 0} ج.م</span>
                </p>
              </div>
              <button
                onClick={() => setMoveItem(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Type Selector Tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMoveType('out')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  moveType === 'out'
                    ? 'bg-amber-50 text-amber-800 border-amber-400 shadow-xs'
                    : 'bg-stone-50 text-stone-600 border-stone-200'
                }`}
              >
                صرف وتوجيه للأقسام (منصرف −)
              </button>
              <button
                type="button"
                onClick={() => setMoveType('in')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  moveType === 'in'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-400 shadow-xs'
                    : 'bg-stone-50 text-stone-600 border-stone-200'
                }`}
              >
                توريد مباشر للمخزن (وارد +)
              </button>
            </div>

            <form onSubmit={handleSaveMove} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  الكمية المطلوبة ({moveItem.unit})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={moveQty}
                  onChange={(e) => setMoveQty(e.target.value)}
                  placeholder="0"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Department selection when dispatching */}
              {moveType === 'out' ? (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    توجيه الصرف إلى القسم / الإدارة
                  </label>
                  <select
                    value={moveDept}
                    onChange={(e) => setMoveDept(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-800 focus:border-[#075073] focus:outline-none cursor-pointer"
                  >
                    {DEPARTMENTS_LIST.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.icon} {dept.name}
                      </option>
                    ))}
                  </select>

                  {moveDept === 'OTHER' && (
                    <input
                      type="text"
                      required
                      placeholder="اكتب اسم الإدارة أو القسم المستلم..."
                      value={moveCustomDept}
                      onChange={(e) => setMoveCustomDept(e.target.value)}
                      className="mt-2 w-full py-2 px-3 rounded-xl border border-amber-300 text-xs font-medium focus:border-[#075073] focus:outline-none"
                    />
                  )}
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  {moveType === 'out' ? 'اسم المستلم المسؤول' : 'اسم المورد أو جهة التوريد'}
                </label>
                <input
                  type="text"
                  value={movePerson}
                  onChange={(e) => setMovePerson(e.target.value)}
                  placeholder={moveType === 'out' ? 'مثال: أ/ أحمد محمد (رئيس القسم)' : 'مثال: شركة التوريدات الحديثة'}
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات الصرف والتوجيه</label>
                <textarea
                  rows={2}
                  value={moveNote}
                  onChange={(e) => setMoveNote(e.target.value)}
                  placeholder="أي تفاصيل أو ملاحظات خاصة بالاستخدام..."
                  className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              {/* Real-time Cost Preview */}
              {moveItem.cost && parseFloat(moveQty) > 0 && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex justify-between items-center">
                  <span className="font-bold text-stone-600">إجمالي التكلفة المقدرة:</span>
                  <span className="font-mono font-black text-sm text-[#075073]">
                    {(parseFloat(moveQty) * (moveItem.cost || 0)).toLocaleString('ar-EG')} ج.م
                  </span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMoveItem(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white transition-all shadow-md cursor-pointer ${
                    moveType === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  تأكيد وحفظ الإذن {moveType === 'in' ? 'الوارد +' : 'المنصرف −'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM WAREHOUSE RECEIPT MODAL (FROM PROCUREMENT) */}
      {receivingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-emerald-600 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">
                  📥 استلام توريد أمر الشراء #{receivingOrder.id.slice(-5)}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  المورد: <span className="font-bold text-stone-800">{receivingOrder.supplier}</span>
                </p>
              </div>
              <button
                onClick={() => setReceivingOrder(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              {/* Order Items Review */}
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#faf7f0] text-[#075073] font-bold">
                    <tr>
                      <th className="p-2.5">الصنف</th>
                      <th className="p-2.5">الكمية</th>
                      <th className="p-2.5">السعر</th>
                      <th className="p-2.5">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {(receivingOrder.lines || []).map((l, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-bold">{l.itemName}</td>
                        <td className="p-2.5 font-mono">{l.qty} {l.unit}</td>
                        <td className="p-2.5 font-mono">{l.price.toLocaleString('ar-EG')} ج.م</td>
                        <td className="p-2.5 font-mono font-bold text-emerald-800">
                          {(l.qty * l.price).toLocaleString('ar-EG')} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    اسم أمين المخزن / المستلم الفعلي
                  </label>
                  <input
                    type="text"
                    required
                    value={receiptReceiver}
                    onChange={(e) => setReceiptReceiver(e.target.value)}
                    placeholder="أمين المخزن..."
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    رقم فاتورة المورد (اختياري)
                  </label>
                  <input
                    type="text"
                    value={receiptInvoiceNumber}
                    onChange={(e) => setReceiptInvoiceNumber(e.target.value)}
                    placeholder="مثال: INV-9842"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-[#075073] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    ملاحظات الفحص والاستلام بالمخزن
                  </label>
                  <textarea
                    rows={2}
                    value={receiptNote}
                    onChange={(e) => setReceiptNote(e.target.value)}
                    placeholder="تمت مطابقة المواصفات والعدد سليم بدون تلفيات..."
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 shrink-0 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setReceivingOrder(null)}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmReceiveOrder}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>تأكيد الاستلام وإصدار الإذن</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD ITEM MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#075073]">+ إضافة صنف جديد للمخازن</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم الصنف</label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="مثال: دباسة ورق مكتبية"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الفئة</label>
                  <select
                    value={addCat}
                    onChange={(e) => handleCatChange(e.target.value as CategoryKey)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  >
                    {(Object.entries(CATEGORIES) as [CategoryKey, typeof CATEGORIES[CategoryKey]][])
                      .filter(([k]) => k !== 'STAT')
                      .map(([k, c]) => (
                        <option key={k} value={k}>
                          {c.icon} {c.n}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الكود (تلقائي)</label>
                  <input
                    type="text"
                    value={addCode}
                    onChange={(e) => setAddCode(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الوحدة</label>
                  <input
                    type="text"
                    value={addUnit}
                    onChange={(e) => setAddUnit(e.target.value)}
                    placeholder="عدد، رزمة، علبة..."
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الحد الأدنى للإنذار</label>
                  <input
                    type="number"
                    value={addMin}
                    onChange={(e) => setAddMin(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    value={addBalance}
                    onChange={(e) => setAddBalance(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-[#075073] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تكلفة الوحدة (ج.م)</label>
                  <input
                    type="number"
                    value={addCost}
                    onChange={(e) => setAddCost(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-[#075073] focus:outline-none"
                  />
                </div>
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
                  حفظ الصنف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ITEM MODAL */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-amber-600 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#075073]">✏️ تعديل صنف: {editItem.name}</h3>
              <button
                onClick={() => setEditItem(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم الصنف</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الرصيد الفعلي</label>
                  <input
                    type="number"
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الحد الأدنى</label>
                  <input
                    type="number"
                    value={editMin}
                    onChange={(e) => setEditMin(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">تكلفة الوحدة التقديرية (ج.م)</label>
                <input
                  type="number"
                  value={editCost}
                  onChange={(e) => setEditCost(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => handleDeleteItem(editItem.id)}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer"
                >
                  حفظ التعديل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOW STOCK REPORT MODAL */}
      {showLowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-amber-500 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">⚠️ تقرير الأصناف المنخفضة</h3>
                <p className="text-xs text-stone-500 mt-0.5">{lowItems.length} صنف يحتاج للتدخل والشراء</p>
              </div>
              <button
                onClick={() => setShowLowModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-stone-100 border border-stone-200 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#faf7f0] text-[#075073] font-bold sticky top-0">
                  <tr>
                    <th className="p-2.5">الصنف</th>
                    <th className="p-2.5">الرصيد</th>
                    <th className="p-2.5">الحد الأدنى</th>
                    <th className="p-2.5">الناقص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {lowItems.map((it) => (
                    <tr key={it.id}>
                      <td className="p-2.5 font-bold">{it.name}</td>
                      <td className="p-2.5 font-mono font-bold text-amber-700">
                        {it.balance} {it.unit}
                      </td>
                      <td className="p-2.5 font-mono text-stone-600">{it.min}</td>
                      <td className="p-2.5 font-mono font-black text-rose-600">{Math.max(0, it.min - it.balance)}</td>
                    </tr>
                  ))}
                  {lowItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-emerald-700 font-bold">
                        جميع الأصناف أعلى من الحد الأدنى 🎉
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowLowModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportCSV('low');
                  setShowLowModal(false);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
