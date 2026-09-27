import React, { useState, useMemo } from 'react';
import {
  CategoryKey,
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderLine,
  RecurringTemplate,
  RoleKey,
  StockMove,
  Supplier
} from '../types';
import { CATEGORIES } from '../data/seedData';
import {
  isoPlusDays,
  isoToday,
  isDateInRange,
  normName,
  normArabic,
  isDuplicateItemName,
  isDuplicateItemCode,
  orderTotal,
  orderTaxTotal,
  orderSubtotal,
  today,
  uid,
  getNextItemCode,
  getNextDocumentSequence
} from '../utils/storage';
import { DocumentSequenceBadge } from './DocumentSequenceBadge';
import { DateFilterBar, DateFilterValue } from './DateFilterBar';
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Download,
  Edit2,
  Eye,
  FileText,
  Lock,
  Percent,
  Plus,
  Receipt,
  Repeat,
  ShoppingCart,
  Trash2,
  Upload,
  Printer,
  X
} from 'lucide-react';

interface ProcurementViewProps {
  proc: PurchaseOrder[];
  items: InventoryItem[];
  moves: StockMove[];
  suppliers: Supplier[];
  recurring: RecurringTemplate[];
  currentRole: RoleKey;
  onSaveProc: (newProc: PurchaseOrder[]) => void;
  onSaveItems: (newItems: InventoryItem[]) => void;
  onSaveMoves: (newMoves: StockMove[], newItems?: InventoryItem[]) => void;
  onSaveSuppliers: (newSuppliers: Supplier[]) => void;
  onSaveRecurring: (newRec: RecurringTemplate[]) => void;
  onExportCSV: (type: string) => void;
  onOpenExcelImport: (type: 'items' | 'lines' | 'proc') => void;
  onPrintVoucher?: (data: any) => void;
  showToast: (msg: string) => void;
}

