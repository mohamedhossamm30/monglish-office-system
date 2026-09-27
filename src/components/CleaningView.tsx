import React, { useState, useMemo } from 'react';
import {
  CleaningHistory,
  CleaningTask,
  InventoryItem,
  PhysicalStocktake,
  PurchaseOrder,
  RoleKey,
  StockMove
} from '../types';
import { isoToday, today, uid, getNextDocumentSequence } from '../utils/storage';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  History,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserCheck,
  X
} from 'lucide-react';

interface CleaningViewProps {
  clean: CleaningTask[];
  cleanHist: CleaningHistory[];
  items: InventoryItem[];
  proc: PurchaseOrder[];
  moves: StockMove[];
  stock: PhysicalStocktake[];
  currentRole: RoleKey;
  onSaveClean: (newClean: CleaningTask[]) => void;
  onSaveCleanHist: (newHist: CleaningHistory[]) => void;
  onSaveItems: (newItems: InventoryItem[]) => void;
  onSaveProc: (newProc: PurchaseOrder[]) => void;
  onSaveMoves: (newMoves: StockMove[]) => void;
  onSaveStock: (newStock: PhysicalStocktake[]) => void;
  onExportCSV: (type: string) => void;
  onOpenNewReq: (title: string, note?: string) => void;
  showToast: (msg: string) => void;
}

