import React from 'react';
import { Building2, Check, Printer, X } from 'lucide-react';
import { today } from '../utils/storage';
import { MonglishLogo } from './MonglishLogo';

export interface PrintVoucherData {
  title: string;
  subtitle?: string;
  voucherNumber: string;
  date: string;
  department?: string;
  person?: string; // Recipient or supplier
  by?: string; // Authorized issuer
  notes?: string;
  totalCost?: number;
  items: {
    code?: string;
    name: string;
    category?: string;
    unit?: string;
    qty: number;
    price?: number;
    total?: number;
    notes?: string;
  }[];
}

interface PrintVoucherModalProps {
  data: PrintVoucherData | null;
  onClose: () => void;
}

export const PrintVoucherModal: React.FC<PrintVoucherModalProps> = ({ data, onClose }) => {
  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/70 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-stone-300 max-h-[95vh] flex flex-col overflow-hidden">
        {/* Top Control Bar (Hidden in Print) */}
        <div className="p-4 bg-gradient-to-r from-[#075073] to-[#03151F] text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#E68131]" />
            <span className="font-black text-sm">معاينة المستند الرسمي قبل الطباعة</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#E68131] hover:bg-[#d06f23] text-white transition-all shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة المستند الآن (Ctrl+P)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/70 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-8 overflow-y-auto flex-1 bg-white text-stone-900" id="printable-voucher-content" dir="rtl">
          {/* Header */}
          <div className="border-b-2 border-[#075073] pb-4 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <MonglishLogo variant="emblem" size="md" className="w-12 h-12 rounded-xl shadow-xs border border-stone-300" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-[#075073] tracking-tight">أكاديمية مونجلش الدولية</span>
                  </div>
                  <div className="text-xs font-bold text-stone-500 mt-0.5">
                    Monglish International Academy — مقر الإسكندرية
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    إدارة الشؤون الإدارية، المخازن والمشتريات
                  </div>
                </div>
              </div>
              <div className="text-left font-mono">
                <div className="text-xs font-bold text-stone-500">رقم الإذن:</div>
                <div className="text-base font-black text-[#075073]">{data.voucherNumber}</div>
                <div className="text-xs text-stone-500 mt-0.5">التاريخ: {data.date || today()}</div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-[#075073] underline underline-offset-4">
                {data.title}
              </h2>
              {data.department && (
                <span className="text-xs font-bold bg-stone-100 text-stone-700 px-3 py-1 rounded-full border border-stone-200">
                  الإدارة / القسم: {data.department}
                </span>
              )}
            </div>
          </div>

          {/* Parties Info */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs mb-6">
            <div>
              <span className="font-bold text-stone-500">جهة الاستلام / الموظف: </span>
              <span className="font-black text-stone-900">{data.person || 'غير محدد'}</span>
            </div>
            <div>
              <span className="font-bold text-stone-500">المسؤول المنفّذ: </span>
              <span className="font-black text-stone-900">{data.by || 'أمين المخزن'}</span>
            </div>
            {data.notes && (
              <div className="col-span-2 pt-1 border-t border-stone-200/60">
                <span className="font-bold text-stone-500">ملاحظات الصرف / التوجيه: </span>
                <span className="text-stone-700">{data.notes}</span>
              </div>
            )}
          </div>

          {/* Table of Items */}
          <div className="mb-6">
            <table className="w-full text-right text-xs border border-stone-300">
              <thead className="bg-stone-100 text-stone-800 font-bold border-b border-stone-300">
                <tr>
                  <th className="py-2.5 px-3 border-l border-stone-300 w-10 text-center">م</th>
                  <th className="py-2.5 px-3 border-l border-stone-300">بيان الصنف</th>
                  {data.items.some((i) => i.code) && (
                    <th className="py-2.5 px-3 border-l border-stone-300">الكود</th>
                  )}
                  <th className="py-2.5 px-3 border-l border-stone-300 text-center">الوحدة</th>
                  <th className="py-2.5 px-3 border-l border-stone-300 text-center">الكمية</th>
                  {data.items.some((i) => typeof i.price === 'number') && (
                    <th className="py-2.5 px-3 border-l border-stone-300 text-center">سعر الوحدة</th>
                  )}
                  {data.items.some((i) => typeof i.total === 'number') && (
                    <th className="py-2.5 px-3 border-l border-stone-300 text-center">الإجمالي</th>
                  )}
                  <th className="py-2.5 px-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {data.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-stone-50/50">
                    <td className="py-2 px-3 border-l border-stone-300 text-center font-mono">{idx + 1}</td>
                    <td className="py-2 px-3 border-l border-stone-300 font-bold">{item.name}</td>
                    {data.items.some((i) => i.code) && (
                      <td className="py-2 px-3 border-l border-stone-300 font-mono text-stone-600">
                        {item.code || '—'}
                      </td>
                    )}
                    <td className="py-2 px-3 border-l border-stone-300 text-center text-stone-600">
                      {item.unit || 'عدد'}
                    </td>
                    <td className="py-2 px-3 border-l border-stone-300 text-center font-mono font-bold text-[#075073]">
                      {item.qty}
                    </td>
                    {data.items.some((i) => typeof i.price === 'number') && (
                      <td className="py-2 px-3 border-l border-stone-300 text-center font-mono">
                        {(item.price || 0).toLocaleString('ar-EG')} ج.م
                      </td>
                    )}
                    {data.items.some((i) => typeof i.total === 'number') && (
                      <td className="py-2 px-3 border-l border-stone-300 text-center font-mono font-bold">
                        {(item.total || 0).toLocaleString('ar-EG')} ج.م
                      </td>
                    )}
                    <td className="py-2 px-3 text-stone-500 text-[11px]">{item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
              {typeof data.totalCost === 'number' && data.totalCost > 0 && (
                <tfoot className="bg-stone-50 border-t-2 border-stone-300 font-black">
                  <tr>
                    <td
                      colSpan={data.items.some((i) => i.code) ? 5 : 4}
                      className="py-2.5 px-3 text-left border-l border-stone-300"
                    >
                      إجمالي التكلفة المقدرة:
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-base text-[#075073] border-l border-stone-300">
                      {data.totalCost.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Signatures Section */}
          <div className="grid grid-cols-3 gap-6 pt-8 border-t border-stone-300 text-center text-xs">
            <div>
              <div className="font-bold text-stone-600 mb-8">أمين المخزن / المنفذ</div>
              <div className="border-b border-dashed border-stone-400 mx-4"></div>
              <div className="text-[10px] text-stone-400 mt-1">التوقيع والاسم</div>
            </div>
            <div>
              <div className="font-bold text-stone-600 mb-8">المستلم / رئيس القسم</div>
              <div className="border-b border-dashed border-stone-400 mx-4"></div>
              <div className="text-[10px] text-stone-400 mt-1">التوقيع والاسم</div>
            </div>
            <div>
              <div className="font-bold text-stone-600 mb-8">اعتماد الإدارة / المدير</div>
              <div className="border-b border-dashed border-stone-400 mx-4"></div>
              <div className="text-[10px] text-stone-400 mt-1">الختم والموافقة</div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="mt-8 pt-3 border-t border-stone-100 text-center text-[10px] text-stone-400">
            تم استخراج هذا السند إلكترونياً من نظام إدارة مكتب أكاديمية مونجلش الدولية — الإسكندرية ({today()})
          </div>
        </div>
      </div>
    </div>
  );
};
