import React, { useState, useMemo } from 'react';
import { DepartmentRequest, RoleKey, AuthUser } from '../types';
import { isDateInRange, today, uid, getNextDocumentSequence } from '../utils/storage';
import { DocumentSequenceBadge } from './DocumentSequenceBadge';
import { auth } from '../firebase';
import { DateFilterBar, DateFilterValue } from './DateFilterBar';
import { ConfirmModal } from './ConfirmModal';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Plus,
  Search,
  Send,
  Trash2,
  X,
  XCircle
} from 'lucide-react';

interface RequestsViewProps {
  reqs: DepartmentRequest[];
  currentRole: RoleKey;
  authUser?: AuthUser | null;
  onSaveReqs: (newReqs: DepartmentRequest[]) => void;
  onExportCSV: (type: string) => void;
  onOpenNewProcurement?: (title: string) => void;
  showToast: (msg: string) => void;
}

export const RequestsView: React.FC<RequestsViewProps> = ({
  reqs = [],
  currentRole,
  authUser,
  onSaveReqs,
  onExportCSV,
  onOpenNewProcurement,
  showToast
}) => {
  const isMgr = currentRole === 'manager';
  const canManageReqs = isMgr || (authUser?.canWrite ? authUser.canWrite.includes('reqs') : true);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [reqDeptFilter, setReqDeptFilter] = useState<string>('all');
  const [reqSearch, setReqSearch] = useState<string>('');
  const [reqDateFilter, setReqDateFilter] = useState<DateFilterValue>({
    preset: 'all',
    startDate: '',
    endDate: ''
  });
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [dept, setDept] = useState('الاستقبال وشؤون الطلاب');
  const [cat, setCat] = useState('أدوات مكتبية وقرطاسية');
  const [urgency, setUrgency] = useState<'عاجل' | 'عادي'>('عادي');
  const [note, setNote] = useState('');

  const filteredReqs = useMemo(() => {
    return reqs.filter((r) => {
      // 1. Status Filter
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;

      // 2. Dept Filter
      if (reqDeptFilter !== 'all' && r.dept !== reqDeptFilter) return false;

      // 3. Date Filter
      if (reqDateFilter.preset !== 'all' || reqDateFilter.startDate || reqDateFilter.endDate) {
        if (!isDateInRange(r.date, reqDateFilter.startDate, reqDateFilter.endDate)) {
          return false;
        }
      }

      // 4. Search
      if (reqSearch.trim()) {
        const q = reqSearch.toLowerCase().trim();
        const matchTitle = (r.title || '').toLowerCase().includes(q);
        const matchDept = (r.dept || '').toLowerCase().includes(q);
        const matchBy = (r.by || '').toLowerCase().includes(q);
        const matchNote = (r.note || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDept && !matchBy && !matchNote) return false;
      }

      return true;
    });
  }, [reqs, filterStatus, reqDeptFilter, reqDateFilter, reqSearch]);

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('يرجى كتابة عنوان الطلب');
      return;
    }

    const reqSeq = getNextDocumentSequence('REQ');

    const newReq: DepartmentRequest = {
      id: reqSeq,
      requestCode: reqSeq,
      title: title.trim(),
      dept,
      cat,
      urgency,
      note: note.trim() || undefined,
      status: 'جديد',
      date: today(),
      by:
        currentRole === 'manager'
          ? 'المدير'
          : currentRole === 'reception'
          ? 'الاستقبال'
          : currentRole === 'buffet'
          ? 'البوفيه'
          : currentRole === 'cleaning'
          ? 'النظافة'
          : currentRole === 'maint'
          ? 'الصيانة'
          : 'المستخدم',
      createdByUid: auth.currentUser?.uid || undefined
    };

    onSaveReqs([newReq, ...reqs]);
    setShowAddModal(false);
    setTitle('');
    setNote('');
    showToast(`تم إرسال الطلب بنجاح برقم تسلسلي [${reqSeq}] ✓`);
  };

  const handleUpdateStatus = (
    id: string,
    newStatus: 'معتمد' | 'مرفوض' | 'منجز',
    reason?: string
  ) => {
    const updated = reqs.map((r) =>
      r.id === id
        ? {
            ...r,
            status: newStatus,
            rejectReason: reason || r.rejectReason
          }
        : r
    );
    onSaveReqs(updated);
    showToast(`تم تغيير حالة الطلب إلى: ${newStatus} ✓`);
  };

  const handleDeleteRequest = (id: string) => {
    if (!window.confirm('هل تريد حذف هذا الطلب؟')) return;
    onSaveReqs(reqs.filter((r) => r.id !== id));
    showToast('تم حذف الطلب');
  };

  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">📋 طلبات واحتياجات المقر</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            طلبات الاحتياجات والمستهلكات المقدمة من الأقسام للاعتماد والتنفيذ
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isMgr && (
            <button
              onClick={() => onExportCSV('reqs')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير Excel</span>
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ تقديم طلب احتياج جديد</span>
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="space-y-3">
        <DateFilterBar
          value={reqDateFilter}
          onChange={setReqDateFilter}
          label="فلترة تاريخ طلبات الاحتياج"
        />

        <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[
              { id: 'all', label: `الكل (${reqs.length})` },
              { id: 'جديد', label: `جديد (${reqs.filter((r) => r.status === 'جديد').length})` },
              { id: 'معتمد', label: `معتمد (${reqs.filter((r) => r.status === 'معتمد').length})` },
              { id: 'منجز', label: `منجز (${reqs.filter((r) => r.status === 'منجز').length})` },
              { id: 'مرفوض', label: `مرفوض (${reqs.filter((r) => r.status === 'مرفوض').length})` }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  filterStatus === tab.id
                    ? 'bg-[#075073] text-white shadow-xs'
                    : 'bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Department */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Dept Filter */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-stone-500">القسم:</span>
              <select
                value={reqDeptFilter}
                onChange={(e) => setReqDeptFilter(e.target.value)}
                className="py-1.5 px-2.5 rounded-lg border border-stone-200 text-xs font-bold text-stone-700 focus:outline-none cursor-pointer"
              >
                <option value="all">كل الأقسام والإدارات</option>
                <option value="الاستقبال وشؤون الطلاب">الاستقبال وشؤون الطلاب</option>
                <option value="البوفيه والضيافة">البوفيه والضيافة</option>
                <option value="النظافة والخدمات">النظافة والخدمات</option>
                <option value="الصيانة والتشغيل">الصيانة والتشغيل</option>
                <option value="إدارة الفرع">إدارة الفرع</option>
              </select>
            </div>

            {/* Search Box */}
            <div className="relative">
              <input
                type="text"
                value={reqSearch}
                onChange={(e) => setReqSearch(e.target.value)}
                placeholder="بحث في الطلبات..."
                className="py-1.5 pl-3 pr-8 rounded-lg border border-stone-200 text-xs focus:border-[#075073] focus:outline-none w-44"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-2.5" />
              {reqSearch && (
                <button
                  type="button"
                  onClick={() => setReqSearch('')}
                  className="absolute left-2.5 top-2 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filteredReqs.map((r) => {
          const isUrgent = r.urgency === 'عاجل';
          const isNew = r.status === 'جديد';
          const isApproved = r.status === 'معتمد';
          const isDone = r.status === 'منجز';
          const isRejected = r.status === 'مرفوض';

          return (
            <div
              key={r.id}
              className={`p-4 bg-white rounded-xl border transition-all shadow-xs space-y-2.5 ${
                isUrgent && isNew
                  ? 'border-rose-300 border-r-4 border-r-rose-600'
                  : 'border-stone-200 border-r-4 border-r-stone-400'
              }`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base">{isUrgent ? '🔴' : '⚪'}</span>
                  <h3 className="text-sm font-bold text-stone-900">{r.title}</h3>
                  <DocumentSequenceBadge code={r.requestCode || r.id} type="REQ" size="sm" />
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      isNew
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : isApproved
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : isDone
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                <span>🏢 القسم: <strong className="text-stone-700">{r.dept}</strong></span>
                <span>🏷️ التصنيف: <strong className="text-stone-700">{r.cat}</strong></span>
                <span>⚡ الأهمية: <strong className="text-stone-700">{r.urgency}</strong></span>
                <span>📅 التاريخ: <strong className="text-stone-700 font-mono">{r.date}</strong></span>
                <span>👤 مقدم الطلب: <strong className="text-stone-700">{r.by}</strong></span>
              </div>

              {r.note && (
                <div className="p-2.5 bg-stone-50 rounded-lg text-xs text-stone-600 leading-relaxed border border-stone-100">
                  {r.note}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {isMgr && isNew && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(r.id, 'معتمد')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>اعتماد الطلب ✓</span>
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt('يرجى توضيح سبب الرفض (اختياري):');
                        handleUpdateStatus(r.id, 'مرفوض', reason || undefined);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>رفض ✕</span>
                    </button>
                  </>
                )}

                {isApproved && !isDone && (
                  <button
                    onClick={() => handleUpdateStatus(r.id, 'منجز')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تم التنفيذ والتسليم (إنجاز)</span>
                  </button>
                )}

                {(isMgr || (isNew && r.createdByUid && r.createdByUid === auth.currentUser?.uid)) && (
                  <button
                    onClick={() => handleDeleteRequest(r.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-all cursor-pointer mr-auto border border-rose-200"
                    title="إلغاء / حذف الطلب"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>إلغاء الطلب</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filteredReqs.length === 0 && (
          <div className="bg-white p-10 text-center rounded-xl border border-dashed border-stone-200 text-stone-400 space-y-1">
            <div className="text-2xl">📋</div>
            <div className="text-xs font-bold text-[#075073]">لا توجد طلبات في هذا التبويب</div>
          </div>
        )}
      </div>

      {/* Add Request Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-[#075073] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#075073]">📋 تقديم طلب احتياج جديد</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">عنوان / تفاصيل الاحتياج</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: طلب 5 رزم ورق تصوير A4 و10 أقلام سبورة"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">القسم الطالب</label>
                  <select
                    value={dept}
                    onChange={(e) => setDept(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:border-[#075073] focus:outline-none"
                  >
                    <option value="الاستقبال وشؤون الطلاب">الاستقبال وشؤون الطلاب</option>
                    <option value="إدارة الفرع">إدارة الفرع</option>
                    <option value="المحاضرين والقاعات">المحاضرين والقاعات</option>
                    <option value="البوفيه والضيافة">البوفيه والضيافة</option>
                    <option value="النظافة والخدمات">النظافة والخدمات</option>
                    <option value="الصيانة والدعم الفني">الصيانة والدعم الفني</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">التصنيف</label>
                  <select
                    value={cat}
                    onChange={(e) => setCat(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:border-[#075073] focus:outline-none"
                  >
                    <option value="أدوات مكتبية وقرطاسية">أدوات مكتبية وقرطاسية</option>
                    <option value="بوفيه وضيافة">بوفيه وضيافة</option>
                    <option value="مستلزمات نظافة">مستلزمات نظافة</option>
                    <option value="صيانة وأجهزة">صيانة وأجهزة</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">درجة الأهمية</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as any)}
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:border-[#075073] focus:outline-none"
                >
                  <option value="عادي">⚪ عادي</option>
                  <option value="عاجل">🔴 عاجل جداً</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات أو مبررات الاحتياج</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="أي تفاصيل تود إضافتها للإدارة..."
                  className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
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
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] transition-all shadow-md cursor-pointer"
                >
                  إرسال الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
