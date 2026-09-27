import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  writeBatch,
  query,
  limit,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  runTransaction,
  enableNetwork,
  Unsubscribe
} from 'firebase/firestore';
import { auth, db, testFirestoreConnection } from '../firebase';
import {
  CleaningHistory,
  CleaningTask,
  DepartmentRequest,
  InventoryItem,
  MaintenanceTicket,
  MobileLine,
  PhysicalStocktake,
  PurchaseOrder,
  RecurringTemplate,
  StockMove,
  Supplier,
  SystemActivity
} from '../types';

export interface FullMonglishDatabase {
  version?: number;
  dataVersion?: number;
  lastUpdated?: string;
  items?: InventoryItem[];
  moves?: StockMove[];
  proc?: PurchaseOrder[];
  maint?: MaintenanceTicket[];
  assets?: any[];
  clean?: CleaningTask[];
  cleanHist?: CleaningHistory[];
  lines?: MobileLine[];
  reqs?: DepartmentRequest[];
  suppliers?: Supplier[];
  recurring?: RecurringTemplate[];
  stock?: PhysicalStocktake[];
  pettyCash?: any[];
  activities?: SystemActivity[];
  roles?: Record<string, any>;
  lastModifiedBy?: string;
  lastAction?: string;
}

export const FIRESTORE_COLLECTIONS = [
  'items',
  'moves',
  'proc',
  'maint',
  'assets',
  'clean',
  'cleanHist',
  'lines',
  'reqs',
  'suppliers',
  'recurring',
  'stock',
  'pettyCash',
  'activities'
] as const;

export type FirestoreCollectionName = typeof FIRESTORE_COLLECTIONS[number];

const SYSTEM_DOC_REF = doc(db, 'system', 'monglish_database');
const MIGRATION_STATUS_DOC_REF = doc(db, 'system', 'migration_status');

/* ---------------- Firestore Quota & Health Management ---------------- */
const QUOTA_STORAGE_KEY = 'monglish_firestore_quota_exceeded';

export interface FirestoreQuotaStatus {
  isExceeded: boolean;
  error?: string;
  timestamp?: number;
  upgradeUrl: string;
}

export const FIRESTORE_UPGRADE_URL =
  'https://console.firebase.google.com/project/monglishoffice/firestore';

/**
 * Checks if an error corresponds to Firestore usage quota exhaustion
 */
export function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err).toLowerCase();
  return (
    code.includes('resource-exhausted') ||
    code.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('free daily write units') ||
    msg.includes('free daily read units')
  );
}

let inMemoryQuotaExceeded: boolean = false;
let quotaListeners: Array<(status: FirestoreQuotaStatus) => void> = [];

export function getFirestoreQuotaStatus(): FirestoreQuotaStatus {
  if (inMemoryQuotaExceeded) {
    return {
      isExceeded: true,
      error: 'Free daily write units per project limit reached for today',
      upgradeUrl: FIRESTORE_UPGRADE_URL
    };
  }

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(QUOTA_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.timestamp && Date.now() - parsed.timestamp < 2 * 60 * 60 * 1000) {
        inMemoryQuotaExceeded = true;
        return {
          isExceeded: true,
          error: parsed.error,
          timestamp: parsed.timestamp,
          upgradeUrl: FIRESTORE_UPGRADE_URL
        };
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage parse errors
  }

  return {
    isExceeded: false,
    upgradeUrl: FIRESTORE_UPGRADE_URL
  };
}

export function markFirestoreQuotaExceeded(err?: any): void {
  inMemoryQuotaExceeded = true;
  const errMsg = err?.message || (typeof err === 'string' ? err : 'Free daily write units quota exceeded');
  const now = Date.now();
  const status: FirestoreQuotaStatus = {
    isExceeded: true,
    error: errMsg,
    timestamp: now,
    upgradeUrl: FIRESTORE_UPGRADE_URL
  };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(status));
    }
  } catch {
    // Ignore
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('monglish:firestore_quota_exceeded', { detail: status }));
  }

  quotaListeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      // Ignore
    }
  });
}

export function clearQuotaExceededStatus(): void {
  inMemoryQuotaExceeded = false;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(QUOTA_STORAGE_KEY);
    }
    enableNetwork(db).catch(() => {});
  } catch {}
  const status: FirestoreQuotaStatus = { isExceeded: false, upgradeUrl: FIRESTORE_UPGRADE_URL };
  quotaListeners.forEach((fn) => {
    try { fn(status); } catch {}
  });
}

