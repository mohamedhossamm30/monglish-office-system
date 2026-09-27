/**
 * Storage Health, Diagnostics & Self-Healing Engine
 * Prevents app crashes caused by corrupted LocalStorage or IndexedDB data,
 * detects storage conflicts, and provides automated repair routines.
 */

import { SEED_CLEAN, SEED_ITEMS, ROLES } from '../data/seedData';
import monglishProcOrders from '../data/monglishProcurement.json';
import monglishCommitments from '../data/monglishCommitments.json';
import { SK, getDefaultRoles } from './storage';
import { idbGet, idbSet, idbGetFullSnapshot, idbSaveFullSnapshot } from './idbStorage';

export interface StorageDiagnosticResult {
  localStorageAvailable: boolean;
  localStorageKeysCount: number;
  localStorageEstimatedBytes: number;
  indexedDBAvailable: boolean;
  hasCorruptedKeys: boolean;
  corruptedKeysList: string[];
  repairedKeysList: string[];
  conflictDetected: boolean;
  conflictReason?: string;
  itemsCount: number;
  dataVersion: number;
  lastUpdated?: string;
  hasUserChanges: boolean;
  status: 'healthy' | 'warning' | 'critical';
  details: string[];
}

/**
 * Validates if an entity is a valid object and not null/array/primitive
 */
export function isPlainObject(val: any): boolean {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Checks if localStorage is accessible and working in current browser context.
 */
export function checkLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__monglish_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (err) {
    console.warn('[StorageHealth] LocalStorage not available or blocked:', err);
    return false;
  }
}

/**
 * Safely parse JSON from localStorage with fallbacks
 */
export function safeJsonParse<T>(raw: string | null, fallback: T): { value: T; isCorrupt: boolean } {
  if (raw === null || raw === undefined || raw === '') {
    return { value: fallback, isCorrupt: false };
  }
  if (raw === 'undefined' || raw === 'null' || raw === 'NaN') {
    return { value: fallback, isCorrupt: true };
  }
  try {
    const parsed = JSON.parse(raw);
    return { value: parsed, isCorrupt: false };
  } catch {
    console.warn('[StorageHealth] JSON parse failed for raw string:', raw.slice(0, 80));
    return { value: fallback, isCorrupt: true };
  }
}

/**
 * Sanitizes Inventory Items array: ensures each item is a valid object with valid types
 */
export function sanitizeItems(rawList: any): any[] {
  if (!Array.isArray(rawList)) return SEED_ITEMS;
  const sanitized = rawList.filter((it) => it && typeof it === 'object').map((it, idx) => ({
    id: it.id ? String(it.id) : `item_${Date.now()}_${idx}`,
    name: it.name ? String(it.name).trim() : `صنف غير مسمى ${idx + 1}`,
    code: it.code ? String(it.code).trim() : `GEN-${idx + 1}`,
    cat: it.cat || 'OFF',
    balance: typeof it.balance === 'number' && !isNaN(it.balance) ? it.balance : 0,
    unit: it.unit || 'قطعة',
    min: typeof it.min === 'number' && !isNaN(it.min) ? it.min : 5,
    cost: typeof it.cost === 'number' && !isNaN(it.cost) ? it.cost : 0,
    dept: it.dept || '',
    note: it.note || ''
  }));
  return sanitized.length > 0 ? sanitized : SEED_ITEMS;
}

/**
 * Sanitizes Purchase Orders array
 */
export function sanitizeProcOrders(rawList: any): any[] {
  if (!Array.isArray(rawList)) return (monglishProcOrders as any[]) || [];
  return rawList.filter((o) => o && typeof o === 'object').map((o, idx) => ({
    id: o.id ? String(o.id) : `PO-${1000 + idx}`,
    supplier: o.supplier || 'مورد عام',
    date: o.date || new Date().toLocaleDateString('ar-EG'),
    status: o.status || 'مكتمل',
    by: o.by || 'المدير',
    lines: Array.isArray(o.lines) ? o.lines.filter((l: any) => l && typeof l === 'object') : [],
    note: o.note || ''
  }));
}

/**
 * Sanitizes System Activities array
 */
export function sanitizeActivities(rawList: any): any[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((a) => a && typeof a === 'object')
    .slice(0, 500)
    .map((a, idx) => ({
      id: a.id ? String(a.id) : `act_${Date.now()}_${idx}`,
      dept: a.dept || 'النظام',
      action: a.action || 'إجراء نظام',
      details: a.details || '',
      amount: typeof a.amount === 'number' && !isNaN(a.amount) ? a.amount : 0,
      by: a.by || 'النظام',
      date: a.date || new Date().toLocaleDateString('ar-EG'),
      time: a.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      ts: typeof a.ts === 'number' && !isNaN(a.ts) ? a.ts : Date.now(),
      type: a.type || 'system',
      read: !!a.read
    }));
}

/**
 * Comprehensive Storage Health Check & Self-Healing
 * Runs on app startup and whenever Error Boundary or user invokes repair.
 */
