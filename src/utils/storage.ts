import {
  CategoryKey,
  CleaningHistory,
  CleaningTask,
  DepartmentRequest,
  InventoryItem,
  MaintenanceAsset,
  AssetMaintenanceLog,
  MaintenanceTicket,
  MobileLine,
  PettyCashExpense,
  PhysicalStocktake,
  PurchaseOrder,
  RecurringTemplate,
  RoleConfig,
  StockMove,
  Supplier,
  SyncStatusType,
  SystemActivity,
  TabKey
} from '../types';
import { CATEGORIES, ROLES, SEED_CLEAN, SEED_ITEMS, SEED_ASSETS } from '../data/seedData';
import monglishProcOrders from '../data/monglishProcurement.json';
import monglishCommitments from '../data/monglishCommitments.json';
import { sendBrowserNotification } from './notifications';
import { idbSet, idbGet, idbSaveFullSnapshot, idbGetFullSnapshot, idbClearAll } from './idbStorage';
import { restoreEntireBackupToFirestore, syncRolesToFirestore } from './firebaseSync';
export * from './documentSequences';

export const SK = {
  items: 'mo_items',
  moves: 'mo_moves',
  proc: 'mo_proc',
  maint: 'mo_maint',
  assets: 'mo_assets',
  clean: 'mo_clean',
  buff: 'mo_buff',
  reqs: 'mo_reqs',
  stock: 'mo_stock',
  suppliers: 'mo_suppliers',
  recurring: 'mo_recurring',
  cleanHist: 'mo_clean_hist',
  lines: 'mo_lines',
  pettyCash: 'mo_petty_cash',
  roles: 'mo_roles',
  activities: 'mo_activities'
};

export function uid(): string {
  return 'id' + Date.now() + Math.random().toString(36).slice(2, 6);
}

export function isHostedMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol !== 'file:';
}

export function today(): string {
  return new Date().toLocaleDateString('ar-EG');
}

export function isoToday(): string {
  return getLocalDateIso();
}

export function getLocalDateIso(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentYearMonth(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function isoPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return getLocalDateIso(d);
}

/**
 * Robust date normalizer: converts any date string (ISO YYYY-MM-DD, DD/MM/YYYY, YYYY/MM/DD,
 * Arabic-indic digits, Persian digits, timestamps, locale strings with invisible RTL marks)
 * into standardized ISO YYYY-MM-DD string.
 */
export function normalizeDateToIso(rawDate?: string | number | Date | null): string {
  if (!rawDate && rawDate !== 0) return '';
  if (rawDate instanceof Date) {
    if (!isNaN(rawDate.getTime())) return getLocalDateIso(rawDate);
    return '';
  }
  if (typeof rawDate === 'number' && rawDate > 0) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) return getLocalDateIso(d);
  }
  let str = String(rawDate).trim();
  // Strip invisible unicode bidirectional control marks (LRM \u200E, RLM \u200F, ALM \u061C, \u202A-\u202E, BOM \uFEFF)
  str = str.replace(/[\u200E\u200F\u061C\u202A-\u202E\uFEFF]/g, '');

  // Convert Arabic-Indic and Persian digits to standard ASCII 0-9
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i <= 9; i++) {
    str = str.replaceAll(arabicDigits[i], String(i));
  }
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  for (let i = 0; i <= 9; i++) {
    str = str.replaceAll(persianDigits[i], String(i));
  }

  // 1. ISO format or Year-Month-Day: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const isoMatch = str.match(/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 2. Day-Month-Year: DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY
  const dmMatch = str.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})\b/);
  if (dmMatch) {
    const day = dmMatch[1].padStart(2, '0');
    const month = dmMatch[2].padStart(2, '0');
    const year = dmMatch[3];
    return `${year}-${month}-${day}`;
  }

  // 3. Numeric timestamp string (seconds or ms)
  if (/^\d{10,14}$/.test(str)) {
    const n = Number(str);
    const d = new Date(n < 10000000000 ? n * 1000 : n);
    if (!isNaN(d.getTime())) return getLocalDateIso(d);
  }

  // 4. Fallback to standard JS Date parser
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return getLocalDateIso(d);
  }
  return '';
}

/**
 * Checks if a given date string falls into the specified Year-Month (e.g. "2026-09").
 * Accurately parses DD/MM/YYYY, ISO, and Arabic numerals.
 */
export function isDateInYearMonth(rawDate?: string | number | null, yearMonth?: string): boolean {
  if (!yearMonth || yearMonth === 'all') return true;
  if (!rawDate && rawDate !== 0) return false;
  const iso = normalizeDateToIso(rawDate);
  if (iso) {
    return iso.startsWith(yearMonth);
  }
  return false;
}

/**
 * Checks if a given date falls within a custom fromDate and toDate range.
 */
export function isDateInRange(rawDate?: string | number | null, startDate?: string, endDate?: string): boolean {
  // If neither boundary is specified, accept all
  if (!startDate && !endDate) return true;
  if (!rawDate && rawDate !== 0) return false;
  const iso = normalizeDateToIso(rawDate);
  if (!iso) return false;

  const startIso = startDate ? normalizeDateToIso(startDate) || startDate : '';
  const endIso = endDate ? normalizeDateToIso(endDate) || endDate : '';

  if (startIso && iso < startIso) return false;
  if (endIso && iso > endIso) return false;
  return true;
}

/**
 * Formats date into a clean, legible Egyptian Arabic display format (e.g. "15/09/2026").
 */
export function formatDateDisplay(rawDate?: string | number | Date | null): string {
  const iso = normalizeDateToIso(rawDate);
  if (!iso) return rawDate ? String(rawDate) : '—';
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
}

export function orderSubtotal(o: { lines?: { qty: number; price: number }[] }): number {
  return (o.lines || []).reduce((a, l) => a + (l.qty || 0) * (l.price || 0), 0);
}

export function orderTaxTotal(o: {
  lines?: { qty: number; price: number; taxable?: boolean; taxRate?: number }[];
  hasTax?: boolean;
  taxRate?: number;
}): number {
  const lines = o.lines || [];
  const taxSum = lines.reduce((sum, l) => {
    const isTaxable = l.taxable === true;
    if (isTaxable) {
      const rate = l.taxRate !== undefined ? l.taxRate : (o.taxRate !== undefined ? o.taxRate : 14);
      return sum + (l.qty || 0) * (l.price || 0) * (rate / 100);
    }
    return sum;
  }, 0);
  return Math.round(taxSum * 100) / 100;
}

export function orderTotal(o: {
  lines?: { qty: number; price: number; taxable?: boolean; taxRate?: number }[];
  hasTax?: boolean;
  taxRate?: number;
  shippingCost?: number;
  totalAmount?: number;
}): number {
  if (o.totalAmount !== undefined && o.totalAmount > 0) {
    return o.totalAmount;
  }
  const sub = orderSubtotal(o);
  const tax = orderTaxTotal(o);
  const shipping = typeof o.shippingCost === 'number' && o.shippingCost > 0 ? o.shippingCost : 0;
  return Math.round((sub + tax + shipping) * 100) / 100;
}

export function fmtDuration(ms?: number): string {
  if (!ms || ms < 0) return '—';
  const h = ms / 3600000;
  if (h < 1) return Math.round(ms / 60000) + ' دقيقة';
  if (h < 24) return h.toFixed(1) + ' ساعة';
  return (h / 24).toFixed(1) + ' يوم';
}

export function normName(s?: string): string {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Normalizes Arabic text for strict deduplication matching:
 * - Unifies alef forms (أ, إ, آ -> ا)
 * - Unifies yaa / alef maqsura (ى -> ي)
 * - Unifies taa marbuta / haa (ة -> ه)
 * - Strips Arabic diacritics / tashkeel and extra spaces
 */
export function normArabic(s?: string): string {
  if (!s) return '';
  return s
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Checks whether an item name is already taken in the inventory or pending cart lines.
 */
export function isDuplicateItemName(
  name: string,
  existingItems: InventoryItem[] = [],
  extraNames: string[] = []
): boolean {
  const targetNorm = normArabic(name);
  if (!targetNorm) return false;

  const inItems = existingItems.some((i) => normArabic(i.name) === targetNorm);
  if (inItems) return true;

  const inExtras = extraNames.some((n) => normArabic(n) === targetNorm);
  return inExtras;
}

/**
 * Checks whether an item code is already taken in the inventory or pending cart lines.
 */
export function isDuplicateItemCode(
  code: string,
  existingItems: InventoryItem[] = [],
  extraCodes: string[] = []
): boolean {
  const target = (code || '').trim().toUpperCase();
  if (!target) return false;

  const inItems = existingItems.some((i) => (i.code || '').trim().toUpperCase() === target);
  if (inItems) return true;

  const inExtras = extraCodes.some((c) => (c || '').trim().toUpperCase() === target);
  return inExtras;
}

/**
 * Smart Item Code Generator per Category / Department
 * - Normalizes STAT to OFF so "أدوات مكتبية وقرطاسية" is 100% unified.
 * - Always inspects ALL existing items in the category and pending extra codes.
 * - Identifies the true highest number (e.g. for OFF it finds OFF-88 -> produces OFF-89).
 * - Guarantees the generated code is completely unique and never repeats or resets to 01!
 */
export function getNextItemCode(
  cat: CategoryKey,
  items: InventoryItem[] = [],
  extraCodes: string[] = []
): string {
  const normalizedCat = (cat === 'STAT' ? 'OFF' : cat) as CategoryKey;
  const targetPrefix = `${normalizedCat}-`;

  const catItems = (items || []).filter((i) => {
    const itCat = i.cat === 'STAT' ? 'OFF' : i.cat;
    return (
      itCat === normalizedCat ||
      ((i.code || '').trim().toUpperCase().startsWith(targetPrefix))
    );
  });

  const allCodes = [
    ...catItems.map((i) => (i.code || '').trim()),
    ...extraCodes.map((c) => (c || '').trim())
  ];

  let maxNum = 0;
  let padLen = 2;

  for (const code of allCodes) {
    // Match code ending with digits
    const m = code.match(/^(.*?)(\d+)$/);
    if (m) {
      const num = parseInt(m[2], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
        padLen = Math.max(m[2].length, 2);
      }
    }
  }

  // Find next unused code strictly greater than maxNum
  let candidateNum = Math.max(maxNum, 0) + 1;
  let candidateCode = `${targetPrefix}${String(candidateNum).padStart(padLen, '0')}`;

  // Build global set of existing codes across the whole database + extraCodes
  const allExistingCodesUpper = new Set([
    ...(items || []).map((i) => (i.code || '').trim().toUpperCase()),
    ...extraCodes.map((c) => (c || '').trim().toUpperCase())
  ]);

  while (allExistingCodesUpper.has(candidateCode.toUpperCase())) {
    candidateNum++;
    candidateCode = `${targetPrefix}${String(candidateNum).padStart(padLen, '0')}`;
  }

  return candidateCode;
}

export function convertArabicIndicDigits(str?: string | number): string {
  if (str === undefined || str === null) return '';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  return String(str)
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)));
}

/**
 * Cleans and formats a genuine person/employee name
 */