export async function testFirestoreWriteCapacity(): Promise<{ success: boolean; message: string }> {
  try {
    await enableNetwork(db).catch(() => {});
    const probeDoc = doc(db, 'system', 'write_probe');
    await setDoc(probeDoc, { probeTs: Date.now(), testBy: 'circuit_breaker' }, { merge: true });

    clearQuotaExceededStatus();
    return { success: true, message: 'تم استئناف المزامنة السحابية الحية بنجاح!' };
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExceeded(err);
      return {
        success: false,
        message: 'الحصة اليومية لا تزال مكتملة في Firebase Console. يعمل النظام حالياً بنظام الكاش المحلي بدون أي توقف.'
      };
    }
    return {
      success: false,
      message: `تعذر الاتصال بـ Firestore: ${err?.message || 'خطأ غير معروف'}`
    };
  }
}

export function subscribeToQuotaStatus(listener: (status: FirestoreQuotaStatus) => void): () => void {
  quotaListeners.push(listener);
  listener(getFirestoreQuotaStatus());
  return () => {
    quotaListeners = quotaListeners.filter((l) => l !== listener);
  };
}

/**
 * Recursively cleans any undefined values from an object or array.
 * Firestore strictly rejects documents containing undefined values.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) return null as any;
  if (data === null || typeof data !== 'object') return data;

  // Preserve Firestore FieldValue sentinels (serverTimestamp, increment, etc.)
  if ((data as any)._methodName || (typeof (data as any).isEqual === 'function' && !Array.isArray(data))) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as any;
  }

  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      cleanObj[key] = sanitizeForFirestore(value);
    }
  }
  return cleanObj as T;
}

/* ========================================================================= */
/*            FAILED OPERATIONS QUEUE (RETRY & VISIBILITY ENGINE)            */
/* ========================================================================= */

export interface FailedOperation {
  id: string;
  type: 'save' | 'delete' | 'stock_move' | 'batch';
  collectionName: string;
  docId?: string;
  payload?: any;
  error: string;
  timestamp: number;
  retryCount: number;
}

const FAILED_OPS_STORAGE_KEY = 'monglish_failed_firestore_operations';

