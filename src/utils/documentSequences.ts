/**
 * Centralized Document Sequencing Engine for Monglish Academy ERP
 * Manages auto-incrementing, formatted, persistent sequential document numbers
 * (e.g., PO-2026-0001, GRN-2026-0001, ISU-2026-0001, MNT-2026-0001, EXP-2026-0001, REQ-2026-0001, STK-2026-0001, CUST-2026-0001, ADJ-2026-0001)
 */

export type DocumentTypeKey =
  | 'PO'    // أمر شراء (Purchase Order)
  | 'GRN'   // إذن توريد واستلام مخزني (Goods Receipt Note)
  | 'ISU'   // إذن صرف وتوجيه مخزني (Stock Issue Voucher)
  | 'MNT'   // أمر عمل وبلاغ صيانة (Maintenance Work Order)
  | 'EXP'   // سند صرف ونثرية (Petty Cash Expense)
  | 'REQ'   // طلب احتياج قسم (Department Requisition)
  | 'STK'   // محضر جرد فعلي دوري (Physical Stocktake Audit)
  | 'CUST'  // إذن تسليم واستلام عهدة (Custody Handover Voucher)
  | 'ADJ';  // إذن تسوية جردية (Stock Adjustment Voucher)

export interface DocumentTypeMeta {
  key: DocumentTypeKey;
  code: string;
  nameAr: string;
  nameEn: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  icon: string;
}

export const DOCUMENT_TYPES: Record<DocumentTypeKey, DocumentTypeMeta> = {
  PO: {
    key: 'PO',
    code: 'PO',
    nameAr: 'أمر شراء معتمد',
    nameEn: 'Purchase Order',
    description: 'أوامر التوريد والشراء الصادرة للموردين والشركات',
    badgeBg: 'bg-blue-50 text-blue-800 border-blue-200',
    badgeText: 'text-blue-700',
    icon: '🛒'
  },
  GRN: {
    key: 'GRN',
    code: 'GRN',
    nameAr: 'إذن توريد واستلام مخزني',
    nameEn: 'Goods Receipt Note',
    description: 'أذونات الفحص والاستلام وإدخال البضائع للمخازن',
    badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    badgeText: 'text-emerald-700',
    icon: '📥'
  },
  ISU: {
    key: 'ISU',
    code: 'ISU',
    nameAr: 'إذن صرف وتوجيه مخزني',
    nameEn: 'Stock Issue Voucher',
    description: 'أذونات صرف وتوزيع الأصناف والمهمات للأقسام والموظفين',
    badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
    badgeText: 'text-amber-700',
    icon: '📤'
  },
  MNT: {
    key: 'MNT',
    code: 'MNT',
    nameAr: 'أمر عمل وبلاغ صيانة',
    nameEn: 'Maintenance Work Order',
    description: 'بلاغات الأعطال وأوامر الإصلاح الفني ومتابعة المراحل',
    badgeBg: 'bg-rose-50 text-rose-800 border-rose-200',
    badgeText: 'text-rose-700',
    icon: '🔧'
  },
  EXP: {
    key: 'EXP',
    code: 'EXP',
    nameAr: 'سند صرف ونثرية',
    nameEn: 'Petty Cash Voucher',
    description: 'سندات المصروفات النثرية والعهد والمدفوعات العاجلة',
    badgeBg: 'bg-purple-50 text-purple-800 border-purple-200',
    badgeText: 'text-purple-700',
    icon: '💵'
  },
  REQ: {
    key: 'REQ',
    code: 'REQ',
    nameAr: 'طلب احتياج قسم',
    nameEn: 'Department Requisition',
    description: 'طلبات التوفير والاحتياجات المرفوعة من الأقسام للإدارة',
    badgeBg: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    badgeText: 'text-cyan-700',
    icon: '📝'
  },
  STK: {
    key: 'STK',
    code: 'STK',
    nameAr: 'محضر جرد فعلي',
    nameEn: 'Stocktake Audit Report',
    description: 'محاضر الجرد الدوري ومطابقة الأرصدة الفعلية مع الدفترية',
    badgeBg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    badgeText: 'text-indigo-700',
    icon: '📋'
  },
  CUST: {
    key: 'CUST',
    code: 'CUST',
    nameAr: 'إذن تسليم عهدة ومحمول',
    nameEn: 'Custody Handover Voucher',
    description: 'نماذج تسليم العهد وخطوط المحمول والأجهزة للموظفين',
    badgeBg: 'bg-teal-50 text-teal-800 border-teal-200',
    badgeText: 'text-teal-700',
    icon: '🤝'
  },
  ADJ: {
    key: 'ADJ',
    code: 'ADJ',
    nameAr: 'إذن تسوية جردية',
    nameEn: 'Stock Adjustment Voucher',
    description: 'أذونات تسوية الأرصدة المخزنية بالزيادة أو العجز',
    badgeBg: 'bg-stone-100 text-stone-800 border-stone-300',
    badgeText: 'text-stone-700',
    icon: '⚖️'
  }
};

