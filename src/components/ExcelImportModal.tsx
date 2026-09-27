import React, { useState } from 'react';
import { CategoryKey, InventoryItem, MobileLine, PurchaseOrder } from '../types';
import {
  normalizeEgyptPhone,
  parseTelecomRow,
  cleanPersonName,
  isCleanPersonName,
  deduplicateLines,
  readExcelFile,
  today,
  uid,
  isoToday
} from '../utils/storage';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';

interface ExcelImportModalProps {
  type: 'items' | 'lines' | 'proc';
  onClose: () => void;
  onImportItems: (newItems: InventoryItem[]) => void;
  onImportLines: (newLines: MobileLine[]) => void;
  onImportProc?: (newOrders: PurchaseOrder[]) => void;
  showToast: (msg: string) => void;
}

function getColValue(row: any, aliases: string[]): any {
  if (!row) return undefined;
  const rowKeys = Object.keys(row);
  for (const alias of aliases) {
    const target = alias.trim().toLowerCase();
    const foundKey = rowKeys.find((k) => k.trim().toLowerCase() === target);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return row[foundKey];
    }
  }
  // Loose match fallback (e.g. contains alias)
  for (const alias of aliases) {
    const target = alias.trim().toLowerCase();
    const foundKey = rowKeys.find((k) => k.trim().toLowerCase().includes(target));
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return row[foundKey];
    }
  }
  return undefined;
}