let failedOperations: FailedOperation[] = (() => {
  try {
    const raw = localStorage.getItem(FAILED_OPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
})();

let failedOpsListeners: Array<(ops: FailedOperation[]) => void> = [];

function persistFailedOps() {
  try {
    localStorage.setItem(FAILED_OPS_STORAGE_KEY, JSON.stringify(failedOperations));
  } catch {}
  failedOpsListeners.forEach((l) => l([...failedOperations]));
}

export function getFailedOperations(): FailedOperation[] {
  return [...failedOperations];
}

export function subscribeToFailedOperations(listener: (ops: FailedOperation[]) => void): () => void {
  failedOpsListeners.push(listener);
  listener(getFailedOperations());
  return () => {
    failedOpsListeners = failedOpsListeners.filter((l) => l !== listener);
  };
}

export function addFailedOperation(op: Omit<FailedOperation, 'id' | 'timestamp' | 'retryCount'>): string {
  const id = 'fail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  let safePayload = op.payload;
  if (op.collectionName === 'items' && op.payload && typeof op.payload === 'object' && op.type !== 'stock_move') {
    safePayload = { ...op.payload };
    delete safePayload.balance;
  }
  const newOp: FailedOperation = {
    ...op,
    payload: safePayload,
    id,
    timestamp: Date.now(),
    retryCount: 0
  };
  failedOperations = [newOp, ...failedOperations.slice(0, 49)];
  persistFailedOps();
  return id;
}

export function dismissFailedOperation(id: string): void {
  failedOperations = failedOperations.filter((op) => op.id !== id);
  persistFailedOps();
}

export function clearAllFailedOperations(): void {
  failedOperations = [];
  persistFailedOps();
}

export async function retryFailedOperation(id: string): Promise<{ success: boolean; error?: string }> {
  const op = failedOperations.find((o) => o.id === id);
  if (!op) return { success: false, error: 'العملية غير موجودة' };

  try {
    let success = false;
    if (op.type === 'save' && op.docId && op.payload) {
      const res = await saveFirestoreDoc(op.collectionName, op.docId, op.payload, 'إعادة محاولة', false);
      success = res.success;
    } else if (op.type === 'delete' && op.docId) {
      const res = await softDeleteFirestoreDoc(op.collectionName, op.docId, 'إعادة محاولة');
      success = res.success;
    } else if (op.type === 'stock_move' && Array.isArray(op.payload)) {
      const res = await commitStockMoves(op.payload, { updatedBy: 'إعادة محاولة' });
      success = res.success;
    }

    if (success) {
      dismissFailedOperation(id);
      return { success: true };
    } else {
      op.retryCount = (op.retryCount || 0) + 1;
      persistFailedOps();
      return { success: false, error: 'فشلت إعادة المحاولة' };
    }
  } catch (err: any) {
    op.retryCount = (op.retryCount || 0) + 1;
    op.error = err?.message || String(err);
    persistFailedOps();
    return { success: false, error: err?.message || 'فشلت إعادة المحاولة' };
  }
}

export async function retryAllFailedOperations(): Promise<{ succeeded: number; failed: number }> {
  const current = [...failedOperations];
  let succeeded = 0;
  let failed = 0;

  for (const op of current) {
    const res = await retryFailedOperation(op.id);
    if (res.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { succeeded, failed };
}

/* ========================================================================= */
/*     GRANULAR DOCUMENT-BASED FIRESTORE ENGINE (SINGLE SOURCE OF TRUTH)     */
/* ========================================================================= */

/**
 * Save or update a single document in a specific Firestore collection.
 * Writes ONLY the specified fields + updatedAt and updatedBy.
 * Does NOT set `deleted: false` on every routine update; only when isCreateOrRestore is true.
 */
export async function saveFirestoreDoc(
  collectionName: string,
  docId: string,
  data: Record<string, any>,
  updatedBy: string = 'المستخدم',
  isCreateOrRestore: boolean = false
): Promise<{ success: boolean; code?: string; error?: string }> {
  if (!docId || !collectionName) return { success: false, error: 'معرف المستند أو المجموعة غير صالح' };
  if (getFirestoreQuotaStatus().isExceeded) {
    return { success: false, code: 'resource-exhausted', error: 'تم استهلاك الحصة السحابية المجانية لليوم — تم حفظ البيانات محلياً' };
  }

  try {
    const cleanId = String(docId).trim();
    const docRef = doc(db, collectionName, cleanId);

    const payload: Record<string, any> = {
      ...data,
      id: cleanId,
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
      updatedBy
    };

    if (isCreateOrRestore) {
      payload.deleted = false;
    }

    // CRITICAL: Balance of existing items in items MUST NEVER be written via saveFirestoreDoc.
    // Balance updates must ONLY be performed via atomic increment in commitStockMoves.
    if (collectionName === 'items' && !isCreateOrRestore) {
      delete payload.balance;
    }

    const sanitized = sanitizeForFirestore(payload);
    await setDoc(docRef, sanitized, { merge: true });
    return { success: true };
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExceeded(err);
      return { success: false, code: 'resource-exhausted', error: 'تم استهلاك الحصة السحابية المجانية لليوم — تم حفظ البيانات محلياً' };
    }

    const rawMsg = String(err?.message || err || '');
    const isPermissionDenied =
      err?.code === 'permission-denied' ||
      rawMsg.toLowerCase().includes('permission-denied') ||
      rawMsg.toLowerCase().includes('missing or insufficient permissions');

    const code = isPermissionDenied ? 'permission-denied' : (err?.code || 'error');
    const userFriendlyError = isPermissionDenied
      ? `لا تملك صلاحية تعديل أو إنشاء المستند في ${collectionName}`
      : (err?.message || 'فشل حفظ المستند في السحابة');

    console.warn(`[Firestore Sync] Error saving doc ${collectionName}/${docId}:`, err?.message || err);

    if (!isPermissionDenied) {
      addFailedOperation({
        type: 'save',
        collectionName,
        docId,
        payload: data,
        error: userFriendlyError
      });
    }

    return { success: false, code, error: userFriendlyError };
  }
}

/**
 * Soft delete a document by setting deleted = true and recording deletedAt
 */
export async function softDeleteFirestoreDoc(
  collectionName: string,
  docId: string,
  deletedBy: string = 'المستخدم'
): Promise<{ success: boolean; code?: string; error?: string }> {
  if (!docId || !collectionName) return { success: false, error: 'معرف المستند غير صالح' };

  try {
    const cleanId = String(docId).trim();
    const docRef = doc(db, collectionName, cleanId);

    const payload = {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedAtIso: new Date().toISOString(),
      deletedBy
    };

    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
    return { success: true };
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExceeded(err);
      return { success: false, code: 'resource-exhausted', error: 'تم استهلاك الحصة السحابية المجانية لليوم' };
    }

    const rawMsg = String(err?.message || err || '');
    const isPermissionDenied =
      err?.code === 'permission-denied' ||
      rawMsg.toLowerCase().includes('permission-denied') ||
      rawMsg.toLowerCase().includes('missing or insufficient permissions');

    const code = isPermissionDenied ? 'permission-denied' : (err?.code || 'error');
    const userFriendlyError = isPermissionDenied
      ? `لا تملك صلاحية حذف المستند في ${collectionName}`
      : (err?.message || 'فشل حذف المستند');

    console.warn(`[Firestore Sync] Error soft-deleting doc ${collectionName}/${docId}:`, err?.message || err);

    if (!isPermissionDenied) {
      addFailedOperation({
        type: 'delete',
        collectionName,
        docId,
        error: userFriendlyError
      });
    }

    return { success: false, code, error: userFriendlyError };
  }
}

/**
 * Save multiple documents in atomic batches (max 400 per batch)
 * Fallback to individual sets if batch encounters a validation issue.
 */
export async function batchSaveFirestoreDocs(
  collectionName: string,
  items: Array<Record<string, any>>,
  updatedBy: string = 'المستخدم',
  isCreateOrRestore: boolean = false
): Promise<{ success: boolean; code?: string; error?: string }> {
  if (!items || items.length === 0) return { success: true };
  if (getFirestoreQuotaStatus().isExceeded) {
    return { success: false, code: 'resource-exhausted', error: 'تم استهلاك الحصة السحابية المجانية لليوم' };
  }

  try {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      const validDocEntries: Array<{ ref: any; payload: any }> = [];

      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        if (!item || typeof item !== 'object') continue;

        const rawId = item.id ?? item.code ?? item.number ?? item.orderId ?? item.ticketId ?? item.lineId ?? ('id_' + Date.now() + '_' + (i + j));
        const cleanId = String(rawId).trim().replace(/[\/\#\[\]]/g, '_') || ('id_' + Date.now() + '_' + (i + j));
        const docRef = doc(db, collectionName, cleanId);

        const payload: Record<string, any> = {
          ...item,
          id: cleanId,
          updatedAt: serverTimestamp(),
          updatedAtIso: new Date().toISOString(),
          updatedBy
        };

        if (isCreateOrRestore) {
          payload.deleted = false;
        } else if (collectionName === 'items') {
          delete payload.balance;
        }

        const sanitized = sanitizeForFirestore(payload);
        batch.set(docRef, sanitized, { merge: true });
        validDocEntries.push({ ref: docRef, payload: sanitized });
      }

      try {
        await batch.commit();
      } catch (batchErr: any) {
        console.warn(`[Firestore Batch Warning] Batch failed for ${collectionName}:`, batchErr);
        const rawMsg = String(batchErr?.message || batchErr || '');
        const isPermissionDenied =
          batchErr?.code === 'permission-denied' ||
          rawMsg.toLowerCase().includes('permission-denied');

        if (isPermissionDenied) {
          return {
            success: false,
            code: 'permission-denied',
            error: `لا تملك صلاحية حفظ البيانات في ${collectionName}`
          };
        }

        // Individual fallback
        let anyFailed = false;
        for (const entry of validDocEntries) {
          try {
            await setDoc(entry.ref, entry.payload, { merge: true });
          } catch (singleErr) {
            console.warn(`[Firestore Single Doc Fail] Failed to save doc in ${collectionName}:`, singleErr);
            anyFailed = true;
          }
        }
        if (anyFailed) {
          return { success: false, error: `تعذر حفظ بعض مستندات ${collectionName}` };
        }
      }
    }
    return { success: true };
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExceeded(err);
      return { success: false, code: 'resource-exhausted', error: 'تم استهلاك الحصة السحابية المجانية لليوم' };
    }
    console.warn(`[Firestore Sync] Error in batchSave to ${collectionName}:`, err?.message || err);
    return { success: false, error: err?.message || 'فشل الحفظ المجمع' };
  }
}

export async function syncRolesToFirestore(roles: Record<string, any>): Promise<boolean> {
  if (getFirestoreQuotaStatus().isExceeded) return false;
  if (!auth.currentUser) return false;
  try {
    const rolesDoc = doc(db, 'system', 'roles');
    // Ensure no PINs or passwords are ever written to system/roles
    const sanitizedRoles: Record<string, any> = {};
    for (const [k, v] of Object.entries(roles || {})) {
      if (!v || typeof v !== 'object') continue;
      const { pin, password, ...rest } = v;
      sanitizedRoles[k] = rest;
    }
    await setDoc(
      rolesDoc,
      {
        roles: sanitizeForFirestore(sanitizedRoles),
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString()
      },
      { merge: true }
    );
    return true;
  } catch (e: any) {
    console.warn('[Firestore] Failed to sync roles to Firestore:', e?.message || e);
    return false;
  }
}

export function subscribeToRolesDoc(
  onUpdate: (roles: Record<string, any>) => void
): () => void {
  try {
    const rolesDoc = doc(db, 'system', 'roles');
    return onSnapshot(
      rolesDoc,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data && data.roles && typeof data.roles === 'object') {
            onUpdate(data.roles);
          }
        }
      },
      (err) => {
        console.warn('[Firestore] Roles subscription error:', err);
      }
    );
  } catch {
    return () => {};
  }
}