export async function runStorageHealthCheck(): Promise<StorageDiagnosticResult> {
  const details: string[] = [];
  const corruptedKeys: string[] = [];
  const repairedKeys: string[] = [];
  let conflictDetected = false;
  let conflictReason: string | undefined;

  const lsAvailable = checkLocalStorageAvailable();
  let lsBytes = 0;
  let keysCount = 0;

  if (lsAvailable) {
    keysCount = localStorage.length;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        const val = localStorage.getItem(k) || '';
        lsBytes += (k.length + val.length) * 2;
      }
    }
  } else {
    details.push('تنبيه: التخزين المحلي (LocalStorage) غير متاح أو مقفل بصلاحيات المتصفح.');
  }

  // 1. Verify all primary keys in LocalStorage
  const keyValidators: Record<string, { validate: (v: any) => boolean; repair: () => any }> = {
    [SK.items]: {
      validate: (v) => Array.isArray(v),
      repair: () => SEED_ITEMS
    },
    [SK.moves]: {
      validate: (v) => Array.isArray(v),
      repair: () => []
    },
    [SK.proc]: {
      validate: (v) => Array.isArray(v),
      repair: () => monglishProcOrders
    },
    [SK.maint]: {
      validate: (v) => Array.isArray(v),
      repair: () => []
    },
    [SK.clean]: {
      validate: (v) => Array.isArray(v),
      repair: () => SEED_CLEAN
    },
    [SK.cleanHist]: {
      validate: (v) => Array.isArray(v),
      repair: () => []
    },
    [SK.lines]: {
      validate: (v) => Array.isArray(v),
      repair: () => []
    },
    [SK.reqs]: {
      validate: (v) => Array.isArray(v),
      repair: () => []
    },
    [SK.suppliers]: {
      validate: (v) => Array.isArray(v),
      repair: () => []
    },
    [SK.recurring]: {
      validate: (v) => Array.isArray(v),
      repair: () => monglishCommitments
    },
    [SK.pettyCash]: {
      validate: (v) => Array.isArray(v),
      repair: () => []
    },
    [SK.activities]: {
      validate: (v) => Array.isArray(v),
      repair: () => []
    },
    [SK.roles]: {
      validate: (v) => isPlainObject(v) && Object.keys(v).length > 0,
      repair: () => getDefaultRoles()
    }
  };

  if (lsAvailable) {
    for (const [key, checker] of Object.entries(keyValidators)) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const { value, isCorrupt } = safeJsonParse(raw, null);
        if (isCorrupt || !checker.validate(value)) {
          corruptedKeys.push(key);
          // Auto-repair key safely
          const safeVal = checker.repair();
          try {
            localStorage.setItem(key, JSON.stringify(safeVal));
            repairedKeys.push(key);
            details.push(`تم إصلاح المفتاح التالف تلقائياً: ${key}`);
          } catch (e) {
            details.push(`فشل حفظ إصلاح المفتاح: ${key}`);
          }
        }
      }
    }
  }

  // 2. Check IndexedDB health & conflicts
  let idbAvailable = false;
  try {
    if (typeof window !== 'undefined' && window.indexedDB) {
      const testGet = await idbGet('__health_test__', 'ok');
      if (testGet !== undefined) {
        idbAvailable = true;
      }
    }
  } catch (err) {
    idbAvailable = false;
    details.push('تنبيه: قاعدة IndexedDB غير متاحة في بيئة التشغيل الحالية.');
  }

  // 3. Resolve conflicts between LocalStorage and IndexedDB
  const hasUserChanges = lsAvailable ? localStorage.getItem('monglish_has_user_changes') === 'true' : false;
  const lsVer = lsAvailable ? Number(localStorage.getItem('monglish_data_version') || 1) : 1;
  const lsUpdated = lsAvailable ? localStorage.getItem('monglish_last_updated') || undefined : undefined;

  if (idbAvailable && lsAvailable) {
    try {
      const idbSnap = await idbGetFullSnapshot();
      if (idbSnap && isPlainObject(idbSnap)) {
        const idbVer = Number(idbSnap.version || 1);
        const idbItems = Array.isArray(idbSnap.items) ? idbSnap.items : [];

        // Check if localStorage items were wiped/empty but IndexedDB has user work
        const lsItemsRaw = localStorage.getItem(SK.items);
        const { value: lsItems } = safeJsonParse<any[]>(lsItemsRaw, []);

        if ((!lsItems || lsItems.length === 0) && idbItems.length > 0) {
          conflictDetected = true;
          conflictReason = 'بيانات LocalStorage فارغة بينما توجد بيانات سابقة في IndexedDB، تم استعادة بيانات IndexedDB تلقائياً لمنع فقدان العمل.';
          // Recover from IndexedDB to LocalStorage
          for (const [k, v] of Object.entries(idbSnap)) {
            if (k !== 'version' && k !== 'lastUpdated' && v !== undefined) {
              localStorage.setItem(k, JSON.stringify(v));
              repairedKeys.push(k);
            }
          }
          localStorage.setItem('monglish_data_version', String(Math.max(idbVer, lsVer)));
          details.push(conflictReason);
        }
      }
    } catch (err) {
      console.warn('[StorageHealth] Conflict check warning:', err);
    }
  }

  // Count items safely
  let itemsCount = 0;
  if (lsAvailable) {
    const { value: itemsArr } = safeJsonParse<any[]>(localStorage.getItem(SK.items), []);
    itemsCount = Array.isArray(itemsArr) ? itemsArr.length : 0;
  }

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (!lsAvailable && !idbAvailable) {
    status = 'critical';
    details.push('حرج: جميع وحدات التخزين المحلية وقواعد البيانات غير متاحة في المتصفح.');
  } else if (corruptedKeys.length > 0 || conflictDetected) {
    status = 'warning';
  }

  return {
    localStorageAvailable: lsAvailable,
    localStorageKeysCount: keysCount,
    localStorageEstimatedBytes: lsBytes,
    indexedDBAvailable: idbAvailable,
    hasCorruptedKeys: corruptedKeys.length > 0,
    corruptedKeysList: corruptedKeys,
    repairedKeysList: repairedKeys,
    conflictDetected,
    conflictReason,
    itemsCount,
    dataVersion: lsVer,
    lastUpdated: lsUpdated,
    hasUserChanges,
    status,
    details
  };
}