export function cleanPersonName(name?: any): string {
  if (name === undefined || name === null) return '';
  let t = convertArabicIndicDigits(String(name)).trim();
  if (!t) return '';

  // Reject system placeholders and empty indicators
  if (/^(null|undefined|none|n\/a|na|بدون|لا يوجد|غير محدد|مخزن|بالمخزن|احتياطي|فاضي|غير مسند)$/i.test(t)) {
    return '';
  }

  // Reject pure phone numbers or National IDs mistakenly placed in name column
  if (/^01[0125]\d{8}$/.test(t) || /^\d{14}$/.test(t)) {
    return '';
  }

  // Reject technical telecom carrier keywords if whole word matches
  if (/^(خدمة|خدمات|باقة|باقات|اشتراك|فاتورة|حساب|رقم|موبايل|تليفون|كود|عميل|شركة|فودافون|أورانج|اتصالات|وي|مصرية للاتصالات|محمول|إنترنت|شريحة|خط|مخزن|telecom|vodafone|orange|etisalat|we)$/i.test(t)) {
    return '';
  }

  // Reject corrupted encoding / mojibake characters
  if (/[\uFFFD\u0080-\u009FÿØ×÷¤§©®]/i.test(t)) return '';

  // Must contain Arabic or Latin letters
  if (!/[\u0600-\u06FFa-zA-Z]/.test(t)) return '';

  // Clean leading and trailing noisy symbols (e.g. quotes, brackets, colons, slashes)
  t = t.replace(/^[^\w\u0600-\u06FF]+|[^\w\u0600-\u06FF]+$/g, '').trim();

  if (t.length >= 2 && t.length <= 60) {
    return t;
  }
  return '';
}

/**
 * Strictly verifies whether a string is a genuine employee/person name,
 * and NOT a code, invoice ID, technical package name, or corrupted font glyph.
 */
export function isCleanPersonName(name?: any): boolean {
  return cleanPersonName(name).length >= 2;
}

export function normalizeEgyptPhone(input?: string | number): string {
  if (input === undefined || input === null) return '';
  let raw = String(input).trim();
  raw = convertArabicIndicDigits(raw);

  // If raw string has explicit date format like 01/10/2024 or 2024-10-01, reject
  if (/\b\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}\b/.test(raw) && !raw.includes('+20')) {
    return '';
  }

  // Handle scientific notation from Excel like 1.012345678e+10
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(raw)) {
    const num = Number(raw);
    if (!isNaN(num)) {
      raw = Math.round(num).toString();
    }
  }

  // Remove trailing .0 or .00 from excel floating point exports
  raw = raw.replace(/\.0+$/, '');

  // If raw has decimal point followed by digits (e.g. monetary cost 1050.25), reject
  if (/\.\d{1,2}$/.test(raw)) {
    return '';
  }

  // First check if the text contains a strict standalone Egyptian phone number
  // Using negative lookbehind and lookahead so it cannot be part of a longer sequence of digits
  const standaloneMatch = raw.match(/(?<![\d.])(?:(?:\+?20|0020|20)?)(0?1[0125]\d{8})(?![\d.])/);
  if (standaloneMatch) {
    let m = standaloneMatch[1];
    if (!m.startsWith('0')) m = '0' + m;
    return m;
  }

  // Strip spaces, dashes, parentheses, colons, slashes and non-digits (keeping +)
  let cleaned = raw.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+20')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('0020')) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('20') && cleaned.length === 12 && /^20(0?1[0125])/.test(cleaned)) {
    cleaned = cleaned.slice(2);
  }

  cleaned = cleaned.replace(/\D/g, '');

  // Must be EXACTLY 10 digits (starting with 10, 11, 12, 15) or 11 digits (starting with 010, 011, 012, 015)
  if (cleaned.length === 10 && /^1[0125]\d{8}$/.test(cleaned)) {
    return '0' + cleaned;
  }

  if (cleaned.length === 11 && /^01[0125]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // NEVER extract slices from longer digit sequences (e.g. barcodes, national IDs, ICCIDs, IBANs)
  return '';
}

export function normNumber(n?: string | number): string {
  return normalizeEgyptPhone(n);
}

/**
 * Merges and deduplicates MobileLine array strictly by normalized Egyptian phone number.
 * Combines details (employee name, national ID, plan, cost, notes, active status).
 */
export function deduplicateLines(linesList: MobileLine[]): MobileLine[] {
  if (!Array.isArray(linesList)) return [];
  const map = new Map<string, MobileLine>();

  linesList.forEach((line) => {
    if (!line) return;
    const rawNum = line.number || '';
    const norm = normalizeEgyptPhone(rawNum) || String(rawNum).trim();
    if (!norm) return;

    if (map.has(norm)) {
      const existing = map.get(norm)!;
      // Merge properties intelligently:
      // 1. Employee
      const emp = (isCleanPersonName(line.employee) && line.employee) || (isCleanPersonName(existing.employee) && existing.employee) || existing.employee || line.employee;
      // 2. National ID
      const nid = cleanEgyptianNationalId(line.nationalId) || cleanEgyptianNationalId(existing.nationalId) || existing.nationalId || line.nationalId;
      // 3. Plan
      const plan = line.plan || existing.plan;
      // 4. Monthly cost (prefer non-zero)
      const monthlyCost = line.monthlyCost && line.monthlyCost > 0 ? line.monthlyCost : (existing.monthlyCost || 0);
      // 5. Status
      const status: 'نشط' | 'معطل' = (line.status === 'نشط' || existing.status === 'نشط') ? 'نشط' : (line.status || existing.status || 'نشط');
      // 6. Note
      const note = line.note ? (existing.note && !existing.note.includes(line.note) ? `${existing.note} | ${line.note}` : line.note) : existing.note;
      
      map.set(norm, {
        ...existing,
        id: existing.id || line.id || uid(),
        number: norm,
        employee: emp,
        nationalId: nid,
        plan,
        monthlyCost,
        status,
        note
      });
    } else {
      map.set(norm, {
        ...line,
        id: line.id || uid(),
        number: norm,
        employee: isCleanPersonName(line.employee) ? line.employee!.trim() : undefined,
        nationalId: cleanEgyptianNationalId(line.nationalId) || line.nationalId || undefined,
        monthlyCost: line.monthlyCost || 0,
        status: line.status || 'نشط'
      });
    }
  });

  return Array.from(map.values());
}

export interface TelecomBillLineMatch {
  number: string;
  amount: number;
  rawText?: string;
}

export function extractEgyptPhonesFromText(text: string): string[] {
  if (!text) return [];
  const results: string[] = [];
  
  // Normalize whitespace & convert Arabic-Indic numerals
  const normalized = convertArabicIndicDigits(text.replace(/[\r\t]/g, ' '));
  
  // Egyptian numbers with strict standalone boundaries:
  // Must NOT be preceded by a digit or dot, must NOT be followed by a digit or dot
  const regex = /(?<![\d.])(?:(?:\+?20|0020|20)?)(0?1[0125]\d{8})(?![\d.])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    let num = match[1];
    if (!num.startsWith('0')) {
      num = '0' + num;
    }
    // Verify it has genuine digit diversity (not 01000000000 dummy)
    const uniqueDigits = new Set(num.split('')).size;
    if (uniqueDigits >= 3 && !results.includes(num)) {
      results.push(num);
    }
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }
  }

  return results;
}

// Smart extractor that reads both mobile line and corresponding bill charge
export function extractLinesAndAmountsFromText(text: string): TelecomBillLineMatch[] {
  if (!text) return [];
  const converted = convertArabicIndicDigits(text);
  const lines = converted.split(/\n+/);
  const foundMap = new Map<string, number>();

  for (const line of lines) {
    const phoneMatches = extractEgyptPhonesFromText(line);
    if (!phoneMatches.length) continue;

    // Look for decimal or integer currency amounts in the same line
    const amounts = line.match(/\b\d+(?:\.\d{1,2})?\b/g) || [];
    let detectedAmount = 0;

    for (const amtStr of amounts) {
      // Exclude strings that look like the phone number or years
      if (amtStr.length >= 8 || amtStr === '2024' || amtStr === '2025' || amtStr === '2026') continue;
      const parsed = parseFloat(amtStr);
      if (parsed > 0 && parsed < 20000) {
        detectedAmount = parsed;
        break;
      }
    }

    phoneMatches.forEach((num) => {
      if (!foundMap.has(num)) {
        foundMap.set(num, detectedAmount);
      }
    });
  }

  return Array.from(foundMap.entries()).map(([number, amount]) => ({
    number,
    amount,
  }));
}

// Valid Egyptian Governorate codes
export const EGYPT_GOVERNORATE_CODES: Record<string, string> = {
  '01': 'القاهرة',
  '02': 'الإسكندرية',
  '03': 'بورسعيد',
  '04': 'السويس',
  '11': 'دمياط',
  '12': 'الدقهلية',
  '13': 'الشرقية',
  '14': 'القليوبية',
  '15': 'كفر الشيخ',
  '16': 'الغربية',
  '17': 'المنوفية',
  '18': 'البحيرة',
  '19': 'الإسماعيلية',
  '21': 'الجيزة',
  '22': 'بني سويف',
  '23': 'الفيوم',
  '24': 'المنيا',
  '25': 'أسيوط',
  '26': 'سوهاج',
  '27': 'قنا',
  '28': 'أسوان',
  '29': 'الأقصر',
  '31': 'البحر الأحمر',
  '32': 'الوادي الجديد',
  '33': 'مطروح',
  '34': 'شمال سيناء',
  '35': 'جنوب سيناء',
  '88': 'خارج الجمهورية'
};

/**
 * Validates genuine Egyptian National ID (الرقم القومي المصري - 14 رقم)
 * Strictly verifies:
 * 1. 14 digits after converting Arabic digits and stripping non-digits
 * 2. Starts with 2 (born 1900-1999) or 3 (born 2000-2099)
 * 3. Month between 01 and 12
 * 4. Day between 01 and 31
 * 5. Valid Egyptian governorate code
 */
export function isValidEgyptianNationalId(val: any): boolean {
  if (val === undefined || val === null || val === '') return false;
  let str = convertArabicIndicDigits(String(val)).trim();
  // Handle Excel scientific notation if present (e.g. 2.950101e+13)
  if (/^[\d.eE+-]+$/.test(str) && (str.includes('e') || str.includes('E'))) {
    try {
      const num = Number(str);
      if (!isNaN(num) && num > 0) {
        str = BigInt(Math.floor(num)).toString();
      }
    } catch {
      // ignore
    }
  }
  const digitsOnly = str.replace(/\D/g, '');
  if (digitsOnly.length !== 14) return false;

  const century = digitsOnly.charAt(0);
  if (century !== '2' && century !== '3') return false;

  const month = parseInt(digitsOnly.substring(3, 5), 10);
  if (isNaN(month) || month < 1 || month > 12) return false;

  const day = parseInt(digitsOnly.substring(5, 7), 10);
  if (isNaN(day) || day < 1 || day > 31) return false;

  const govCode = digitsOnly.substring(7, 9);
  if (!EGYPT_GOVERNORATE_CODES[govCode]) return false;

  return true;
}

/**
 * Cleans and returns a validated 14-digit Egyptian National ID or null
 */
export function cleanEgyptianNationalId(val: any): string | null {
  if (val === undefined || val === null || val === '') return null;
  let str = convertArabicIndicDigits(String(val)).trim();
  if (/^[\d.eE+-]+$/.test(str) && (str.includes('e') || str.includes('E'))) {
    try {
      const num = Number(str);
      if (!isNaN(num) && num > 0) {
        str = BigInt(Math.floor(num)).toString();
      }
    } catch {
      // ignore
    }
  }
  const digitsOnly = str.replace(/\D/g, '');
  if (isValidEgyptianNationalId(digitsOnly)) {
    return digitsOnly;
  }
  return null;
}

/**
 * Extracts metadata (birth date, governorate, gender) from a valid Egyptian National ID
 */
export function getNationalIdMetadata(nationalId: string): {
  birthDate: string;
  governorate: string;
  gender: 'ذكر' | 'أنثى';
} | null {
  const clean = cleanEgyptianNationalId(nationalId);
  if (!clean) return null;

  const century = clean.charAt(0);
  const yearPrefix = century === '2' ? '19' : '20';
  const year = yearPrefix + clean.substring(1, 3);
  const month = clean.substring(3, 5);
  const day = clean.substring(5, 7);
  const govCode = clean.substring(7, 9);
  const governorate = EGYPT_GOVERNORATE_CODES[govCode] || 'غير محدد';
  const genderDigit = parseInt(clean.charAt(12), 10);
  const gender: 'ذكر' | 'أنثى' = genderDigit % 2 === 1 ? 'ذكر' : 'أنثى';

  return {
    birthDate: `${day}/${month}/${year}`,
    governorate,
    gender
  };
}