/**
 * Restore an entire backup dataset into Firestore in atomic chunks.
 * Writes to all core collections so real-time listeners don't overwrite restored data.
 */
export async function restoreEntireBackupToFirestore(
  backupData: Record<string, any>,
  updatedBy: string = 'المدير'
): Promise<{ success: boolean; message: string; counts: Record<string, number> }> {
  try {
    if (!backupData || typeof backupData !== 'object') {
      return { success: false, message: 'بيانات النسخة الاحتياطية غير صالحة أو تالفة', counts: {} };
    }

    const counts: Record<string, number> = {};

    // 1. Items
    if (Array.isArray(backupData.items) && backupData.items.length > 0) {
      await batchSaveFirestoreDocs('items', backupData.items, updatedBy, true);
      counts['الأصناف'] = backupData.items.length;
    }

    // 2. Moves
    if (Array.isArray(backupData.moves) && backupData.moves.length > 0) {
      await batchSaveFirestoreDocs('moves', backupData.moves, updatedBy, true);
      counts['حركات المخزن'] = backupData.moves.length;
    }

    // 3. Procurement
    if (Array.isArray(backupData.proc) && backupData.proc.length > 0) {
      await batchSaveFirestoreDocs('proc', backupData.proc, updatedBy, true);
      counts['أوامر الشراء'] = backupData.proc.length;
    }

    // 4. Maintenance
    if (Array.isArray(backupData.maint) && backupData.maint.length > 0) {
      await batchSaveFirestoreDocs('maint', backupData.maint, updatedBy, true);
      counts['بلاغات الصيانة'] = backupData.maint.length;
    }

    // 5. Cleaning
    if (Array.isArray(backupData.clean) && backupData.clean.length > 0) {
      await batchSaveFirestoreDocs('clean', backupData.clean, updatedBy, true);
      counts['مهام النظافة'] = backupData.clean.length;
    }

    // 6. Cleaning History
    if (Array.isArray(backupData.cleanHist) && backupData.cleanHist.length > 0) {
      await batchSaveFirestoreDocs('cleanHist', backupData.cleanHist, updatedBy, true);
      counts['سجلات النظافة'] = backupData.cleanHist.length;
    }

    // 7. Lines
    if (Array.isArray(backupData.lines) && backupData.lines.length > 0) {
      await batchSaveFirestoreDocs('lines', backupData.lines, updatedBy, true);
      counts['خطوط الموبايل'] = backupData.lines.length;
    }

    // 8. Requests
    if (Array.isArray(backupData.reqs) && backupData.reqs.length > 0) {
      await batchSaveFirestoreDocs('reqs', backupData.reqs, updatedBy, true);
      counts['طلبات الأقسام'] = backupData.reqs.length;
    }

    // 9. Suppliers
    if (Array.isArray(backupData.suppliers) && backupData.suppliers.length > 0) {
      await batchSaveFirestoreDocs('suppliers', backupData.suppliers, updatedBy, true);
      counts['الموردين'] = backupData.suppliers.length;
    }

    // 10. Recurring Commitments
    if (Array.isArray(backupData.recurring) && backupData.recurring.length > 0) {
      await batchSaveFirestoreDocs('recurring', backupData.recurring, updatedBy, true);
      counts['الالتزامات الدورية'] = backupData.recurring.length;
    }

    // 11. Stocktakes
    if (Array.isArray(backupData.stock) && backupData.stock.length > 0) {
      await batchSaveFirestoreDocs('stock', backupData.stock, updatedBy, true);
      counts['الجرد'] = backupData.stock.length;
    }

    // 12. Petty Cash
    if (Array.isArray(backupData.pettyCash) && backupData.pettyCash.length > 0) {
      await batchSaveFirestoreDocs('pettyCash', backupData.pettyCash, updatedBy, true);
      counts['العهدة النقدية'] = backupData.pettyCash.length;
    }

    // 13. Activities
    if (Array.isArray(backupData.activities) && backupData.activities.length > 0) {
      await batchSaveFirestoreDocs('activities', backupData.activities, updatedBy, true);
      counts['سجل العمليات'] = backupData.activities.length;
    }

    // 14. Roles & Permissions
    if (backupData.roles && typeof backupData.roles === 'object') {
      await syncRolesToFirestore(backupData.roles);
      counts['أدوار المستخدمين'] = Object.keys(backupData.roles).length;
    }

    // 15. Backup metadata
    try {
      const metaDoc = doc(db, 'system', 'backup_meta');
      await setDoc(
        metaDoc,
        {
          lastRestoredAt: serverTimestamp(),
          lastRestoredIso: new Date().toISOString(),
          restoredBy: updatedBy,
          branch: backupData.branch || 'Monglish Academy - Alexandria',
          version: backupData.version || Date.now(),
          counts
        },
        { merge: true }
      );
    } catch {
      // Ignore meta write error
    }

    return {
      success: true,
      message: 'تمت استعادة النسخة الاحتياطية ورفعها إلى السحابة بنجاح ✓',
      counts
    };
  } catch (err: any) {
    console.error('[Firestore] Error in restoreEntireBackupToFirestore:', err);
    return {
      success: false,
      message: `فشل رفع النسخة إلى السحابة: ${err?.message || 'خطأ غير معروف'}`,
      counts: {}
    };
  }
}

