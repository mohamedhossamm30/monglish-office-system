import React, { useEffect, useMemo, useRef, useState, useCallback, Suspense } from 'react';
import {
  AuthUser,
  CleaningHistory,
  CleaningTask,
  DepartmentRequest,
  InventoryItem,
  MaintenanceAsset,
  MaintenanceTicket,
  MobileLine,
  PettyCashExpense,
  PhysicalStocktake,
  PurchaseOrder,
  RecurringTemplate,
  RoleConfig,
  RoleKey,
  StockMove,
  Supplier,
  SyncStatusType,
  SystemActivity,
  TabKey
} from './types';
import {
  clearAllLocalCachedData,
  downloadExcelWorkbook,
  exportToCsv,
  loadActivities,
  loadData,
  loadRoles,
  ROLE_ALLOWED_TABS,
  getRoleDefaultCanWrite,
  getRoleDefaultCanStockMove,
  saveData,
  saveRoles,
  today,
  isCleanPersonName,
  mergeRecordsById,
  deduplicateLines,
  BackupValidationSummary,
  parseAndValidateBackupPayload,
  syncCountersWithExistingRecords,
  checkAndGenerateAssetMaintenanceAlerts,
  uid,
  normName,
  getNextItemCode,
  getNextDocumentSequence
} from './utils/storage';
import { idbSaveFullSnapshot } from './utils/idbStorage';
import {
  getFirestoreQuotaStatus,
  getFailedOperations,
  subscribeToFailedOperations,
  clearAllFailedOperations,
  retryAllFailedOperations,
  saveFirestoreDoc,
  softDeleteFirestoreDoc,
  batchSaveFirestoreDocs,
  subscribeToCollection,
  subscribeToRolesDoc,
  saveActivityDoc,
  markActivityReadDoc,
  clearActivitiesSoftDelete,
  commitStockMoves,
  executeStockMoveTransaction
} from './utils/firebaseSync';
import { auth, db, firebaseConfig } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, getDocFromCache, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { FirestoreQuotaBanner } from './components/FirestoreQuotaBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ROLES } from './data/seedData';
import { playNotificationTone } from './utils/audioAlert';

import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import type { PrintVoucherData } from './components/PrintVoucherModal';

const BuffetView = React.lazy(() => import('./components/BuffetView').then((m) => ({ default: m.BuffetView })));
const CleaningView = React.lazy(() => import('./components/CleaningView').then((m) => ({ default: m.CleaningView })));
const CostsView = React.lazy(() => import('./components/CostsView').then((m) => ({ default: m.CostsView })));
const DashboardView = React.lazy(() => import('./components/DashboardView').then((m) => ({ default: m.DashboardView })));
const ExcelImportModal = React.lazy(() => import('./components/ExcelImportModal').then((m) => ({ default: m.ExcelImportModal })));
const InventoryView = React.lazy(() => import('./components/InventoryView').then((m) => ({ default: m.InventoryView })));
const LoginScreen = React.lazy(() => import('./components/LoginScreen').then((m) => ({ default: m.LoginScreen })));
const MaintenanceView = React.lazy(() => import('./components/MaintenanceView').then((m) => ({ default: m.MaintenanceView })));
const MobileLinesView = React.lazy(() => import('./components/MobileLinesView').then((m) => ({ default: m.MobileLinesView })));
const ProcurementView = React.lazy(() => import('./components/ProcurementView').then((m) => ({ default: m.ProcurementView })));
const ReportsView = React.lazy(() => import('./components/ReportsView').then((m) => ({ default: m.ReportsView })));
const RequestsView = React.lazy(() => import('./components/RequestsView').then((m) => ({ default: m.RequestsView })));
const SettingsView = React.lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));
const AiAdvisorView = React.lazy(() => import('./components/AiAdvisorView').then((m) => ({ default: m.AiAdvisorView })));
const PrintVoucherModal = React.lazy(() => import('./components/PrintVoucherModal').then((m) => ({ default: m.PrintVoucherModal })));
const NotificationCenterModal = React.lazy(() => import('./components/NotificationCenterModal').then((m) => ({ default: m.NotificationCenterModal })));
const AuditLogModal = React.lazy(() => import('./components/AuditLogModal').then((m) => ({ default: m.AuditLogModal })));
const InstallAppModal = React.lazy(() => import('./components/InstallAppModal').then((m) => ({ default: m.InstallAppModal })));

const ViewLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[320px] w-full p-8 text-center animate-pulse" dir="rtl">
    <div className="w-10 h-10 border-4 border-[#075073] border-t-[#E68131] rounded-full animate-spin mb-4" />
    <span className="text-sm font-bold text-stone-700">جاري تحميل الشاشة...</span>
    <span className="text-xs text-stone-400 mt-1 font-mono">Monglish Office Management</span>
  </div>
);