function mapCategory(val: any): CategoryKey {
  if (!val) return 'OFF';
  const str = String(val).toLowerCase();
  if (str.includes('بوف') || str.includes('buff') || str.includes('شاي') || str.includes('سكر') || str.includes('ضياف')) return 'BUFF';
  if (str.includes('نظاف') || str.includes('cln') || str.includes('صابون') || str.includes('مطهر')) return 'CLN';
  if (str.includes('صيان') || str.includes('maint') || str.includes('سباك')) return 'OFF';
  if (str.includes('مكتب') || str.includes('ورق') || str.includes('stat') || str.includes('قلم') || str.includes('قرطاس')) return 'OFF';
  if (str.includes('أثاث') || str.includes('furn') || str.includes('كرسي')) return 'FURN';
  if (str.includes('كهرب') || str.includes('إلكترون') || str.includes('شاش') || str.includes('تليفون')) return 'ELEC';
  if (str.includes('تقني') || str.includes('tech') || str.includes('طابع') || str.includes('حاسب') || str.includes('كمبيوت')) return 'TECH';
  if (str.includes('دواء') || str.includes('إسعاف') || str.includes('med')) return 'MED';
  return 'OFF';
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  type,
  onClose,
  onImportItems,
  onImportLines,
  onImportProc,
  showToast
}) => {
  const [loading, setLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');

  const typeLabels = {
    items: 'أصناف المخزون (أدوات، بوفيه، نظافة)',
    lines: 'خطوط الموبايل والاتصالات',
    proc: 'أوامر المشتريات والتوريدات'
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);

    try {
      const rows = await readExcelFile(file);
      if (!rows.length) {
        showToast('الملف فارغ أو لا يحتوي على بيانات');
        setLoading(false);
        return;
      }

      setHeaders(Object.keys(rows[0]));
      setPreviewRows(rows);
    } catch (err: any) {
      showToast(`فشل قراءة الملف: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = () => {
    if (!previewRows.length) return;

    if (type === 'items') {
      const parsedItems: InventoryItem[] = previewRows.map((r, idx) => {
        const rawName = getColValue(r, ['الصنف', 'اسم الصنف', 'الاسم', 'البيان', 'name', 'item', 'description']);
        const name = rawName ? String(rawName).trim() : `صنف مستورد ${idx + 1}`;
        
        const rawCode = getColValue(r, ['الكود', 'كود', 'code', 'sku', 'id']);
        const code = rawCode ? String(rawCode).trim() : `IMP-${idx + 100}`;
        
        const rawCat = getColValue(r, ['التصنيف', 'الفئة', 'القسم', 'cat', 'category']);
        const cat = mapCategory(rawCat);

        const rawBal = getColValue(r, ['الرصيد', 'الكمية', 'الرصيد الفعلي', 'balance', 'qty', 'count']);
        const balance = parseFloat(rawBal) || 0;

        const rawMin = getColValue(r, ['الحد الأدنى', 'حد أدنى', 'min', 'minimum']);
        const min = parseFloat(rawMin) || 5;

        const rawUnit = getColValue(r, ['الوحدة', 'unit', 'قياس']);
        const unit = rawUnit ? String(rawUnit).trim() : 'قطعة';

        const rawCost = getColValue(r, ['السعر', 'التكلفة', 'سعر الوحدة', 'cost', 'price']);
        const cost = parseFloat(rawCost) || 0;

        const rawLoc = getColValue(r, ['المكان', 'الموقع', 'المخزن', 'loc', 'location']);

        return {
          id: uid(),
          code,
          name,
          cat,
          unit,
          balance,
          min,
          cost,
          loc: rawLoc ? String(rawLoc).trim() : 'مخزن رئيسي'
        };
      });

      onImportItems(parsedItems);
      showToast(`تم استيراد ${parsedItems.length} صنف بنجاح ✓`);
    } else if (type === 'lines') {
      const validLines: MobileLine[] = [];

      previewRows.forEach((r, idx) => {
        const parsed = parseTelecomRow(r);
        let number = parsed.number;
        if (!number) {
          const directRaw = getColValue(r, ['رقم', 'رقم الموبايل', 'رقم الهاتف', 'الهاتف', 'الموبايل', 'number', 'phone', 'mobile']);
          if (directRaw) {
            number = normalizeEgyptPhone(String(directRaw));
          }
        }
        if (!number) return; // Skip rows without a valid phone number

        const rawEmp = parsed.employee || getColValue(r, ['موظف', 'اسم الموظف', 'الموظفين', 'الاسم', 'المستخدم', 'المسؤول', 'المسند إليه', 'employee', 'name']);
        const cleanEmp = cleanPersonName(rawEmp) || undefined;

        validLines.push({
          id: uid(),
          number,
          employee: cleanEmp,
          nationalId: parsed.nationalId || undefined,
          status: 'نشط',
          plan: parsed.plan || undefined,
          monthlyCost: parsed.amount || 0,
          note: parsed.note || undefined,
          addedDate: today()
        });
      });

      const deduplicated = deduplicateLines(validLines);
      onImportLines(deduplicated);
      showToast(`تم استيراد ${deduplicated.length} خط موبايل فريد وتحديث البيانات بدون تكرار ✓`);
    } else if (type === 'proc') {
      const parsedOrders: PurchaseOrder[] = previewRows.map((r, idx) => {
        const rawSupplier = getColValue(r, ['المورد', 'اسم المورد', 'الشركة', 'جهة التوريد', 'supplier', 'vendor']);
        const supplier = rawSupplier ? String(rawSupplier).trim() : 'مورد عام';

        const rawItemName = getColValue(r, ['الصنف', 'اسم الصنف', 'البيان', 'الوصف', 'المادة', 'item', 'itemName', 'description']);
        const itemName = rawItemName ? String(rawItemName).trim() : `توريدات ${idx + 1}`;

        const rawQty = getColValue(r, ['الكمية', 'العدد', 'qty', 'quantity', 'count']);
        const qty = parseFloat(rawQty) || 1;

        const rawPrice = getColValue(r, ['السعر', 'سعر الوحدة', 'التكلفة', 'القيمة', 'price', 'cost', 'unitPrice']);
        const price = parseFloat(rawPrice) || 0;

        const rawUnit = getColValue(r, ['الوحدة', 'نوع الوحدة', 'unit']);
        const unit = rawUnit ? String(rawUnit).trim() : 'عدد';

        const rawCat = getColValue(r, ['القسم', 'الفئة', 'التصنيف', 'cat', 'category']);
        const cat = mapCategory(rawCat);

        const rawInvoice = getColValue(r, ['الفاتورة', 'رقم الفاتورة', 'invoice', 'invoiceNumber', 'bill']);
        const invoiceNumber = rawInvoice ? String(rawInvoice).trim() : undefined;

        const rawStatus = getColValue(r, ['الحالة', 'حالة الأمر', 'status']);
        const isDone = rawStatus && (String(rawStatus).includes('مكتمل') || String(rawStatus).includes('تم') || String(rawStatus).includes('done'));
        const status: PurchaseOrder['status'] = isDone ? 'مكتمل' : 'قيد التنفيذ';

        const rawNote = getColValue(r, ['ملاحظات', 'بيان', 'notes', 'note']);
        const note = rawNote ? String(rawNote).trim() : undefined;

        const rawDate = getColValue(r, ['التاريخ', 'تاريخ الشراء', 'تاريخ الطلب', 'date']);
        const date = rawDate ? String(rawDate).trim() : today();

        return {
          id: uid(),
          supplierId: null,
          supplier,
          date,
          isoDate: isoToday(),
          status,
          invoiceNumber,
          note,
          by: 'المشتريات',
          lines: [
            {
              id: uid(),
              itemId: null,
              itemName,
              cat,
              unit,
              qty,
              price,
              isNewItem: true
            }
          ]
        };
      });

      if (onImportProc) {
        onImportProc(parsedOrders);
        showToast(`تم استيراد ${parsedOrders.length} أمر شراء بنجاح ✓`);
      } else {
        showToast('تم استيراد أوامر الشراء بنجاح ✓');
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-black text-[#075073]">
              استيراد من ملف Excel أو CSV — {typeLabels[type]}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload area */}
        <div className="shrink-0 space-y-2">
          <label className="border-2 border-dashed border-stone-300 hover:border-[#075073] bg-stone-50 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors">
            <Upload className="w-8 h-8 text-stone-400 mb-2" />
            <span className="text-xs font-bold text-stone-800">
              {fileName ? fileName : 'اضغط لاختيار ملف Excel (.xlsx / .xls) أو CSV'}
            </span>
            <span className="text-[11px] text-stone-400 mt-0.5">
              يدعم الملفات باللغة العربية والإنجليزية
            </span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFile}
              className="hidden"
            />
          </label>
          {loading && <p className="text-xs text-amber-700 font-bold animate-pulse">جاري قراءة الملف...</p>}
        </div>

        {/* Preview */}
        {previewRows.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 border border-stone-200 rounded-xl p-3 bg-[#faf7f0]">
            <div className="flex justify-between items-center text-xs font-bold text-[#075073]">
              <span>معاينة البيانات المستخرجة ({previewRows.length} صف):</span>
              <span className="text-emerald-700 font-mono">جاهز للاستيراد ✓</span>
            </div>
            <div className="overflow-x-auto bg-white rounded-lg border border-stone-200">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#f4efe2] font-bold text-[#075073]">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="p-2 border-b border-stone-200">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {previewRows.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="hover:bg-stone-50">
                      {headers.map((h) => (
                        <td key={h} className="p-2 font-mono">
                          {String(row[h] || '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewRows.length > 5 && (
              <p className="text-[10px] text-stone-400 text-center">
                يتم عرض أول 5 صفوف فقط من إجمالي {previewRows.length} صفاً
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={!previewRows.length}
            onClick={handleConfirmImport}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md cursor-pointer"
          >
            تأكيد واستيراد ({previewRows.length} سجل)
          </button>
        </div>
      </div>
    </div>
  );
};