/**
 * Append-only activity document writer
 */
export async function saveActivityDoc(activity: SystemActivity): Promise<boolean> {
  if (!activity || !activity.id) return false;
  if (getFirestoreQuotaStatus().isExceeded) return false;
  try {
    const cleanId = String(activity.id).trim();
    const docRef = doc(db, 'activities', cleanId);
    const payload = {
      ...activity,
      id: cleanId,
      deleted: false,
      read: activity.read || false,
      ts: activity.ts || Date.now(),
      createdAt: serverTimestamp()
    };
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
    return true;
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExceeded(err);
    }
    return false;
  }
}

/**
 * Mark a single activity as read
 */
export async function markActivityReadDoc(activityId: string): Promise<boolean> {
  if (!activityId) return false;
  try {
    const cleanId = String(activityId).trim();
    const docRef = doc(db, 'activities', cleanId);
    await setDoc(docRef, { read: true, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (err: any) {
    if (isQuotaExceededError(err)) markFirestoreQuotaExceeded(err);
    return false;
  }
}

/**
 * Soft-delete activities in batches (Manager only)
 */
export async function clearActivitiesSoftDelete(
  activityIds: string[],
  deletedBy: string = 'المدير'
): Promise<boolean> {
  if (!activityIds || activityIds.length === 0) return true;
  try {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < activityIds.length; i += CHUNK_SIZE) {
      const chunk = activityIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        const docRef = doc(db, 'activities', String(id).trim());
        batch.set(
          docRef,
          {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy
          },
          { merge: true }
        );
      }
      await batch.commit();
    }
    return true;
  } catch (err: any) {
    if (isQuotaExceededError(err)) markFirestoreQuotaExceeded(err);
    return false;
  }
}

/* ========================================================================= */
/*       ATOMIC STOCK MOVES ENGINE (INCREMENT ON BALANCE + MOVE RECORDS)     */
/* ========================================================================= */

/**
 * Commits stock movements atomically in Firestore using batch writes.
 * Updates item balances using increment() without requiring read-before-write,
 * ensuring offline compatibility and immunity to concurrent race conditions.
 */
export async function commitStockMoves(
  moves: StockMove[],
  options?: {
    newItems?: InventoryItem[];
    activityLog?: SystemActivity;
    updatedBy?: string;
  }
): Promise<{ success: boolean; code?: string; error?: string }> {
  if (!moves || moves.length === 0) {
    return { success: true };
  }
  if (getFirestoreQuotaStatus().isExceeded) {
    return {
      success: false,
      code: 'resource-exhausted',
      error: 'تم استهلاك الحصة السحابية المجانية لليوم — تم حفظ الحركة محلياً'
    };
  }

  const updatedBy = options?.updatedBy || (moves[0] && moves[0].by) || 'المستخدم';

  try {
    // Process in batches of max 150 items to stay well below Firestore 500 ops per batch limit
    const BATCH_SIZE = 150;
    for (let i = 0; i < moves.length; i += BATCH_SIZE) {
      const batchMoves = moves.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      // 1. Create new items if provided in this batch
      if (options?.newItems && i === 0) {
        for (const newItem of options.newItems) {
          if (!newItem || !newItem.id) continue;
          const cleanItemId = String(newItem.id).trim();
          const itemDocRef = doc(db, 'items', cleanItemId);
          const newItemPayload = sanitizeForFirestore({
            ...newItem,
            id: cleanItemId,
            balance: 0, // Balance will be incremented by the stock move
            deleted: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedAtIso: new Date().toISOString(),
            updatedBy
          });
          batch.set(itemDocRef, newItemPayload, { merge: true });
        }
      }

      // 2. Add each move and its corresponding balance increment to the batch
      for (const move of batchMoves) {
        if (!move || !move.id || !move.itemId) continue;
        const cleanMoveId = String(move.id).trim();
        const cleanItemId = String(move.itemId).trim();
        const itemDocRef = doc(db, 'items', cleanItemId);
        const moveDocRef = doc(db, 'moves', cleanMoveId);

        const qty = Math.abs(Number(move.qty) || 0);
        const delta = move.type === 'in' ? qty : -qty;

        // Atomic balance update
        batch.set(
          itemDocRef,
          {
            balance: increment(delta),
            updatedAt: serverTimestamp(),
            updatedAtIso: new Date().toISOString(),
            updatedBy: move.by || updatedBy
          },
          { merge: true }
        );

        // Move record
        const movePayload = sanitizeForFirestore({
          ...move,
          id: cleanMoveId,
          itemId: cleanItemId,
          deleted: false,
          createdAt: serverTimestamp(),
          createdAtIso: new Date().toISOString()
        });
        batch.set(moveDocRef, movePayload, { merge: true });
      }

      // 3. Activity log if requested
      if (options?.activityLog && i === 0) {
        const actRef = doc(db, 'activities', String(options.activityLog.id).trim());
        batch.set(
          actRef,
          sanitizeForFirestore({
            ...options.activityLog,
            id: String(options.activityLog.id).trim(),
            deleted: false,
            createdAt: serverTimestamp()
          }),
          { merge: true }
        );
      }

      await batch.commit();
    }

    return { success: true };
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExceeded(err);
      return {
        success: false,
        code: 'resource-exhausted',
        error: 'تم استهلاك الحصة السحابية المجانية لليوم — تم حفظ الحركة محلياً'
      };
    }

    const rawMsg = String(err?.message || err || '');
    const isPermissionDenied =
      err?.code === 'permission-denied' ||
      rawMsg.toLowerCase().includes('permission-denied') ||
      rawMsg.toLowerCase().includes('missing or insufficient permissions');

    const code = isPermissionDenied ? 'permission-denied' : (err?.code || 'error');
    const userFriendlyError = isPermissionDenied
      ? 'لا تملك صلاحية إضافة صنف جديد للمخزن أو تعديل الأرصدة — يرجى التواصل مع إدارة المخازن أو المدير'
      : (err?.message || 'فشلت حركة المخزون في السحابة');

    console.error(`[Stock Commit Error] [${code}]:`, err);

    if (!isPermissionDenied) {
      addFailedOperation({
        type: 'stock_move',
        collectionName: 'moves',
        payload: moves,
        error: userFriendlyError
      });
    }

    return { success: false, code, error: userFriendlyError };
  }
}