const ModalLoadingFallback: React.FC = () => (
  <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
    <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-3 border-[#075073] border-t-[#E68131] rounded-full animate-spin" />
      <span className="text-xs font-bold text-stone-700">جاري تحميل النافذة...</span>
    </div>
  </div>
);

export default function App() {
  // Purge legacy local cache if Firebase project changed
  useEffect(() => {
    try {
      const activeProjectId = firebaseConfig.projectId;
      const storedProjectId = localStorage.getItem('mo_active_firebase_project');
      if (storedProjectId && storedProjectId !== activeProjectId) {
        console.log(`Firebase project changed from ${storedProjectId} to ${activeProjectId}. Purging legacy local cache.`);
        clearAllLocalCachedData();
      }
      localStorage.setItem('mo_active_firebase_project', activeProjectId);
    } catch {
      // Ignore
    }
  }, []);

  // Session & Authentication State
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [currentRole, setCurrentRole] = useState<RoleKey | null>(null);

  const [isLockedDept] = useState<boolean>(() => {
    return !!localStorage.getItem('monglish_locked_dept');
  });

  // Track Firebase Auth state & sync in real-time with users/{uid} document
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (fbUser) {
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);

          // Real-time snapshot listener on the current user's profile doc
          unsubUserDoc = onSnapshot(
            userDocRef,
            async (snap) => {
              if (!snap.exists()) {
                console.warn('User document was deleted or does not exist:', fbUser.uid);
                await signOut(auth).catch(() => {});
                clearAllLocalCachedData();
                setAuthUser(null);
                setCurrentRole(null);
                setAuthLoading(false);
                showToast('⚠️ تم تعطيل حسابك، تواصل مع المدير');
                return;
              }

              const d = snap.data();
              if (d?.active === false) {
                console.warn('User account has been disabled by manager:', fbUser.uid);
                await signOut(auth).catch(() => {});
                clearAllLocalCachedData();
                setAuthUser(null);
                setCurrentRole(null);
                setAuthLoading(false);
                showToast('⚠️ تم تعطيل حسابك، تواصل مع المدير');
                return;
              }

              const roleKey = (d.role as RoleKey) || 'warehouse';
              const allRoles = loadRoles();
              const roleConfig = allRoles[roleKey] || ROLES[roleKey];

              const userObj: AuthUser = {
                uid: fbUser.uid,
                email: fbUser.email || d.email || '',
                username: d.username || '',
                displayName: d.displayName || d.label || roleConfig?.label || roleKey,
                role: roleKey,
                label: d.label || d.displayName || roleConfig?.label || roleKey,
                canWrite: Array.isArray(d.canWrite) && d.canWrite.length > 0
                  ? d.canWrite
                  : getRoleDefaultCanWrite(roleKey),
                canStockMove: d.canStockMove !== undefined
                  ? !!d.canStockMove
                  : getRoleDefaultCanStockMove(roleKey),
                allowedTabs: Array.isArray(d.allowedTabs) && d.allowedTabs.length > 0
                  ? d.allowedTabs
                  : (roleKey === 'manager'
                      ? ROLES.manager.tabs
                      : (roleConfig?.tabs || ['dashboard'])),
                active: true
              };

              setAuthUser(userObj);
              setCurrentRole(roleKey);
              setAuthLoading(false);
            },
            async (err) => {
              console.warn('User doc snapshot notice:', err);
              // Fallback to cache if network glitch
              try {
                const cacheSnap = await getDocFromCache(userDocRef);
                if (cacheSnap.exists()) {
                  const d = cacheSnap.data();
                  if (d?.active === false) {
                    await signOut(auth).catch(() => {});
                    clearAllLocalCachedData();
                    setAuthUser(null);
                    setCurrentRole(null);
                    showToast('⚠️ تم تعطيل حسابك، تواصل مع المدير');
                    setAuthLoading(false);
                    return;
                  }
                  const roleKey = (d.role as RoleKey) || 'warehouse';
                  const allRoles = loadRoles();
                  const roleConfig = allRoles[roleKey] || ROLES[roleKey];
                  const userObj: AuthUser = {
                    uid: fbUser.uid,
                    email: fbUser.email || d.email || '',
                    username: d.username || '',
                    displayName: d.displayName || d.label || roleConfig?.label || roleKey,
                    role: roleKey,
                    label: d.label || d.displayName || roleConfig?.label || roleKey,
                    canWrite: Array.isArray(d.canWrite) && d.canWrite.length > 0
                      ? d.canWrite
                      : getRoleDefaultCanWrite(roleKey),
                    canStockMove: d.canStockMove !== undefined
                      ? !!d.canStockMove
                      : getRoleDefaultCanStockMove(roleKey),
                    allowedTabs: Array.isArray(d.allowedTabs) && d.allowedTabs.length > 0
                      ? d.allowedTabs
                      : (roleKey === 'manager'
                          ? ROLES.manager.tabs
                          : (roleConfig?.tabs || ['dashboard'])),
                    active: true
                  };
                  setAuthUser(userObj);
                  setCurrentRole(roleKey);
                }
              } catch {}
              setAuthLoading(false);
            }
          );
        } catch (e) {
          console.warn('Failed to attach user snapshot listener:', e);
          setAuthLoading(false);
        }
      } else {
        clearAllLocalCachedData();
        setAuthUser(null);
        setCurrentRole(null);
        setAuthLoading(false);
      }
    });

    return () => {
      if (unsubUserDoc) unsubUserDoc();
      unsubAuth();
    };
  }, []);

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Core Data States
  const [items, setItems] = useState<InventoryItem[]>(() => loadData<InventoryItem[]>('ITEMS'));
  const [moves, setMoves] = useState<StockMove[]>(() => loadData<StockMove[]>('MOVES'));
  const [proc, setProc] = useState<PurchaseOrder[]>(() => loadData<PurchaseOrder[]>('PROC'));
  const [maint, setMaint] = useState<MaintenanceTicket[]>(() => loadData<MaintenanceTicket[]>('MAINT'));
  const [assets, setAssets] = useState<MaintenanceAsset[]>(() => loadData<MaintenanceAsset[]>('ASSETS'));
  const [clean, setClean] = useState<CleaningTask[]>(() => loadData<CleaningTask[]>('CLEAN'));
  const [cleanHist, setCleanHist] = useState<CleaningHistory[]>(() => loadData<CleaningHistory[]>('CLEAN_HIST'));
  const [lines, setLines] = useState<MobileLine[]>(() => loadData<MobileLine[]>('LINES'));
  const [reqs, setReqs] = useState<DepartmentRequest[]>(() => loadData<DepartmentRequest[]>('REQS'));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadData<Supplier[]>('SUPPLIERS'));
  const [recurring, setRecurring] = useState<RecurringTemplate[]>(() => loadData<RecurringTemplate[]>('RECURRING'));
  const [pettyCash, setPettyCash] = useState<PettyCashExpense[]>(() => loadData<PettyCashExpense[]>('PETTY_CASH'));
  const [stock, setStock] = useState<PhysicalStocktake[]>(() => loadData<PhysicalStocktake[]>('STOCK'));
  const [activities, setActivities] = useState<SystemActivity[]>(() => loadActivities());

  // Real-time Sync Status State
  const [syncStatus, setSyncStatus] = useState<SyncStatusType>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  });
  const [pendingWritesCount, setPendingWritesCount] = useState<number>(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Ref tracking
  const initializedCollectionsRef = useRef<Record<string, boolean>>({});
  const knownActivityIdsRef = useRef<Set<string>>(new Set(loadActivities().map((a) => String(a.id))));

  // Sound Alerts Toggle
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('monglish_sound_alerts') !== 'false';
  });
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Tab Selection with Instant Scroll-to-Top
  const handleSelectTab = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, []);

  // Ensure scroll position resets whenever activeTab changes
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [activeTab]);

  // Modal States
  const [excelImportType, setExcelImportType] = useState<'items' | 'lines' | 'proc' | null>(null);
  const [printVoucherData, setPrintVoucherData] = useState<PrintVoucherData | null>(null);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showAuditLogModal, setShowAuditLogModal] = useState(false);
  const [showInstallAppModal, setShowInstallAppModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Show Toast helper
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  // Helper for role names
  const getRoleName = useCallback((role: string): string => {
    const all = loadRoles();
    return all[role]?.label || ROLES[role]?.label || role;
  }, []);

  // PWA Install prompt listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => {
      setToastMsg(null);
    }, 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Check URL params on initial load
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlTab = urlParams.get('tab');
      if (urlTab) {
        setActiveTab(urlTab as TabKey);
      }
    } catch {}
  }, []);

  // Sync document sequence counters with existing data
  useEffect(() => {
    syncCountersWithExistingRecords({
      proc,
      moves,
      pettyCash,
      maint,
      reqs,
      stock
    });
  }, [proc, moves, pettyCash, maint, reqs, stock]);

  // Automatic check & notification generation for Asset Periodic Maintenance
  useEffect(() => {
    if (assets && assets.length > 0) {
      const generated = checkAndGenerateAssetMaintenanceAlerts(assets);
      if (generated.length > 0) {
        setActivities((prev) => [...generated, ...prev]);
        if (soundEnabledRef.current) {
          playNotificationTone();
        }
      }
    }
  }, [assets]);

  // Online / Offline Detection
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus('synced');
      showToast('تم استعادة الاتصال بالإنترنت ✓');
    };
    const handleOffline = () => {
      setSyncStatus('offline');
      showToast('انقطع الاتصال بالإنترنت - يعمل النظام حالياً بنظام الحفظ المحلي');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Active in-flight writes counter & helper
  const activeWritesCountRef = useRef<number>(0);

  const startSyncOperation = () => {
    activeWritesCountRef.current++;
    setSyncStatus('syncing');
  };

  const endSyncOperation = (success: boolean = true) => {
    activeWritesCountRef.current = Math.max(0, activeWritesCountRef.current - 1);
    if (activeWritesCountRef.current === 0) {
      if (getFirestoreQuotaStatus().isExceeded) {
        setSyncStatus('offline');
      } else if (!success && getFailedOperations().length > 0) {
        setSyncStatus('fail');
      } else {
        setSyncStatus('synced');
      }
      setLastSyncTime(
        new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      );
    }
  };

  // Listen to failed operations queue for accurate badge count
  useEffect(() => {
    const unsub = subscribeToFailedOperations((ops) => {
      setPendingWritesCount(ops.length);
      if (ops.length === 0 && syncStatus === 'fail') {
        setSyncStatus('synced');
      }
    });
    return () => unsub();
  }, [syncStatus]);

  // Safety watchdog: Automatically recover syncStatus if it stays 'syncing' > 4s without clearing
  useEffect(() => {
    if (syncStatus !== 'syncing') {
      return;
    }

    const timer = setTimeout(() => {
      activeWritesCountRef.current = 0;
      if (getFirestoreQuotaStatus().isExceeded) {
        setSyncStatus('offline');
      } else {
        const failedOps = getFailedOperations();
        if (failedOps.length > 0) {
          setSyncStatus('fail');
        } else {
          setSyncStatus('synced');
        }
      }
      setLastSyncTime(
        new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      );
    }, 4000);

    return () => clearTimeout(timer);
  }, [syncStatus]);

  /* ========================================================================= */
  /*       REAL-TIME LISTENERS: SINGLE SOURCE OF TRUTH (COLLECTIONS)          */
  /* ========================================================================= */

  useEffect(() => {
    if (!authUser) {
      return;
    }

    const unsubscribes: Array<() => void> = [];

    const handleCollectionUpdate = <T extends { id: string | number }>(
      colName: string,
      itemsFromCloud: T[],
      fromCache: boolean,
      hasPendingWrites: boolean,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      storageKey: string
    ) => {
      // Guard against initial empty cache wipeout before first cloud response
      const isInitialized = initializedCollectionsRef.current[colName];
      if (fromCache && itemsFromCloud.length === 0 && !isInitialized) {
        return;
      }

      initializedCollectionsRef.current[colName] = true;

      saveData(storageKey, itemsFromCloud);
      setter(itemsFromCloud);
    };

    const handleCollectionError = (colName: string, err: any) => {
      console.warn(`[Firestore Listener Notice] ${colName}:`, err?.message || err);
    };

    // 1. Items
    unsubscribes.push(
      subscribeToCollection<InventoryItem>(
        'items',
        (data, fromCache, pending) => {
          handleCollectionUpdate('items', data, fromCache, pending, setItems, 'ITEMS');
        },
        (err) => handleCollectionError('items', err)
      )
    );

    // 2. Moves
    unsubscribes.push(
      subscribeToCollection<StockMove>(
        'moves',
        (data, fromCache, pending) => {
          handleCollectionUpdate('moves', data, fromCache, pending, setMoves, 'MOVES');
        },
        (err) => handleCollectionError('moves', err)
      )
    );

    // 3. Procurement Orders
    unsubscribes.push(
      subscribeToCollection<PurchaseOrder>(
        'proc',
        (data, fromCache, pending) => {
          handleCollectionUpdate('proc', data, fromCache, pending, setProc, 'PROC');
        },
        (err) => handleCollectionError('proc', err)
      )
    );

    // 4. Maintenance Tickets
    unsubscribes.push(
      subscribeToCollection<MaintenanceTicket>(
        'maint',
        (data, fromCache, pending) => {
          handleCollectionUpdate('maint', data, fromCache, pending, setMaint, 'MAINT');
        },
        (err) => handleCollectionError('maint', err)
      )
    );

    // 4.1. Maintenance Assets & Schedules
    unsubscribes.push(
      subscribeToCollection<MaintenanceAsset>(
        'assets',
        (data, fromCache, pending) => {
          handleCollectionUpdate('assets', data, fromCache, pending, setAssets, 'ASSETS');
        },
        (err) => handleCollectionError('assets', err)
      )
    );

    // 5. Cleaning Tasks
    unsubscribes.push(
      subscribeToCollection<CleaningTask>(
        'clean',
        (data, fromCache, pending) => {
          handleCollectionUpdate('clean', data, fromCache, pending, setClean, 'CLEAN');
        },
        (err) => handleCollectionError('clean', err)
      )
    );

    // 6. Cleaning History
    unsubscribes.push(
      subscribeToCollection<CleaningHistory>(
        'cleanHist',
        (data, fromCache, pending) => {
          handleCollectionUpdate('cleanHist', data, fromCache, pending, setCleanHist, 'CLEAN_HIST');
        },
        (err) => handleCollectionError('cleanHist', err)
      )
    );

    // 7. Mobile Lines
    unsubscribes.push(
      subscribeToCollection<MobileLine>(
        'lines',
        (data, fromCache, pending) => {
          const cleaned = data.map((l) => ({
            ...l,
            employee: isCleanPersonName(l.employee) ? l.employee : undefined
          }));
          handleCollectionUpdate('lines', cleaned, fromCache, pending, setLines, 'LINES');
        },
        (err) => handleCollectionError('lines', err)
      )
    );

    // 8. Department Requests
    unsubscribes.push(
      subscribeToCollection<DepartmentRequest>(
        'reqs',
        (data, fromCache, pending) => {
          handleCollectionUpdate('reqs', data, fromCache, pending, setReqs, 'REQS');
        },
        (err) => handleCollectionError('reqs', err)
      )
    );

    // 9. Suppliers
    unsubscribes.push(
      subscribeToCollection<Supplier>(
        'suppliers',
        (data, fromCache, pending) => {
          handleCollectionUpdate('suppliers', data, fromCache, pending, setSuppliers, 'SUPPLIERS');
        },
        (err) => handleCollectionError('suppliers', err)
      )
    );

    // 10. Recurring Commitments
    unsubscribes.push(
      subscribeToCollection<RecurringTemplate>(
        'recurring',
        (data, fromCache, pending) => {
          handleCollectionUpdate('recurring', data, fromCache, pending, setRecurring, 'RECURRING');
        },
        (err) => handleCollectionError('recurring', err)
      )
    );

    // 11. Physical Stocktakes
    unsubscribes.push(
      subscribeToCollection<PhysicalStocktake>(
        'stock',
        (data, fromCache, pending) => {
          handleCollectionUpdate('stock', data, fromCache, pending, setStock, 'STOCK');
        },
        (err) => handleCollectionError('stock', err)
      )
    );

    // 12. Petty Cash
    unsubscribes.push(
      subscribeToCollection<PettyCashExpense>(
        'pettyCash',
        (data, fromCache, pending) => {
          handleCollectionUpdate('pettyCash', data, fromCache, pending, setPettyCash, 'PETTY_CASH');
        },
        (err) => handleCollectionError('pettyCash', err)
      )
    );

    // 13. System Activities
    unsubscribes.push(
      subscribeToCollection<SystemActivity>(
        'activities',
        (data, fromCache) => {
          const isInitialized = initializedCollectionsRef.current['activities'];
          if (fromCache && data.length === 0 && !isInitialized) return;
          initializedCollectionsRef.current['activities'] = true;

          const incomingNew = data.filter((a) => a && a.id && !knownActivityIdsRef.current.has(String(a.id)));
          if (incomingNew.length > 0) {
            incomingNew.forEach((a) => knownActivityIdsRef.current.add(String(a.id)));
            const latest = incomingNew[0];
            const isRecent = latest.ts ? Date.now() - latest.ts < 300000 : false;
            if (soundEnabledRef.current && !latest.read && isRecent) {
              playNotificationTone(latest.severity === 'critical' ? 'critical' : 'normal');
            }
            if (authUserRef.current?.role === 'manager' && latest.dept && !latest.read && isRecent) {
              showToast(`🔔 تنبيه جديد: [${latest.dept}] ${latest.action} بواسطة ${latest.by}`);
            }
          }

          saveData('ACTIVITIES', data);
          setActivities(data);
        },
        (err) => handleCollectionError('activities', err)
      )
    );

    // 14. Roles Cloud Sync Listener
    unsubscribes.push(
      subscribeToRolesDoc((cloudRoles) => {
        if (cloudRoles && typeof cloudRoles === 'object' && Object.keys(cloudRoles).length > 0) {
          saveRoles(cloudRoles, false);
        }
      })
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [authUser?.uid]);

  // Keep full IndexedDB backup synchronized
  useEffect(() => {
    idbSaveFullSnapshot({
      items,
      moves,
      proc,
      maint,
      assets,
      clean,
      cleanHist,
      lines,
      reqs,
      suppliers,
      recurring,
      stock,
      pettyCash,
      activities
    }).catch(() => {});
  }, [items, moves, proc, maint, assets, clean, cleanHist, lines, reqs, suppliers, recurring, stock, pettyCash, activities]);

  // Check preventive maintenance alerts on assets update
  useEffect(() => {
    if (assets && assets.length > 0) {
      checkAndGenerateAssetMaintenanceAlerts(assets);
    }
  }, [assets]);

  // Secure Backup Restoration & Merge Engine (Manager only)
  const handlePerformRestore = async (summary: BackupValidationSummary): Promise<{
    success: boolean;
    message: string;
    counts?: Record<string, number>;
  }> => {
    if (currentRole !== 'manager') {
      return { success: false, message: 'استعادة النسخة الاحتياطية مقتصرة على حساب المدير فقط' };
    }

    try {
      showToast('جاري دمج ومزامنة بيانات النسخة الاحتياطية مع السحابة...');
      const summaryList: string[] = [];
      const cloudCounts: Record<string, number> = {};

      // 1. Items
      const itemsCol = summary.validCollections.find((c) => c.key === 'items');
      if (itemsCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<InventoryItem>(items, itemsCol.records as any);
        setItems(mergedList);
        saveData('ITEMS', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('items', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['الأصناف'] = recordsToPush.length;
          summaryList.push(`${recordsToPush.length} صنف`);
        }
      }

      // 2. Moves
      const movesCol = summary.validCollections.find((c) => c.key === 'moves');
      if (movesCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<StockMove>(moves, movesCol.records as any);
        setMoves(mergedList);
        saveData('MOVES', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('moves', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['حركات المخزن'] = recordsToPush.length;
          summaryList.push(`${recordsToPush.length} حركة مخزن`);
        }
      }

      // 3. Proc
      const procCol = summary.validCollections.find((c) => c.key === 'proc');
      if (procCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<PurchaseOrder>(proc, procCol.records as any);
        setProc(mergedList);
        saveData('PROC', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('proc', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['أوامر الشراء'] = recordsToPush.length;
          summaryList.push(`${recordsToPush.length} أمر شراء`);
        }
      }

      // 4. Maint
      const maintCol = summary.validCollections.find((c) => c.key === 'maint');
      if (maintCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<MaintenanceTicket>(maint, maintCol.records as any);
        setMaint(mergedList);
        saveData('MAINT', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('maint', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['بلاغات الصيانة'] = recordsToPush.length;
          summaryList.push(`${recordsToPush.length} بلاغ صيانة`);
        }
      }

      // 4.1 Assets
      const assetsCol = summary.validCollections.find((c) => c.key === 'assets');
      if (assetsCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<MaintenanceAsset>(assets, assetsCol.records as any);
        setAssets(mergedList);
        saveData('ASSETS', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('assets', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['أصول ومعدات الصيانة'] = recordsToPush.length;
          summaryList.push(`${recordsToPush.length} أصل صيانة`);
        }
      }

      // 5. Clean
      const cleanCol = summary.validCollections.find((c) => c.key === 'clean');
      if (cleanCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<CleaningTask>(clean, cleanCol.records as any);
        setClean(mergedList);
        saveData('CLEAN', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('clean', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['مهام النظافة'] = recordsToPush.length;
        }
      }

      // 6. CleanHist
      const cleanHistCol = summary.validCollections.find((c) => c.key === 'cleanHist');
      if (cleanHistCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<CleaningHistory>(cleanHist, cleanHistCol.records as any);
        setCleanHist(mergedList);
        saveData('CLEAN_HIST', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('cleanHist', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['سجلات النظافة'] = recordsToPush.length;
        }
      }

      // 7. Lines
      const linesCol = summary.validCollections.find((c) => c.key === 'lines');
      if (linesCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<MobileLine>(lines, linesCol.records as any);
        setLines(mergedList);
        saveData('LINES', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('lines', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['خطوط المحمول'] = recordsToPush.length;
          summaryList.push(`${recordsToPush.length} خط`);
        }
      }

      // 8. Reqs
      const reqsCol = summary.validCollections.find((c) => c.key === 'reqs');
      if (reqsCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<DepartmentRequest>(reqs, reqsCol.records as any);
        setReqs(mergedList);
        saveData('REQS', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('reqs', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['طلبات الأقسام'] = recordsToPush.length;
          summaryList.push(`${recordsToPush.length} طلب`);
        }
      }

      // 9. Suppliers
      const suppliersCol = summary.validCollections.find((c) => c.key === 'suppliers');
      if (suppliersCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<Supplier>(suppliers, suppliersCol.records as any);
        setSuppliers(mergedList);
        saveData('SUPPLIERS', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('suppliers', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['الموردين'] = recordsToPush.length;
        }
      }

      // 10. Recurring
      const recurringCol = summary.validCollections.find((c) => c.key === 'recurring');
      if (recurringCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<RecurringTemplate>(recurring, recurringCol.records as any);
        setRecurring(mergedList);
        saveData('RECURRING', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('recurring', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['الالتزامات الدورية'] = recordsToPush.length;
        }
      }

      // 11. Stock
      const stockCol = summary.validCollections.find((c) => c.key === 'stock');
      if (stockCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<PhysicalStocktake>(stock, stockCol.records as any);
        setStock(mergedList);
        saveData('STOCK', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('stock', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['الجرد'] = recordsToPush.length;
        }
      }

      // 12. PettyCash
      const pettyCashCol = summary.validCollections.find((c) => c.key === 'pettyCash');
      if (pettyCashCol) {
        const { mergedList, recordsToPush } = mergeRecordsById<PettyCashExpense>(pettyCash, pettyCashCol.records as any);
        setPettyCash(mergedList);
        saveData('PETTY_CASH', mergedList);
        if (recordsToPush.length > 0) {
          await batchSaveFirestoreDocs('pettyCash', recordsToPush, 'المدير (استعادة ودمج)', true);
          cloudCounts['العهدة النقدية'] = recordsToPush.length;
        }
      }

      // 13. IndexedDB Snapshot
      const newVersion = (Number(localStorage.getItem('monglish_data_version') || 1)) + 10;
      localStorage.setItem('monglish_data_version', String(newVersion));
      localStorage.setItem('monglish_last_updated', new Date().toISOString());

      await idbSaveFullSnapshot({
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
        pettyCash: loadData('PETTY_CASH'),
        activities: loadActivities(),
        version: newVersion,
        lastUpdated: new Date().toISOString()
      }).catch((e) => console.warn('IDB snapshot notice:', e));

      // 14. Single summary activity log
      const exportDateDisplay = summary.exportDate || 'غير مدون';
      const summaryDetailText = summary.validCollections.map((c) => `${c.name}: ${c.count}`).join('، ');

      const restoreActivity: SystemActivity = {
        id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        action: 'استعادة ودمج نسخة احتياطية',
        dept: 'الإدارة',
        by: authUser?.label || authUser?.displayName || 'المدير العام',
        details: `استعادة ودمج نسخة احتياطية (تاريخ الملف: ${exportDateDisplay}). السجلات المستوردة: [${summaryDetailText}]`,
        date: today(),
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        ts: Date.now(),
        type: 'system',
        severity: 'critical',
        read: false
      };

      await saveActivityDoc(restoreActivity).catch((e) => console.warn('Activity save notice:', e));
      setActivities((prev) => [restoreActivity, ...prev]);

      const resultText = summaryList.length > 0 ? ` (${summaryList.join('، ')})` : '';

      return {
        success: true,
        message: `تم دمج واستعادة البيانات بنجاح في السحابة${resultText} ✓`,
        counts: cloudCounts
      };
    } catch (err: any) {
      console.error('[Restore Error]:', err);
      return {
        success: false,
        message: `فشلت عملية الدمج والاستعادة: ${err?.message || err}`
      };
    }
  };

  // Handle backup file restoration event (Manager only)
  useEffect(() => {
    const handleRestoreEvent = async (e: any) => {
      const restoredData = e.detail;
      if (!restoredData || typeof restoredData !== 'object') return;

      if (currentRole !== 'manager') {
        showToast('⚠️ استعادة النسخة الاحتياطية مقتصرة على حساب المدير فقط');
        return;
      }

      const summary: BackupValidationSummary =
        restoredData._validation || (await parseAndValidateBackupPayload(restoredData));

      if (!summary.valid) {
        showToast('⚠️ ملف النسخة الاحتياطية غير صالح: ' + (summary.errorMessage || ''));
        return;
      }

      const res = await handlePerformRestore(summary);
      if (res.success) {
        showToast('✓ ' + res.message);
      } else {
        showToast('⚠️ ' + res.message);
      }
    };

    window.addEventListener('monglish:database_restored', handleRestoreEvent);
    return () => window.removeEventListener('monglish:database_restored', handleRestoreEvent);
  }, [
    currentRole,
    items,
    moves,
    proc,
    maint,
    clean,
    cleanHist,
    lines,
    reqs,
    suppliers,
    recurring,
    stock,
    pettyCash,
    authUser
  ]);

  // Role Allowed Tabs memoization (User account document is 1st priority, Role config fallback)
  const allowedTabs: TabKey[] = useMemo(() => {
    if (!currentRole) return [];
    if (currentRole === 'manager') {
      return [
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
      ];
    }
    // 1. Account document allowedTabs takes highest priority
    if (authUser?.allowedTabs && Array.isArray(authUser.allowedTabs) && authUser.allowedTabs.length > 0) {
      return authUser.allowedTabs;
    }
    // 2. Global Role configuration fallback
    const allRoles = loadRoles();
    const config = allRoles[currentRole] || ROLES[currentRole];
    if (config?.tabs && Array.isArray(config.tabs) && config.tabs.length > 0) {
      return config.tabs;
    }
    return ROLE_ALLOWED_TABS[currentRole] || ['requests'];
  }, [currentRole, authUser?.allowedTabs]);

  // Strict RBAC Tab Guard
  useEffect(() => {
    if (currentRole && !allowedTabs.includes(activeTab)) {
      const fallbackTab = allowedTabs[0] || 'requests';
      setActiveTab(fallbackTab);
      showToast(`تم حجب هذا القسم — دورك مخصص لشاشة: ${getRoleName(currentRole)} فقط`);
    }
  }, [currentRole, activeTab, allowedTabs]);

  // Update session when user logs in
  const handleLogin = (user: AuthUser) => {
    setAuthUser(user);
    setCurrentRole(user.role);

    if (user.role === 'buffet') setActiveTab('buffet');
    else if (user.role === 'cleaning') setActiveTab('cleaning');
    else if (user.role === 'maint') setActiveTab('maintenance');
    else if (user.role === 'reception') setActiveTab('lines');
    else if (user.role === 'warehouse') setActiveTab('inventory');
    else if (user.role === 'purchase') setActiveTab('procurement');
    else setActiveTab('dashboard');

    showToast(`مرحباً بك! تم تسجيل الدخول بصلاحية: ${user.label}`);
  };

  const handleLogout = async () => {
    if (currentRole) {
      const act: SystemActivity = {
        id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        action: 'تسجيل الخروج',
        dept: 'النظام',
        by: authUser?.label || getRoleName(currentRole),
        details: `قام المستخدم (${authUser?.email || currentRole}) بتسجيل الخروج من النظام`,
        date: today(),
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        ts: Date.now(),
        type: 'system',
        severity: 'info',
        read: false
      };
      saveActivityDoc(act).catch(() => {});
    }

    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out error:', e);
    }

    clearAllLocalCachedData();
    initializedCollectionsRef.current = {};
    knownActivityIdsRef.current = new Set();
    setItems([]);
    setMoves([]);
    setProc([]);
    setMaint([]);
    setClean([]);
    setCleanHist([]);
    setLines([]);
    setReqs([]);
    setSuppliers([]);
    setRecurring([]);
    setPettyCash([]);
    setStock([]);
    setActivities([]);
    setCurrentRole(null);
    setAuthUser(null);
    showToast('تم تسجيل الخروج بنجاح ✓');
  };

  /* ========================================================================= */
  /*            SINGLE WRITE PATH & GRANULAR DIFF SYNCHRONIZATION             */
  /* ========================================================================= */

  const syncEntityDiff = async <T extends { id: string | number }>(
    colName: string,
    prevItems: T[],
    nextItems: T[],
    user: string
  ) => {
    if (!colName) return;

    try {
      if (prevItems.length === 0 && nextItems.length === 0) return;

      const prevMap = new Map(prevItems.map((i) => [String(i.id), i]));
      const nextMap = new Map(nextItems.map((i) => [String(i.id), i]));

      const addedItems: T[] = [];
      const updatedDiffs: Array<{ id: string; changes: Record<string, any> }> = [];
      const removedItems: T[] = [];

      for (const item of nextItems) {
        const id = String(item.id);
        const prev = prevMap.get(id);
        if (!prev) {
          addedItems.push(item);
        } else {
          const changes: Record<string, any> = {};
          let hasChange = false;
          for (const [k, v] of Object.entries(item as Record<string, any>)) {
            // For items collection, balance is exclusively updated atomically via commitStockMoves
            if (colName === 'items' && k === 'balance') continue;
            if ((prev as any)[k] !== v) {
              changes[k] = v;
              hasChange = true;
            }
          }
          if (hasChange) {
            updatedDiffs.push({ id, changes });
          }
        }
      }

      for (const prev of prevItems) {
        const id = String(prev.id);
        if (!nextMap.has(id)) {
          removedItems.push(prev);
        }
      }

      if (addedItems.length === 0 && updatedDiffs.length === 0 && removedItems.length === 0) {
        return;
      }

      startSyncOperation();

      // 1. Process added items
      if (addedItems.length > 5) {
        const res = await batchSaveFirestoreDocs(colName, addedItems as any[], user, true);
        if (!res.success && res.code === 'permission-denied') {
          showToast(`خطأ صلاحيات: ${res.error}`);
        }
      } else {
        for (const item of addedItems) {
          const res = await saveFirestoreDoc(colName, String(item.id), item as any, user, true);
          if (!res.success && res.code === 'permission-denied') {
            showToast(`خطأ صلاحيات: ${res.error}`);
          }
        }
      }

      // 2. Process granular diff updates
      for (const { id, changes } of updatedDiffs) {
        const res = await saveFirestoreDoc(colName, id, changes, user, false);
        if (!res.success && res.code === 'permission-denied') {
          showToast(`خطأ صلاحيات: ${res.error}`);
        }
      }

      // 3. Process removed items (soft delete)
      for (const prev of removedItems) {
        const res = await softDeleteFirestoreDoc(colName, String(prev.id), user);
        if (!res.success && res.code === 'permission-denied') {
          showToast(`خطأ صلاحيات: ${res.error}`);
        }
      }

      endSyncOperation(true);
    } catch (err: any) {
      console.warn(`[Sync Diff] Notice updating ${colName}:`, err?.message || err);
      endSyncOperation(false);
    }
  };

  const pushCollectionUpdate = <T extends { id: string | number }>(
    key: string,
    prevList: T[],
    nextList: T[],
    meta?: { updatedBy?: string; action?: string; dept?: string; details?: string }
  ) => {
    const user = meta?.updatedBy || (currentRole ? getRoleName(currentRole) : 'المستخدم');
    syncEntityDiff(key, prevList, nextList, user);
  };

  /* ---------------- Event Handlers for Domain Operations ---------------- */

  const handleSaveItems = useCallback((newItems: InventoryItem[]) => {
    const prev = items;
    setItems(newItems);
    saveData('ITEMS', newItems);

    const act: SystemActivity = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action: 'تحديث بيانات المخزن',
      dept: 'المخازن',
      by: currentRole ? getRoleName(currentRole) : 'أمين المخزن',
      details: `تم تحديث بيانات المخزن (${newItems.length} صنف مسجل)`,
      date: today(),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
      type: 'warehouse',
      severity: 'info',
      read: false
    };
    saveActivityDoc(act).catch((err) => console.warn('[Activity Log Notice]:', err?.message || err));

    pushCollectionUpdate('items', prev, newItems, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [items, currentRole, getRoleName]);

  const handleSaveMoves = useCallback(async (newMoves: StockMove[], newItems?: InventoryItem[]) => {
    const prev = moves;

    // Identify newly added moves
    const prevMoveIds = new Set(prev.map((m) => String(m.id)));
    const addedMoves = newMoves.filter((m) => !prevMoveIds.has(String(m.id)));

    // Ensure accurate unit cost computation for 'out' moves if missing
    for (const m of addedMoves) {
      if (m.type === 'out' && (!m.cost || Number(m.cost) <= 0) && !m.adjustment) {
        const itemObj =
          items.find((it) => String(it.id) === String(m.itemId)) ||
          (newItems && newItems.find((it) => String(it.id) === String(m.itemId)));
        if (itemObj && Number(itemObj.cost) > 0) {
          m.cost = +(Number(itemObj.cost) * (Number(m.qty) || 0)).toFixed(2);
        }
      }
    }

    setMoves(newMoves);
    saveData('MOVES', newMoves);

    if (addedMoves.length > 0) {
      // 1. Immediately apply balance delta to local React items state
      setItems((prevItems) => {
        const itemMap = new Map(prevItems.map((it) => [String(it.id), { ...it }]));
        if (newItems && Array.isArray(newItems)) {
          for (const ni of newItems) {
            const existing = itemMap.get(String(ni.id));
            if (!existing) {
              itemMap.set(String(ni.id), { ...ni, balance: 0 });
            } else {
              if (Number(ni.cost) > 0) existing.cost = Number(ni.cost);
              if (ni.code) existing.code = ni.code;
              if (ni.name) existing.name = ni.name;
            }
          }
        }
        for (const m of addedMoves) {
          const target = itemMap.get(String(m.itemId));
          if (target) {
            const qty = Math.abs(Number(m.qty) || 0);
            const delta = m.type === 'in' ? qty : -qty;
            target.balance = +(Number(target.balance || 0) + delta).toFixed(2);
            if (m.type === 'in' && Number(m.cost) > 0 && qty > 0) {
              target.cost = +(Number(m.cost) / qty).toFixed(2);
            }
          }
        }
        const nextItems = Array.from(itemMap.values());
        saveData('ITEMS', nextItems);
        return nextItems;
      });

      // 2. Commit atomic batch to Firestore with increment()
      const user = currentRole ? getRoleName(currentRole) : 'المستخدم';
      const firstMove = addedMoves[0];
      const act: SystemActivity = {
        id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        action:
          addedMoves.length === 1
            ? firstMove.adjustment
              ? 'تسوية جرد فعلي'
              : firstMove.type === 'in'
              ? 'توريد أصناف للمخزن'
              : 'إذن صرف بضاعة'
            : `حركات مخزن متعددة (${addedMoves.length} حركة)`,
        dept: 'المخازن',
        by: user,
        details:
          addedMoves.length === 1
            ? `${firstMove.type === 'in' ? 'توريد' : 'صرف'}: ${firstMove.itemName || 'صنف'} (${firstMove.qty} وحدة) - ${firstMove.department || firstMove.person || firstMove.note || 'المخزن'}`
            : `تم تسجيل ${addedMoves.length} حركة مخزنية جديدة`,
        quantity: addedMoves.reduce((acc, m) => acc + (Number(m.qty) || 0), 0),
        amount: addedMoves.reduce((acc, m) => acc + (Number(m.qty) || 0) * (Number(m.cost) || 0), 0),
        date: today(),
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        ts: Date.now(),
        type: 'warehouse',
        severity: addedMoves.some((m) => m.type === 'out') ? 'warning' : 'info',
        read: false
      };

      startSyncOperation();
      const commitResult = await commitStockMoves(addedMoves, {
        newItems,
        activityLog: act,
        updatedBy: user
      });
      endSyncOperation(commitResult.success);

      if (!commitResult.success) {
        showToast(
          commitResult.code === 'permission-denied'
            ? `خطأ صلاحيات: ${commitResult.error}`
            : `تنبيه: تم تسجيل الحركة محلياً (${commitResult.error || 'فشل الاتصال بالسحابة'})`
        );
      }
    } else {
      pushCollectionUpdate('moves', prev, newMoves, {
        updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
      });
    }
  }, [moves, items, currentRole, getRoleName, showToast]);

  const handleSaveProc = useCallback((newProc: PurchaseOrder[]) => {
    const prev = proc;

    // Detect orders that became completed or received
    const newlyCompletedOrders = newProc.filter((order) => {
      const isCompleted = order.status === 'مكتمل' || order.status === 'تم الاستلام';
      if (!isCompleted) return false;
      const prevOrder = prev.find((p) => p.id === order.id);
      const wasCompleted = prevOrder && (prevOrder.status === 'مكتمل' || prevOrder.status === 'تم الاستلام');
      return !wasCompleted;
    });

    const autoGeneratedMoves: StockMove[] = [];
    const autoTouchedItems: InventoryItem[] = [...items];
    let createdMovesCount = 0;

    for (const order of newlyCompletedOrders) {
      // Prevent duplication: check if moves already contain records for this order
      const alreadyHasMoves = moves.some(
        (m) =>
          m.note?.includes(`[${order.id}]`) ||
          (m.docType === 'GRN' && m.note?.includes(order.id)) ||
          m.voucherNo === order.id
      );
      if (alreadyHasMoves) continue;

      const grnSeq = getNextDocumentSequence('GRN');
      const receiverTitle = order.receivedBy || (currentRole ? getRoleName(currentRole) : 'أمين المخزن');
      const orderDate = order.receivedDate || order.date || today();

      (order.lines || []).forEach((line, idx) => {
        const qty = Math.abs(Number(line.qty) || 0);
        if (qty <= 0) return;
        const price = Number(line.price) || 0;
        const lineCost = +(qty * price).toFixed(2);

        let itemObj = autoTouchedItems.find(
          (i) => (line.itemId && String(i.id) === String(line.itemId)) || normName(i.name) === normName(line.itemName)
        );

        if (!itemObj) {
          const targetCat = line.cat || 'STAT';
          const code = (line.code && line.code.trim()) || getNextItemCode(targetCat, autoTouchedItems);
          const deptLocation =
            targetCat === 'BUFF'
              ? 'بوفيه المركز'
              : targetCat === 'CLN'
              ? 'مخزن النظافة'
              : 'المخزن الرئيسي';

          itemObj = {
            id: line.itemId || uid(),
            code,
            name: line.itemName.trim(),
            cat: targetCat,
            unit: line.unit || 'عدد',
            balance: 0, // Balance will be incremented by handleSaveMoves
            min: line.newMin || 5,
            cost: price,
            loc: deptLocation
          };
          autoTouchedItems.push(itemObj);
        } else {
          if (price > 0) itemObj.cost = price;
          if (!itemObj.code || itemObj.code.trim() === '') {
            itemObj.code = line.code || getNextItemCode(itemObj.cat, autoTouchedItems);
          }
        }

        line.itemId = itemObj.id;

        const moveUniqueId = `${grnSeq}_${idx + 1}_${uid().slice(0, 5)}`;
        autoGeneratedMoves.push({
          id: moveUniqueId,
          voucherNo: grnSeq,
          docType: 'GRN',
          itemId: itemObj.id,
          itemName: itemObj.name,
          code: itemObj.code,
          cat: itemObj.cat,
          type: 'in',
          qty,
          cost: lineCost,
          person: order.supplier || 'المورد',
          note: `استلام وتوريد تلقائي بموجب إذن [${grnSeq}] من أمر شراء [${order.id}]${order.invoiceNumber ? ` (فاتورة #${order.invoiceNumber})` : ''}`,
          date: orderDate,
          ts: Date.now() + idx,
          by: receiverTitle
        });
        createdMovesCount++;
      });
    }

    // Normalize received metadata on completed orders
    const normalizedProc = newProc.map((o) => {
      const isCompleted = o.status === 'مكتمل' || o.status === 'تم الاستلام';
      if (isCompleted && !o.receivedDate) {
        return {
          ...o,
          receivedDate: today(),
          receivedBy: o.receivedBy || (currentRole ? getRoleName(currentRole) : 'أمين المخزن')
        };
      }
      return o;
    });

    setProc(normalizedProc);
    saveData('PROC', normalizedProc);

    const act: SystemActivity = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action: newlyCompletedOrders.length > 0 ? 'استلام وتوريد أمر شراء' : 'تحديث أوامر الشراء',
      dept: 'المشتريات',
      by: currentRole ? getRoleName(currentRole) : 'مسؤول المشتريات',
      details:
        newlyCompletedOrders.length > 0
          ? `تم اعتماد أمر الشراء وتوريد الأصناف تلقائياً للمخزن (${newlyCompletedOrders.map((o) => o.id).join('، ')})`
          : `تسجيل وتحديث أوامر الشراء (${normalizedProc.length} أمر مسجل)`,
      date: today(),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
      type: 'purchase',
      severity: newlyCompletedOrders.length > 0 ? 'success' : 'info',
      read: false
    };
    saveActivityDoc(act).catch((err) => console.warn('[Activity Notice]:', err?.message || err));

    pushCollectionUpdate('proc', prev, normalizedProc, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });

    // Automatically commit stock movements and update balances
    if (autoGeneratedMoves.length > 0) {
      handleSaveMoves([...autoGeneratedMoves, ...moves], autoTouchedItems);
      showToast(`تم توريد أصناف أمر الشراء تلقائياً وتحديث أرصدة المخزن (${createdMovesCount} بند) ✓`);
    }
  }, [proc, moves, items, currentRole, getRoleName, handleSaveMoves, showToast]);

  const handleSaveMaint = useCallback((newMaint: MaintenanceTicket[]) => {
    const prev = maint;
    setMaint(newMaint);
    saveData('MAINT', newMaint);

    const act: SystemActivity = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action: 'تحديث بلاغات الصيانة',
      dept: 'الصيانة',
      by: currentRole ? getRoleName(currentRole) : 'فني الصيانة',
      details: `تحديث سجل بلاغات الصيانة (${newMaint.length} بلاغ)`,
      date: today(),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
      type: 'maint',
      severity: 'info',
      read: false
    };
    saveActivityDoc(act).catch((err) => console.warn('[Activity Notice]:', err?.message || err));

    pushCollectionUpdate('maint', prev, newMaint, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [maint, currentRole, getRoleName]);

  const handleSaveAssets = useCallback((newAssets: MaintenanceAsset[]) => {
    const prev = assets;
    setAssets(newAssets);
    saveData('ASSETS', newAssets);

    const act: SystemActivity = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action: 'تحديث سجل الأصول والصيانة الوقائية',
      dept: 'الصيانة',
      by: currentRole ? getRoleName(currentRole) : 'مسؤول الصيانة',
      details: `تحديث جدول الصيانة الدورية للأصول والمعدات (${newAssets.length} أصل مسجل)`,
      date: today(),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
      type: 'maint',
      severity: 'info',
      read: false
    };
    saveActivityDoc(act).catch((err) => console.warn('[Activity Notice]:', err?.message || err));

    pushCollectionUpdate('assets', prev, newAssets, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [assets, currentRole, getRoleName]);

  const handleSaveClean = useCallback((newClean: CleaningTask[]) => {
    const prev = clean;
    setClean(newClean);
    saveData('CLEAN', newClean);

    const act: SystemActivity = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action: 'تحديث مهام النظافة',
      dept: 'النظافة',
      by: currentRole ? getRoleName(currentRole) : 'مشرف النظافة',
      details: `تحديث جدول ونسب إنجاز مهام النظافة والخدمات`,
      date: today(),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
      type: 'clean',
      severity: 'info',
      read: false
    };
    saveActivityDoc(act).catch((err) => console.warn('[Activity Notice]:', err?.message || err));

    pushCollectionUpdate('clean', prev, newClean, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [clean, currentRole, getRoleName]);

  const handleSaveCleanHist = useCallback((newCleanHist: CleaningHistory[]) => {
    const prev = cleanHist;
    setCleanHist(newCleanHist);
    saveData('CLEAN_HIST', newCleanHist);

    pushCollectionUpdate('cleanHist', prev, newCleanHist, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [cleanHist, currentRole, getRoleName]);

  const handleSaveLines = useCallback((newLines: MobileLine[]) => {
    const prev = lines;
    const merged = deduplicateLines(newLines);
    setLines(merged);
    saveData('LINES', merged);

    const act: SystemActivity = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action: 'تحديث خطوط المحمول',
      dept: 'الاستقبال',
      by: currentRole ? getRoleName(currentRole) : 'مسؤول الخطوط',
      details: `تحديث سجل خطوط المحمول والفواتير (${merged.length} خط مسجل)`,
      date: today(),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
      type: 'line',
      severity: 'info',
      read: false
    };
    saveActivityDoc(act).catch((err) => console.warn('[Activity Notice]:', err?.message || err));

    pushCollectionUpdate('lines', prev, newLines, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [lines, currentRole, getRoleName]);

  const handleSaveReqs = useCallback((newReqs: DepartmentRequest[]) => {
    const prev = reqs;
    setReqs(newReqs);
    saveData('REQS', newReqs);

    const act: SystemActivity = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action: 'تحديث طلبات الأقسام',
      dept: 'الطلبات',
      by: currentRole ? getRoleName(currentRole) : 'المستخدم',
      details: `تحديث ومتابعة طلبات الأقسام والاحتياجات (${newReqs.length} طلب)`,
      date: today(),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
      type: 'request',
      severity: 'info',
      read: false
    };
    saveActivityDoc(act).catch((err) => console.warn('[Activity Notice]:', err?.message || err));

    pushCollectionUpdate('reqs', prev, newReqs, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [reqs, currentRole, getRoleName]);

  const handleSaveSuppliers = useCallback((newSuppliers: Supplier[]) => {
    const prev = suppliers;
    setSuppliers(newSuppliers);
    saveData('SUPPLIERS', newSuppliers);

    pushCollectionUpdate('suppliers', prev, newSuppliers, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [suppliers, currentRole, getRoleName]);

  const handleSaveRecurring = useCallback((newRecurring: RecurringTemplate[]) => {
    const prev = recurring;
    setRecurring(newRecurring);
    saveData('RECURRING', newRecurring);

    pushCollectionUpdate('recurring', prev, newRecurring, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [recurring, currentRole, getRoleName]);

  const handleSavePettyCash = useCallback((newPettyCash: PettyCashExpense[]) => {
    const prev = pettyCash;
    setPettyCash(newPettyCash);
    saveData('PETTY_CASH', newPettyCash);

    pushCollectionUpdate('pettyCash', prev, newPettyCash, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [pettyCash, currentRole, getRoleName]);

  const handleSaveStock = useCallback((newStock: PhysicalStocktake[]) => {
    const prev = stock;
    setStock(newStock);
    saveData('STOCK', newStock);

    pushCollectionUpdate('stock', prev, newStock, {
      updatedBy: currentRole ? getRoleName(currentRole) : 'المستخدم'
    });
  }, [stock, currentRole, getRoleName]);

  const handleSaveRoles = useCallback((updatedRoles: Record<string, RoleConfig>) => {
    saveRoles(updatedRoles);
    showToast('تم حفظ وتحديث إعدادات الحسابات بنجاح ✓');
  }, [showToast]);

  /* ---------------- Activity Log Handlers ---------------- */

  const handleMarkAsRead = useCallback((actId: string) => {
    markActivityReadDoc(actId).catch((err) => console.warn('[Activity Read Notice]:', err?.message || err));
    setActivities((prev) =>
      prev.map((a) => (a.id === actId ? { ...a, read: true } : a))
    );
  }, []);

  const handleMarkAllAsRead = useCallback(() => {
    const unreadIds = activities.filter((a) => !a.read).map((a) => String(a.id));
    unreadIds.forEach((id) => markActivityReadDoc(id).catch((err) => console.warn('[Activity Read Notice]:', err?.message || err)));
    setActivities((prev) => prev.map((a) => ({ ...a, read: true })));
    showToast('تم تعليم جميع الإشعارات كمقروءة ✓');
  }, [activities, showToast]);

  const handleClearActivities = useCallback(async () => {
    if (currentRole !== 'manager') {
      showToast('⚠️ مسح سجل الأنشطة مقتصر على المدير فقط');
      return;
    }
    const allIds = activities.map((a) => String(a.id));
    await clearActivitiesSoftDelete(allIds, 'المدير');
    setActivities([]);
    saveData('ACTIVITIES', []);
    showToast('تم مسح سجل النشاطات بنجاح ✓');
  }, [currentRole, activities, showToast]);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('monglish_sound_alerts', String(next));
      showToast(next ? 'تم تفعيل التنبيهات الصوتية 🔔' : 'تم كتم التنبيهات الصوتية 🔕');
      return next;
    });
  }, [showToast]);

  // CSV Export handler dispatcher
  const handleExportCSV = useCallback((type: string) => {
    exportToCsv(type);
    showToast('تم تصدير ملف CSV بنجاح ✓');
  }, [showToast]);

  const handleOpenNewReq = useCallback((title: string, note?: string) => {
    const newReq: DepartmentRequest = {
      id: 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title,
      note,
      dept: currentRole ? getRoleName(currentRole) : 'القسم',
      cat: 'عام',
      urgency: 'عادي',
      status: 'جديد',
      date: today(),
      by: currentRole ? getRoleName(currentRole) : 'المستخدم',
      createdByUid: authUser?.uid || undefined
    };
    handleSaveReqs([newReq, ...reqs]);
    showToast('تم إرسال الطلب إلى الإدارة بنجاح ✓');
  }, [currentRole, getRoleName, authUser, handleSaveReqs, reqs, showToast]);

  const handleApproveReq = useCallback((id: string) => {
    const updated = reqs.map((r) => (r.id === id ? { ...r, status: 'معتمد' as const } : r));
    handleSaveReqs(updated);
    showToast('تم اعتماد الطلب بنجاح ✓');
  }, [reqs, handleSaveReqs, showToast]);

  const handleRejectReq = useCallback((id: string) => {
    const updated = reqs.map((r) => (r.id === id ? { ...r, status: 'مرفوض' as const } : r));
    handleSaveReqs(updated);
    showToast('تم رفض الطلب');
  }, [reqs, handleSaveReqs, showToast]);

  const handleImportBackupJson = (jsonData: any) => {
    if (jsonData && typeof jsonData === 'object') {
      window.dispatchEvent(
        new CustomEvent('monglish:database_restored', { detail: jsonData })
      );
    }
  };

  const unreadCount = useMemo(() => activities.filter((a) => !a.read).length, [activities]);
  const pendingReqsCount = useMemo(() => reqs.filter((r) => r.status === 'جديد').length, [reqs]);
  const pendingProcCount = useMemo(
    () => proc.filter((p) => p.status !== 'مكتمل' && p.status !== 'تم الاستلام' && p.status !== 'ملغي').length,
    [proc]
  );

  // Render loading state during Firebase Auth initialization
  if (authLoading) {
    return (
      <div className="fade-in-entry min-h-screen bg-gradient-to-br from-[#075073] to-[#03151F] flex flex-col items-center justify-center text-white" dir="rtl">
        <div className="w-12 h-12 border-4 border-[#E68131] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-stone-200">جاري التحقق من هوية المستخدم والمصادقة السحابية...</p>
        <p className="text-xs text-stone-400 mt-1 font-mono">Monglish Office Management</p>
      </div>
    );
  }

  // Render Login Screen if not logged in
  if (!currentRole || !authUser) {
    return (
      <Suspense
        fallback={
          <div className="fade-in-entry min-h-screen bg-gradient-to-br from-[#075073] to-[#03151F] flex flex-col items-center justify-center text-white" dir="rtl">
            <div className="w-12 h-12 border-4 border-[#E68131] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-bold text-stone-200">جاري تحميل شاشة تسجيل الدخول...</p>
            <p className="text-xs text-stone-400 mt-1 font-mono">Monglish Office Management</p>
          </div>
        }
      >
        <LoginScreen
          onLogin={handleLogin}
          showToast={showToast}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen md:h-screen md:max-h-screen bg-stone-100 flex flex-col text-stone-800 font-sans antialiased overflow-x-hidden md:overflow-hidden" dir="rtl">
      {/* Cloud Quota Status Banner */}
      <FirestoreQuotaBanner />

      {/* Top Navbar spans 100% full width across the entire top */}
      <TopNav
        currentRole={currentRole}
        activeTab={activeTab}
        syncStatus={syncStatus}
        lastSyncTime={lastSyncTime}
        pendingQueueCount={pendingWritesCount}
        isLockedDept={isLockedDept}
        unreadNotificationsCount={unreadCount}
        onOpenNotifications={() => setShowNotificationsModal(true)}
        onOpenAuditLog={() => setShowAuditLogModal(true)}
        onOpenInstallApp={() => setShowInstallAppModal(true)}
        onLogout={handleLogout}
        onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        onExportAll={() => downloadExcelWorkbook()}
        onRetryPending={async () => {
          setSyncStatus('syncing');
          showToast('جاري إعادة محاولة مزامنة العمليات المعلقة...');
          try {
            const res = await retryAllFailedOperations();
            if (res.failed === 0) {
              clearAllFailedOperations();
              setPendingWritesCount(0);
              setSyncStatus('synced');
              setLastSyncTime(
                new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
              );
              showToast('تمت مزامنة جميع العمليات المعلقة بنجاح ✓');
            } else {
              setPendingWritesCount(res.failed);
              setSyncStatus('fail');
              showToast(`تمت مزامنة ${res.succeeded} عملية، وتتبقى ${res.failed} عمليات`);
            }
          } catch {
            setSyncStatus('synced');
            showToast('تم تحديث حالة المزامنة ✓');
          }
        }}
        onRefresh={() => {
          clearAllFailedOperations();
          setPendingWritesCount(0);
          setSyncStatus('synced');
          setLastSyncTime(
            new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
          );
          showToast('تم تحديث الشاشة وتأكيد المزامنة بنجاح ✓');
        }}
      />

      {/* Main Layout Body: Sidebar (right) + Content Area (left) */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 md:overflow-hidden">
        {/* Sidebar for Desktop & Mobile Drawer */}
        <Sidebar
          currentRole={currentRole}
          activeTab={activeTab}
          isLockedDept={isLockedDept}
          badgeCounts={{
            inventory: pendingProcCount,
            procurement: pendingProcCount,
            requests: pendingReqsCount
          } as any}
          pendingRequestsCount={pendingReqsCount}
          unreadNotificationsCount={unreadCount}
          onSelectTab={handleSelectTab}
          onOpenAuditLog={() => setShowAuditLogModal(true)}
          onOpenInstallApp={() => setShowInstallAppModal(true)}
          onOpenNotifications={() => setShowNotificationsModal(true)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          onOpenMobile={() => setMobileMenuOpen(true)}
        />

        {/* Main Content Area: Resets to top instantly on every tab switch */}
        <div 
          ref={mainContentRef} 
          className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6 overflow-y-auto scroll-smooth"
        >
          {/* View Routing with Strict Error Boundary */}
          <main key={activeTab} className="flex-1 p-3 sm:p-5 lg:p-7 max-w-7xl w-full mx-auto fade-in-entry">
          <ErrorBoundary>
            <Suspense fallback={<ViewLoadingFallback />}>
              {activeTab === 'dashboard' && (
              <DashboardView
                items={items}
                moves={moves}
                proc={proc}
                maint={maint}
                clean={clean}
                cleanHist={cleanHist}
                lines={lines}
                reqs={reqs}
                recurring={recurring}
                activities={activities}
                currentRole={currentRole}
                onNavigateTab={handleSelectTab}
                onApproveReq={handleApproveReq}
                onRejectReq={handleRejectReq}
                onOpenAuditLog={() => setShowAuditLogModal(true)}
                onOpenNotifications={() => setShowNotificationsModal(true)}
              />
            )}

            {activeTab === 'inventory' && (
              <InventoryView
                items={items}
                moves={moves}
                proc={proc}
                currentRole={currentRole}
                authUser={authUser}
                onSaveItems={handleSaveItems}
                onSaveMoves={handleSaveMoves}
                onSaveProc={handleSaveProc}
                onExportCSV={handleExportCSV}
                onOpenExcelImport={(type) => setExcelImportType(type)}
                onPrintVoucher={(data) => setPrintVoucherData(data)}
                showToast={showToast}
              />
            )}

            {activeTab === 'procurement' && (
              <ProcurementView
                proc={proc}
                items={items}
                moves={moves}
                suppliers={suppliers}
                recurring={recurring}
                currentRole={currentRole}
                authUser={authUser}
                onSaveProc={handleSaveProc}
                onSaveItems={handleSaveItems}
                onSaveMoves={handleSaveMoves}
                onSaveSuppliers={handleSaveSuppliers}
                onSaveRecurring={handleSaveRecurring}
                onExportCSV={handleExportCSV}
                onOpenExcelImport={(type) => setExcelImportType(type)}
                onPrintVoucher={(data) => setPrintVoucherData(data)}
                showToast={showToast}
              />
            )}

            {activeTab === 'maintenance' && (
              <MaintenanceView
                maint={maint}
                assets={assets}
                currentRole={currentRole}
                authUser={authUser}
                onSaveMaint={handleSaveMaint}
                onSaveAssets={handleSaveAssets}
                onExportCSV={handleExportCSV}
                showToast={showToast}
              />
            )}

            {activeTab === 'buffet' && (
              <BuffetView
                items={items}
                proc={proc}
                moves={moves}
                stock={stock}
                currentRole={currentRole}
                authUser={authUser}
                onSaveItems={handleSaveItems}
                onSaveProc={handleSaveProc}
                onSaveMoves={handleSaveMoves}
                onSaveStock={handleSaveStock}
                onExportCSV={handleExportCSV}
                onOpenNewReq={handleOpenNewReq}
                showToast={showToast}
              />
            )}

            {activeTab === 'cleaning' && (
              <CleaningView
                clean={clean}
                cleanHist={cleanHist}
                items={items}
                proc={proc}
                moves={moves}
                stock={stock}
                currentRole={currentRole}
                authUser={authUser}
                onSaveClean={handleSaveClean}
                onSaveCleanHist={handleSaveCleanHist}
                onSaveItems={handleSaveItems}
                onSaveProc={handleSaveProc}
                onSaveMoves={handleSaveMoves}
                onSaveStock={handleSaveStock}
                onExportCSV={handleExportCSV}
                onOpenNewReq={handleOpenNewReq}
                showToast={showToast}
              />
            )}

            {activeTab === 'lines' && (
              <MobileLinesView
                lines={lines}
                currentRole={currentRole}
                authUser={authUser}
                onSaveLines={handleSaveLines}
                onExportCSV={handleExportCSV}
                onOpenExcelImport={(type) => setExcelImportType(type)}
                showToast={showToast}
              />
            )}

            {activeTab === 'requests' && (
              <RequestsView
                reqs={reqs}
                currentRole={currentRole}
                authUser={authUser}
                onSaveReqs={handleSaveReqs}
                onExportCSV={handleExportCSV}
                onOpenNewProcurement={() => setActiveTab('procurement')}
                showToast={showToast}
              />
            )}

            {activeTab === 'costs' && (
              <CostsView
                proc={proc}
                maint={maint}
                lines={lines}
                recurring={recurring}
                pettyCash={pettyCash}
                moves={moves}
                items={items}
                currentRole={currentRole}
                authUser={authUser}
                onSaveRecurring={handleSaveRecurring}
                onSavePettyCash={handleSavePettyCash}
                onExportCSV={handleExportCSV}
                showToast={showToast}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsView
                items={items}
                moves={moves}
                proc={proc}
                maint={maint}
                clean={clean}
                cleanHist={cleanHist}
                lines={lines}
                reqs={reqs}
                currentRole={currentRole}
                onExportCSV={handleExportCSV}
                onImportBackupJson={handleImportBackupJson}
                showToast={showToast}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                currentRole={currentRole}
                authUser={authUser}
                onSaveRoles={handleSaveRoles}
                showToast={showToast}
                onPerformRestore={handlePerformRestore}
              />
            )}

            {activeTab === 'ai' && (
              <AiAdvisorView
                items={items}
                moves={moves}
                proc={proc}
                maint={maint}
                clean={clean}
                lines={lines}
                recurring={recurring}
                showToast={showToast}
              />
            )}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>

      {/* Modals & Dialogs with Code Splitting Suspense */}
      <Suspense fallback={<ModalLoadingFallback />}>
        {/* Real-time Notification Center Modal */}
        {showNotificationsModal && (
          <NotificationCenterModal
            activities={activities}
            soundEnabled={soundEnabled}
            onToggleSound={handleToggleSound}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onOpenAuditLog={() => {
              setShowNotificationsModal(false);
              setShowAuditLogModal(true);
            }}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
              setShowNotificationsModal(false);
            }}
            onClose={() => setShowNotificationsModal(false)}
          />
        )}

        {/* Full Audit Log Modal */}
        {showAuditLogModal && (
          <AuditLogModal
            activities={activities}
            onClearActivities={currentRole === 'manager' ? handleClearActivities : undefined}
            onClose={() => setShowAuditLogModal(false)}
            showToast={showToast}
          />
        )}

        {/* Install as Mobile App Modal */}
        {showInstallAppModal && (
          <InstallAppModal
            deferredPrompt={deferredPrompt}
            onClose={() => setShowInstallAppModal(false)}
            onInstalled={() => {
              showToast('تم تثبيت التطبيق بنجاح! ستجده الآن على شاشتك الرئيسية ✓');
            }}
          />
        )}

        {/* Excel Import Modal */}
        {excelImportType && (
          <ExcelImportModal
            type={excelImportType}
            onClose={() => setExcelImportType(null)}
            onImportItems={(newItems) => {
              handleSaveItems([...newItems, ...items]);
            }}
            onImportLines={(newLines) => {
              const merged = deduplicateLines([...newLines, ...lines]);
              handleSaveLines(merged);
            }}
            onImportProc={(newOrders) => {
              handleSaveProc([...newOrders, ...proc]);
            }}
            showToast={showToast}
          />
        )}

        {/* Official Printable Voucher Modal */}
        {printVoucherData && (
          <PrintVoucherModal
            data={printVoucherData}
            onClose={() => setPrintVoucherData(null)}
          />
        )}
      </Suspense>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-18 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-[#075073] text-white text-xs font-bold shadow-2xl flex items-center gap-2.5 border border-[#E68131]/40 animate-fade-in max-w-[90vw] text-center">
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