export const ProcurementView: React.FC<ProcurementViewProps> = ({
  proc = [],
  items = [],
  moves = [],
  suppliers = [],
  recurring = [],
  currentRole,
  onSaveProc,
  onSaveItems,
  onSaveMoves,
  onSaveSuppliers,
  onSaveRecurring,
  onExportCSV,
  onOpenExcelImport,
  onPrintVoucher,
  showToast
}) => {
  const isMgr = currentRole === 'manager';

  // Add/Edit Order Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [orderDateIso, setOrderDateIso] = useState<string>(isoToday());
  const [orderHasTax, setOrderHasTax] = useState<boolean>(false);
  const [orderTaxRate, setOrderTaxRate] = useState<string>('14');
  const [orderShippingCost, setOrderShippingCost] = useState<string>('0');
  const [orderInvoiceNumber, setOrderInvoiceNumber] = useState<string>('');

  const [procSupplierSearch, setProcSupplierSearch] = useState('');
  const [procPickedSupplier, setProcPickedSupplier] = useState<Supplier | null>(null);
  const [procCart, setProcCart] = useState<PurchaseOrderLine[]>([]);
  const [procItemMode, setProcItemMode] = useState<'existing' | 'new'>('existing');
  const [procItemSearch, setProcItemSearch] = useState('');
  const [procPickedItem, setProcPickedItem] = useState<InventoryItem | null>(null);

  // Line inputs
  const [lineNewName, setLineNewName] = useState('');
  const [lineNewCat, setLineNewCat] = useState<CategoryKey>('OFF');
  const [lineNewCode, setLineNewCode] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineUnit, setLineUnit] = useState('عدد');
  const [linePrice, setLinePrice] = useState('0');
  const [lineTaxable, setLineTaxable] = useState<boolean>(true);
  const [lineTaxRate, setLineTaxRate] = useState<string>('14');
  const [orderNote, setOrderNote] = useState('');

  // View Details Modal
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

  // Suppliers Modal
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');

  // Recurring Modal
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showAddRecurringModal, setShowAddRecurringModal] = useState(false);
  const [recItemSearch, setRecItemSearch] = useState('');
  const [recPickedItem, setRecPickedItem] = useState<InventoryItem | null>(null);
  const [recQty, setRecQty] = useState('1');
  const [recUnit, setRecUnit] = useState('عدد');
  const [recPrice, setRecPrice] = useState('0');
  const [recSupplier, setRecSupplier] = useState('');
  const [recFreqDays, setRecFreqDays] = useState('7');

  const totalAllProc = useMemo(() => proc.reduce((a, o) => a + orderTotal(o), 0), [proc]);
  const dueRecurring = useMemo(() => recurring.filter((r) => r.nextDue && r.nextDue <= isoToday()), [recurring]);

  // Orders Filter States
  const [procDateFilter, setProcDateFilter] = useState<DateFilterValue>({
    preset: 'all',
    startDate: '',
    endDate: ''
  });
  const [procStatusFilter, setProcStatusFilter] = useState<string>('all');
  const [procSupplierFilter, setProcSupplierFilter] = useState<string>('all');
  const [procSearchQuery, setProcSearchQuery] = useState<string>('');

  // Filtered Orders Calculation
  const filteredOrders = useMemo(() => {
    return proc.filter((o) => {
      // 1. Date Filter
      if (procDateFilter.preset !== 'all' || procDateFilter.startDate || procDateFilter.endDate) {
        const orderDate = o.isoDate || o.date;
        if (!isDateInRange(orderDate, procDateFilter.startDate, procDateFilter.endDate)) {
          return false;
        }
      }

      // 2. Status Filter
      if (procStatusFilter !== 'all' && o.status !== procStatusFilter) {
        return false;
      }

      // 3. Supplier Filter
      if (procSupplierFilter !== 'all' && o.supplier !== procSupplierFilter) {
        return false;
      }

      // 4. Search Query
      if (procSearchQuery) {
        const q = procSearchQuery.toLowerCase();
        const matchId = o.id.toLowerCase().includes(q);
        const matchSup = (o.supplier || '').toLowerCase().includes(q);
        const matchInv = (o.invoiceNumber || '').toLowerCase().includes(q);
        const matchLines = (o.lines || []).some((l) => l.itemName.toLowerCase().includes(q));
        if (!matchId && !matchSup && !matchInv && !matchLines) {
          return false;
        }
      }

      return true;
    });
  }, [proc, procDateFilter, procStatusFilter, procSupplierFilter, procSearchQuery]);

  const filteredOrdersTotal = useMemo(() => {
    return filteredOrders.reduce((a, o) => a + orderTotal(o), 0);
  }, [filteredOrders]);

  // Suppliers filter
  const matchingSuppliers = suppliers.filter((s) => !procSupplierSearch || s.name.includes(procSupplierSearch));

  // Items filter for order
  const matchingItems = items.filter(
    (it) =>
      !procItemSearch ||
      it.name.includes(procItemSearch) ||
      it.code.toLowerCase().includes(procItemSearch.toLowerCase())
  ).slice(0, 20);

  const handleOpenAddOrder = () => {
    setEditingOrder(null);
    setProcCart([]);
    setProcPickedSupplier(null);
    setProcSupplierSearch('');
    setProcPickedItem(null);
    setProcItemSearch('');
    setLineNewName('');
    setLineNewCat('OFF');
    setLineNewCode(getNextItemCode('OFF', items));
    setLineQty('1');
    setLineUnit('عدد');
    setLinePrice('0');
    setOrderDateIso(isoToday());
    setOrderHasTax(false);
    setOrderTaxRate('14');
    setLineTaxable(false);
    setLineTaxRate('14');
    setOrderNote('');
    setOrderInvoiceNumber('');
    setOrderShippingCost('0');
    setShowAddModal(true);
  };

  const handleOpenEditOrder = (order: PurchaseOrder) => {
    if (order.status === 'مكتمل' && !isMgr) {
      showToast('⚠️ أمر الشراء مكتمل وتم توريده للمخزن بالفعل. التعديل متاح فقط للمدير العام للحفاظ على سلامة المخزون.');
      return;
    }

    setEditingOrder(order);
    const existingSup = suppliers.find(
      (s) => s.id === order.supplierId || normName(s.name) === normName(order.supplier)
    );
    setProcPickedSupplier(existingSup || null);
    setProcSupplierSearch(order.supplier || '');
    setProcPickedItem(null);
    setProcItemSearch('');
    setLineNewName('');
    setLineNewCat('OFF');
    setLineNewCode(getNextItemCode('OFF', items));
    setLineQty('1');
    setLineUnit('عدد');
    setLinePrice('0');
    setOrderDateIso(order.isoDate || isoToday());

    const hasTaxVal = order.hasTax !== undefined ? order.hasTax : (order.lines || []).some((l) => l.taxable);
    setOrderHasTax(hasTaxVal);
    const taxRateVal = order.taxRate !== undefined ? String(order.taxRate) : '14';
    setOrderTaxRate(taxRateVal);
    setLineTaxable(hasTaxVal);
    setLineTaxRate(taxRateVal);
    setOrderNote(order.note || '');
    setOrderInvoiceNumber(order.invoiceNumber || '');
    setOrderShippingCost(order.shippingCost !== undefined ? String(order.shippingCost) : '0');

    // Map existing lines
    const mappedLines: PurchaseOrderLine[] = (order.lines || []).map((l) => ({
      ...l,
      taxable: l.taxable !== undefined ? l.taxable : hasTaxVal,
      taxRate: l.taxRate !== undefined ? l.taxRate : parseFloat(taxRateVal) || 14
    }));
    setProcCart(mappedLines);
    setShowAddModal(true);
  };

  const handleToggleLineTax = (index: number) => {
    setProcCart((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        const nextTaxable = !line.taxable;
        return {
          ...line,
          taxable: nextTaxable,
          taxRate: line.taxRate !== undefined ? line.taxRate : (parseFloat(orderTaxRate) || 14)
        };
      })
    );
  };

  const handleApplyTaxToAllCart = (taxable: boolean) => {
    const rate = parseFloat(orderTaxRate) || 14;
    setProcCart((prev) =>
      prev.map((l) => ({
        ...l,
        taxable,
        taxRate: l.taxRate !== undefined ? l.taxRate : rate
      }))
    );
    showToast(taxable ? 'تم تفعيل الضريبة على كافة الأصناف بالسلة' : 'تم إعفاء كافة الأصناف بالسلة من الضريبة');
  };

  const handleAddLineToCart = () => {
    const q = parseFloat(lineQty) || 1;
    const p = parseFloat(linePrice) || 0;
    const u = lineUnit.trim() || 'عدد';
    const isTax = orderHasTax ? lineTaxable : lineTaxable;
    const itemTaxRate = parseFloat(lineTaxRate) || parseFloat(orderTaxRate) || 14;

    if (procItemMode === 'existing') {
      if (!procPickedItem) {
        showToast('يرجى اختيار صنف من القائمة أولاً');
        return;
      }
      const newLine: PurchaseOrderLine = {
        id: uid(),
        itemId: procPickedItem.id,
        itemName: procPickedItem.name,
        cat: procPickedItem.cat,
        code: procPickedItem.code,
        unit: u,
        qty: q,
        price: p,
        isNewItem: false,
        taxable: isTax,
        taxRate: itemTaxRate
      };
      setProcCart([...procCart, newLine]);
      setProcPickedItem(null);
      setProcItemSearch('');
      showToast('تمت إضافة الصنف للأمر ✓');
    } else {
      if (!lineNewName.trim()) {
        showToast('يرجى كتابة اسم الصنف الجديد');
        return;
      }
      
      const cartNames = procCart.map((l) => l.itemName);
      if (isDuplicateItemName(lineNewName, items, cartNames)) {
        showToast(`⚠️ هذا الصنف [${lineNewName.trim()}] موجود بالفعل في المخازن أو في قائمة الطلب الحالية لمنع التكرار`);
        return;
      }

      const cartCodes = procCart.map((l) => l.code || '').filter(Boolean);
      let codeToUse = lineNewCode.trim();

      // Ensure code is not duplicated
      if (codeToUse && isDuplicateItemCode(codeToUse, items, cartCodes)) {
        const nextSafeCode = getNextItemCode(lineNewCat, items, cartCodes);
        showToast(`⚠️ الكود [${codeToUse}] مستخدم بالفعل. تم اختيار الكود التالي المتاح [${nextSafeCode}] لمنع التكرار`);
        codeToUse = nextSafeCode;
      } else if (!codeToUse) {
        codeToUse = getNextItemCode(lineNewCat, items, cartCodes);
      }

      const newLine: PurchaseOrderLine = {
        id: uid(),
        itemId: null,
        itemName: lineNewName.trim(),
        cat: lineNewCat,
        code: codeToUse,
        unit: u,
        qty: q,
        price: p,
        isNewItem: true,
        newMin: 5,
        taxable: isTax,
        taxRate: itemTaxRate
      };
      const updatedCart = [...procCart, newLine];
      setProcCart(updatedCart);
      setLineNewName('');
      // Prepare next sequential code in the same category automatically
      const nextCartCodes = updatedCart.map((l) => l.code || '').filter(Boolean);
      setLineNewCode(getNextItemCode(lineNewCat, items, nextCartCodes));
      showToast(`تمت إضافة الصنف الجديد بالكود [${codeToUse}] ✓`);
    }
  };

  const handleRemoveCartLine = (index: number) => {
    setProcCart(procCart.filter((_, i) => i !== index));
  };

  const handleCreateSupplierQuick = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = suppliers.find((s) => normName(s.name) === normName(trimmed));
    if (existing) {
      setProcPickedSupplier(existing);
      setProcSupplierSearch(existing.name);
      return;
    }
    const newSup: Supplier = { id: uid(), name: trimmed };
    onSaveSuppliers([...suppliers, newSup]);
    setProcPickedSupplier(newSup);
    setProcSupplierSearch(trimmed);
    showToast('تم حفظ المورد الجديد ✓');
  };

  const handleSubmitProcOrder = () => {
    if (!procCart.length) {
      showToast('يرجى إضافة صنف واحد على الأقل قبل الحفظ');
      return;
    }

    const supplierName = procPickedSupplier ? procPickedSupplier.name : procSupplierSearch.trim() || 'غير محدد';
    const hasTax = orderHasTax;
    const taxRate = parseFloat(orderTaxRate) || 14;

    let formattedDate = today();
    if (orderDateIso) {
      try {
        const dObj = new Date(orderDateIso + 'T12:00:00');
        if (!isNaN(dObj.getTime())) {
          formattedDate = dObj.toLocaleDateString('ar-EG');
        }
      } catch {
        formattedDate = today();
      }
    }

    const sub = orderSubtotal({ lines: procCart });
    const tax = orderTaxTotal({ lines: procCart, hasTax, taxRate });
    const shipping = Math.max(0, parseFloat(orderShippingCost) || 0);
    const grand = Math.round((sub + tax + shipping) * 100) / 100;

    if (editingOrder) {
      if (editingOrder.status === 'مكتمل' && !isMgr) {
        showToast('⚠️ لا يمكن تعديل أمر شراء مكتمل إلا بصلاحية المدير العام.');
        return;
      }

      const updatedOrder: PurchaseOrder = {
        ...editingOrder,
        supplierId: procPickedSupplier ? procPickedSupplier.id : null,
        supplier: supplierName,
        date: formattedDate,
        isoDate: orderDateIso,
        hasTax,
        taxRate,
        shippingCost: shipping,
        subtotal: sub,
        taxTotal: tax,
        totalAmount: grand,
        note: orderNote.trim() || undefined,
        invoiceNumber: orderInvoiceNumber.trim() || undefined,
        lines: procCart
      };

      const updatedProc = proc.map((o) => (o.id === editingOrder.id ? updatedOrder : o));
      onSaveProc(updatedProc);

      if (selectedOrder && selectedOrder.id === editingOrder.id) {
        setSelectedOrder(updatedOrder);
      }

      setShowAddModal(false);
      setEditingOrder(null);
      showToast(`تم حفظ وتحديث أمر الشراء ${updatedOrder.id} بنجاح ✓`);
    } else {
      const orderId = getNextDocumentSequence('PO');
      const newOrder: PurchaseOrder = {
        id: orderId,
        orderNumber: orderId,
        supplierId: procPickedSupplier ? procPickedSupplier.id : null,
        supplier: supplierName,
        date: formattedDate,
        isoDate: orderDateIso,
        status: 'قيد التنفيذ',
        hasTax,
        taxRate,
        shippingCost: shipping,
        subtotal: sub,
        taxTotal: tax,
        totalAmount: grand,
        note: orderNote.trim() || undefined,
        invoiceNumber: orderInvoiceNumber.trim() || undefined,
        by: isMgr ? 'المدير' : currentRole === 'purchase' ? 'المشتريات' : 'مسؤول',
        lines: procCart
      };

      onSaveProc([newOrder, ...proc]);
      setShowAddModal(false);
      showToast(`تم إنشاء أمر الشراء بنجاح برقم تسلسلي [${newOrder.id}] ✓`);
    }
  };

  const handleSetOrderStatus = (orderId: string, status: 'مكتمل' | 'ملغي') => {
    const o = proc.find((x) => x.id === orderId);
    if (!o) return;

    if (o.status === 'مكتمل') {
      showToast('⚠️ أمر الشراء مستلم ومورد للمخزن مسبقاً بالفعل منعاً للتكرار');
      return;
    }

    const receiverTitle = isMgr ? 'المدير' : (currentRole === 'warehouse' || currentRole === 'inventory') ? 'أمين المخزن' : 'مسؤول المشتريات';

    let grnSequence = '';
    if (status === 'مكتمل') {
      let updatedItems = [...items];
      const newMoves: StockMove[] = [];
      const newCreatedItems: InventoryItem[] = [];
      grnSequence = getNextDocumentSequence('GRN');

      (o.lines || []).forEach((l, idx) => {
        // Find existing item by id OR by name
        let it = updatedItems.find(
          (i) => (l.itemId && i.id === l.itemId) || normName(i.name) === normName(l.itemName)
        );

        if (!it) {
          // Create new item in inventory with the specified/generated code
          const code = (l.code && l.code.trim()) || getNextItemCode(l.cat, updatedItems);
          it = {
            id: l.itemId || uid(),
            code,
            name: l.itemName.trim(),
            cat: l.cat,
            unit: l.unit || 'عدد',
            balance: 0, // Balance will be incremented by handleSaveMoves
            min: l.newMin || 5,
            cost: l.price || 0,
            loc: l.cat === 'BUFF' ? 'بوفيه المركز' : l.cat === 'CLN' ? 'مخزن النظافة' : 'المخزن الرئيسي'
          };
          updatedItems.push(it);
          newCreatedItems.push(it);
        }

        // Link item id to order line
        l.itemId = it.id;

        if (l.price > 0) {
          it.cost = l.price;
        }
        if (!it.code || it.code.trim() === '') {
          it.code = l.code || getNextItemCode(it.cat, updatedItems);
        }

        // Record incoming stock movement with UNIQUE ID and common GRN Sequence
        const moveUniqueId = `${grnSequence}_${idx + 1}_${uid().slice(0, 5)}`;
        newMoves.push({
          id: moveUniqueId,
          voucherNo: grnSequence,
          docType: 'GRN',
          itemId: it.id,
          itemName: it.name,
          code: it.code,
          cat: it.cat,
          type: 'in',
          qty: l.qty,
          cost: +(l.qty * l.price).toFixed(2),
          person: o.supplier || 'المورد',
          note: `استلام وتوريد بموجب إذن [${grnSequence}] من أمر شراء [${o.id}]`,
          date: today(),
          ts: Date.now() + idx,
          by: receiverTitle
        });
      });

      // Pass updated items list to onSaveMoves so it safely increments balances without duplicate overwrite
      if (typeof onSaveMoves === 'function') {
        onSaveMoves([...newMoves, ...moves], updatedItems);
      }
    }

    const updatedProc = proc.map((x) =>
      x.id === orderId
        ? {
            ...x,
            status,
            receivedDate: status === 'مكتمل' ? today() : x.receivedDate,
            receivedBy: status === 'مكتمل' ? receiverTitle : x.receivedBy
          }
        : x
    );
    onSaveProc(updatedProc);

    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder(updatedProc.find((x) => x.id === orderId) || null);
    }

    if (status === 'مكتمل') {
      showToast(`تم استلام أمر الشراء وتوريد الأصناف بنجاح للمخزن بإذن [${grnSequence}] بواسطة (${receiverTitle}) ✓`);
    } else {
      showToast('تم إلغاء أمر الشراء');
    }
  };

  const handleDeleteProc = (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الأمر نهائياً؟')) return;
    onSaveProc(proc.filter((o) => o.id !== id));
    showToast('تم حذف أمر الشراء');
  };

  const handleOrderRecurringNow = (recId: string) => {
    const r = recurring.find((x) => x.id === recId);
    if (!r) return;

    const orderId = getNextDocumentSequence('PO');
    const newOrder: PurchaseOrder = {
      id: orderId,
      orderNumber: orderId,
      supplierId: null,
      supplier: r.supplier || 'غير محدد',
      date: today(),
      isoDate: isoToday(),
      status: 'قيد التنفيذ',
      note: `من قالب الشراء الدوري: ${r.itemName}`,
      by: isMgr ? 'المدير' : 'المشتريات',
      lines: [
        {
          id: uid(),
          itemId: r.itemId,
          itemName: r.itemName,
          cat: r.cat,
          unit: r.unit,
          qty: r.qty,
          price: r.price,
          isNewItem: false
        }
      ]
    };

    onSaveProc([newOrder, ...proc]);

    const updatedRecurring = recurring.map((x) =>
      x.id === recId
        ? {
            ...x,
            lastOrdered: isoToday(),
            nextDue: isoPlusDays(x.freqDays)
          }
        : x
    );
    onSaveRecurring(updatedRecurring);
    showToast(`تم إنشاء أمر الشراء الدوري [${orderId}] ✓ يرجى مراجعته وتأكيده`);
  };

  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">🧾 المشتريات</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {proc.length} أمر شراء — إجمالي المشتريات:{' '}
            <strong className="font-mono text-[#075073] font-bold">{totalAllProc.toLocaleString('ar-EG')} ج.م</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMgr && (
            <button
              onClick={() => onExportCSV('proc')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير Excel</span>
            </button>
          )}
          <button
            onClick={() => setShowSuppliersModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-sm transition-all cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>الموردين ({suppliers.length})</span>
          </button>
          <button
            onClick={() => setShowRecurringModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-sm transition-all cursor-pointer"
          >
            <Repeat className="w-3.5 h-3.5 text-amber-600" />
            <span>المشتريات الدورية ({recurring.length})</span>
          </button>
          {isMgr && (
            <button
              onClick={() => onOpenExcelImport('proc')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-sm transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>استيراد Excel</span>
            </button>
          )}
          <button
            onClick={handleOpenAddOrder}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ أمر شراء جديد</span>
          </button>
        </div>
      </div>

      {/* Due Recurring Reminder */}
      {dueRecurring.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-300 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-black text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>مشتريات دورية مستحقة الطلب الآن ({dueRecurring.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {dueRecurring.map((r) => (
              <div
                key={r.id}
                className="bg-white p-3 rounded-lg border border-amber-200/80 flex items-center justify-between shadow-2xs"
              >
                <div>
                  <div className="text-xs font-bold text-stone-900">{r.itemName}</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    {r.qty} {r.unit} · {r.price} ج.م · {r.supplier || 'بدون مورد'}
                  </div>
                </div>
                <button
                  onClick={() => handleOrderRecurringNow(r.id)}
                  className="px-2.5 py-1 rounded-md bg-[#c9920a] hover:bg-[#b07f08] text-white text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <ShoppingCart className="w-3 h-3" />
                  <span>اطلب</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders Filter & Date Controls */}
      <div className="space-y-3">
        <DateFilterBar
          value={procDateFilter}
          onChange={setProcDateFilter}
          label="فلترة تاريخ أوامر الشراء"
        />

        <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {/* Search */}
            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <input
                type="text"
                value={procSearchQuery}
                onChange={(e) => setProcSearchQuery(e.target.value)}
                placeholder="بحث برقم الأمر، المورد، الفاتورة، الصنف..."
                className="w-full py-1.5 px-3 rounded-lg border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
              />
              {procSearchQuery && (
                <button
                  type="button"
                  onClick={() => setProcSearchQuery('')}
                  className="absolute left-2 top-2 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-stone-500">الحالة:</span>
              <select
                value={procStatusFilter}
                onChange={(e) => setProcStatusFilter(e.target.value)}
                className="py-1.5 px-2.5 rounded-lg border border-stone-200 text-xs font-bold text-stone-700 focus:outline-none cursor-pointer"
              >
                <option value="all">كل الحالات ({proc.length})</option>
                <option value="مكتمل">مكتمل ومستلم ({proc.filter((p) => p.status === 'مكتمل').length})</option>
                <option value="قيد التنفيذ">قيد التنفيذ ({proc.filter((p) => p.status === 'قيد التنفيذ').length})</option>
                <option value="ملغي">ملغي ({proc.filter((p) => p.status === 'ملغي').length})</option>
              </select>
            </div>

            {/* Supplier Filter */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-stone-500">المورد:</span>
              <select
                value={procSupplierFilter}
                onChange={(e) => setProcSupplierFilter(e.target.value)}
                className="py-1.5 px-2.5 rounded-lg border border-stone-200 text-xs font-bold text-stone-700 focus:outline-none cursor-pointer max-w-[180px]"
              >
                <option value="all">كل الموردين</option>
                {Array.from(new Set(proc.map((p) => p.supplier).filter(Boolean))).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results Summary */}
          <div className="text-xs text-stone-500 flex items-center gap-2">
            <span>المعروض: <strong className="text-[#075073] font-mono">{filteredOrders.length}</strong> أمر</span>
            <span>·</span>
            <span>الإجمالي: <strong className="text-emerald-700 font-mono font-bold">{filteredOrdersTotal.toLocaleString('ar-EG')} ج.م</strong></span>
          </div>
        </div>
      </div>

      {/* Purchase Orders Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#f4efe2] text-[#075073] border-b border-stone-200 font-bold">
              <tr>
                <th className="py-3 px-3.5">رقم الأمر</th>
                <th className="py-3 px-3.5">المورد</th>
                <th className="py-3 px-3.5">الأصناف</th>
                <th className="py-3 px-3.5">الإجمالي</th>
                <th className="py-3 px-3.5">الحالة</th>
                <th className="py-3 px-3.5">التاريخ</th>
                <th className="py-3 px-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((o) => {
                const total = orderTotal(o);
                const tax = orderTaxTotal(o);
                const isDone = o.status === 'مكتمل';
                const isCancelled = o.status === 'ملغي';
                return (
                  <tr key={o.id} className="hover:bg-[#fbf8f1] transition-colors">
                    <td className="py-3 px-3.5">
                      <DocumentSequenceBadge code={o.id} type="PO" size="sm" onPrint={() => setSelectedOrder(o)} />
                    </td>
                    <td className="py-3 px-3.5 font-bold text-stone-900">{o.supplier || '—'}</td>
                    <td className="py-3 px-3.5 text-stone-600 font-mono">
                      <div>{(o.lines || []).length} صنف</div>
                      {tax > 0 && (
                        <span className="text-[10px] text-emerald-700 font-sans font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          شامل ضريبة ({o.taxRate !== undefined ? o.taxRate : 14}%)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 font-mono font-bold text-stone-900">
                      <div>{total.toLocaleString('ar-EG')} ج.م</div>
                      {tax > 0 && (
                        <div className="text-[10px] text-stone-400 font-sans font-normal">
                          (الضريبة: +{tax.toLocaleString('ar-EG')})
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          isDone
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isCancelled
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-stone-500 font-mono text-[11px]">{o.date}</td>
                    <td className="py-3 px-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => setSelectedOrder(o)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>التفاصيل</span>
                        </button>
                        {o.status === 'مكتمل' ? (
                          <span
                            className="px-2 py-1 rounded-lg text-[10.5px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 flex items-center gap-1"
                            title={`تم الاستلام والتوريد للمخزن بواسطة: ${o.receivedBy || 'أمين المخزن'} بتاريخ ${o.receivedDate || o.date}`}
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>مستلم ({o.receivedBy || 'المخازن'})</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenEditOrder(o)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="تعديل أمر الشراء (الأصناف، التاريخ، الضريبة، المورد، الشحن)"
                          >
                            <Edit2 className="w-3 h-3 text-amber-700" />
                            <span>تعديل</span>
                          </button>
                        )}
                        {(isMgr || currentRole === 'warehouse' || currentRole === 'inventory') && o.status === 'قيد التنفيذ' && (
                          <>
                            <button
                              onClick={() => handleSetOrderStatus(o.id, 'مكتمل')}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="استلام وتوريد الأصناف وتحديث الأرصدة بالمخزن فوراً"
                            >
                              <Check className="w-3 h-3 text-white" />
                              <span>استلام المخزن (مكتمل)</span>
                            </button>
                            <button
                              onClick={() => handleSetOrderStatus(o.id, 'ملغي')}
                              className="px-2 py-1 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer"
                              title="إلغاء أمر الشراء"
                            >
                              إلغاء
                            </button>
                          </>
                        )}
                        {isMgr && (
                          <button
                            onClick={() => handleDeleteProc(o.id)}
                            className="p-1 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                            title="حذف الأمر"
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
                <td colSpan={7} className="py-8 text-center text-stone-400">
                  لا توجد أوامر شراء مطابقة لمعايير البحث والتاريخ الحالية
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      {/* Info Tip */}
      <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-xl text-xs text-stone-600 leading-relaxed">
        💡 <strong>معلومة:</strong> أمر الشراء يتيح لك إضافة أصناف متعددة معاً. عند تحويل حالة الأمر إلى &quot;مكتمل&quot;،
        تُضاف جميع الأصناف تلقائياً لأرصدة المخزون في أقسامها وتُحدّث تكلفتها — مما يظهر في تقارير التكاليف والأداء.
      </div>

      {/* Add / Edit Purchase Order Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">
                  {editingOrder ? `✏️ تعديل أمر الشراء #${editingOrder.id.slice(-5)}` : '+ أمر شراء جديد (متعدد الأصناف)'}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  {editingOrder
                    ? 'تعديل التاريخ، المورد، الأصناف، الأسعار وخيارات الضريبة لأمر الشراء'
                    : 'تسجيل طلب شراء مع إمكانية تحديد الضريبة ونسبتها لكل صنف بشكل مستقل'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingOrder(null);
                }}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              {/* Supplier & Order Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Supplier Selection */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">المورد</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={procSupplierSearch}
                      onChange={(e) => {
                        setProcSupplierSearch(e.target.value);
                        setProcPickedSupplier(null);
                      }}
                      placeholder="ابحث عن مورد أو اكتب اسماً جديداً..."
                      className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                    />
                  </div>
                  {procSupplierSearch && !procPickedSupplier && (
                    <div className="mt-1.5 max-h-28 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100 bg-white shadow-xs">
                      {matchingSuppliers.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setProcPickedSupplier(s);
                            setProcSupplierSearch(s.name);
                          }}
                          className="w-full text-right p-2 text-xs hover:bg-stone-50 font-medium text-stone-800"
                        >
                          🏢 {s.name}
                        </button>
                      ))}
                      {!suppliers.some((s) => normName(s.name) === normName(procSupplierSearch)) && (
                        <button
                          type="button"
                          onClick={() => handleCreateSupplierQuick(procSupplierSearch)}
                          className="w-full text-right p-2 text-xs hover:bg-amber-50 text-[#075073] font-bold"
                        >
                          + إضافة &quot;{procSupplierSearch}&quot; كمورد جديد
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Order Date Picker */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-stone-500" />
                    <span>تاريخ أمر الشراء</span>
                  </label>
                  <input
                    type="date"
                    value={orderDateIso}
                    onChange={(e) => setOrderDateIso(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold font-mono bg-white focus:border-[#075073] focus:outline-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Order Tax Configuration Card */}
              <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={orderHasTax}
                      onChange={(e) => {
                        const chk = e.target.checked;
                        setOrderHasTax(chk);
                        setLineTaxable(chk);
                      }}
                      className="w-4 h-4 text-[#075073] rounded accent-[#075073] cursor-pointer"
                    />
                    <span className="text-xs font-black text-[#075073] flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-amber-700" />
                      <span>تطبيق خيار الضريبة على أمر الشراء (ضريبة القيمة المضافة / مبيعات)</span>
                    </span>
                  </label>

                  {orderHasTax && (
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-amber-200">
                      <span className="text-xs font-bold text-stone-700">نسبة الضريبة:</span>
                      <div className="flex items-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={orderTaxRate}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOrderTaxRate(val);
                            setLineTaxRate(val);
                          }}
                          className="w-14 py-0.5 px-1 rounded border border-amber-300 text-xs font-mono font-bold bg-white text-center focus:outline-none"
                        />
                        <span className="mr-1 text-xs font-bold text-stone-600">%</span>
                      </div>
                      <div className="flex gap-1 mr-1">
                        <button
                          type="button"
                          onClick={() => {
                            setOrderTaxRate('14');
                            setLineTaxRate('14');
                          }}
                          className="px-1.5 py-0.5 rounded bg-stone-100 hover:bg-amber-100 text-[10px] font-bold text-stone-700 cursor-pointer"
                        >
                          14%
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOrderTaxRate('5');
                            setLineTaxRate('5');
                          }}
                          className="px-1.5 py-0.5 rounded bg-stone-100 hover:bg-amber-100 text-[10px] font-bold text-stone-700 cursor-pointer"
                        >
                          5%
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-stone-600 flex-wrap gap-2 pt-1 border-t border-amber-200/50">
                  <span>
                    {orderHasTax
                      ? '💡 الضريبة مفعلة للأمر: يمكنك تحديد أي الأصناف تخضع للضريبة وأيها معفاة أدناه.'
                      : '💡 الضريبة غير مفعلة افتراضياً: يمكنك تحديد أصناف خاضعة بشكل مستقل إذا رغبت.'}
                  </span>
                  {procCart.length > 0 && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleApplyTaxToAllCart(true)}
                        className="text-[10px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        تطبيق الضريبة على كل السلة
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyTaxToAllCart(false)}
                        className="text-[10px] font-bold text-stone-600 bg-stone-200 hover:bg-stone-300 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        إعفاء كل السلة
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Add Item to Cart Section */}
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black text-[#075073]">إضافة صنف إلى أمر الشراء</div>
                  <div className="flex gap-1.5 bg-white p-0.5 rounded-lg border border-stone-200 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setProcItemMode('existing')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        procItemMode === 'existing' ? 'bg-[#075073] text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      صنف موجود
                    </button>
                    <button
                      type="button"
                      onClick={() => setProcItemMode('new')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        procItemMode === 'new' ? 'bg-[#075073] text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      صنف جديد تماماً
                    </button>
                  </div>
                </div>

                {procItemMode === 'existing' ? (
                  <div>
                    <input
                      type="text"
                      value={procItemSearch}
                      onChange={(e) => setProcItemSearch(e.target.value)}
                      placeholder="ابحث عن الصنف بالاسم أو الكود..."
                      className="w-full py-2 px-3 rounded-lg border border-stone-200 text-xs bg-white focus:border-[#075073] focus:outline-none"
                    />
                    {procItemSearch && !procPickedItem && (
                      <div className="mt-1 max-h-28 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100 bg-white shadow-xs">
                        {matchingItems.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => {
                              setProcPickedItem(it);
                              setProcItemSearch(it.name);
                              setLineUnit(it.unit || 'عدد');
                              setLinePrice(String(it.cost || 0));
                            }}
                            className="w-full text-right p-2 text-xs hover:bg-stone-50 text-stone-800 flex justify-between"
                          >
                            <span>{it.name}</span>
                            <span className="font-mono text-stone-400 text-[11px]">{it.code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {procPickedItem && (
                      <div className="mt-1.5 p-2 bg-emerald-50 rounded-lg text-xs font-bold text-emerald-800 flex items-center justify-between">
                        <span>✅ تم اختيار: {procPickedItem.name} ({procPickedItem.code})</span>
                        <button
                          type="button"
                          onClick={() => {
                            setProcPickedItem(null);
                            setProcItemSearch('');
                          }}
                          className="text-stone-400 hover:text-stone-600"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-600 mb-1">اسم الصنف الجديد</label>
                      <input
                        type="text"
                        value={lineNewName}
                        onChange={(e) => setLineNewName(e.target.value)}
                        placeholder="مثال: صابون سائل يدوي"
                        className="w-full py-2 px-3 rounded-lg border border-stone-200 text-xs bg-white focus:border-[#075073] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-600 mb-1">القسم / الفئة</label>
                      <select
                        value={lineNewCat}
                        onChange={(e) => {
                          const newCat = e.target.value as CategoryKey;
                          setLineNewCat(newCat);
                          const currentCartCodes = procCart.map((l) => l.code || '').filter(Boolean);
                          setLineNewCode(getNextItemCode(newCat, items, currentCartCodes));
                        }}
                        className="w-full py-2 px-3 rounded-lg border border-stone-200 text-xs bg-white font-bold text-stone-700 focus:border-[#075073] focus:outline-none"
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
                      <label className="block text-[11px] font-bold text-stone-600 mb-1 flex items-center justify-between">
                        <span>كود الصنف</span>
                        <span className="text-[10px] text-amber-700 font-normal">تلقائي أو مخصص</span>
                      </label>
                      <input
                        type="text"
                        value={lineNewCode}
                        onChange={(e) => setLineNewCode(e.target.value)}
                        placeholder="مثال: CLN-01 أو اكتب بداية الكود"
                        className="w-full py-2 px-3 rounded-lg border border-amber-300 bg-amber-50/40 text-xs font-mono font-bold text-[#075073] focus:border-[#075073] focus:outline-none"
                        title="اكتب كود البداية للقسم إذا أردت تخصيصه، أو دعه يكمل بنفس الوتيرة تلقائياً"
                      />
                    </div>
                  </div>
                )}

                {/* Qty, Unit, Price inputs */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">الكمية</label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={lineQty}
                      onChange={(e) => setLineQty(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-lg border border-stone-200 text-xs font-mono font-bold bg-white focus:border-[#075073] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">الوحدة</label>
                    <input
                      type="text"
                      value={lineUnit}
                      onChange={(e) => setLineUnit(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-lg border border-stone-200 text-xs bg-white focus:border-[#075073] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">سعر الوحدة (ج.م)</label>
                    <input
                      type="number"
                      step="any"
                      value={linePrice}
                      onChange={(e) => setLinePrice(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-lg border border-stone-200 text-xs font-mono font-bold bg-white focus:border-[#075073] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Line Item Tax Option */}
                <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-stone-200 flex-wrap gap-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-stone-800 select-none">
                    <input
                      type="checkbox"
                      checked={lineTaxable}
                      onChange={(e) => setLineTaxable(e.target.checked)}
                      className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                    />
                    <span>هذا الصنف خاضع للضريبة؟</span>
                  </label>
                  {lineTaxable ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-stone-500 font-medium">نسبة الضريبة لهذا الصنف:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={lineTaxRate}
                        onChange={(e) => setLineTaxRate(e.target.value)}
                        className="w-16 py-1 px-2 rounded-lg border border-stone-200 text-xs font-mono font-bold bg-white text-center focus:border-[#075073] focus:outline-none"
                      />
                      <span className="text-stone-700 font-bold">%</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-stone-400 font-medium">معفي من الضريبة (0%)</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAddLineToCart}
                  className="w-full py-2 px-3 rounded-lg bg-[#c9920a] hover:bg-[#b07f08] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة الصنف لسلة الأمر</span>
                </button>
              </div>

              {/* Cart Preview */}
              {procCart.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                    <span>الأصناف المضافة للأمر ({procCart.length}):</span>
                    <span className="text-[11px] text-stone-500 font-normal">اضغط على حالة الضريبة لتبديلها مباشرة</span>
                  </div>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
                    {procCart.map((line, idx) => {
                      const lineBase = line.qty * line.price;
                      const lineTaxRateVal = line.taxRate !== undefined ? line.taxRate : parseFloat(orderTaxRate) || 14;
                      const lineTaxAmt = line.taxable ? lineBase * (lineTaxRateVal / 100) : 0;
                      const lineFinalTotal = lineBase + lineTaxAmt;

                      return (
                        <div key={line.id || idx} className="p-3 bg-white flex items-center justify-between text-xs gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-stone-900">{line.itemName}</span>
                              {line.code && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                  {line.code}
                                </span>
                              )}
                              {line.isNewItem && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  جديد
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleLineTax(idx)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1 select-none ${
                                  line.taxable
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                    : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'
                                }`}
                                title="انقر للتبديل بين خاضع للضريبة ومعفي"
                              >
                                {line.taxable ? (
                                  <>
                                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                                    <span>خاضع ({lineTaxRateVal}%)</span>
                                  </>
                                ) : (
                                  <span>معفي (0%)</span>
                                )}
                              </button>
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5 font-mono">
                              {line.qty} {line.unit} × {line.price.toLocaleString('ar-EG')} ج.م = {lineBase.toLocaleString('ar-EG')} ج.م
                              {line.taxable && (
                                <span className="text-emerald-700 font-sans mr-1">
                                  + ضريبة {lineTaxAmt.toLocaleString('ar-EG')} ج.م = <strong>{lineFinalTotal.toLocaleString('ar-EG')} ج.م</strong>
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCartLine(idx)}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="حذف الصنف من السلة"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Financial Summary Box */}
                  {(() => {
                    const cartSub = orderSubtotal({ lines: procCart });
                    const cartTax = orderTaxTotal({ lines: procCart, hasTax: orderHasTax, taxRate: parseFloat(orderTaxRate) || 14 });
                    const cartShipping = Math.max(0, parseFloat(orderShippingCost) || 0);
                    const cartGrand = Math.round((cartSub + cartTax + cartShipping) * 100) / 100;
                    const taxableCount = procCart.filter((l) => l.taxable).length;
                    const exemptCount = procCart.length - taxableCount;
                    return (
                      <div className="bg-[#faf7f0] p-3.5 rounded-xl border border-stone-200 space-y-2 text-xs shadow-2xs">
                        <div className="flex justify-between text-stone-600 font-medium">
                          <span>المجموع قبل الضريبة (المجموع الفرعي):</span>
                          <span className="font-mono font-bold text-stone-900">{cartSub.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        <div className="flex justify-between text-stone-600 font-medium">
                          <span>
                            إجمالي الضريبة (
                            <strong className="text-emerald-700 font-bold">{taxableCount} صنف خاضع</strong>
                            {exemptCount > 0 && <span className="text-stone-400 font-normal"> · {exemptCount} صنف معفي</span>}
                            ):
                          </span>
                          <span className="font-mono font-bold text-emerald-700">+{cartTax.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        {cartShipping > 0 && (
                          <div className="flex justify-between text-amber-800 font-medium">
                            <span>🚚 مصاريف الشحن والتوصيل:</span>
                            <span className="font-mono font-bold">+{cartShipping.toLocaleString('ar-EG')} ج.م</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-black text-[#075073] pt-2 border-t border-stone-300">
                          <span>الإجمالي النهائي المطلوب:</span>
                          <span className="font-mono text-base">{cartGrand.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Shipping, Invoice Number & Order Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <span>🚚 مصاريف الشحن والنقل (ج.م)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={orderShippingCost}
                    onChange={(e) => setOrderShippingCost(e.target.value)}
                    placeholder="0"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold text-amber-900 bg-white focus:border-[#075073] focus:outline-none"
                  />
                  <span className="text-[10px] text-stone-400 mt-0.5 block">تضاف للإجمالي ولا تخضع للمخزون الفردي</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5 text-stone-500" />
                    <span>رقم فاتورة المورد (اختياري)</span>
                  </label>
                  <input
                    type="text"
                    value={orderInvoiceNumber}
                    onChange={(e) => setOrderInvoiceNumber(e.target.value)}
                    placeholder="مثال: INV-98421"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات على أمر الشراء</label>
                  <textarea
                    rows={2}
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="شروط التسليم، تفاصيل الدفع، ملاحظات..."
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-3 shrink-0 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingOrder(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSubmitProcOrder}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              >
                {editingOrder ? (
                  <>
                    <Edit2 className="w-4 h-4 text-amber-400" />
                    <span>حفظ التعديلات على أمر الشراء</span>
                  </>
                ) : (
                  <span>حفظ أمر الشراء ({procCart.length} صنف)</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-black text-[#075073]">
                    📄 تفاصيل أمر الشراء
                  </h3>
                  <DocumentSequenceBadge code={selectedOrder.id} type="PO" size="sm" />
                </div>
                <p className="text-xs text-stone-500">
                  المورد: <span className="font-bold text-stone-800">{selectedOrder.supplier}</span> · التاريخ: {selectedOrder.date}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
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
                    <th className="p-2.5">القسم</th>
                    <th className="p-2.5">الكمية</th>
                    <th className="p-2.5">السعر</th>
                    <th className="p-2.5">الضريبة</th>
                    <th className="p-2.5">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(selectedOrder.lines || []).map((l) => {
                    const lineBase = l.qty * l.price;
                    const taxRateVal = l.taxRate !== undefined ? l.taxRate : selectedOrder.taxRate !== undefined ? selectedOrder.taxRate : 14;
                    const lineTax = l.taxable ? lineBase * (taxRateVal / 100) : 0;
                    const lineTotal = lineBase + lineTax;

                    return (
                      <tr key={l.id}>
                        <td className="p-2.5 font-bold">
                          {l.itemName}
                          {l.isNewItem && (
                            <span className="mr-1.5 px-1 py-0.2 rounded text-[10px] bg-blue-50 text-blue-700">
                              جديد
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-stone-600">{CATEGORIES[l.cat]?.n || l.cat}</td>
                        <td className="p-2.5 font-mono">
                          {l.qty} {l.unit}
                        </td>
                        <td className="p-2.5 font-mono">{l.price.toLocaleString('ar-EG')}</td>
                        <td className="p-2.5">
                          {l.taxable ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                              خاضع ({taxRateVal}%)
                            </span>
                          ) : (
                            <span className="text-[10px] text-stone-400 font-medium">معفي (0%)</span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono font-bold">
                          <div>{lineTotal.toLocaleString('ar-EG')} ج.م</div>
                          {l.taxable && (
                            <div className="text-[10px] text-stone-400 font-sans font-normal">
                              (أساسي: {lineBase.toLocaleString('ar-EG')})
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            {(() => {
              const sub = orderSubtotal(selectedOrder);
              const tax = orderTaxTotal(selectedOrder);
              const shipping = selectedOrder.shippingCost || 0;
              const total = orderTotal(selectedOrder);
              return (
                <div className="p-3 bg-[#faf7f0] rounded-xl border border-stone-200 space-y-1.5 text-xs">
                  <div className="flex justify-between text-stone-600">
                    <span>المجموع الفرعي (قبل الضريبة):</span>
                    <span className="font-mono font-bold text-stone-900">{sub.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  {tax > 0 && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>إجمالي الضريبة المضافة:</span>
                      <span className="font-mono font-bold">+{tax.toLocaleString('ar-EG')} ج.م</span>
                    </div>
                  )}
                  {shipping > 0 && (
                    <div className="flex justify-between text-amber-800 font-medium">
                      <span>🚚 مصاريف الشحن والتوصيل:</span>
                      <span className="font-mono font-bold">+{shipping.toLocaleString('ar-EG')} ج.م</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-[#075073] pt-1.5 border-t border-stone-300">
                    <span>الإجمالي الكلي:</span>
                    <span className="font-mono text-base">{total.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                </div>
              );
            })()}

            {selectedOrder.note && (
              <div className="p-2.5 bg-stone-50 rounded-lg text-xs text-stone-600">
                📝 <strong>ملاحظات الطلب:</strong> {selectedOrder.note}
              </div>
            )}

            {selectedOrder.receivedDate && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <div className="font-bold flex items-center gap-1 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>تم استلام وتوريد الطلب بالمخزن بنجاح</span>
                </div>
                <div className="text-[11px]">
                  بواسطة: <strong>{selectedOrder.receivedBy || 'أمين المخزن'}</strong> بتاريخ: {selectedOrder.receivedDate}
                </div>
                {selectedOrder.invoiceNumber && (
                  <div className="text-[11px]">
                    رقم فاتورة المورد: <strong className="font-mono">{selectedOrder.invoiceNumber}</strong>
                  </div>
                )}
                {selectedOrder.receiptNote && (
                  <div className="text-[11px]">
                    ملاحظات الاستلام: {selectedOrder.receiptNote}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons inside modal */}
            <div className="flex gap-2 pt-2 shrink-0 flex-wrap">
              {selectedOrder.status === 'مكتمل' && !isMgr ? (
                <div className="py-2 px-3 rounded-xl text-xs font-bold text-stone-500 bg-stone-100 border border-stone-200 flex items-center gap-1.5 cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5 text-stone-400" />
                  <span>تم الاستلام — التعديل متاح للمدير العام فقط</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const ord = selectedOrder;
                    setSelectedOrder(null);
                    handleOpenEditOrder(ord);
                  }}
                  className="py-2.5 px-4 rounded-xl text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  title={selectedOrder.status === 'مكتمل' ? 'تعديل أمر الشراء المستلم (صلاحية المدير العام)' : 'تعديل بيانات أمر الشراء أو الأصناف أو الضريبة أو الشحن'}
                >
                  <Edit2 className="w-4 h-4 text-amber-700" />
                  <span>{selectedOrder.status === 'مكتمل' ? 'تعديل أمر الشراء (المدير العام)' : 'تعديل أمر الشراء'}</span>
                </button>
              )}
              {(isMgr || currentRole === 'warehouse' || currentRole === 'inventory') && selectedOrder.status === 'قيد التنفيذ' && (
                <button
                  type="button"
                  onClick={() => handleSetOrderStatus(selectedOrder.id, 'مكتمل')}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>استلام وتوريد الأصناف للمخزن (مكتمل)</span>
                </button>
              )}
              {onPrintVoucher && (
                <button
                  type="button"
                  onClick={() => {
                    const sub = orderSubtotal(selectedOrder);
                    const tax = orderTaxTotal(selectedOrder);
                    onPrintVoucher({
                      title: selectedOrder.status === 'مكتمل' ? 'إذن استلام وتوريد مخزني (معتمد)' : 'أمر شراء بضاعة ومستلزمات',
                      subtitle: `أمر شراء [${selectedOrder.id}]${selectedOrder.invoiceNumber ? ` | فاتورة #${selectedOrder.invoiceNumber}` : ''}${tax > 0 ? ` (شامل ضريبة ${tax.toLocaleString('ar-EG')} ج.م)` : ''}`,
                      voucherNumber: selectedOrder.id,
                      date: selectedOrder.receivedDate || selectedOrder.date,
                      department: 'المشتريات والمخازن',
                      person: selectedOrder.supplier || 'المورد',
                      by: selectedOrder.receivedBy || selectedOrder.by || 'مسؤول المشتريات',
                      notes: [
                        selectedOrder.receiptNote || selectedOrder.note,
                        tax > 0 ? `المجموع قبل الضريبة: ${sub.toLocaleString('ar-EG')} ج.م | الضريبة: ${tax.toLocaleString('ar-EG')} ج.م` : ''
                      ].filter(Boolean).join(' | '),
                      totalCost: orderTotal(selectedOrder),
                      items: (selectedOrder.lines || []).map((l) => ({
                        name: `${l.itemName}${l.taxable ? ' (خاضع للضريبة)' : ''}`,
                        unit: l.unit,
                        qty: l.qty,
                        price: l.price,
                        total: l.qty * l.price
                      }))
                    });
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-[#075073] bg-stone-100 hover:bg-stone-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الإذن / الفاتورة</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suppliers Modal */}
      {showSuppliersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">🏢 سجل الموردين</h3>
                <p className="text-xs text-stone-500 mt-0.5">قائمة الموردين المعتمدين وإجمالي التعاملات</p>
              </div>
              <button
                onClick={() => setShowSuppliersModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 shrink-0">
              <input
                type="text"
                placeholder="اسم مورد جديد..."
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                className="flex-1 py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newSupplierName.trim()) return;
                  handleCreateSupplierQuick(newSupplierName);
                  setNewSupplierName('');
                }}
                className="py-2 px-3 rounded-xl bg-[#075073] hover:bg-[#03151F] text-white text-xs font-bold transition-all cursor-pointer"
              >
                + إضافة
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-stone-100 border border-stone-200 rounded-xl">
              {suppliers.map((s) => {
                const totalSpend = proc
                  .filter((o) => (o.supplierId === s.id || normName(o.supplier) === normName(s.name)) && o.status === 'مكتمل')
                  .reduce((a, o) => a + orderTotal(o), 0);

                return (
                  <div key={s.id} className="p-3 flex items-center justify-between hover:bg-stone-50 text-xs">
                    <div>
                      <div className="font-bold text-stone-900">{s.name}</div>
                      <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                        إجمالي المشتريات المكتملة: {totalSpend.toLocaleString('ar-EG')} ج.م
                      </div>
                    </div>
                    {isMgr && (
                      <button
                        onClick={() => {
                          if (!window.confirm('حذف المورد؟')) return;
                          onSaveSuppliers(suppliers.filter((x) => x.id !== s.id));
                        }}
                        className="p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              {suppliers.length === 0 && (
                <div className="p-4 text-center text-stone-400 text-xs">لا يوجد موردون مسجلون</div>
              )}
            </div>

            <div className="pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSuppliersModal(false)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recurring Purchases Modal */}
      {showRecurringModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-amber-600 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-[#075073]">🔁 قوالب المشتريات الدورية</h3>
                <p className="text-xs text-stone-500 mt-0.5">تذكير بالأصناف الدورية والطلب بضغطة واحدة</p>
              </div>
              <button
                onClick={() => setShowRecurringModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setShowAddRecurringModal(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-[#075073] hover:bg-[#03151F] text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة قالب شراء دوري جديد</span>
            </button>

            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {recurring.map((r) => {
                const isDue = r.nextDue && r.nextDue <= isoToday();
                return (
                  <div
                    key={r.id}
                    className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900">{r.itemName}</span>
                        {isDue ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            مستحق الآن
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-200 text-stone-600">
                            غير مستحق
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-500 mt-1 font-mono space-x-2 space-x-reverse">
                        <span>📦 {r.qty} {r.unit}</span>
                        <span>💰 {r.price} ج.م</span>
                        <span>🔁 {r.freq}</span>
                        <span>🏢 {r.supplier || 'بدون مورد'}</span>
                        {r.nextDue && <span>📅 القادم: {r.nextDue}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleOrderRecurringNow(r.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#c9920a] hover:bg-[#b07f08] text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>اطلب الآن</span>
                      </button>
                      <button
                        onClick={() => {
                          if (!window.confirm('حذف القالب؟')) return;
                          onSaveRecurring(recurring.filter((x) => x.id !== r.id));
                        }}
                        className="p-1.5 text-stone-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {recurring.length === 0 && (
                <div className="p-6 text-center text-stone-400 text-xs">لا توجد قوالب شراء دورية حتى الآن</div>
              )}
            </div>

            <div className="pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowRecurringModal(false)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Recurring Template Sub-Modal */}
      {showAddRecurringModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-[#075073]">+ إضافة قالب شراء دوري</h4>
              <button
                onClick={() => setShowAddRecurringModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">ابحث عن الصنف</label>
              <input
                type="text"
                value={recItemSearch}
                onChange={(e) => setRecItemSearch(e.target.value)}
                placeholder="اسم الصنف..."
                className="w-full py-2 px-3 rounded-lg border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
              />
              {recItemSearch && !recPickedItem && (
                <div className="mt-1 max-h-24 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100 bg-white">
                  {items
                    .filter((it) => it.name.includes(recItemSearch))
                    .slice(0, 10)
                    .map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => {
                          setRecPickedItem(it);
                          setRecItemSearch(it.name);
                          setRecUnit(it.unit || 'عدد');
                          setRecPrice(String(it.cost || 0));
                        }}
                        className="w-full text-right p-1.5 text-xs hover:bg-stone-50 text-stone-800"
                      >
                        {it.name}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">الكمية</label>
                <input
                  type="number"
                  value={recQty}
                  onChange={(e) => setRecQty(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg border border-stone-200 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">الوحدة</label>
                <input
                  type="text"
                  value={recUnit}
                  onChange={(e) => setRecUnit(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg border border-stone-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">السعر المعتاد</label>
                <input
                  type="number"
                  value={recPrice}
                  onChange={(e) => setRecPrice(e.target.value)}
                  className="w-full py-1.5 px-2 rounded-lg border border-stone-200 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">المورد المعتاد</label>
              <input
                type="text"
                value={recSupplier}
                onChange={(e) => setRecSupplier(e.target.value)}
                placeholder="اسم المورد (اختياري)..."
                className="w-full py-2 px-3 rounded-lg border border-stone-200 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">التكرار</label>
              <select
                value={recFreqDays}
                onChange={(e) => setRecFreqDays(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-stone-200 text-xs font-bold text-stone-700"
              >
                <option value="7">أسبوعي (كل 7 أيام)</option>
                <option value="14">كل أسبوعين (14 يوماً)</option>
                <option value="30">شهري (كل 30 يوماً)</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddRecurringModal(false)}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!recPickedItem) {
                    showToast('يرجى اختيار صنف أولاً');
                    return;
                  }
                  const fDays = parseInt(recFreqDays, 10) || 7;
                  const q = parseFloat(recQty) || 1;
                  const p = parseFloat(recPrice) || 0;
                  const newRec: RecurringTemplate = {
                    id: uid(),
                    title: `توريد دوري: ${recPickedItem.name}`,
                    itemId: recPickedItem.id,
                    itemName: recPickedItem.name,
                    cat: recPickedItem.cat,
                    qty: q,
                    unit: recUnit.trim() || 'عدد',
                    price: p,
                    estCost: q * p,
                    active: true,
                    supplier: recSupplier.trim() || undefined,
                    freq: fDays === 7 ? 'أسبوعي' : fDays === 14 ? 'كل أسبوعين' : 'شهري',
                    freqDays: fDays,
                    lastOrdered: null,
                    nextDue: isoToday()
                  };
                  onSaveRecurring([...recurring, newRec]);
                  setShowAddRecurringModal(false);
                  showToast('تم حفظ قالب الشراء الدوري ✓');
                }}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F]"
              >
                حفظ القالب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