/**
 * Backward compatibility alias for single move execution
 */
export async function executeStockMoveTransaction(
  move: StockMove,
  options?: {
    isAdjustment?: boolean;
    overrideBalance?: number;
    activityLog?: SystemActivity;
  }
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const res = await commitStockMoves([move], {
    activityLog: options?.activityLog,
    updatedBy: move.by
  });
  return { success: res.success, error: res.error };
}

/* ========================================================================= */
/*       REAL-TIME LISTENERS (SINGLE SOURCE OF TRUTH + METADATA TRACKING)    */
/* ========================================================================= */

/**
 * Real-time listener for a specific collection.
 * Filters out soft-deleted items automatically.
 * Notifies listener of (items, fromCache, hasPendingWrites).
 */
export function subscribeToCollection<T = any>(
  collectionName: string,
  onUpdate: (items: T[], fromCache: boolean, hasPendingWrites: boolean) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    let q: any;
    if (collectionName === 'activities') {
      q = query(collection(db, 'activities'), orderBy('ts', 'desc'), limit(300));
    } else {
      q = collection(db, collectionName);
    }

    return onSnapshot(
      q,
      (snapshot: any) => {
        try {
          const list: T[] = [];
          snapshot.forEach((docSnap: any) => {
            const data = docSnap.data();
            if (data && !data.deleted) {
              list.push({ ...data, id: docSnap.id } as T);
            }
          });
          onUpdate(list, snapshot.metadata?.fromCache ?? false, snapshot.metadata?.hasPendingWrites ?? false);
        } catch (parseErr: any) {
          console.error(`[Firestore Sync] Parse error in collection ${collectionName}:`, parseErr);
        }
      },
      (error: any) => {
        if (isQuotaExceededError(error)) {
          markFirestoreQuotaExceeded(error);
        } else {
          console.warn(`[Firestore Sync] Snapshot notice for ${collectionName}:`, error?.message || error);
        }
        if (onError) onError(error);
      }
    );
  } catch (err: any) {
    console.warn(`[Firestore Sync] Failed to attach listener to ${collectionName}:`, err);
    return () => {};
  }
}