const STORAGE_KEY_SEQUENCES = 'mo_doc_sequences_v1';

export type SequenceCounters = Record<string, number>;

/**
 * Load current sequence counters from localStorage
 */
export function loadSequenceCounters(): SequenceCounters {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SEQUENCES);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse sequence counters', e);
    return {};
  }
}

/**
 * Save sequence counters to localStorage
 */
export function saveSequenceCounters(counters: SequenceCounters): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SEQUENCES, JSON.stringify(counters));
  } catch (e) {
    console.error('Failed to save sequence counters', e);
  }
}

/**
 * Format document sequence into standardized string (e.g. PO-2026-0001)
 */
export function formatDocumentSequence(type: DocumentTypeKey, sequenceNum: number, year?: number): string {
  const currentYear = year || new Date().getFullYear();
  const padded = String(Math.max(1, sequenceNum)).padStart(4, '0');
  return `${type}-${currentYear}-${padded}`;
}

/**
 * Parse an existing document sequence string
 */
export function parseDocumentSequence(code?: string): { type: DocumentTypeKey; year: number; sequence: number } | null {
  if (!code || typeof code !== 'string') return null;
  const match = code.trim().match(/^([A-Z]{2,5})-(\d{4})-(\d+)$/i);
  if (!match) return null;
  const type = match[1].toUpperCase() as DocumentTypeKey;
  const year = parseInt(match[2], 10);
  const sequence = parseInt(match[3], 10);
  return { type, year, sequence };
}

/**
 * Get next document sequence and atomically increment counter
 */
export function getNextDocumentSequence(type: DocumentTypeKey, year?: number): string {
  const currentYear = year || new Date().getFullYear();
  const key = `${type}_${currentYear}`;
  const counters = loadSequenceCounters();
  
  const currentVal = counters[key] || 0;
  const nextVal = currentVal + 1;
  counters[key] = nextVal;
  saveSequenceCounters(counters);

  return formatDocumentSequence(type, nextVal, currentYear);
}

/**
 * Peek at what the next document sequence will be WITHOUT incrementing
 */
export function peekNextDocumentSequence(type: DocumentTypeKey, year?: number): string {
  const currentYear = year || new Date().getFullYear();
  const key = `${type}_${currentYear}`;
  const counters = loadSequenceCounters();
  const nextVal = (counters[key] || 0) + 1;
  return formatDocumentSequence(type, nextVal, currentYear);
}

/**
 * Manually set / adjust a sequence counter (e.g., in Settings)
 */
export function setDocumentSequenceCounter(type: DocumentTypeKey, lastUsedNumber: number, year?: number): void {
  const currentYear = year || new Date().getFullYear();
  const key = `${type}_${currentYear}`;
  const counters = loadSequenceCounters();
  counters[key] = Math.max(0, lastUsedNumber);
  saveSequenceCounters(counters);
}

/**
 * Scan all application records and ensure sequence counters match the maximum existing document codes.
 * Prevents any accidental counter resets or duplicate sequences across reloads or device imports.
 */
export function syncCountersWithExistingRecords(data: {
  proc?: { id?: string }[];
  moves?: { id?: string; voucherNo?: string; type?: string; adjustment?: boolean }[];
  maint?: { id?: string }[];
  pettyCash?: { id?: string; receiptNo?: string }[];
  reqs?: { id?: string; requestCode?: string }[];
  stock?: { id?: string }[];
}): SequenceCounters {
  const counters = loadSequenceCounters();
  const currentYear = new Date().getFullYear();

  const updateMax = (type: DocumentTypeKey, code?: string) => {
    if (!code) return;
    const parsed = parseDocumentSequence(code);
    if (parsed && parsed.type === type) {
      const key = `${type}_${parsed.year}`;
      counters[key] = Math.max(counters[key] || 0, parsed.sequence);
    }
  };

  // 1. Purchase Orders
  (data.proc || []).forEach((p) => updateMax('PO', p.id));

  // 2. Stock Moves (Vouchers: GRN, ISU, ADJ)
  (data.moves || []).forEach((m) => {
    if (m.voucherNo) {
      updateMax('GRN', m.voucherNo);
      updateMax('ISU', m.voucherNo);
      updateMax('ADJ', m.voucherNo);
    }
    if (m.id) {
      updateMax('GRN', m.id);
      updateMax('ISU', m.id);
      updateMax('ADJ', m.id);
    }
  });

  // 3. Maintenance Tickets
  (data.maint || []).forEach((t) => updateMax('MNT', t.id));

  // 4. Petty Cash Expenses
  (data.pettyCash || []).forEach((e) => {
    updateMax('EXP', e.receiptNo);
    updateMax('EXP', e.id);
  });

  // 5. Department Requests
  (data.reqs || []).forEach((r) => {
    updateMax('REQ', r.requestCode);
    updateMax('REQ', r.id);
  });

  saveSequenceCounters(counters);
  return counters;
}
