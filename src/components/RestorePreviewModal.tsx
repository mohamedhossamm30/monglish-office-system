import React, { useState } from 'react';
import { BackupValidationSummary } from '../utils/storage';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Database,
  FileCheck2,
  Info,
  Layers,
  RefreshCw,
  ShieldAlert,
  X
} from 'lucide-react';

interface RestorePreviewModalProps {
  isOpen: boolean;
  summary: BackupValidationSummary | null;
  onClose: () => void;
  onConfirm: (summary: BackupValidationSummary) => Promise<void>;
  isRestoring: boolean;
}

export const RestorePreviewModal: React.FC<RestorePreviewModalProps> = ({
  isOpen,
  summary,
  onClose,
  onConfirm,
  isRestoring
}) => {
  const [confirmInput, setConfirmInput] = useState('');

  if (!isOpen || !summary) return null;

  const isDoubleConfirmed =
    confirmInput.trim() === 'تأكيد' || confirmInput.trim() === 'تاكيد';

  const handleExecute = async () => {
    if (!isDoubleConfirmed || isRestoring) return;
    await onConfirm(summary);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/70 backdrop-blur-xs overflow-y-auto" dir="rtl">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border-t-4 border-[#E68131] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-stone-100 flex items-start justify-between bg-stone-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[#075073]">
                  معاينة وتأكيد استعادة النسخة الاحتياطية
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  إجراء حساس للمدير
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                فحص آمن وتحقق من بنية البيانات قبل الكتابة الفعلية في السحابة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRestoring}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-right text-xs">
          {/* Export Date & Source File Meta */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between flex-wrap gap-2 text-blue-900">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-bold">تاريخ التصدير المسجل بالملف:</span>
              <span className="font-black font-mono text-blue-800">
                {summary.exportDate || 'غير مدون بالملف (استيراد خام)'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-blue-700 text-[11px]">
              <Database className="w-3.5 h-3.5" />
              <span>إجمالي السجلات المعتمدة: <b>{summary.totalValidRecords}</b></span>
            </div>
          </div>

          {/* Explicit Merge Notice Question */}
          <div className="p-3 bg-amber-50 border-r-4 border-amber-500 rounded-lg text-amber-950 font-bold leading-relaxed">
            ⚠️ هل تريد المتابعة؟ سيتم دمج هذه السجلات مع البيانات الحالية بالمعرف (ID) دون حذف أي سجلات حالية غير موجودة بالملف.
          </div>

          {/* Valid Collections Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-black text-stone-800 flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                <span>المجموعات المعتمدة للدمج ({summary.validCollections.length}):</span>
              </h4>
              <span className="text-[11px] text-stone-400">سجل الملف يطغى على السجل الموجود بنفس الـ ID</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {summary.validCollections.map((col) => (
                <div
                  key={col.key}
                  className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-between"
                >
                  <div className="font-bold text-stone-700 truncate">{col.name}</div>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-mono font-bold text-xs">
                    {col.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Excluded Collections (if any) */}
          {summary.excludedCollections.length > 0 && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 text-rose-900">
              <div className="font-black flex items-center gap-1.5 text-xs text-rose-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>مجموعات تم استبعادها لعدم مطابقة البنية ({summary.excludedCollections.length}):</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-800 pr-1">
                {summary.excludedCollections.map((ex) => (
                  <li key={ex.key}>
                    <span className="font-bold">{ex.name}:</span> {ex.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Ignored Keys Notice */}
          {summary.ignoredKeys.length > 0 && (
            <div className="p-3 bg-stone-100 rounded-xl border border-stone-200 text-stone-600 text-[11px] space-y-1">
              <div className="font-bold text-stone-700 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-stone-500" />
                <span>مفاتيح بيانات تم تجاهلها عمداً:</span>
              </div>
              <p className="text-stone-500 leading-normal">
                تم استبعاد المفاتيح [ {summary.ignoredKeys.join(', ')} ] من الكتابة في السحابة.
                {summary.hasLegacyRolesWithPin && (
                  <span className="text-amber-800 font-semibold block mt-1">
                    ✓ تم رصد مفتاح أدوار قديم (roles يحتوي على pin) وتجاهله عمداً لعدم استبدال نظام المصادقة السحابي الموثق.
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Double Confirmation Input */}
          <div className="pt-2 border-t border-stone-100 space-y-1.5">
            <label className="block text-xs font-black text-[#075073]">
              تأكيد مزدوج: يرجى كتابة كلمة <span className="text-[#E68131] underline">"تأكيد"</span> أدناه لتمكين زر الدمج:
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder="اكتب كلمة: تأكيد"
              disabled={isRestoring}
              className="w-full py-2.5 px-3 rounded-xl border border-stone-300 text-xs font-bold text-[#075073] focus:border-[#E68131] focus:outline-none bg-stone-50/50"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring}
            className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            إلغاء العملية
          </button>

          <button
            type="button"
            onClick={handleExecute}
            disabled={!isDoubleConfirmed || isRestoring}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black text-white bg-amber-600 hover:bg-amber-700 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isRestoring ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>جاري الدمج والتحديث السحابي...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>تأكيد وتنفيذ دمج البيانات ✓</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