/* ========================================================================= */
/*                     MIGRATION TOOL (ONE-TIME REFACTOR)                    */
/* ========================================================================= */

export interface MigrationReport {
  timestamp: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  totalMigrated: number;
  counts: Record<string, number>;
  error?: string;
  sourceCounts?: Record<string, number>;
  diff?: Record<string, { source: number; migrated: number }>;
}

/**
 * Check if the migration from system/monglish_database to collections has completed
 */
export async function getMigrationStatus(): Promise<MigrationReport | null> {
  try {
    const snap = await getDoc(MIGRATION_STATUS_DOC_REF);
    if (snap.exists()) {
      return snap.data() as MigrationReport;
    }
    return null;
  } catch (err: any) {
    if (isQuotaExceededError(err)) markFirestoreQuotaExceeded(err);
    throw err;
  }
}

/**
 * Authoritative Migration Function:
 * Manual, Manager-only.
 * Uses a distributed lock with transaction on `system/migration_status`.
 * Uses create-if-missing only (never overwrites existing documents).
 */
export async function migrateDatabaseToCollections(
  onProgress?: (step: string, current: number, total: number) => void,
  sourceData?: Partial<FullMonglishDatabase>
): Promise<MigrationReport> {
  const counts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  let totalCount = 0;

  try {
    if (onProgress) onProgress('التحقق من قفل الهجرة وقاعدة البيانات...', 0, 100);

    // 1. Acquire distributed lock with transaction (10-minute expiry)
    const LOCK_EXPIRY_MS = 10 * 60 * 1000;
    await runTransaction(db, async (tx) => {
      const statusSnap = await tx.get(MIGRATION_STATUS_DOC_REF);
      if (statusSnap.exists()) {
        const currentData = statusSnap.data();
        if (currentData.status === 'running') {
          const startedAtTs = Number(currentData.startedAtTs) || 0;
          if (Date.now() - startedAtTs < LOCK_EXPIRY_MS) {
            throw new Error('عملية الترحيل قيد التشغيل بالفعل من قبل مستخدم آخر. يرجى الانتظار.');
          }
        }
      }
      tx.set(
        MIGRATION_STATUS_DOC_REF,
        {
          status: 'running',
          startedAt: serverTimestamp(),
          startedAtTs: Date.now()
        },
        { merge: true }
      );
    });

    let rawData: FullMonglishDatabase | null = null;

    if (sourceData && Object.keys(sourceData).length > 0) {
      rawData = sourceData as FullMonglishDatabase;
    } else {
      const snap = await getDoc(SYSTEM_DOC_REF);
      if (snap.exists()) {
        rawData = snap.data() as FullMonglishDatabase;
      }
    }

    if (!rawData) {
      throw new Error('لم يتم العثور على بيانات سابقة في المستند القديم أو ملف النسخة الاحتياطية.');
    }

    const mapping: Record<string, any[] | undefined> = {
      items: rawData.items,
      moves: rawData.moves,
      proc: rawData.proc,
      maint: rawData.maint,
      clean: rawData.clean,
      cleanHist: rawData.cleanHist,
      lines: rawData.lines,
      reqs: rawData.reqs,
      suppliers: rawData.suppliers,
      recurring: rawData.recurring,
      stock: rawData.stock,
      pettyCash: rawData.pettyCash,
      activities: rawData.activities?.slice(0, 300)
    };

    const collectionKeys = Object.keys(mapping);
    let completedSteps = 0;

    for (const colName of collectionKeys) {
      const records = mapping[colName] || [];
      sourceCounts[colName] = records.length;
      let createdCount = 0;

      if (records.length > 0) {
        if (onProgress) {
          onProgress(`فحص وترحيل ${colName} (${records.length} سجل)...`, completedSteps, collectionKeys.length);
        }

        // Get existing documents in target collection to enforce create-if-missing
        const existingDocsSnap = await getDocs(collection(db, colName));
        const existingIds = new Set<string>();
        existingDocsSnap.forEach((d) => existingIds.add(d.id));

        const toCreate: Array<Record<string, any>> = [];
        for (const item of records) {
          if (!item || !item.id) continue;
          const cleanId = String(item.id).trim();
          if (!existingIds.has(cleanId)) {
            toCreate.push(item);
          }
        }

        if (toCreate.length > 0) {
          await batchSaveFirestoreDocs(colName, toCreate, 'نظام الترحيل الآمن', true);
          createdCount = toCreate.length;
        }
      }

      counts[colName] = createdCount;
      totalCount += createdCount;
      completedSteps++;
    }

    // Build diff report
    const diff: Record<string, { source: number; migrated: number }> = {};
    for (const key of collectionKeys) {
      diff[key] = {
        source: sourceCounts[key] || 0,
        migrated: counts[key] || 0
      };
    }

    // Save migration status report
    const report: MigrationReport = {
      timestamp: new Date().toISOString(),
      status: 'completed',
      totalMigrated: totalCount,
      counts,
      sourceCounts,
      diff
    };

    await setDoc(
      MIGRATION_STATUS_DOC_REF,
      sanitizeForFirestore({
        ...report,
        completedAt: serverTimestamp()
      }),
      { merge: true }
    );

    if (onProgress) onProgress('اكتملت الهجرة بنجاح تام وتم إنشاء التقرير!', 100, 100);
    return report;
  } catch (err: any) {
    const errorReport: MigrationReport = {
      timestamp: new Date().toISOString(),
      status: 'error',
      totalMigrated: totalCount,
      counts,
      sourceCounts,
      error: err?.message || String(err)
    };

    // Only update migration status doc if we were the owner of the lock or failed after acquiring it
    const isLockConflict = String(err?.message || '').includes('عملية الترحيل قيد التشغيل بالفعل');
    if (!isLockConflict) {
      try {
        await setDoc(
          MIGRATION_STATUS_DOC_REF,
          sanitizeForFirestore({
            ...errorReport,
            errorAt: serverTimestamp()
          }),
          { merge: true }
        );
      } catch {}
    }

    return errorReport;
  }
}

export { testFirestoreConnection };