// Smart telecom Excel row detector
export function parseTelecomRow(row: Record<string, any>): {
  number: string;
  amount: number;
  employee: string;
  plan: string;
  note: string;
  nationalId: string;
} {
  const keys = Object.keys(row);
  
  // 1. Detect Phone Column
  let rawNumber = '';
  const phoneKey = keys.find((k) =>
    /(?:^|\b|_)(?:msisdn|mobile|phone|gsm|dial|service|تليفون|هاتف|محمول|الرقم|رقم الخط|رقم الموبايل|رقم الشريحة|رقم الخدمة|رقم التليفون|رقم الهاتف|خط|شريحة)(?:\b|_|$)/i.test(k.trim())
  );

  if (phoneKey && row[phoneKey] !== undefined && row[phoneKey] !== null) {
    const directVal = String(row[phoneKey]);
    const norm = normalizeEgyptPhone(directVal);
    if (norm) {
      rawNumber = norm;
    } else {
      rawNumber = directVal;
    }
  }

  // If no direct valid phone number found from phoneKey, search all cells
  if (!rawNumber || !normalizeEgyptPhone(rawNumber)) {
    for (const k of keys) {
      const val = row[k];
      if (val === undefined || val === null || val === '') continue;
      const norm = normalizeEgyptPhone(val);
      if (/^01[0125]\d{8}$/.test(norm)) {
        rawNumber = norm;
        break;
      }
    }
  }

  const cleanNumber = normalizeEgyptPhone(rawNumber);

  // 2. Detect Egyptian National ID (الرقم القومي المصري - 14 رقم)
  // Priority A: Check column headers that explicitly indicate National ID / Civil ID / البطاقة
  let nationalId = '';
  const nidKey = keys.find((k) =>
    /قومي|الرقم القومي|بطاقة|رقم البطاقة|هوية|رقم الهوية|الرقم التأميني|national[_\s]?id|nid|national_no|ssn|id[_\s]?number|id[_\s]?no|civil[_\s]?id/i.test(k)
  );

  if (nidKey && row[nidKey] !== undefined && row[nidKey] !== null) {
    const cleaned = cleanEgyptianNationalId(row[nidKey]);
    if (cleaned) {
      nationalId = cleaned;
    }
  }

  // Priority B: If no explicit header, search other cells for a genuine 14-digit Egyptian National ID
  if (!nationalId) {
    for (const k of keys) {
      if (k === phoneKey) continue;
      const val = row[k];
      if (val === undefined || val === null || val === '') continue;
      const cleaned = cleanEgyptianNationalId(val);
      if (cleaned) {
        nationalId = cleaned;
        break;
      }
    }
  }

  // 3. Detect Amount / Cost Column
  let amount = 0;
  const costKey = keys.find((k) =>
    /مبلغ|قيمة|إجمالي|مستحق|فاتورة|اشتراك|تكلفة|رسوم|حساب|amount|total|net|cost|price|fee|charge|bill|subtotal/i.test(k)
  );

  if (costKey && row[costKey] !== undefined) {
    const rawVal = convertArabicIndicDigits(String(row[costKey]));
    const val = parseFloat(rawVal.replace(/[^\d.]/g, ''));
    if (!isNaN(val)) amount = val;
  } else {
    // If no cost header, find first small numeric column that isn't the phone or an ID
    for (const k of keys) {
      if (k === phoneKey || k === nidKey) continue;
      const rawVal = convertArabicIndicDigits(String(row[k] || ''));
      const num = parseFloat(rawVal);
      if (!isNaN(num) && num > 0 && num < 10000 && String(num).length < 7 && num !== 2024 && num !== 2025 && num !== 2026) {
        amount = num;
        break;
      }
    }
  }

  // 4. Detect Employee Column (Strictly for employee/person name, NOT service/package/company name)
  let employee = '';
  const empKey = keys.find((k) => {
    const lk = k.trim().toLowerCase();
    // Exclude columns that refer to service name, plan name, company name, billing codes, or phone/national ID
    if (/خدمة|باقة|شركة|ملف|فاتورة|كود|حساب|تعريفة|قومي|بطاقة|هاتف|موبايل|تليفون|service|package|plan|company|file|bill|tariff|national|nid|msisdn|mobile|phone/i.test(lk)) {
      return false;
    }
    return /(?:موظف|الموظف|موظفين|الموظفين|اسم|الاسم|الاسم بالكامل|اسم العامل|المستخدم|المسؤول|المسئول|المسند|المستلم|صاحب|مشترك|حامل|عامل|شخص|بيانات الموظف|عضو|employee|emp|name|user|staff|person|worker|holder|subscriber|assignee)/i.test(lk);
  });

  if (empKey && row[empKey] !== undefined && row[empKey] !== null) {
    const rawEmp = cleanPersonName(row[empKey]);
    if (rawEmp) {
      employee = rawEmp;
    }
  }

  // If no employee column found by explicit header, scan other text cells for a valid person name
  if (!employee) {
    for (const k of keys) {
      if (k === phoneKey || k === nidKey || k === costKey) continue;
      const val = row[k];
      if (val === undefined || val === null || val === '') continue;
      const candidate = cleanPersonName(val);
      if (candidate && candidate.length >= 2 && !/^\d+$/.test(candidate)) {
        employee = candidate;
        break;
      }
    }
  }

  // 5. Detect Plan Column
  const planKey = keys.find((k) =>
    /باقة|خطة|نوع|تعريفة|plan|bundle|tariff|package|type/i.test(k)
  );
  const plan = planKey ? String(row[planKey] || '').trim() : '';

  // 6. Notes
  const noteKey = keys.find((k) => /ملاحظ|تفاصيل|note|remarks|desc|comment/i.test(k));
  const note = noteKey ? String(row[noteKey] || '').trim() : '';

  return {
    number: cleanNumber,
    amount,
    employee,
    plan,
    note,
    nationalId
  };
}

export const ROLE_ALLOWED_TABS: Record<string, TabKey[]> = {
  manager: [
    'dashboard',
    'inventory',
    'procurement',
    'maintenance',
    'buffet',
    'cleaning',
    'lines',
    'requests',
    'costs',
    'reports',
    'settings',
    'ai'
  ],
  warehouse: ['inventory', 'requests'],
  purchase: ['procurement', 'requests'],
  buffet: ['buffet', 'requests'],
  cleaning: ['cleaning', 'requests'],
  maint: ['maintenance', 'requests'],
  reception: ['lines', 'requests']
};