export const CleaningView: React.FC<CleaningViewProps> = ({
  clean = [],
  cleanHist = [],
  items = [],
  proc = [],
  moves = [],
  stock = [],
  currentRole,
  onSaveClean,
  onSaveCleanHist,
  onSaveItems,
  onSaveProc,
  onSaveMoves,
  onSaveStock,
  onExportCSV,
  onOpenNewReq,
  showToast
}) => {
  const isMgr = currentRole === 'manager';
  const isCleaningLeader = currentRole === 'cleaning';
  const canManageTasks = isMgr || isCleaningLeader;

  const clnItems = items.filter((i) => i.cat === 'CLN');

  const doneCount = clean.filter((c) => c.done).length;
  const pct = clean.length ? Math.round((doneCount / clean.length) * 100) : 0;

  // Assignee groups
  const assignees = [...new Set(clean.map((c) => c.assignee || 'غير محدد'))];

  // Purchase lines for Cleaning
  const purchaseLines: {
    id: string;
    itemName: string;
    qty: number;
    unit: string;
    price: number;
    supplier: string;
    date: string;
  }[] = [];

  proc.forEach((o) => {
    if (o.status !== 'مكتمل') return;
    (o.lines || []).forEach((l) => {
      if (l.cat === 'CLN') {
        purchaseLines.push({
          id: l.id,
          itemName: l.itemName,
          qty: l.qty,
          unit: l.unit,
          price: l.price,
          supplier: o.supplier,
          date: o.date
        });
      }
    });
  });

  const totalCleaningSpend = purchaseLines.reduce((a, l) => a + l.qty * l.price, 0);

  const cleaningMoves = useMemo(() => {
    return (moves || []).filter(
      (m) => m.cat === 'CLN' || clnItems.some((ci) => ci.id === m.itemId || ci.name === m.itemName)
    );
  }, [moves, clnItems]);

  // Modal States
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [taskArea, setTaskArea] = useState('');
  const [taskFreq, setTaskFreq] = useState('يومي');
  const [taskAssignee, setTaskAssignee] = useState('');

  const [assigningTask, setAssigningTask] = useState<CleaningTask | null>(null);
  const [newAssigneeName, setNewAssigneeName] = useState('');

  const [showHistModal, setShowHistModal] = useState(false);
  const [selectedHistDay, setSelectedHistDay] = useState<CleaningHistory | null>(null);

  // Quick Expense
  const [showQuickExpense, setShowQuickExpense] = useState(false);
  const [qeSearch, setQeSearch] = useState('');
  const [qePickedItem, setQePickedItem] = useState<InventoryItem | null>(null);
  const [qeQty, setQeQty] = useState('1');
  const [qeTotalCost, setQeTotalCost] = useState('0');

  // Stocktake
  const [showStocktakeModal, setShowStocktakeModal] = useState(false);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [stocktakeResults, setStocktakeResults] = useState<PhysicalStocktake[] | null>(null);
  const [autoAdjustChecked, setAutoAdjustChecked] = useState(true);

  // In / Out Movement
  const [moveItem, setMoveItem] = useState<InventoryItem | null>(null);
  const [moveType, setMoveType] = useState<'in' | 'out'>('in');
  const [moveQty, setMoveQty] = useState('');
  const [movePerson, setMovePerson] = useState('');

  const latestStocktakes = stock
    .filter((s) => s.cat === 'CLN')
    .sort((a, b) => b.ts - a.ts)
    .slice(0, clnItems.length);

  const handleToggleTask = (id: string) => {
    const updated = clean.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    onSaveClean(updated);
  };

  const handleResetDay = () => {
    if (
      !window.confirm(
        'هل تريد تجديد مهام اليوم؟ (سيتم أرشفة سجل إنجاز اليوم الحالي في سجل الأيام السابقة تلقائياً دون ضياع)'
      )
    ) {
      return;
    }

    const newHistEntry: CleaningHistory = {
      id: uid(),
      date: today(),
      isoDate: isoToday(),
      total: clean.length,
      done: doneCount,
      pct,
      tasks: clean.map((c) => ({
        name: c.name,
        done: c.done,
        assignee: c.assignee,
        area: c.area
      }))
    };

    onSaveCleanHist([newHistEntry, ...cleanHist]);

    const resetTasks = clean.map((t) => ({ ...t, done: false }));
    onSaveClean(resetTasks);
    showToast('تم حفظ سجل إنجاز اليوم وتجديد المهام بنجاح ✓');
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) {
      showToast('يرجى كتابة اسم المهمة');
      return;
    }

    const newTask: CleaningTask = {
      id: uid(),
      name: taskName.trim(),
      area: taskArea.trim() || '—',
      freq: taskFreq,
      done: false,
      assignee: taskAssignee.trim() || 'غير محدد'
    };

    onSaveClean([...clean, newTask]);
    setShowAddTask(false);
    setTaskName('');
    setTaskArea('');
    setTaskAssignee('');
    showToast('تمت إضافة المهمة بنجاح ✓');
  };

  const handleDeleteTask = (id: string) => {
    onSaveClean(clean.filter((c) => c.id !== id));
    showToast('تم حذف المهمة');
  };

  const handleSaveAssignee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningTask) return;

    const updated = clean.map((t) =>
      t.id === assigningTask.id ? { ...t, assignee: newAssigneeName.trim() || 'غير محدد' } : t
    );
    onSaveClean(updated);
    setAssigningTask(null);
    showToast('تم تعيين المسؤول بنجاح ✓');
  };

  const handleSubmitQuickExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qePickedItem) {
      showToast('يرجى اختيار صنف من القائمة أولاً');
      return;
    }

    const q = parseFloat(qeQty) || 1;
    const totCost = parseFloat(qeTotalCost) || 0;
    const unitPrice = q > 0 ? +(totCost / q).toFixed(2) : 0;

    const poSeq = getNextDocumentSequence('PO');
    const grnSeq = getNextDocumentSequence('GRN');

    const newOrder: PurchaseOrder = {
      id: poSeq,
      orderNumber: poSeq,
      supplierId: null,
      supplier: 'مستلزمات نظافة (مصروف نثري)',
      date: today(),
      isoDate: isoToday(),
      status: 'مكتمل',
      note: 'تسجيل مستلزمات نظافة سريعة',
      by: isMgr ? 'المدير' : 'النظافة',
      lines: [
        {
          id: uid(),
          itemId: qePickedItem.id,
          itemName: qePickedItem.name,
          cat: 'CLN',
          unit: qePickedItem.unit,
          qty: q,
          price: unitPrice,
          isNewItem: false
        }
      ]
    };

    if (unitPrice > 0) {
      const updatedCostItems = items.map((i) => (i.id === qePickedItem.id ? { ...i, cost: unitPrice } : i));
      onSaveItems(updatedCostItems);
    }

    const newMove: StockMove = {
      id: grnSeq,
      voucherNo: grnSeq,
      docType: 'GRN',
      itemId: qePickedItem.id,
      itemName: qePickedItem.name,
      code: qePickedItem.code,
      cat: qePickedItem.cat,
      type: 'in',
      qty: q,
      cost: 0,
      person: 'مصروف نثري',
      note: 'تسجيل مستلزمات نظافة سريعة',
      date: today(),
      ts: Date.now(),
      by: isMgr ? 'المدير' : 'النظافة'
    };

    onSaveProc([newOrder, ...proc]);
    onSaveMoves([newMove, ...moves]);
    setShowQuickExpense(false);
    setQePickedItem(null);
    setQeSearch('');
    showToast('تم تسجيل المستلزمات بنجاح ✓');
  };

  const handleOpenStocktake = () => {
    const initial: Record<string, string> = {};
    clnItems.forEach((it) => {
      initial[it.id] = '';
    });
    setStockInputs(initial);
    setShowStocktakeModal(true);
  };

  const handleSubmitStocktake = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntries: PhysicalStocktake[] = [];
    const tStamp = Date.now();
    const dStr = today();

    clnItems.forEach((it) => {
      const val = stockInputs[it.id];
      if (val !== undefined && val.trim() !== '') {
        const physical = parseFloat(val);
        newEntries.push({
          id: uid(),
          itemId: it.id,
          itemName: it.name,
          cat: 'CLN',
          systemBalance: it.balance,
          physicalCount: physical,
          variance: +(physical - it.balance).toFixed(2),
          date: dStr,
          ts: tStamp,
          by: isMgr ? 'المدير' : currentRole === 'cleaning' ? 'النظافة' : 'مسؤول'
        });
      }
    });

    if (!newEntries.length) {
      showToast('يرجى كتابة عدد فعلي واحد على الأقل');
      return;
    }

    onSaveStock([...stock, ...newEntries]);
    setShowStocktakeModal(false);
    setStocktakeResults(newEntries);
  };

  const handleApplyStocktakeAdjust = () => {
    if (!stocktakeResults || !autoAdjustChecked) {
      setStocktakeResults(null);
      return;
    }

    let updatedItems = [...items];
    const newMoves: StockMove[] = [];

    stocktakeResults.forEach((entry) => {
      if (entry.variance !== 0) {
        const it = updatedItems.find((i) => i.id === entry.itemId);
        if (it) {
          const diff = entry.physicalCount - it.balance;
          const adjSeq = getNextDocumentSequence('ADJ');
          newMoves.push({
            id: adjSeq,
            voucherNo: adjSeq,
            docType: 'ADJ',
            itemId: it.id,
            itemName: it.name,
            code: it.code,
            cat: it.cat,
            type: diff >= 0 ? 'in' : 'out',
            qty: Math.abs(diff),
            cost: 0,
            person: 'تسوية جرد فعلي',
            note: 'تعديل تلقائي بعد الجرد المادي للنظافة',
            date: today(),
            ts: Date.now(),
            by: isMgr ? 'المدير' : 'النظافة',
            adjustment: true
          });
        }
      }
    });

    onSaveMoves([...newMoves, ...moves]);
    setStocktakeResults(null);
    showToast('تمت تسوية أرصدة مستلزمات النظافة بنجاح ✓');
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

    const currentItem = items.find((i) => i.id === moveItem.id) || moveItem;
    const unitCost = Number(currentItem.cost !== undefined ? currentItem.cost : moveItem.cost || 0);
    const moveCost = moveType === 'out' ? +(unitCost * q).toFixed(2) : 0;
    const moveDocType = moveType === 'out' ? 'ISU' : 'GRN';
    const moveSeq = getNextDocumentSequence(moveDocType);

    const newMove: StockMove = {
      id: moveSeq,
      voucherNo: moveSeq,
      docType: moveDocType,
      itemId: moveItem.id,
      itemName: moveItem.name,
      code: moveItem.code,
      cat: moveItem.cat || 'CLN',
      type: moveType,
      qty: q,
      cost: moveCost,
      department: 'قسم النظافة والخدمات',
      person: movePerson.trim() || undefined,
      date: today(),
      ts: Date.now(),
      by: isMgr ? 'المدير' : 'النظافة'
    };

    onSaveMoves([newMove, ...moves]);
    setMoveItem(null);
    showToast(`تم تسجيل ${moveType === 'in' ? 'التوريد' : 'الصرف'} للنظافة ✓`);
  };

  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">🧴 النظافة والخدمات</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            تم إنجاز {doneCount} من {clean.length} مهمة اليوم ({pct}%) — إجمالي مشتريات المستلزمات:{' '}
            <strong className="font-mono text-[#075073] font-bold">{totalCleaningSpend.toLocaleString('ar-EG')} ج.م</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageTasks && (
            <button
              onClick={() => setShowAddTask(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ مهمة جديدة</span>
            </button>
          )}
          <button
            onClick={() => setShowHistModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-sm transition-all cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-blue-600" />
            <span>سجل الأيام السابقة ({cleanHist.length})</span>
          </button>
          {doneCount > 0 && canManageTasks && (
            <button
              onClick={handleResetDay}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-sm transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
              <span>🔄 تجديد اليوم وحفظ الإنجاز</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress & Checklist Card */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-black text-[#075073]">قائمة مهام اليوم ومتابعة الإنجاز</h3>
          </div>
          <div className="flex items-center gap-3 min-w-[180px] max-w-xs flex-1 justify-end">
            <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              ></div>
            </div>
            <span className="font-mono text-xs font-bold text-emerald-700">{pct}%</span>
          </div>
        </div>

        <div className="p-4 space-y-2">
          {clean.map((t) => (
            <div
              key={t.id}
              className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                t.done ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-stone-200 hover:border-stone-300'
              }`}
            >
              {/* Checkbox button */}
              <button
                type="button"
                onClick={() => handleToggleTask(t.id)}
                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                  t.done
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                    : 'border-stone-300 bg-white hover:border-stone-400'
                }`}
              >
                {t.done && <CheckCircle2 className="w-4 h-4" />}
              </button>

              <div className="flex-1">
                <div
                  className={`text-xs font-bold ${
                    t.done ? 'line-through text-stone-400' : 'text-stone-900'
                  }`}
                >
                  {t.name}
                </div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  📍 {t.area} · 🔁 {t.freq} · 👤 المسؤول:{' '}
                  <strong className="text-stone-700">{t.assignee || 'غير محدد'}</strong>
                </div>
              </div>

              {canManageTasks && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setAssigningTask(t);
                      setNewAssigneeName(t.assignee || '');
                    }}
                    className="px-2 py-1 rounded text-[11px] font-medium text-stone-600 hover:bg-stone-100 flex items-center gap-1 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">تعيين</span>
                  </button>
                  <button
                    onClick={() => handleDeleteTask(t.id)}
                    className="p-1 text-stone-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {clean.length === 0 && (
            <div className="py-8 text-center text-stone-400 text-xs">لا توجد مهام نظافة مسجلة</div>
          )}
        </div>
      </div>

      {/* Staff Performance Summary (Manager and Cleaning Team Leader) */}
      {canManageTasks && assignees.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
            <h3 className="text-sm font-black text-[#075073]">👥 أداء ومتابعة فريق النظافة اليوم</h3>
            <span className="text-[11px] text-stone-500 font-bold">صلاحيات الإشراف والمتابعة</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#faf7f0] text-[#075073] border-b border-stone-200 font-bold">
                <tr>
                  <th className="py-2.5 px-3">المسؤول</th>
                  <th className="py-2.5 px-3">المهام المسندة</th>
                  <th className="py-2.5 px-3">المنجز</th>
                  <th className="py-2.5 px-3">نسبة الإنجاز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {assignees.map((a) => {
                  const tasks = clean.filter((c) => (c.assignee || 'غير محدد') === a);
                  const d = tasks.filter((c) => c.done).length;
                  const p = tasks.length ? Math.round((d / tasks.length) * 100) : 0;
                  return (
                    <tr key={a} className="hover:bg-stone-50">
                      <td className="py-2.5 px-3 font-bold text-stone-900">{a}</td>
                      <td className="py-2.5 px-3 font-mono">{tasks.length}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{d}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            p >= 80
                              ? 'bg-emerald-50 text-emerald-700'
                              : p >= 50
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {p}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cleaning Supplies Inventory Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-black text-[#075073]">🧴 مخزون مستلزمات النظافة والأدوات</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenStocktake}
              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
              <span>جرد مادي</span>
            </button>
            <button
              onClick={() => setShowQuickExpense(true)}
              className="px-2.5 py-1 rounded-lg bg-[#075073] hover:bg-[#03151F] text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تسجيل مستهلكات</span>
            </button>
            <button
              onClick={() => onOpenNewReq('طلب شراء مستلزمات نظافة')}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-50 border border-stone-300 text-[#075073] text-xs font-bold transition-all cursor-pointer"
            >
              📋 طلب مستلزمات
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#faf7f0] text-[#075073] border-b border-stone-200 font-bold">
              <tr>
                <th className="py-3 px-3.5">الصنف</th>
                <th className="py-3 px-3.5">الرصيد بالنظام</th>
                <th className="py-3 px-3.5">الحد الأدنى</th>
                <th className="py-3 px-3.5">الحالة</th>
                <th className="py-3 px-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {clnItems.map((it) => {
                const isZero = it.balance <= 0;
                const isLow = it.balance < it.min;
                return (
                  <tr key={it.id} className="hover:bg-[#fbf8f1] transition-colors">
                    <td className="py-3 px-3.5 font-bold text-stone-900">{it.name}</td>
                    <td
                      className={`py-3 px-3.5 font-mono font-bold ${
                        isZero ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-stone-800'
                      }`}
                    >
                      {it.balance} <span className="text-[10px] text-stone-400 font-normal">{it.unit}</span>
                    </td>
                    <td className="py-3 px-3.5 font-mono text-stone-600">{it.min}</td>
                    <td className="py-3 px-3.5">
                      {isZero ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          نفد ❌
                        </span>
                      ) : isLow ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          منخفض ⚠️
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          متوفر ✅
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setMoveItem(it);
                            setMoveType('in');
                            setMoveQty('');
                            setMovePerson('');
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-all cursor-pointer flex items-center gap-1"
                        >
                          <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                          <span>وارد +</span>
                        </button>
                        <button
                          onClick={() => {
                            setMoveItem(it);
                            setMoveType('out');
                            setMoveQty('');
                            setMovePerson('');
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-all cursor-pointer flex items-center gap-1"
                        >
                          <ArrowUpRight className="w-3 h-3 text-amber-600" />
                          <span>صرف −</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {clnItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-stone-400">
                    لا توجد مستلزمات نظافة مسجلة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cleaning Purchases Log */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-black text-[#075073]">🧾 سجل مشتريات مستلزمات النظافة المعتمدة</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#faf7f0] text-[#075073] border-b border-stone-200 font-bold">
              <tr>
                <th className="py-2.5 px-3">الصنف</th>
                <th className="py-2.5 px-3">الكمية</th>
                <th className="py-2.5 px-3">التكلفة</th>
                <th className="py-2.5 px-3">المورد</th>
                <th className="py-2.5 px-3">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {purchaseLines.map((l) => (
                <tr key={l.id} className="hover:bg-stone-50 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-stone-800">{l.itemName}</td>
                  <td className="py-2.5 px-3 font-mono">
                    {l.qty} {l.unit}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-stone-900">
                    {(l.qty * l.price).toLocaleString('ar-EG')} ج.م
                  </td>
                  <td className="py-2.5 px-3 text-stone-600">{l.supplier}</td>
                  <td className="py-2.5 px-3 text-stone-500 font-mono text-[11px]">{l.date}</td>
                </tr>
              ))}
              {purchaseLines.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-stone-400">
                    لا توجد مشتريات مسجلة للنظافة حتى الآن
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {purchaseLines.length > 0 && (
          <div className="p-3.5 bg-stone-50 border-t border-stone-200 flex justify-between items-center text-xs">
            <span className="font-bold text-stone-700">إجمالي مصروفات النظافة:</span>
            <span className="font-mono font-black text-sm text-[#075073]">
              {totalCleaningSpend.toLocaleString('ar-EG')} ج.م
            </span>
          </div>
        )}
      </div>

      {/* Cleaning Stock Movements History (سجل حركات وارد وصرف مستلزمات النظافة) */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#075073]" />
            <h3 className="text-sm font-black text-[#075073]">📜 سجل حركات وارد وصرف مستلزمات النظافة</h3>
          </div>
          <span className="text-[11px] text-stone-500 font-mono">
            {cleaningMoves.length} حركة مسجلة وموثقة بالسجل السحابي
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#faf7f0] text-[#075073] border-b border-stone-200 font-bold">
              <tr>
                <th className="py-2.5 px-3">نوع الحركة</th>
                <th className="py-2.5 px-3">الصنف</th>
                <th className="py-2.5 px-3">الكمية</th>
                <th className="py-2.5 px-3">المستلم / المورد</th>
                <th className="py-2.5 px-3">البيان والتفاصيل</th>
                <th className="py-2.5 px-3">التاريخ والوقت</th>
                <th className="py-2.5 px-3">المسؤول</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {cleaningMoves.slice(0, 50).map((m) => {
                const isIn = m.type === 'in';
                return (
                  <tr key={m.id} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          isIn
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {isIn ? (
                          <>
                            <ArrowDownLeft className="w-3 h-3" /> وارد (+)
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="w-3 h-3" /> صرف (−)
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-stone-900">{m.itemName}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-stone-800">
                      {m.qty}
                    </td>
                    <td className="py-2.5 px-3 text-stone-700">{m.person || m.department || '—'}</td>
                    <td className="py-2.5 px-3 text-stone-500 max-w-[200px] truncate">{m.note || '—'}</td>
                    <td className="py-2.5 px-3 text-stone-500 font-mono text-[11px]">{m.date}</td>
                    <td className="py-2.5 px-3 text-stone-600 font-medium">{m.by || '—'}</td>
                  </tr>
                );
              })}
              {cleaningMoves.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-stone-400">
                    لا توجد حركات وارد أو صرف مسجلة لمستلزمات النظافة حتى الآن
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Task Modal */}
      {showAddTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#075073]">+ إضافة مهمة نظافة دورية</h3>
              <button
                onClick={() => setShowAddTask(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم المهمة</label>
                <input
                  type="text"
                  required
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="مثال: تعقيم طاولات الريسبشن"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">المنطقة أو الطابق</label>
                  <input
                    type="text"
                    value={taskArea}
                    onChange={(e) => setTaskArea(e.target.value)}
                    placeholder="الدور الأول، الممرات..."
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">التكرار</label>
                  <select
                    value={taskFreq}
                    onChange={(e) => setTaskFreq(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:border-[#075073] focus:outline-none"
                  >
                    <option value="يومي">يومي</option>
                    <option value="أسبوعي">أسبوعي</option>
                    <option value="شهري">شهري</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم العامل المسؤول (اختياري)</label>
                <input
                  type="text"
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                  placeholder="مثال: أحمد السيد"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer"
                >
                  إضافة المهمة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Task Modal */}
      {assigningTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">👤 تعيين مسؤول عن المهمة</h3>
                <p className="text-xs text-stone-500 mt-0.5">{assigningTask.name}</p>
              </div>
              <button
                onClick={() => setAssigningTask(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignee} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم المسؤول</label>
                <input
                  type="text"
                  value={newAssigneeName}
                  onChange={(e) => setNewAssigneeName(e.target.value)}
                  placeholder="مثال: محمود علي"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  autoFocus
                />
                <div className="mt-2">
                  <div className="text-[11px] text-stone-500 font-bold mb-1">اختيار سريع من الفريق:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(
                      new Set([
                        ...assignees.filter((a) => a && a !== 'غير محدد'),
                        'أحمد السيد',
                        'محمود علي',
                        'إبراهيم حسن',
                        'سارة محمد',
                        'فريق النظافة العام'
                      ])
                    ).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setNewAssigneeName(name)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                          newAssigneeName === name
                            ? 'bg-[#075073] text-white border-[#075073]'
                            : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigningTask(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer"
                >
                  حفظ التعيين
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Historical Records Modal */}
      {showHistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">📅 سجل إنجاز الأيام السابقة</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  {cleanHist.length} يوم مؤرشف — السجلات محفوظة دائماً ولا يتم مسحها
                </p>
              </div>
              <button
                onClick={() => {
                  setShowHistModal(false);
                  setSelectedHistDay(null);
                }}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedHistDay ? (
              <div className="overflow-y-auto flex-1 space-y-3">
                <div className="p-3 bg-stone-50 rounded-xl flex items-center justify-between">
                  <span className="font-bold text-xs text-stone-800">تفاصيل يوم: {selectedHistDay.date}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      selectedHistDay.pct >= 80
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    نسبة الإنجاز: {selectedHistDay.pct}%
                  </span>
                </div>
                <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden text-xs">
                  {selectedHistDay.tasks.map((t, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-stone-50">
                      <div>
                        <div className="font-bold text-stone-900">{t.name}</div>
                        <div className="text-[11px] text-stone-500">
                          {t.area} · المسؤول: {t.assignee}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          t.done ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {t.done ? 'تم ✓' : 'لم تُنجز'}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHistDay(null)}
                  className="w-full py-2 px-3 rounded-lg text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200"
                >
                  ← رجوع لقائمة الأيام
                </button>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                {cleanHist.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-stone-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-stone-400" />
                        <span>{h.date}</span>
                      </div>
                      <div className="text-[11px] text-stone-500 mt-1">
                        تم إنجاز {h.done} من {h.total} مهمة
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          h.pct >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {h.pct}%
                      </span>
                      <button
                        onClick={() => setSelectedHistDay(h)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-stone-200 hover:bg-stone-100 text-[11px] font-bold cursor-pointer"
                      >
                        التفاصيل
                      </button>
                    </div>
                  </div>
                ))}
                {cleanHist.length === 0 && (
                  <div className="py-8 text-center text-stone-400 text-xs">
                    لا يوجد سجل سابق محفوظ حتى الآن — يُحفظ اليوم عند الضغط على &quot;تجديد اليوم&quot;
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowHistModal(false);
                  setSelectedHistDay(null);
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Expense Modal */}
      {showQuickExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">🧴 تسجيل مستلزمات نظافة سريعة</h3>
                <p className="text-xs text-stone-500 mt-0.5">يُسجّل كأمر شراء مكتمل ويدخل في تقارير التكاليف فوراً</p>
              </div>
              <button
                onClick={() => setShowQuickExpense(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitQuickExpense} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اختر الصنف من مستلزمات النظافة</label>
                <input
                  type="text"
                  value={qeSearch}
                  onChange={(e) => {
                    setQeSearch(e.target.value);
                    setQePickedItem(null);
                  }}
                  placeholder="ابحث (كلور، ديتول، صابون، مناديل...)"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  autoFocus
                />
                {qeSearch && !qePickedItem && (
                  <div className="mt-1 max-h-32 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100 bg-white">
                    {clnItems
                      .filter((i) => i.name.includes(qeSearch))
                      .map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => {
                            setQePickedItem(it);
                            setQeSearch(it.name);
                          }}
                          className="w-full text-right p-2 text-xs hover:bg-stone-50 flex justify-between"
                        >
                          <span className="font-bold">{it.name}</span>
                          <span className="text-stone-400 font-mono">الرصيد: {it.balance} {it.unit}</span>
                        </button>
                      ))}
                  </div>
                )}
                {qePickedItem && (
                  <div className="mt-1 p-2 bg-emerald-50 rounded-lg text-xs font-bold text-emerald-800">
                    تم اختيار: {qePickedItem.name} ({qePickedItem.unit})
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الكمية</label>
                  <input
                    type="number"
                    step="any"
                    value={qeQty}
                    onChange={(e) => setQeQty(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">التكلفة الإجمالية (ج.م)</label>
                  <input
                    type="number"
                    step="any"
                    value={qeTotalCost}
                    onChange={(e) => setQeTotalCost(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowQuickExpense(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer"
                >
                  تسجيل المصروف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stocktake Modal */}
      {showStocktakeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-amber-500 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">📋 جرد مادي فعلي — مستلزمات النظافة</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  اكتب العدد الفعلي الموجود أمامك حالياً بالمخزن لكل صنف
                </p>
              </div>
              <button
                onClick={() => setShowStocktakeModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitStocktake} className="overflow-y-auto flex-1 space-y-2.5 pr-1">
              {clnItems.map((it) => (
                <div
                  key={it.id}
                  className="p-2.5 rounded-xl border border-stone-200 bg-stone-50/60 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex-1">
                    <div className="font-bold text-stone-900">{it.name}</div>
                    <div className="text-[11px] text-stone-500">
                      رصيد النظام: <span className="font-mono font-bold text-stone-700">{it.balance} {it.unit}</span>
                    </div>
                  </div>
                  <div className="w-28 shrink-0">
                    <input
                      type="number"
                      step="any"
                      placeholder={String(it.balance)}
                      value={stockInputs[it.id] || ''}
                      onChange={(e) =>
                        setStockInputs({
                          ...stockInputs,
                          [it.id]: e.target.value
                        })
                      }
                      className="w-full py-1.5 px-2 bg-white rounded-lg border border-stone-300 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none text-center"
                    />
                  </div>
                </div>
              ))}

              <div className="flex gap-2 pt-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowStocktakeModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer"
                >
                  حفظ نتيجة الجرد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stocktake Results Modal */}
      {stocktakeResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-emerald-600 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">✅ نتيجة الجرد المادي لمستلزمات النظافة</h3>
                <p className="text-xs text-stone-500 mt-0.5">تم تسجيل الجرد بنجاح</p>
              </div>
              <button
                onClick={() => setStocktakeResults(null)}
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
                    <th className="p-2.5">رصيد النظام</th>
                    <th className="p-2.5">الفعلي</th>
                    <th className="p-2.5">الفرق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {stocktakeResults.map((e) => {
                    const isDeficit = e.variance < 0;
                    const isSurplus = e.variance > 0;
                    return (
                      <tr key={e.id}>
                        <td className="p-2.5 font-bold">{e.itemName}</td>
                        <td className="p-2.5 font-mono">{e.systemBalance}</td>
                        <td className="p-2.5 font-mono font-bold">{e.physicalCount}</td>
                        <td
                          className={`p-2.5 font-mono font-black ${
                            isDeficit ? 'text-rose-600' : isSurplus ? 'text-emerald-600' : 'text-stone-400'
                          }`}
                        >
                          {isSurplus ? `+${e.variance}` : e.variance}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {stocktakeResults.some((e) => e.variance !== 0) && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk_auto_adjust_cln"
                  checked={autoAdjustChecked}
                  onChange={(e) => setAutoAdjustChecked(e.target.checked)}
                  className="w-4 h-4 rounded text-[#075073] cursor-pointer"
                />
                <label htmlFor="chk_auto_adjust_cln" className="font-bold cursor-pointer">
                  تعديل أرصدة المخزون تلقائياً لتطابق الجرد الفعلي فوراً (تسوية الجرد)
                </label>
              </div>
            )}

            <div className="flex gap-2 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setStocktakeResults(null)}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إغلاق
              </button>
              {stocktakeResults.some((e) => e.variance !== 0) && (
                <button
                  type="button"
                  onClick={handleApplyStocktakeAdjust}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#c9920a] hover:bg-[#b07f08] transition-all shadow-md cursor-pointer"
                >
                  تطبيق التسوية
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {moveItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#c9920a] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">{moveItem.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  الرصيد الحالي: <span className="font-mono font-bold text-stone-800">{moveItem.balance} {moveItem.unit}</span>
                </p>
              </div>
              <button
                onClick={() => setMoveItem(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMove} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">الكمية ({moveItem.unit})</label>
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

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  {moveType === 'in' ? 'جهة التوريد / المورد' : 'المستلم أو العامل'}
                </label>
                <input
                  type="text"
                  value={movePerson}
                  onChange={(e) => setMovePerson(e.target.value)}
                  placeholder={moveType === 'in' ? 'شركة التوريدات' : 'اسم العامل / القسم'}
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

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
                  تأكيد {moveType === 'in' ? 'التوريد +' : 'الصرف −'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