/**
 * Emergency Auto-Repair:
 * Safely sanitizes all arrays, reconciles LocalStorage and IndexedDB,
 * clears malformed pending queues, and returns clean operational state.
 */
export async function performFullStorageRepair(): Promise<{
  success: boolean;
  message: string;
  diagnostics: StorageDiagnosticResult;
}> {
  try {
    const diag = await runStorageHealthCheck();

    // 1. Force sanitize all core stores
    if (diag.localStorageAvailable) {
      // 0. Clean up any firestore_mutations or firestore_ state bloat that exhausts localStorage quota
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
      } catch {}

      // Items
      const { value: rawItems } = safeJsonParse(localStorage.getItem(SK.items), SEED_ITEMS);
      const cleanItems = sanitizeItems(rawItems);
      localStorage.setItem(SK.items, JSON.stringify(cleanItems));

      // Procurement
      const { value: rawProc } = safeJsonParse(localStorage.getItem(SK.proc), monglishProcOrders);
      const cleanProc = sanitizeProcOrders(rawProc);
      localStorage.setItem(SK.proc, JSON.stringify(cleanProc));

      // Activities
      const { value: rawActs } = safeJsonParse(localStorage.getItem(SK.activities), []);
      const cleanActs = sanitizeActivities(rawActs);
      localStorage.setItem(SK.activities, JSON.stringify(cleanActs));

      // Roles
      const { value: rawRoles } = safeJsonParse(localStorage.getItem(SK.roles), null);
      if (!rawRoles || typeof rawRoles !== 'object' || Object.keys(rawRoles).length === 0) {
        localStorage.setItem(SK.roles, JSON.stringify(getDefaultRoles()));
      }

      // Clear any corrupted pending sync queue that might crash JSON parse
      try {
        const rawQ = localStorage.getItem('monglish_pending_sync_queue');
        if (rawQ) {
          const { value: qVal, isCorrupt } = safeJsonParse(rawQ, []);
          if (isCorrupt || !Array.isArray(qVal)) {
            localStorage.setItem('monglish_pending_sync_queue', '[]');
          }
        }
      } catch {}

      // Mirror sanitized snapshot to IndexedDB
      try {
        const fullSnap = {
          items: cleanItems,
          proc: cleanProc,
          activities: cleanActs,
          version: Number(localStorage.getItem('monglish_data_version') || 1) + 1,
          lastUpdated: new Date().toISOString()
        };
        await idbSaveFullSnapshot(fullSnap);
      } catch {}
    }

    const updatedDiag = await runStorageHealthCheck();
    return {
      success: true,
      message: 'تم فحص وإصلاح هياكل التخزين ومنع تضارب البيانات بنجاح ✓',
      diagnostics: updatedDiag
    };
  } catch (err: any) {
    return {
      success: false,
      message: `فشل في إصلاح التخزين: ${err?.message || err}`,
      diagnostics: await runStorageHealthCheck()
    };
  }
}

/**
 * Creates a safe emergency JSON string backup of everything currently in storage.
 */
export function createEmergencyBackupJson(): string {
  try {
    const backup: Record<string, any> = {
      exportDate: new Date().toISOString(),
      type: 'monglish_emergency_backup',
      branch: 'Monglish Academy Alexandria'
    };
    if (checkLocalStorageAvailable()) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const { value } = safeJsonParse(localStorage.getItem(k), null);
          backup[k] = value;
        }
      }
    }
    return JSON.stringify(backup, null, 2);
  } catch (e) {
    return JSON.stringify({ error: 'Failed to create emergency backup', timestamp: Date.now() });
  }
}