/* ---------------- Department Launcher & Multi-Device Tools ---------------- */
export function downloadDepartmentLauncher(deptKey: string, deptLabel: string) {
  if (typeof window === 'undefined') return;
  const origin = window.location.origin;
  const targetUrl = `${origin}/?dept=${deptKey}`;
  const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>بوابة ${deptLabel} — أكاديمية مونجلش</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #075073; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
    .card { background: rgba(255,255,255,0.08); padding: 36px 28px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.18); max-width: 440px; width: 90%; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
    h1 { font-size: 22px; margin-bottom: 8px; color: #E68131; }
    .badge { display: inline-block; background: rgba(230,129,49,0.2); color: #E68131; font-weight: bold; padding: 4px 14px; border-radius: 9999px; font-size: 13px; margin-bottom: 16px; border: 1px solid rgba(230,129,49,0.3); }
    p { font-size: 14px; opacity: 0.9; line-height: 1.7; margin-bottom: 24px; }
    .lock-note { font-size: 12px; color: #94a3b8; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 12px; margin-bottom: 24px; border-right: 3px solid #E68131; text-align: right; }
    a { display: inline-block; background: #E68131; color: #fff; font-weight: bold; padding: 14px 32px; border-radius: 14px; text-decoration: none; font-size: 15px; box-shadow: 0 4px 12px rgba(230,129,49,0.3); }
  </style>
</head>
<body>
  <div class="card">
    <h1>أكاديمية مونجلش الدولية</h1>
    <div class="badge">🔒 بوابة الدخول لقسم: ${deptLabel}</div>
    <p>جاري تحويلك إلى شاشة تسجيل الدخول المعتمدة لقسم ${deptLabel}...</p>
    <div class="lock-note">
      ✓ يتم التحقق من الصلاحيات عبر Firebase Auth وقاعدة بيانات المستخدمين.
    </div>
    <a href="${targetUrl}">الدخول الفوري للبوابة</a>
  </div>
  <script>
    window.location.replace("${targetUrl}");
  </script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `بوابة_${deptLabel.replace(/\s+/g, '_')}_مونجلش.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function lsGet<T>(key: string, def: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return def;
    const v = localStorage.getItem(key);
    if (v === null || v === undefined || v === '' || v === 'undefined' || v === 'null') {
      return def;
    }
    const parsed = JSON.parse(v);
    if (parsed === null || parsed === undefined) {
      return def;
    }
    // Strict Type Guard: If default is an array, ensure parsed value is an array
    if (Array.isArray(def) && !Array.isArray(parsed)) {
      console.warn(`[Storage] Type mismatch for key ${key}: expected Array, got ${typeof parsed}. Using fallback.`);
      return def;
    }
    // Strict Type Guard: If default is a plain object, ensure parsed value is a valid object
    if (typeof def === 'object' && def !== null && !Array.isArray(def) && (typeof parsed !== 'object' || Array.isArray(parsed))) {
      console.warn(`[Storage] Type mismatch for key ${key}: expected Object, got ${typeof parsed}. Using fallback.`);
      return def;
    }
    return parsed as T;
  } catch (err) {
    console.warn(`[Storage] Error reading/parsing key "${key}":`, err);
    return def;
  }
}

export function lsSet<T>(key: string, val: T): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e: any) {
    console.warn('[Storage] localStorage write error (possibly quota exceeded):', e);
    // If quota exceeded, purge stray firestore mutation keys and prune logs
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k &&
          (k.startsWith('firestore_mutations') ||
            k.startsWith('firestore_clients') ||
            k.startsWith('firestore_'))
        ) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
      if (key !== SK.activities) {
        const activities = lsGet<any[]>(SK.activities, []);
        if (activities.length > 20) {
          localStorage.setItem(SK.activities, JSON.stringify(activities.slice(0, 15)));
        }
      }
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      // Graceful fallback
    }
  }
}

// Initial defaults for realistic branch simulation
const SEED_SUPPLIERS: Supplier[] = [
  { id: 's1', name: 'مكتبة الأهرام الحديثة', phone: '01011223344', notes: 'توريدات ورق وطباعة' },
  { id: 's2', name: 'هايبر ماركت فتح الله', phone: '01223344556', notes: 'مستلزمات بوفيه وشاي وسكر' },
  { id: 's3', name: 'الشركة المصرية لتجارة المنظفات', phone: '01155667788', notes: 'مطهرات وأدوات نظافة' },
  { id: 's4', name: 'شركة النيل للصيانة والتكييف', phone: '01099887766', notes: 'صيانة قاعات وتبريد' }
];

const SEED_LINES: MobileLine[] = [
  { id: 'l1', number: '01012345678', employee: 'أحمد محمود', status: 'نشط', plan: 'Red Business 20G', monthlyCost: 250, note: 'مسؤول الاستقبال', addedDate: '2026-08-01' },
  { id: 'l2', number: '01098765432', employee: 'سارة إبراهيم', status: 'نشط', plan: 'Red Business 10G', monthlyCost: 180, note: 'شؤون الطلاب', addedDate: '2026-08-01' },
  { id: 'l3', number: '01055566677', employee: 'محمود الصاوي', status: 'نشط', plan: 'Business Voice', monthlyCost: 120, note: 'المشتريات والخدمات', addedDate: '2026-08-05' },
  { id: 'l4', number: '01022334455', employee: '', status: 'نشط', plan: 'كارت شحن', monthlyCost: 0, note: 'بالمخزن جاهز للاستخدام', addedDate: '2026-08-10' },
  { id: 'l5', number: '01099881122', employee: 'مصطفى كامل', status: 'معطل', plan: 'Red Business', monthlyCost: 0, note: 'خط مفصول - الموظف غادر', addedDate: '2026-07-15' }
];

const SEED_MAINT: MaintenanceTicket[] = [
  { id: 'MNT-2026-0001', ticketNumber: 'MNT-2026-0001', title: 'عطل في مكيف قاعة المحاضرات رقم 3', location: 'الدور الثاني - قاعة 3', priority: 'عاجل', status: 'قيد الإصلاح', date: today(), createdTs: Date.now() - 7200000, cost: 0, by: 'الاستقبال' },
  { id: 'MNT-2026-0002', ticketNumber: 'MNT-2026-0002', title: 'تسريب مياه في صنبور بوفيه الإدارة', location: 'الدور الأول - البوفيه', priority: 'متوسط', status: 'مغلق', date: today(), createdTs: Date.now() - 86400000, closedTs: Date.now() - 3600000, cost: 150, by: 'البوفيه' },
  { id: 'MNT-2026-0003', ticketNumber: 'MNT-2026-0003', title: 'صيانة جهاز البروجيكتور وتغيير اللمبة', location: 'المختبر الرئيسي', priority: 'متوسط', status: 'جديد', date: today(), createdTs: Date.now() - 1800000, cost: 0, by: 'المحاضرين' }
];

const SEED_RECURRING: RecurringTemplate[] = (monglishCommitments as unknown as RecurringTemplate[]).length > 0
  ? (monglishCommitments as unknown as RecurringTemplate[])
  : [
      { id: 'REC-2026-0001', title: 'اشتراك إنترنت فايبر للفرع (فودافون)', supplier: 'شركة فودافون للاتصالات', estCost: 1850, period: 'monthly', freq: 'شهري', active: true, nextDue: '2026-10-01' }
    ];

const SEED_PROC: PurchaseOrder[] = (monglishProcOrders as unknown as PurchaseOrder[]).length > 0
  ? (monglishProcOrders as unknown as PurchaseOrder[])
  : [
      {
        id: 'PO-2026-0001',
        orderNumber: 'PO-2026-0001',
        supplierId: 's1',
        supplier: 'مكتبة الأهرام الحديثة',
        date: today(),
        isoDate: isoToday(),
        status: 'مكتمل',
        note: 'شراء ورق طباعة وأقلام سبورة للفرع',
        by: 'المدير',
        lines: [
          { id: 'l1', itemId: 'OFF-67', itemName: 'رزمة ورق A4', cat: 'OFF', unit: 'رزمة', qty: 20, price: 120 }
        ]
      }
    ];

const SEED_REQS: DepartmentRequest[] = [
  {
    id: 'REQ-2026-0001',
    requestCode: 'REQ-2026-0001',
    title: 'طلب 5 رزم ورق تصوير إضافية للامتحانات',
    dept: 'الاستقبال وشؤون الطلاب',
    cat: 'أدوات مكتبية وقرطاسية',
    urgency: 'عاجل',
    status: 'جديد',
    date: today(),
    by: 'الاستقبال',
    note: 'بدء امتحانات منتصف الفصل الدراسي الأسبوع القادم'
  },
  {
    id: 'REQ-2026-0002',
    requestCode: 'REQ-2026-0002',
    title: 'تعبئة صابون أيدي ومناديل تواليت لجميع الأدوار',
    dept: 'النظافة والخدمات',
    cat: 'مستلزمات نظافة',
    urgency: 'عادي',
    status: 'معتمد',
    date: today(),
    by: 'النظافة',
    note: 'الرصيد أوشك على النفاد'
  }
];

const SEED_MOVES: StockMove[] = [
  { id: 'GRN-2026-0001', voucherNo: 'GRN-2026-0001', docType: 'GRN', itemId: 'i9', itemName: 'رزمة ورق A4', code: 'OFF-67', cat: 'OFF', type: 'in', qty: 20, cost: 2400, person: 'مكتبة الأهرام', date: today(), ts: Date.now() - 3600000, by: 'المشتريات' },
  { id: 'ISU-2026-0001', voucherNo: 'ISU-2026-0001', docType: 'ISU', itemId: 'i9', itemName: 'رزمة ورق A4', code: 'OFF-67', cat: 'OFF', type: 'out', qty: 5, cost: 600, person: 'شؤون الطلاب', date: today(), ts: Date.now() - 1800000, by: 'الاستقبال' }
];

const SEED_PETTY_CASH: any[] = [
  {
    id: 'EXP-2026-0001',
    voucherNo: 'EXP-2026-0001',
    title: 'شراء قهوة وسكر وشاي ضيافة للوفود',
    amount: 320,
    category: 'ضيافة_وطوارئ',
    date: '2026-09-02',
    month: '2026-09',
    paidBy: 'مسؤول البوفيه',
    department: 'البوفيه',
    paymentMethod: 'عهدة_نقدية',
    receiptNo: 'EXP-2026-0001',
    ts: Date.now() - 86400000 * 10
  },
  {
    id: 'EXP-2026-0002',
    voucherNo: 'EXP-2026-0002',
    title: 'مشوار تاكسي ونقل مستندات للشؤون القانونية',
    amount: 180,
    category: 'نقل_ومشاوير',
    date: '2026-09-05',
    month: '2026-09',
    paidBy: 'الاستقبال',
    department: 'الاستقبال',
    paymentMethod: 'عهدة_نقدية',
    receiptNo: 'EXP-2026-0002',
    ts: Date.now() - 86400000 * 7
  },
  {
    id: 'EXP-2026-0003',
    voucherNo: 'EXP-2026-0003',
    title: 'إصلاح طارئ لكالون باب الأكاديمية الرئيسي',
    amount: 250,
    category: 'صيانة_عاجلة',
    date: '2026-09-08',
    month: '2026-09',
    paidBy: 'المدير',
    department: 'الإدارة',
    paymentMethod: 'خزينة',
    receiptNo: 'EXP-2026-0003',
    ts: Date.now() - 86400000 * 4
  }
];

export interface AssetDueCalculation {
  status: 'overdue' | 'due_today' | 'due_soon' | 'on_track';
  daysUntilDue: number; // positive = days remaining, negative = days overdue, 0 = today
  statusLabel: string;
  statusBadgeColor: string;
  isAlertActive: boolean;
  formattedDueDate: string;
}

/**
 * Calculates the exact periodic maintenance due status and remaining days for an asset
 */
export function getAssetDueStatus(asset: MaintenanceAsset, refIsoDate?: string): AssetDueCalculation {
  const todayIso = refIsoDate || isoToday();
  const nextDue = normalizeDateToIso(asset.nextDueDate) || asset.nextDueDate;
  
  if (!nextDue) {
    return {
      status: 'on_track',
      daysUntilDue: 999,
      statusLabel: 'غير محدد',
      statusBadgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
      isAlertActive: false,
      formattedDueDate: '—'
    };
  }

  const dToday = new Date(todayIso + 'T00:00:00');
  const dDue = new Date(nextDue + 'T00:00:00');
  const diffMs = dDue.getTime() - dToday.getTime();
  const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const alertThreshold = asset.alertDaysBefore && asset.alertDaysBefore > 0 ? asset.alertDaysBefore : 7;
  const formattedDueDate = formatDateDisplay(nextDue);

  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    return {
      status: 'overdue',
      daysUntilDue,
      statusLabel: `متأخرة عن موعدها منذ ${overdueDays} يوم ⚠️`,
      statusBadgeColor: 'bg-rose-100 text-rose-900 border-rose-300 animate-pulse font-black',
      isAlertActive: true,
      formattedDueDate
    };
  }

  if (daysUntilDue === 0) {
    return {
      status: 'due_today',
      daysUntilDue: 0,
      statusLabel: 'مستحقة اليوم للصيانة الفورية 🔔',
      statusBadgeColor: 'bg-amber-500 text-white border-amber-600 font-black animate-bounce',
      isAlertActive: true,
      formattedDueDate
    };
  }

  if (daysUntilDue <= alertThreshold) {
    return {
      status: 'due_soon',
      daysUntilDue,
      statusLabel: `يقترب الموعد (متبقي ${daysUntilDue} ${daysUntilDue === 1 ? 'يوم' : daysUntilDue === 2 ? 'يومان' : 'أيام'}) ⏳`,
      statusBadgeColor: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
      isAlertActive: true,
      formattedDueDate
    };
  }

  return {
    status: 'on_track',
    daysUntilDue,
    statusLabel: `سارية ومنتظمة (متبقي ${daysUntilDue} يوم) ✓`,
    statusBadgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium',
    isAlertActive: false,
    formattedDueDate
  };
}

/**
 * Checks all active assets and auto-generates notifications in the activity system
 * for any asset whose periodic maintenance is due soon or overdue.
 */
export function checkAndGenerateAssetMaintenanceAlerts(assets: MaintenanceAsset[]): SystemActivity[] {
  if (!Array.isArray(assets) || assets.length === 0) return [];

  const existingActivities = loadActivities();
  const newActivities: SystemActivity[] = [];
  const todayIso = isoToday();
  const lastCheckedKey = 'monglish_asset_maint_alert_last_checked';
  const lastCheckedIso = localStorage.getItem(lastCheckedKey) || '';

  // Scan all active assets
  assets.forEach((asset) => {
    if (asset.status === 'inactive') return;

    const calc = getAssetDueStatus(asset, todayIso);
    if (!calc.isAlertActive) return;

    // Avoid duplicated notifications on the same day for the same asset
    const alertTag = `asset_alert_${asset.id}_${asset.nextDueDate}`;
    const alreadyLoggedToday = existingActivities.some((act) =>
      act.id.includes(alertTag) ||
      (act.details.includes(asset.assetCode || asset.name) && act.date === today() && act.type === 'maint')
    );

    if (!alreadyLoggedToday) {
      const isOverdue = calc.status === 'overdue';
      const isDueToday = calc.status === 'due_today';

      const act: SystemActivity = {
        id: `act_${alertTag}_${Date.now()}`,
        action: isOverdue ? '⚠️ تنبيه: موعد صيانة دورية متأخر لأصل' : isDueToday ? '🔔 تنبيه: موعد صيانة دورية مستحق اليوم' : '⏳ تنبيه: اقتراب موعد صيانة دورية لأصل',
        dept: 'قسم الصيانة والأصول',
        by: 'نظام المراقبة والتنبيه التلقائي',
        details: `الأصل: [${asset.name} - ${asset.assetCode}] في الموقع (${asset.location}). حالة الصيانة: ${calc.statusLabel}. الفني/الجهة: ${asset.assignedTechnician || 'غير محدد'}.`,
        date: today(),
        time: formatActivityClock(Date.now()),
        ts: Date.now(),
        type: 'maint',
        severity: isOverdue ? 'critical' : isDueToday ? 'warning' : 'warning',
        read: false
      };

      newActivities.push(act);
      logActivity(act);
    }
  });

  localStorage.setItem(lastCheckedKey, todayIso);
  return newActivities;
}

export function loadData<T>(key: string): T {
  const k = key.toUpperCase();
  if (k === 'ITEMS') return lsGet<T>(SK.items, [] as unknown as T);
  if (k === 'MOVES') return lsGet<T>(SK.moves, [] as unknown as T);
  if (k === 'PROC') return lsGet<T>(SK.proc, [] as unknown as T);
  if (k === 'MAINT') return lsGet<T>(SK.maint, [] as unknown as T);
  if (k === 'ASSETS') return lsGet<T>(SK.assets, [] as unknown as T);
  if (k === 'CLEAN') return lsGet<T>(SK.clean, [] as unknown as T);
  if (k === 'CLEAN_HIST') return lsGet<T>(SK.cleanHist, [] as unknown as T);
  if (k === 'LINES') {
    const rawLines = lsGet<MobileLine[]>(SK.lines, []);
    const cleaned = rawLines.map((l) => ({
      ...l,
      employee: isCleanPersonName(l.employee) ? l.employee : undefined,
      nationalId: cleanEgyptianNationalId(l.nationalId) || undefined
    }));
    return cleaned as unknown as T;
  }
  if (k === 'PETTY_CASH') return lsGet<T>(SK.pettyCash, [] as unknown as T);
  if (k === 'REQS') return lsGet<T>(SK.reqs, [] as unknown as T);
  if (k === 'SUPPLIERS') return lsGet<T>(SK.suppliers, [] as unknown as T);
  if (k === 'RECURRING') return lsGet<T>(SK.recurring, [] as unknown as T);
  if (k === 'STOCK') return lsGet<T>(SK.stock, [] as unknown as T);
  if (k === 'ACTIVITIES') return lsGet<T>(SK.activities, loadActivities() as unknown as T);
  if (k === 'ROLES') return lsGet<T>(SK.roles, loadRoles() as unknown as T);

  return lsGet<T>(key, [] as unknown as T);
}

export function saveData<T>(key: string, val: T): void {
  const k = key.toUpperCase();
  let mappedKey = key;
  if (k === 'ITEMS') mappedKey = SK.items;
  else if (k === 'MOVES') mappedKey = SK.moves;
  else if (k === 'PROC') mappedKey = SK.proc;
  else if (k === 'MAINT') mappedKey = SK.maint;
  else if (k === 'ASSETS') mappedKey = SK.assets;
  else if (k === 'CLEAN') mappedKey = SK.clean;
  else if (k === 'CLEAN_HIST') mappedKey = SK.cleanHist;
  else if (k === 'LINES') mappedKey = SK.lines;
  else if (k === 'PETTY_CASH') mappedKey = SK.pettyCash;
  else if (k === 'REQS') mappedKey = SK.reqs;
  else if (k === 'SUPPLIERS') mappedKey = SK.suppliers;
  else if (k === 'RECURRING') mappedKey = SK.recurring;
  else if (k === 'STOCK') mappedKey = SK.stock;
  else if (k === 'ACTIVITIES') mappedKey = SK.activities;
  else if (k === 'ROLES') mappedKey = SK.roles;

  let processedVal = val;
  if (mappedKey === SK.lines && Array.isArray(val)) {
    processedVal = deduplicateLines(val as any) as any;
  }

  // 1. Save to localStorage
  lsSet(mappedKey, processedVal);

  // 2. Mirror asynchronously to permanent IndexedDB
  try {
    idbSet(mappedKey, processedVal);
  } catch (err) {
    console.warn('idbSet failed:', err);
  }

  // 3. Mark user modifications in both localStorage and IndexedDB so restart or cache clearing doesn't wipe them
  try {
    const curVer = Math.max(Date.now(), Number(localStorage.getItem('monglish_data_version') || 0) + 1);
    const nowIso = new Date().toISOString();
    localStorage.setItem('monglish_has_user_changes', 'true');
    localStorage.setItem('monglish_data_version', String(curVer));
    localStorage.setItem('monglish_last_updated', nowIso);

    // Mirror change flags to IndexedDB
    idbSet('monglish_has_user_changes', 'true');
    idbSet('monglish_data_version', curVer);
    idbSet('monglish_last_updated', nowIso);
  } catch {}
}

/* ---------------- CSV & Excel Exports ---------------- */
export function exportToCsv(type: string): boolean {
  const items = loadData<InventoryItem[]>('ITEMS');
  const moves = loadData<StockMove[]>('MOVES');
  const proc = loadData<PurchaseOrder[]>('PROC');
  const maint = loadData<MaintenanceTicket[]>('MAINT');
  const assets = loadData<MaintenanceAsset[]>('ASSETS');
  const lines = loadData<MobileLine[]>('LINES');
  const reqs = loadData<DepartmentRequest[]>('REQS');
  const recurring = loadData<RecurringTemplate[]>('RECURRING');
  const pettyCash = loadData<PettyCashExpense[]>('PETTY_CASH');

  if (type === 'all') {
    downloadExcelWorkbook().catch(console.error);
    return true;
  }

  let rows: (string | number)[][] = [];
  let fn = type;

  if (type === 'assets' || type === 'asset_maint') {
    rows = [['كود الأصل', 'اسم الأصل / المعدة', 'التصنيف', 'الموقع', 'دورة الصيانة (أيام)', 'تاريخ آخر صيانة', 'موعد الصيانة القادم', 'حالة الاستحقاق', 'الفني / المورد', 'هاتف التواصل', 'التكلفة التقديرية', 'ملاحظات']];
    assets.forEach((ast) => {
      const calc = getAssetDueStatus(ast);
      rows.push([
        ast.assetCode,
        ast.name,
        ast.category,
        ast.location,
        ast.periodDays,
        ast.lastMaintenanceDate || '—',
        ast.nextDueDate || '—',
        calc.statusLabel,
        ast.assignedTechnician || '—',
        ast.vendorPhone || '—',
        ast.estimatedCost || 0,
        ast.notes || ''
      ]);
    });
    fn = 'assets_preventive_maintenance';
  } else if (type === 'inv' || type === 'items') {
    rows = [['الكود', 'الاسم', 'الفئة', 'الرصيد', 'الوحدة', 'الحد الأدنى', 'متوسط التكلفة', 'الحالة']];
    items.forEach((it) => {
      const statusLabel = it.balance <= 0 ? 'نفد ❌' : it.balance < it.min ? 'منخفض ⚠️' : 'متوفر ✅';
      rows.push([it.code, it.name, CATEGORIES[it.cat]?.n || it.cat, it.balance, it.unit, it.min, it.cost || 0, statusLabel]);
    });
    fn = 'inventory';
  } else if (type === 'low') {
    rows = [['الكود', 'الاسم', 'الفئة', 'الرصيد الحالي', 'الحد الأدنى', 'الوحدة', 'النقص المطلوب', 'الحالة']];
    items.filter((it) => it.balance <= it.min).forEach((it) => {
      const deficit = Math.max(0, it.min - it.balance);
      const statusLabel = it.balance <= 0 ? 'نفد بالكامل ❌' : 'منخفض عن الحد الأدنى ⚠️';
      rows.push([it.code, it.name, CATEGORIES[it.cat]?.n || it.cat, it.balance, it.min, it.unit, deficit, statusLabel]);
    });
    fn = 'low_stock_items';
  } else if (type === 'moves') {
    rows = [['الصنف', 'الكود', 'النوع', 'الكمية', 'بواسطة', 'المستلم/المورد', 'التاريخ', 'ملاحظات']];
    moves.forEach((m) => {
      rows.push([m.itemName, m.code, m.type === 'in' ? 'توريد' : 'صرف', m.qty, m.by, m.person || '', m.date, m.note || '']);
    });
    fn = 'stock_moves';
  } else if (type === 'proc') {
    rows = [['رقم الأمر', 'الصنف', 'الفئة', 'المورد', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الإجمالي', 'الحالة', 'التاريخ', 'بواسطة']];
    proc.forEach((o) => {
      (o.lines || []).forEach((l) => {
        rows.push([o.id, l.itemName, CATEGORIES[l.cat]?.n || l.cat, o.supplier || '', l.qty, l.unit, l.price, l.qty * l.price, o.status, o.date, o.by]);
      });
    });
    fn = 'procurement';
  } else if (type === 'buff') {
    rows = [['الصنف', 'الكمية', 'الوحدة', 'التكلفة', 'المورد', 'التاريخ']];
    proc.filter((o) => o.status === 'مكتمل').forEach((o) => {
      (o.lines || []).filter((l) => l.cat === 'BUFF').forEach((l) => {
        rows.push([l.itemName, l.qty, l.unit, l.qty * l.price, o.supplier, o.date]);
      });
    });
    fn = 'buffet_expenses';
  } else if (type === 'cln' || type === 'clean') {
    rows = [['الصنف', 'الكمية', 'الوحدة', 'التكلفة', 'المورد', 'التاريخ']];
    proc.filter((o) => o.status === 'مكتمل').forEach((o) => {
      (o.lines || []).filter((l) => l.cat === 'CLN').forEach((l) => {
        rows.push([l.itemName, l.qty, l.unit, l.qty * l.price, o.supplier, o.date]);
      });
    });
    fn = 'cleaning_expenses';
  } else if (type === 'maint') {
    rows = [['العطل', 'الموقع', 'الأولوية', 'الحالة', 'التاريخ', 'التكلفة', 'بواسطة']];
    maint.forEach((t) => {
      rows.push([t.title, t.location || '', t.priority, t.status, t.date, t.cost || 0, t.by]);
    });
    fn = 'maintenance';
  } else if (type === 'lines') {
    rows = [['الرقم', 'الموظف', 'الرقم القومي', 'الحالة', 'الباقة', 'التكلفة الشهرية', 'ملاحظات']];
    lines.forEach((l) => {
      const statusLabel = l.status === 'معطل' ? 'معطل' : l.employee && l.employee.trim() ? 'نشط' : 'في المخزون';
      rows.push([l.number, l.employee || '', l.nationalId || '', statusLabel, l.plan || '', l.monthlyCost || 0, l.note || '']);
    });
    fn = 'mobile_lines';
  } else if (type === 'reqs') {
    rows = [['الطلب', 'القسم', 'التصنيف', 'الأهمية', 'الحالة', 'التاريخ', 'بواسطة', 'ملاحظات']];
    reqs.forEach((r) => {
      rows.push([r.title, r.dept, r.cat, r.urgency, r.status, r.date, r.by, r.note || '']);
    });
    fn = 'department_requests';
  } else if (type === 'costs' || type === 'recurring') {
    rows = [['النوع', 'البند / الالتزام', 'التكلفة التقديرية', 'التكرار', 'الجهة / المورد', 'تاريخ الاستحقاق', 'ملاحظات']];
    recurring.forEach((rec) => {
      rows.push(['التزام دوري / قسط', rec.title, rec.estCost || 0, rec.freq || '', rec.supplier || '', rec.nextDue || '', rec.notes || '']);
    });
    pettyCash.forEach((p) => {
      rows.push(['مصروفات نثرية', p.title, p.amount || 0, 'فوري', p.category || '', p.date, p.notes || '']);
    });
    fn = 'financial_commitments_and_costs';
  } else if (type === 'petty') {
    rows = [['البند', 'المبلغ', 'التصنيف', 'المسؤول / الصارف', 'التاريخ', 'ملاحظات']];
    pettyCash.forEach((p) => {
      rows.push([p.title, p.amount || 0, p.category || '', p.paidBy || '', p.date, p.notes || '']);
    });
    fn = 'petty_cash';
  }

  if (!rows.length) return false;

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monglish_${fn}_${today().replace(/\//g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export async function downloadExcelWorkbook(): Promise<void> {
  const items = loadData<InventoryItem[]>('ITEMS');
  const moves = loadData<StockMove[]>('MOVES');
  const proc = loadData<PurchaseOrder[]>('PROC');
  const maint = loadData<MaintenanceTicket[]>('MAINT');
  const lines = loadData<MobileLine[]>('LINES');
  const reqs = loadData<DepartmentRequest[]>('REQS');

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // 1. Inventory Sheet
  const itemsData = items.map((it) => ({
    'كود الصنف': it.code,
    'اسم الصنف': it.name,
    'التصنيف': CATEGORIES[it.cat]?.n || it.cat,
    'الرصيد الحالي': it.balance,
    'الوحدة': it.unit,
    'الحد الأدنى': it.min,
    'سعر الوحدة': it.cost || 0,
    'قيمة الرصيد': it.balance * (it.cost || 0)
  }));
  const wsItems = XLSX.utils.json_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, 'المخزون');

  // 2. Stock Moves Sheet
  const movesData = moves.map((m) => ({
    'اسم الصنف': m.itemName,
    'الكود': m.code,
    'نوع الحركة': m.type === 'in' ? 'وارد (توريد)' : 'منصرف',
    'الكمية': m.qty,
    'الشخص / الجهة': m.person || '',
    'التاريخ': m.date,
    'المسؤول': m.by,
    'ملاحظات': m.note || ''
  }));
  const wsMoves = XLSX.utils.json_to_sheet(movesData);
  XLSX.utils.book_append_sheet(wb, wsMoves, 'حركات المخزن');

  // 3. Procurement Sheet
  const procRows: any[] = [];
  proc.forEach((o) => {
    (o.lines || []).forEach((l) => {
      procRows.push({
        'رقم الأمر': o.id,
        'المورد': o.supplier,
        'الصنف': l.itemName,
        'الكمية': l.qty,
        'الوحدة': l.unit,
        'سعر الوحدة': l.price,
        'الإجمالي': l.qty * l.price,
        'الحالة': o.status,
        'التاريخ': o.date
      });
    });
  });
  const wsProc = XLSX.utils.json_to_sheet(procRows);
  XLSX.utils.book_append_sheet(wb, wsProc, 'المشتريات');

  // 4. Maintenance Sheet
  const maintData = maint.map((t) => ({
    'وصف العطل': t.title,
    'الموقع': t.location,
    'الأولوية': t.priority,
    'الحالة': t.status,
    'التكلفة': t.cost || 0,
    'التاريخ': t.date,
    'المسؤول': t.by
  }));
  const wsMaint = XLSX.utils.json_to_sheet(maintData);
  XLSX.utils.book_append_sheet(wb, wsMaint, 'الصيانة');

  // 4.1. Assets & Preventive Maintenance Sheet
  const assets = loadData<MaintenanceAsset[]>('ASSETS');
  const assetsData = assets.map((a) => {
    const calc = getAssetDueStatus(a);
    return {
      'كود الأصل': a.assetCode,
      'اسم الأصل': a.name,
      'التصنيف': a.category,
      'الموقع': a.location,
      'دورة الصيانة': `${a.periodDays} يوم (${a.periodTitle || ''})`,
      'آخر صيانة': a.lastMaintenanceDate || '—',
      'الصيانة القادمة': a.nextDueDate || '—',
      'حالة الاستحقاق': calc.statusLabel,
      'الفني المسؤول': a.assignedTechnician || '—',
      'هاتف التواصل': a.vendorPhone || '—',
      'التكلفة التقديرية': a.estimatedCost || 0,
      'ملاحظات': a.notes || ''
    };
  });
  const wsAssets = XLSX.utils.json_to_sheet(assetsData);
  XLSX.utils.book_append_sheet(wb, wsAssets, 'الأصول والصيانة الدورية');

  // 5. Mobile Lines Sheet
  const linesData = lines.map((l) => ({
    'رقم الخط': l.number,
    'الموظف المسند إليه': l.employee || 'في المخزون',
    'الرقم القومي': l.nationalId || '',
    'الحالة': l.status,
    'الباقة': l.plan || '',
    'التكلفة الشهرية': l.monthlyCost || 0,
    'ملاحظات': l.note || ''
  }));
  const wsLines = XLSX.utils.json_to_sheet(linesData);
  XLSX.utils.book_append_sheet(wb, wsLines, 'خطوط الموبايل');

  // 6. Requests Sheet
  const reqsData = reqs.map((r) => ({
    'عنوان الطلب': r.title,
    'القسم الطالب': r.dept,
    'التصنيف': r.cat,
    'الأهمية': r.urgency,
    'الحالة': r.status,
    'التاريخ': r.date,
    'مقدم الطلب': r.by,
    'ملاحظات': r.note || ''
  }));
  const wsReqs = XLSX.utils.json_to_sheet(reqsData);
  XLSX.utils.book_append_sheet(wb, wsReqs, 'الطلبات');

  XLSX.writeFile(wb, `monglish_complete_office_report_${today().replace(/\//g, '-')}.xlsx`);
}

export function exportAllDataJson(): void {
  const fullBackup = {
    exportDate: today(),
    timestamp: Date.now(),
    branch: 'Monglish Academy - Alexandria',
    version: Number(localStorage.getItem('monglish_data_version') || 1),
    items: loadData('ITEMS'),
    moves: loadData('MOVES'),
    proc: loadData('PROC'),
    maint: loadData('MAINT'),
    assets: loadData('ASSETS'),
    clean: loadData('CLEAN'),
    cleanHist: loadData('CLEAN_HIST'),
    lines: loadData('LINES'),
    reqs: loadData('REQS'),
    suppliers: loadData('SUPPLIERS'),
    recurring: loadData('RECURRING'),
    stock: loadData('STOCK'),
    activities: loadActivities(),
    roles: loadRoles()
  };

  const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monglish_full_backup_${today().replace(/\//g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ValidatedBackupCollection {
  key: string;
  name: string;
  count: number;
  records: Array<Record<string, any>>;
}

export interface ExcludedBackupCollection {
  key: string;
  name: string;
  reason: string;
}

export interface BackupValidationSummary {
  valid: boolean;
  exportDate: string | null;
  validCollections: ValidatedBackupCollection[];
  excludedCollections: ExcludedBackupCollection[];
  ignoredKeys: string[];
  hasLegacyRolesWithPin: boolean;
  totalValidRecords: number;
  rawPayload: Record<string, any>;
  errorMessage?: string;
}

export const BACKUP_COLLECTION_METAS: Record<string, { name: string; storageKey: string }> = {
  items: { name: 'الأصناف المخزنية', storageKey: 'ITEMS' },
  moves: { name: 'حركات المخزن', storageKey: 'MOVES' },
  proc: { name: 'أوامر الشراء', storageKey: 'PROC' },
  maint: { name: 'بلاغات الصيانة', storageKey: 'MAINT' },
  assets: { name: 'الأصول والصيانة الدورية', storageKey: 'ASSETS' },
  clean: { name: 'مهام النظافة', storageKey: 'CLEAN' },
  cleanHist: { name: 'سجلات النظافة', storageKey: 'CLEAN_HIST' },
  lines: { name: 'خطوط المحمول', storageKey: 'LINES' },
  reqs: { name: 'طلبات الأقسام', storageKey: 'REQS' },
  suppliers: { name: 'بيانات الموردين', storageKey: 'SUPPLIERS' },
  recurring: { name: 'الالتزامات الدورية', storageKey: 'RECURRING' },
  stock: { name: 'عمليات الجرد', storageKey: 'STOCK' },
  pettyCash: { name: 'سجلات العهدة النقدية', storageKey: 'PETTY_CASH' },
  activities: { name: 'سجل العمليات', storageKey: 'ACTIVITIES' }
};

/**
 * Parses and strictly validates any backup file/payload before writing.
 * - Ensures each expected collection is an array where every item has an id.
 * - Excludes non-conforming collections without failing the entire restore.
 * - Explicitly detects and ignores legacy/system keys (roles, branch, exportDate, etc.).
 */
export async function parseAndValidateBackupPayload(
  jsonStringOrObjOrFile: string | Record<string, any> | File
): Promise<BackupValidationSummary> {
  try {
    let rawData: Record<string, any> = {};

    if (typeof File !== 'undefined' && jsonStringOrObjOrFile instanceof File) {
      const fileName = jsonStringOrObjOrFile.name.toLowerCase();
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
        rawData = await readExcelBackupWorkbook(jsonStringOrObjOrFile);
      } else {
        const text = await jsonStringOrObjOrFile.text();
        rawData = normalizeBackupPayload(text);
      }
    } else {
      rawData = normalizeBackupPayload(jsonStringOrObjOrFile);
    }

    if (!rawData || typeof rawData !== 'object' || Object.keys(rawData).length === 0) {
      return {
        valid: false,
        exportDate: null,
        validCollections: [],
        excludedCollections: [],
        ignoredKeys: [],
        hasLegacyRolesWithPin: false,
        totalValidRecords: 0,
        rawPayload: {},
        errorMessage: 'ملف النسخة الاحتياطية فارغ أو تالف أو بتنسيق غير معتمد'
      };
    }

    const exportDate =
      typeof rawData.exportDate === 'string' && rawData.exportDate.trim()
        ? rawData.exportDate.trim()
        : rawData.timestamp && typeof rawData.timestamp === 'number'
        ? new Date(rawData.timestamp).toISOString().split('T')[0]
        : null;

    const ignoredKeysSet = new Set([
      'roles',
      'branch',
      'exportDate',
      'timestamp',
      'version',
      'updatedAt',
      'lastUpdated',
      'monglish_data_version'
    ]);
    const ignoredKeys: string[] = [];
    let hasLegacyRolesWithPin = false;

    // Detect legacy roles key and pin fields
    if (rawData.roles && typeof rawData.roles === 'object') {
      ignoredKeys.push('roles');
      for (const rKey of Object.keys(rawData.roles)) {
        const roleObj = rawData.roles[rKey];
        if (roleObj && typeof roleObj === 'object' && ('pin' in roleObj || 'password' in roleObj)) {
          hasLegacyRolesWithPin = true;
          break;
        }
      }
    }

    // Detect other non-collection keys
    for (const key of Object.keys(rawData)) {
      if (ignoredKeysSet.has(key) && !ignoredKeys.includes(key)) {
        ignoredKeys.push(key);
      } else if (!BACKUP_COLLECTION_METAS[key] && !ignoredKeys.includes(key)) {
        ignoredKeys.push(key);
      }
    }

    const validCollections: ValidatedBackupCollection[] = [];
    const excludedCollections: ExcludedBackupCollection[] = [];
    let totalValidRecords = 0;

    for (const [colKey, meta] of Object.entries(BACKUP_COLLECTION_METAS)) {
      if (!(colKey in rawData)) continue;

      const rawVal = rawData[colKey];
      if (!Array.isArray(rawVal)) {
        excludedCollections.push({
          key: colKey,
          name: meta.name,
          reason: 'المحتوى ليس مصفوفة (Array) صالحة'
        });
        continue;
      }

      if (rawVal.length === 0) {
        continue;
      }

      // Ensure every item is an object with a non-empty id
      const invalidItems = rawVal.filter(
        (item: any) =>
          !item || typeof item !== 'object' || item.id == null || String(item.id).trim().length === 0
      );

      if (invalidItems.length > 0) {
        excludedCollections.push({
          key: colKey,
          name: meta.name,
          reason: `المجموعة تضم ${invalidItems.length} سجل يفتقر إلى معرّف فريد (id)`
        });
        continue;
      }

      validCollections.push({
        key: colKey,
        name: meta.name,
        count: rawVal.length,
        records: rawVal
      });
      totalValidRecords += rawVal.length;
    }

    if (validCollections.length === 0) {
      return {
        valid: false,
        exportDate,
        validCollections: [],
        excludedCollections,
        ignoredKeys,
        hasLegacyRolesWithPin,
        totalValidRecords: 0,
        rawPayload: rawData,
        errorMessage: 'الملف لا يحتوي على أي مجموعات بيانات مطابقة صالحة للاستيراد'
      };
    }

    return {
      valid: true,
      exportDate,
      validCollections,
      excludedCollections,
      ignoredKeys,
      hasLegacyRolesWithPin,
      totalValidRecords,
      rawPayload: rawData
    };
  } catch (err: any) {
    return {
      valid: false,
      exportDate: null,
      validCollections: [],
      excludedCollections: [],
      ignoredKeys: [],
      hasLegacyRolesWithPin: false,
      totalValidRecords: 0,
      rawPayload: {},
      errorMessage: `فشل قراءة وفحص بنية الملف: ${err?.message || err}`
    };
  }
}

/**
 * Merges incoming records with current list by ID.
 * - Existing records with different IDs are strictly preserved (no deletes).
 * - Incoming records overwrite existing records with identical ID.
 * - Returns the merged full list plus the specific list of records to push to cloud.
 */
export function mergeRecordsById<T extends { id: string | number }>(
  currentList: T[],
  incomingList: T[]
): { mergedList: T[]; recordsToPush: T[] } {
  const map = new Map<string, T>();

  // 1. Keep existing records
  for (const item of currentList) {
    if (item && item.id != null) {
      map.set(String(item.id).trim(), item);
    }
  }

  const recordsToPush: T[] = [];

  // 2. Overwrite or insert incoming records
  for (const item of incomingList) {
    if (item && item.id != null) {
      const cleanId = String(item.id).trim();
      map.set(cleanId, item);
      recordsToPush.push(item);
    }
  }

  return {
    mergedList: Array.from(map.values()),
    recordsToPush
  };
}

export async function restoreAllDataFromJson(
  jsonStringOrObjOrFile: string | Record<string, any> | File
): Promise<{ success: boolean; message: string; counts?: Record<string, number> }> {
  try {
    const validated = await parseAndValidateBackupPayload(jsonStringOrObjOrFile);
    if (!validated.valid) {
      return { success: false, message: validated.errorMessage || 'ملف غير صالح' };
    }

    const counts: Record<string, number> = {};

    // Save each valid collection merged with existing local storage
    for (const col of validated.validCollections) {
      const meta = BACKUP_COLLECTION_METAS[col.key];
      if (!meta) continue;

      const current = loadData<any[]>(meta.storageKey as any) || [];
      const { mergedList } = mergeRecordsById(current, col.records);
      saveData(meta.storageKey as any, mergedList);
      counts[col.name] = col.records.length;
    }

    localStorage.setItem('monglish_has_user_changes', 'true');
    const newVersion = (Number(localStorage.getItem('monglish_data_version') || 1)) + 100;
    localStorage.setItem('monglish_data_version', String(newVersion));
    localStorage.setItem('monglish_last_updated', new Date().toISOString());

    // Save full snapshot to IndexedDB
    try {
      await idbSaveFullSnapshot({
        items: loadData('ITEMS'),
        moves: loadData('MOVES'),
        proc: loadData('PROC'),
        maint: loadData('MAINT'),
        clean: loadData('CLEAN'),
        cleanHist: loadData('CLEAN_HIST'),
        lines: loadData('LINES'),
        reqs: loadData('REQS'),
        suppliers: loadData('SUPPLIERS'),
        recurring: loadData('RECURRING'),
        stock: loadData('STOCK'),
        pettyCash: loadData('PETTY_CASH'),
        activities: loadActivities(),
        version: newVersion,
        lastUpdated: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Failed to save restored backup to IndexedDB:', e);
    }

    // Synchronize valid collections to Firestore collections
    let fbCounts: Record<string, number> = {};
    try {
      const payloadToWrite: Record<string, any> = {};
      for (const col of validated.validCollections) {
        payloadToWrite[col.key] = col.records;
      }
      const fbRes = await restoreEntireBackupToFirestore(payloadToWrite, 'المدير');
      if (fbRes.counts) fbCounts = fbRes.counts;
      if (!fbRes.success) {
        console.warn('Firestore backup sync warning:', fbRes.message);
      }
    } catch (fbErr) {
      console.warn('Firestore restoreEntireBackupToFirestore error:', fbErr);
    }

    // Dispatch event for components that listen
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('monglish:database_restored', {
          detail: { ...validated.rawPayload, _validation: validated }
        })
      );
    }

    const summaryList = validated.validCollections.map((c) => `${c.count} ${c.name}`);
    const summaryText = summaryList.length > 0 ? ` (${summaryList.join('، ')})` : '';

    return {
      success: true,
      message: `تم دمج واستعادة النسخة الاحتياطية بنجاح ورفعها إلى السحابة${summaryText} ✓`,
      counts: fbCounts
    };
  } catch (err: any) {
    return { success: false, message: `فشل قراءة الملف أو استعادته: ${err?.message || err}` };
  }
}

/**
 * Normalizes any backup payload (JSON string, object, array, or wrapped JSON)
 */
export function normalizeBackupPayload(raw: any): Record<string, any> {
  if (!raw) return {};

  let obj = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    try {
      obj = JSON.parse(trimmed);
    } catch {
      try {
        const cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        obj = JSON.parse(cleaned);
      } catch (e: any) {
        throw new Error('كود JSON غير صالح، يرجى التأكد من محتوى الملف أو النص المنسوخ');
      }
    }
  }

  if (Array.isArray(obj)) {
    const sample = obj[0] || {};
    if (sample.code || sample.unit || sample.balance !== undefined || sample.name) {
      return {
        items: obj.map((it, idx) => ({
          ...it,
          id: it.id ? String(it.id).trim() : it.code ? String(it.code).trim() : uid(),
          code: it.code ? String(it.code).trim() : `ITM-${idx + 100}`,
          name: it.name ? String(it.name).trim() : `صنف ${idx + 1}`,
          cat: it.cat || 'OFF',
          unit: it.unit || 'عدد',
          balance: parseFloat(it.balance) || 0,
          min: parseFloat(it.min) || 5,
          cost: parseFloat(it.cost) || 0
        }))
      };
    }
    if (sample.number || sample.employee) {
      return {
        lines: obj.map((l, idx) => ({
          ...l,
          id: l.id ? String(l.id).trim() : l.number ? String(l.number).trim() : uid(),
          number: normalizeEgyptPhone(String(l.number || ''))
        }))
      };
    }
    return { items: obj };
  }

  const result: Record<string, any> = {};

  const getArray = (...aliases: string[]) => {
    for (const k of aliases) {
      if (Array.isArray(obj[k]) && obj[k].length > 0) return obj[k];
    }
    return undefined;
  };

  const itemsArr = getArray('items', 'ITEMS', 'mo_items', 'inventory', 'الأصناف', 'المخزون', 'أصناف');
  if (itemsArr) {
    result.items = itemsArr.map((it: any, idx: number) => ({
      ...it,
      id: it.id ? String(it.id).trim() : it.code ? String(it.code).trim() : uid(),
      code: it.code ? String(it.code).trim() : `ITM-${idx + 100}`,
      name: it.name ? String(it.name).trim() : `صنف ${idx + 1}`,
      cat: it.cat || 'OFF',
      unit: it.unit || 'عدد',
      balance: typeof it.balance === 'number' ? it.balance : parseFloat(it.balance) || 0,
      min: typeof it.min === 'number' ? it.min : parseFloat(it.min) || 5,
      cost: typeof it.cost === 'number' ? it.cost : parseFloat(it.cost) || 0
    }));
  }

  const movesArr = getArray('moves', 'MOVES', 'mo_moves', 'stockMoves', 'stock_moves', 'الحركات', 'حركات المخزن', 'حركات');
  if (movesArr) {
    result.moves = movesArr.map((m: any) => ({
      ...m,
      id: m.id ? String(m.id).trim() : uid(),
      qty: typeof m.qty === 'number' ? m.qty : parseFloat(m.qty) || 0
    }));
  }

  const procArr = getArray('proc', 'PROC', 'mo_proc', 'orders', 'procurement', 'purchases', 'المشتريات', 'أوامر الشراء');
  if (procArr) {
    result.proc = procArr.map((p: any) => ({
      ...p,
      id: p.id ? String(p.id).trim() : uid()
    }));
  }

  const maintArr = getArray('maint', 'MAINT', 'mo_maint', 'tickets', 'maintenance', 'الصيانة', 'بلاغات الصيانة');
  if (maintArr) {
    result.maint = maintArr.map((t: any) => ({
      ...t,
      id: t.id ? String(t.id).trim() : uid()
    }));
  }

  const cleanArr = getArray('clean', 'CLEAN', 'mo_clean', 'cleaning', 'النظافة', 'مهام النظافة');
  if (cleanArr) {
    result.clean = cleanArr.map((c: any) => ({
      ...c,
      id: c.id ? String(c.id).trim() : uid()
    }));
  }

  const cleanHistArr = getArray('cleanHist', 'CLEAN_HIST', 'mo_clean_hist', 'cleaningHistory', 'سجل النظافة', 'سجلات النظافة');
  if (cleanHistArr) {
    result.cleanHist = cleanHistArr.map((h: any) => ({
      ...h,
      id: h.id ? String(h.id).trim() : uid()
    }));
  }

  const linesArr = getArray('lines', 'LINES', 'mo_lines', 'mobileLines', 'phones', 'الخطوط', 'خطوط الموبايل', 'الاتصالات');
  if (linesArr) {
    const rawParsed = linesArr.map((l: any) => ({
      ...l,
      id: l.id ? String(l.id).trim() : l.number ? String(l.number).trim() : uid(),
      number: normalizeEgyptPhone(String(l.number || '')),
      nationalId: cleanEgyptianNationalId(l.nationalId || l['الرقم القومي'] || l['بطاقة'] || l['رقم البطاقة']) || undefined
    }));
    result.lines = deduplicateLines(rawParsed);
  }

  const reqsArr = getArray('reqs', 'REQS', 'mo_reqs', 'requests', 'departmentRequests', 'الطلبات', 'طلبات الأقسام');
  if (reqsArr) {
    result.reqs = reqsArr.map((r: any) => ({
      ...r,
      id: r.id ? String(r.id).trim() : uid()
    }));
  }

  const suppliersArr = getArray('suppliers', 'SUPPLIERS', 'mo_suppliers', 'vendors', 'الموردين', 'الموردون');
  if (suppliersArr) {
    result.suppliers = suppliersArr.map((s: any) => ({
      ...s,
      id: s.id ? String(s.id).trim() : uid()
    }));
  }

  const recurringArr = getArray('recurring', 'RECURRING', 'mo_recurring', 'commitments', 'الالتزامات', 'الالتزامات الدورية');
  if (recurringArr) {
    result.recurring = recurringArr.map((rec: any) => ({
      ...rec,
      id: rec.id ? String(rec.id).trim() : uid()
    }));
  }

  const stockArr = getArray('stock', 'STOCK', 'mo_stock', 'stocktakes', 'الجرد', 'عمليات الجرد');
  if (stockArr) {
    result.stock = stockArr.map((st: any) => ({
      ...st,
      id: st.id ? String(st.id).trim() : uid()
    }));
  }

  const pettyArr = getArray('pettyCash', 'PETTY_CASH', 'mo_petty_cash', 'petty_cash', 'expenses', 'العهدة', 'العهدة النقدية');
  if (pettyArr) {
    result.pettyCash = pettyArr.map((pc: any) => ({
      ...pc,
      id: pc.id ? String(pc.id).trim() : uid()
    }));
  }

  const activitiesArr = getArray('activities', 'ACTIVITIES', 'mo_activities', 'logs', 'الأنشطة', 'سجل العمليات');
  if (activitiesArr) {
    result.activities = activitiesArr.map((a: any) => ({
      ...a,
      id: a.id ? String(a.id).trim() : uid()
    }));
  }

  const rolesObj = obj.roles || obj.ROLES || obj.mo_roles || obj.users || obj['الأدوار'] || obj['الصلاحيات'];
  if (rolesObj && typeof rolesObj === 'object') {
    result.roles = rolesObj;
  }

  return result;
}

/**
 * Reads multi-sheet Excel workbooks and converts them into the backup structure
 */
export async function readExcelBackupWorkbook(file: File): Promise<Record<string, any>> {
  const buf = await file.arrayBuffer();
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const backup: Record<string, any> = {};

  for (const sheetName of wb.SheetNames) {
    const sName = sheetName.trim().toLowerCase();
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
    if (!rows || rows.length === 0) continue;

    if (sName.includes('مخزون') || sName.includes('أصناف') || sName.includes('items') || sName.includes('inv')) {
      backup.items = rows.map((r, idx) => ({
        id: String(r['الكود'] || r['كود'] || r['كود الصنف'] || r.code || ('item_' + idx)).trim(),
        code: String(r['الكود'] || r['كود'] || r['كود الصنف'] || r.code || ('ITM-' + (idx + 100))).trim(),
        name: String(r['اسم الصنف'] || r['الاسم'] || r['الصنف'] || r.name || ('صنف ' + (idx + 1))).trim(),
        cat: (r['التصنيف'] || r['الفئة'] || r.cat || 'OFF') as CategoryKey,
        unit: String(r['الوحدة'] || r.unit || 'عدد').trim(),
        balance: parseFloat(r['الرصيد الحالي'] || r['الرصيد'] || r.balance) || 0,
        min: parseFloat(r['الحد الأدنى'] || r.min) || 5,
        cost: parseFloat(r['سعر الوحدة'] || r['التكلفة'] || r.cost) || 0,
        loc: String(r['المكان'] || r['الموقع'] || r.loc || 'مخزن رئيسي').trim()
      }));
    } else if (sName.includes('حركات') || sName.includes('moves')) {
      backup.moves = rows.map((r, idx) => ({
        id: String(r.id || ('move_' + idx)).trim(),
        itemName: String(r['اسم الصنف'] || r['الصنف'] || r.itemName || '').trim(),
        code: String(r['الكود'] || r.code || '').trim(),
        type: String(r['نوع الحركة'] || r.type || '').includes('صرف') ? 'out' : 'in',
        qty: parseFloat(r['الكمية'] || r.qty) || 0,
        person: String(r['الشخص / الجهة'] || r['المستلم'] || r.person || '').trim(),
        date: String(r['التاريخ'] || r.date || today()).trim(),
        by: String(r['المسؤول'] || r['بواسطة'] || r.by || 'أمين المخزن').trim(),
        note: String(r['ملاحظات'] || r.note || '').trim()
      }));
    } else if (sName.includes('مشتريات') || sName.includes('proc') || sName.includes('orders')) {
      backup.proc = rows.map((r, idx) => ({
        id: String(r['رقم الأمر'] || r.id || ('PO-' + (idx + 100))).trim(),
        supplier: String(r['المورد'] || r.supplier || '').trim(),
        status: (String(r['الحالة'] || r.status || 'مكتمل').trim() as any),
        date: String(r['التاريخ'] || r.date || today()).trim(),
        lines: [
          {
            itemId: String(r.itemId || uid()),
            itemName: String(r['الصنف'] || r.itemName || '').trim(),
            cat: (r['الفئة'] || r.cat || 'OFF') as CategoryKey,
            qty: parseFloat(r['الكمية'] || r.qty) || 1,
            unit: String(r['الوحدة'] || r.unit || 'عدد').trim(),
            price: parseFloat(r['سعر الوحدة'] || r.price) || 0
          }
        ]
      }));
    } else if (sName.includes('صيانة') || sName.includes('maint')) {
      backup.maint = rows.map((r, idx) => ({
        id: String(r.id || ('TKT-' + (idx + 100))).trim(),
        title: String(r['وصف العطل'] || r['العطل'] || r.title || '').trim(),
        location: String(r['الموقع'] || r.location || '').trim(),
        priority: (String(r['الأولوية'] || r.priority || 'متوسط').trim() as any),
        status: (String(r['الحالة'] || r.status || 'قيد المعالجة').trim() as any),
        cost: parseFloat(r['التكلفة'] || r.cost) || 0,
        date: String(r['التاريخ'] || r.date || today()).trim(),
        by: String(r['المسؤول'] || r.by || 'الإدارة').trim()
      }));
    } else if (sName.includes('خطوط') || sName.includes('lines')) {
      backup.lines = rows.map((r, idx) => ({
        id: String(r.id || ('line_' + idx)).trim(),
        number: normalizeEgyptPhone(String(r['رقم الخط'] || r['الرقم'] || r.number || '')),
        employee: String(r['الموظف المسند إليه'] || r['الموظف'] || r.employee || '').trim(),
        nationalId: cleanEgyptianNationalId(r['الرقم القومي'] || r['بطاقة'] || r['رقم البطاقة'] || r.nationalId) || undefined,
        status: (String(r['الحالة'] || r.status || 'نشط').trim() as any),
        plan: String(r['الباقة'] || r.plan || '').trim(),
        monthlyCost: parseFloat(r['التكلفة الشهرية'] || r.monthlyCost) || 0,
        note: String(r['ملاحظات'] || r.note || '').trim()
      }));
    } else if (sName.includes('طلبات') || sName.includes('reqs')) {
      backup.reqs = rows.map((r, idx) => ({
        id: String(r.id || ('REQ-' + (idx + 100))).trim(),
        title: String(r['عنوان الطلب'] || r.title || '').trim(),
        dept: String(r['القسم الطالب'] || r.dept || 'عام').trim(),
        cat: String(r['التصنيف'] || r.cat || 'عام').trim(),
        urgency: (String(r['الأهمية'] || r.urgency || 'عادي').trim() as any),
        status: (String(r['الحالة'] || r.status || 'معلق').trim() as any),
        date: String(r['التاريخ'] || r.date || today()).trim(),
        by: String(r['مقدم الطلب'] || r.by || 'موظف').trim(),
        note: String(r['ملاحظات'] || r.note || '').trim()
      }));
    }
  }

  return backup;
}

/* ---------------- Excel Import Helpers ---------------- */
export async function readExcelFile(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/* ---------------- User & Role Control Functions ---------------- */
export function getRoleDefaultCanWrite(role: string): string[] {
  switch (role) {
    case 'manager':
      return ['*'];
    case 'purchase':
      return ['proc', 'suppliers', 'recurring', 'reqs', 'activities'];
    case 'warehouse':
      return ['items', 'moves', 'proc', 'stock', 'reqs', 'activities'];
    case 'maint':
      return ['maint', 'assets', 'reqs', 'activities'];
    case 'buffet':
      return ['moves', 'pettyCash', 'reqs', 'activities'];
    case 'cleaning':
      return ['clean', 'cleanHist', 'reqs', 'activities'];
    case 'reception':
      return ['lines', 'maint', 'pettyCash', 'reqs', 'activities'];
    default:
      return [role, 'reqs', 'activities'];
  }
}

export function getDefaultRoles(): Record<string, RoleConfig> {
  const mapped: Record<string, RoleConfig> = {};
  Object.entries(ROLES).forEach(([k, v]) => {
    mapped[k] = {
      key: k,
      label: v.label,
      icon: v.icon,
      email: v.email,
      tabs: [...v.tabs],
      isCustom: false
    };
  });
  return mapped;
}

export function loadRoles(): Record<string, RoleConfig> {
  const custom = lsGet<Record<string, RoleConfig> | null>(SK.roles, null);
  if (custom && Object.keys(custom).length > 0) {
    return custom;
  }
  const def = getDefaultRoles();
  lsSet(SK.roles, def);
  return def;
}

export function saveRoles(roles: Record<string, RoleConfig>, syncToCloud: boolean = true): void {
  lsSet(SK.roles, roles);
  if (syncToCloud) {
    syncRolesToFirestore(roles).catch(() => {});
  }
}

export function resetRolesToDefault(): Record<string, RoleConfig> {
  const def = getDefaultRoles();
  lsSet(SK.roles, def);
  syncRolesToFirestore(def).catch(() => {});
  return def;
}

/* ---------------- Real-time Activities / Notifications ---------------- */
const READ_ACT_IDS_KEY = 'monglish_read_activity_ids';
const DELETED_MAINT_IDS_KEY = 'monglish_deleted_maint_ids';

export function getDeletedMaintIds(): Set<string> {
  const arr = lsGet<string[]>(DELETED_MAINT_IDS_KEY, []);
  return new Set(arr);
}

export function addDeletedMaintId(id: string): void {
  if (!id) return;
  const current = getDeletedMaintIds();
  current.add(id);
  lsSet(DELETED_MAINT_IDS_KEY, Array.from(current).slice(-2000));
}

export function getReadActivityIds(): Set<string> {
  const arr = lsGet<string[]>(READ_ACT_IDS_KEY, []);
  return new Set(arr);
}

export function addReadActivityIds(ids: string[]): void {
  if (!ids || ids.length === 0) return;
  const current = getReadActivityIds();
  ids.forEach((id) => {
    if (id) current.add(id);
  });
  lsSet(READ_ACT_IDS_KEY, Array.from(current).slice(-2000));
}

export function loadActivities(): SystemActivity[] {
  const stored = lsGet<SystemActivity[] | null>(SK.activities, null);
  const readIds = getReadActivityIds();

  if (Array.isArray(stored)) {
    if (readIds.size > 0) {
      return stored.map((a) => (readIds.has(a.id) ? { ...a, read: true } : a));
    }
    return stored;
  }
  const now = Date.now();
  const initialActs: SystemActivity[] = [
    {
      id: 'act-init-1',
      dept: 'النظام',
      action: 'بدء تشغيل النظام والمزامنة السحابية',
      details: 'تم تفعيل قاعدة البيانات السحابية (Firestore) والمزامنة بنجاح',
      by: 'النظام',
      date: today(),
      time: formatActivityClock(now),
      ts: now,
      read: true
    }
  ];
  addReadActivityIds(['act-init-1']);
  lsSet(SK.activities, initialActs);
  return initialActs;
}

export function formatActivityClock(ts?: number, fallbackTime?: string): string {
  if (ts && !isNaN(ts)) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      const hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const period = hours >= 12 ? 'م' : 'ص';
      const h12 = hours % 12 || 12;
      return `${h12}:${minutes} ${period}`;
    }
  }
  return fallbackTime || '';
}

export function formatActivityRelative(ts?: number): string {
  if (!ts || isNaN(ts)) return '';
  const now = Date.now();
  const diffMs = now - ts;
  if (diffMs < 0) return 'الآن';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return 'الآن';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'أمس';
  return `منذ ${diffDays} يوم`;
}

export function logActivity(act: Omit<SystemActivity, 'id' | 'date' | 'time' | 'ts'>): SystemActivity {
  const current = loadActivities();
  const now = Date.now();
  const timeStr = formatActivityClock(now);
  const newAct: SystemActivity = {
    ...act,
    id: uid(),
    date: today(),
    time: timeStr,
    ts: now,
    read: false
  };
  const updated = [newAct, ...current.slice(0, 499)];
  lsSet(SK.activities, updated);

  // Send real system notification to user's device/browser
  try {
    sendBrowserNotification(`[${act.dept || 'إدارة المكتب'}] ${act.action}`, {
      body: `${act.details || ''} — بواسطة: ${act.by}`
    });
  } catch {
    // Ignore notification errors if permissions not yet granted
  }

  return newAct;
}

export function markActivityRead(id: string): void {
  addReadActivityIds([id]);
  const current = loadActivities();
  const updated = current.map((a) => (a.id === id ? { ...a, read: true } : a));
  lsSet(SK.activities, updated);
}

export function markAllActivitiesRead(): void {
  const current = loadActivities();
  addReadActivityIds(current.map((a) => a.id));
  const updated = current.map((a) => ({ ...a, read: true }));
  lsSet(SK.activities, updated);
}

export function clearActivities(): void {
  lsSet(SK.activities, []);
}

export function clearAllLocalCachedData(): void {
  try {
    Object.values(SK).forEach((key) => {
      localStorage.removeItem(key);
    });
    localStorage.removeItem('monglish_role');
    localStorage.removeItem('monglish_locked_dept');
    localStorage.removeItem('monglish_read_activity_ids');
    localStorage.removeItem('monglish_deleted_maint_ids');
    localStorage.removeItem('monglish_data_version');
    localStorage.removeItem('monglish_has_user_changes');
    localStorage.removeItem('monglish_last_updated');
    idbClearAll().catch(() => {});
  } catch (e) {
    console.warn('Error clearing local cache on logout:', e);
  }
}


