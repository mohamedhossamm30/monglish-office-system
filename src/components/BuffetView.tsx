import React, { useState, useMemo } from 'react';
import {
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
  CheckCircle2,
  ClipboardList,
  Coffee,
  Download,
  History,
  Plus,
  Receipt,
  X
} from 'lucide-react';

interface BuffetViewProps {
  items: InventoryItem[];
  proc: PurchaseOrder[];
  moves: StockMove[];
  stock: PhysicalStocktake[];
  currentRole: RoleKey;
  onSaveItems: (newItems: InventoryItem[]) => void;
  onSaveProc: (newProc: PurchaseOrder[]) => void;
  onSaveMoves: (newMoves: StockMove[]) => void;
  onSaveStock: (newStock: PhysicalStocktake[]) => void;
  onExportCSV: (type: string) => void;
  onOpenNewReq: (title: string, note?: string) => void;
  showToast: (msg: string) => void;
}

export const BuffetView: React.FC<BuffetViewProps> = ({
  items = [],
  proc = [],
  moves = [],
  stock = [],
  currentRole,
  onSaveItems,
  onSaveProc,
  onSaveMoves,
  onSaveStock,
  onExportCSV,
  onOpenNewReq,
  showToast
}) => {
  const isMgr = currentRole === 'manager';

  const buffItems = items.filter((i) => i.cat === 'BUFF');

  // Purchase lines for Buffet
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
      if (l.cat === 'BUFF') {
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

  const totalBuffetSpend = purchaseLines.reduce((a, l) => a + l.qty * l.price, 0);

  const buffetMoves = useMemo(() => {
    return (moves || []).filter(
      (m) => m.cat === 'BUFF' || buffItems.some((bi) => bi.id === m.itemId || bi.name === m.itemName)
    );
  }, [moves, buffItems]);

  // Quick Expense Modal State
  const [showQuickExpense, setShowQuickExpense] = useState(false);
  const [qeSearch, setQeSearch] = useState('');
  const [qePickedItem, setQePickedItem] = useState<InventoryItem | null>(null);
  const [qeQty, setQeQty] = useState('1');
  const [qeTotalCost, setQeTotalCost] = useState('0');

  // Physical Stocktake Modal State
  const [showStocktakeModal, setShowStocktakeModal] = useState(false);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [stocktakeResults, setStocktakeResults] = useState<PhysicalStocktake[] | null>(null);
  const [autoAdjustChecked, setAutoAdjustChecked] = useState(true);

  // In / Out Movement Modal
  const [moveItem, setMoveItem] = useState<InventoryItem | null>(null);
  const [moveType, setMoveType] = useState<'in' | 'out'>('in');
  const [moveQty, setMoveQty] = useState('');
  const [movePerson, setMovePerson] = useState('');

  // Latest stocktake per item
  const latestStocktakes = stock
    .filter((s) => s.cat === 'BUFF')
    .sort((a, b) => b.ts - a.ts)
    .slice(0, buffItems.length);

  const handleOpenStocktake = () => {
    const initial: Record<string, string> = {};
    buffItems.forEach((it) => {
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

    buffItems.forEach((it) => {
      const val = stockInputs[it.id];
      if (val !== undefined && val.trim() !== '') {
        const physical = parseFloat(val);
        newEntries.push({
          id: uid(),
          itemId: it.id,
          itemName: it.name,
          cat: 'BUFF',
          systemBalance: it.balance,
          physicalCount: physical,
          variance: +(physical - it.balance).toFixed(2),
          date: dStr,
          ts: tStamp,
          by: isMgr ? 'المدير' : currentRole === 'buffet' ? 'البوفيه' : 'مسؤول'
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
            note: 'تعديل تلقائي بعد الجرد المادي للبوفيه',
            date: today(),
            ts: Date.now(),
            by: isMgr ? 'المدير' : 'البوفيه',
            adjustment: true
          });
        }
      }
    });

    onSaveMoves([...newMoves, ...moves]);
    setStocktakeResults(null);
    showToast('تمت تسوية أرصدة البوفيه حسب الجرد الفعلي بنجاح ✓');
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
      supplier: 'مصروف نثري (بوفيه)',
      date: today(),
      isoDate: isoToday(),
      status: 'مكتمل',
      note: 'تسجيل مصروف بوفيه مباشر',
      by: isMgr ? 'المدير' : 'البوفيه',
      lines: [
        {
          id: uid(),
          itemId: qePickedItem.id,
          itemName: qePickedItem.name,
          cat: 'BUFF',
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
      note: 'تسجيل مصروف بوفيه سريع',
      date: today(),
      ts: Date.now(),
      by: isMgr ? 'المدير' : 'البوفيه'
    };

    onSaveProc([newOrder, ...proc]);
    onSaveMoves([newMove, ...moves]);
    setShowQuickExpense(false);
    setQePickedItem(null);
    setQeSearch('');
    showToast('تم تسجيل المصروف وإضافته للمخزون والتكاليف ✓');
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
      cat: moveItem.cat || 'BUFF',
      type: moveType,
      qty: q,
      cost: moveCost,
      department: 'قسم البوفيه والضيافة',
      person: movePerson.trim() || undefined,
      date: today(),
      ts: Date.now(),
      by: isMgr ? 'المدير' : 'البوفيه'
    };

    onSaveMoves([newMove, ...moves]);
    setMoveItem(null);
    showToast(`تم تسجيل ${moveType === 'in' ? 'التوريد' : 'الصرف'} للبوفيه ✓`);
  };

  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">☕ البوفيه والضيافة</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            إجمالي مشتريات البوفيه المعتمدة:{' '}
            <strong className="font-mono text-[#075073] font-bold">{totalBuffetSpend.toLocaleString('ar-EG')} ج.م</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMgr && (
            <button
              onClick={() => onExportCSV('buff')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير Excel</span>
            </button>
          )}
          <button
            onClick={handleOpenStocktake}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-sm transition-all cursor-pointer"
          >
            <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
            <span>جرد مادي (فعلي)</span>
          </button>
          <button
            onClick={() => setShowQuickExpense(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ تسجيل مصروف بوفيه</span>
          </button>
          <button
            onClick={() => onOpenNewReq('طلب تعبئة بوفيه ومشروبات')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-[#075073] border border-stone-300 shadow-sm transition-all cursor-pointer"
          >
            <span>📋 طلب تعبئة</span>
          </button>
        </div>
      </div>

      {/* Buffet Stock Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-black text-[#075073]">📦 أرصدة أصناف ومستلزمات البوفيه</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#faf7f0] text-[#075073] border-b border-stone-200 font-bold">
              <tr>
                <th className="py-3 px-3.5">الصنف</th>
                <th className="py-3 px-3.5">الرصيد بالنظام</th>
                <th className="py-3 px-3.5">الحد الأدنى</th>
                <th className="py-3 px-3.5">الحالة</th>
                <th className="py-3 px-3.5 text-center">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {buffItems.map((it) => {
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
              {buffItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-400">
                    لا توجد أصناف مسجلة في فئة البوفيه
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Latest Stocktake Card */}
      {latestStocktakes.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
            <h3 className="text-sm font-black text-[#075073]">📋 نتائج آخر جرد مادي تم تسجيله للبوفيه</h3>
            <span className="text-[11px] text-stone-500 font-mono">
              {latestStocktakes[0].date} — بواسطة {latestStocktakes[0].by}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#faf7f0] text-[#075073] border-b border-stone-200 font-bold">
                <tr>
                  <th className="py-2.5 px-3">الصنف</th>
                  <th className="py-2.5 px-3">رصيد النظام وقت الجرد</th>
                  <th className="py-2.5 px-3">العدد الفعلي بالمخزن</th>
                  <th className="py-2.5 px-3">الفرق (عجز / زيادة)</th>
                  <th className="py-2.5 px-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {latestStocktakes.map((s) => {
                  const isDeficit = s.variance < 0;
                  const isSurplus = s.variance > 0;
                  return (
                    <tr key={s.id} className="hover:bg-stone-50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-stone-800">{s.itemName}</td>
                      <td className="py-2.5 px-3 font-mono">{s.systemBalance}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-stone-900">{s.physicalCount}</td>
                      <td
                        className={`py-2.5 px-3 font-mono font-bold ${
                          isDeficit ? 'text-rose-600' : isSurplus ? 'text-emerald-600' : 'text-stone-400'
                        }`}
                      >
                        {isSurplus ? `+${s.variance}` : s.variance}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            isDeficit
                              ? 'bg-rose-50 text-rose-700'
                              : isSurplus
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {isDeficit ? 'عجز' : isSurplus ? 'زيادة' : 'مطابق ✓'}
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

      {/* Buffet Purchases Log */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-black text-[#075073]">🧾 سجل مشتريات ومصروفات البوفيه المعتمدة</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#faf7f0] text-[#075073] border-b border-stone-200 font-bold">
              <tr>
                <th className="py-2.5 px-3">الصنف</th>
                <th className="py-2.5 px-3">الكمية</th>
                <th className="py-2.5 px-3">التكلفة الإجمالية</th>
                <th className="py-2.5 px-3">المورد / المصدر</th>
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
                    لا توجد مشتريات معتمدة مسجلة للبوفيه بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {purchaseLines.length > 0 && (
          <div className="p-3.5 bg-stone-50 border-t border-stone-200 flex justify-between items-center text-xs">
            <span className="font-bold text-stone-700">إجمالي منصرف البوفيه:</span>
            <span className="font-mono font-black text-sm text-[#075073]">
              {totalBuffetSpend.toLocaleString('ar-EG')} ج.م
            </span>
          </div>
        )}
      </div>

      {/* Buffet Stock Movements History (سجل حركات وارد وصرف البوفيه) */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-[#f4efe2] border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#075073]" />
            <h3 className="text-sm font-black text-[#075073]">📜 سجل حركات وارد وصرف البوفيه</h3>
          </div>
          <span className="text-[11px] text-stone-500 font-mono">
            {buffetMoves.length} حركة مسجلة وموثقة بالسجل السحابي
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
              {buffetMoves.slice(0, 50).map((m) => {
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
                            <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> وارد (+)
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="w-3 h-3 text-amber-600" /> صرف (−)
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
              {buffetMoves.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-stone-400">
                    لا توجد حركات وارد أو صرف مسجلة لأصناف البوفيه حتى الآن
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Expense Modal */}
      {showQuickExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">☕ تسجيل مصروف بوفيه سريع</h3>
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
                <label className="block text-xs font-bold text-stone-700 mb-1">اختر الصنف من أصناف البوفيه</label>
                <input
                  type="text"
                  value={qeSearch}
                  onChange={(e) => {
                    setQeSearch(e.target.value);
                    setQePickedItem(null);
                  }}
                  placeholder="ابحث عن الصنف (شاي، سكر، بن، لبن...)"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  autoFocus
                />
                {qeSearch && !qePickedItem && (
                  <div className="mt-1 max-h-32 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100 bg-white">
                    {buffItems
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
                  <label className="block text-xs font-bold text-stone-700 mb-1">الكمية المشتراة</label>
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
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] transition-all shadow-md cursor-pointer"
                >
                  تسجيل المصروف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Physical Stocktake Modal */}
      {showStocktakeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-amber-500 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">📋 جرد مادي فعلي — البوفيه</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  اكتب العدد الفعلي الموجود أمامك حالياً لكل صنف، والنظام سيحسب الفرق
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
              {buffItems.map((it) => (
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
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] transition-all shadow-md cursor-pointer"
                >
                  حفظ نتيجة الجرد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stocktake Results & Adjustment Modal */}
      {stocktakeResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-emerald-600 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">✅ نتيجة الجرد المادي للبوفيه</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  تم تسجيل الجرد — قارن بين أرصدة النظام والأعداد الفعلية
                </p>
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
                  id="chk_auto_adjust"
                  checked={autoAdjustChecked}
                  onChange={(e) => setAutoAdjustChecked(e.target.checked)}
                  className="w-4 h-4 rounded text-[#075073] cursor-pointer"
                />
                <label htmlFor="chk_auto_adjust" className="font-bold cursor-pointer">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
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
                  {moveType === 'in' ? 'جهة التوريد / المورد' : 'المستلم أو القسم'}
                </label>
                <input
                  type="text"
                  value={movePerson}
                  onChange={(e) => setMovePerson(e.target.value)}
                  placeholder={moveType === 'in' ? 'مثال: سوبرماركت' : 'مثال: ضيافة الإدارة'}
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
