import React, { useState } from 'react';
import { RoleConfig, RoleKey, TabKey, AuthUser } from '../types';
import { TABS_META } from '../data/seedData';
import {
  exportAllDataJson,
  restoreAllDataFromJson,
  loadRoles,
  resetRolesToDefault,
  saveRoles,
  downloadDepartmentLauncher,
  parseAndValidateBackupPayload,
  BackupValidationSummary
} from '../utils/storage';
import { runStorageHealthCheck, performFullStorageRepair, StorageDiagnosticResult } from '../utils/storageHealth';
import { initPersistentStorage } from '../utils/idbStorage';
import { migrateDatabaseToCollections, getMigrationStatus, MigrationReport } from '../utils/firebaseSync';
import { UserManagementView } from './UserManagementView';
import { RestorePreviewModal } from './RestorePreviewModal';
import {
  Building2,
  Check,
  Download,
  Upload,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  ExternalLink,
  Laptop,
  HardDrive,
  Wrench,
  AlertTriangle,
  Activity,
  Cloud,
  Database,
  Layers
} from 'lucide-react';

interface SettingsViewProps {
  roles?: Record<string, RoleConfig>;
  onSaveRoles?: (newRoles: Record<string, RoleConfig>) => void;
  showToast: (msg: string) => void;
  currentRole?: RoleKey | null;
  authUser?: AuthUser | null;
  onPerformRestore?: (
    summary: BackupValidationSummary
  ) => Promise<{ success: boolean; message: string; counts?: Record<string, number> }>;
}

const AVAILABLE_EMOJIS = ['👔', '📦', '🧾', '☕', '🛠️', '🧴', '📞', '💼', '💻', '🎯', '📊', '👨‍🏫', '🔒', '⭐', '🏢'];

export const SettingsView: React.FC<SettingsViewProps> = ({
  roles: propRoles,
  onSaveRoles: propOnSaveRoles,
  showToast,
  currentRole,
  authUser,
  onPerformRestore
}) => {
  const [internalRoles, setInternalRoles] = useState<Record<string, RoleConfig>>(() => propRoles || loadRoles());
  const roles: Record<string, RoleConfig> = propRoles || internalRoles;

  const onSaveRoles = (updated: Record<string, RoleConfig>) => {
    setInternalRoles(updated);
    saveRoles(updated);
    if (propOnSaveRoles) {
      propOnSaveRoles(updated);
    }
  };

  // Add User Modal
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleEmail, setNewRoleEmail] = useState('');
  const [newRoleIcon, setNewRoleIcon] = useState('💼');
  const [newRoleTabs, setNewRoleTabs] = useState<TabKey[]>(['requests']);

  // Edit Role Permissions Modal
  const [editingRole, setEditingRole] = useState<RoleConfig | null>(null);
  const [editTabs, setEditTabs] = useState<TabKey[]>([]);
  const [editLabel, setEditLabel] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editIcon, setEditIcon] = useState('');

  // Backup & Restore
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [isPastingRestore, setIsPastingRestore] = useState(false);
  const [restorePreviewSummary, setRestorePreviewSummary] = useState<BackupValidationSummary | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [isExecutingRestore, setIsExecutingRestore] = useState(false);

  // Storage Health Diagnostics State
  const [diagnostics, setDiagnostics] = useState<StorageDiagnosticResult | null>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [isRepairingStorage, setIsRepairingStorage] = useState(false);

  // Firestore Collections Migration State
  const [migrationReport, setMigrationReport] = useState<MigrationReport | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStep, setMigrationStep] = useState('');
  const [migrationProgressPct, setMigrationProgressPct] = useState(0);

  React.useEffect(() => {
    runStorageHealthCheck().then(setDiagnostics).catch(() => {});
    getMigrationStatus().then(setMigrationReport).catch(() => {});
  }, []);

  const handleRunMigration = async () => {
    try {
      setIsMigrating(true);
      setMigrationStep('جاري تنزيل نسخة احتياطية محلية JSON تلقائياً قبل الترحيل...');
      setMigrationProgressPct(10);
      try {
        exportAllDataJson();
      } catch {}

      const report = await migrateDatabaseToCollections((step, current, total) => {
        setMigrationStep(step);
        if (total > 0) {
          setMigrationProgressPct(Math.round((current / total) * 100));
        }
      });

      setMigrationReport(report);
      if (report.status === 'completed') {
        showToast(`✓ تم ترحيل ${report.totalMigrated} سجل إلى مجموعات Firestore بنجاح تام!`);
      } else {
        showToast(`تنبيه أثناء الترحيل: ${report.error || 'حدث خطأ غير متوقع'}`);
      }
    } catch (err: any) {
      showToast(`تعذر بدء الترحيل: ${err?.message || err}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleRunHealthCheck = async () => {
    setIsRunningDiag(true);
    try {
      const diag = await runStorageHealthCheck();
      setDiagnostics(diag);
      showToast(diag.status === 'healthy' ? '✓ التخزين سليم تماماً ولا يوجد أي تضارب' : '⚠️ تم رصد بعض الملاحظات في التخزين');
    } catch {
      showToast('⚠️ تعذر إتمام فحص التخزين');
    } finally {
      setIsRunningDiag(false);
    }
  };

  const handleRunAutoRepair = async () => {
    setIsRepairingStorage(true);
    try {
      const res = await performFullStorageRepair();
      setDiagnostics(res.diagnostics);
      showToast(res.message);
    } catch (err: any) {
      showToast('⚠️ فشل إصلاح التخزين: ' + (err?.message || 'خطأ'));
    } finally {
      setIsRepairingStorage(false);
    }
  };

  const handleRequestPersist = async () => {
    const granted = await initPersistentStorage();
    if (granted) {
      showToast('✓ تم تفعيل الحفظ الدائم (Persistent Storage) بنجاح');
      handleRunHealthCheck();
    } else {
      showToast('⚠️ لم يمنح المتصفح إذن الحفظ الدائم، أو أنه مفعل مسبقاً');
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsRestoring(true);
    try {
      const summary = await parseAndValidateBackupPayload(file);
      if (!summary.valid) {
        showToast('⚠️ ' + (summary.errorMessage || 'ملف النسخة الاحتياطية غير صالح'));
        return;
      }
      setRestorePreviewSummary(summary);
      setShowRestoreModal(true);
    } catch (err: any) {
      showToast('⚠️ فشل قراءة وفحص ملف النسخة الاحتياطية: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsRestoring(false);
      if (e.target) e.target.value = '';
    }
  };

  const handlePasteRestore = async () => {
    if (!pastedJson.trim()) {
      showToast('⚠️ يرجى لصق كود أو نص النسخة الاحتياطية أولاً');
      return;
    }
    setIsPastingRestore(true);
    try {
      const summary = await parseAndValidateBackupPayload(pastedJson.trim());
      if (!summary.valid) {
        showToast('⚠️ ' + (summary.errorMessage || 'كود النسخة الاحتياطية غير صالح'));
        return;
      }
      setShowPasteModal(false);
      setPastedJson('');
      setRestorePreviewSummary(summary);
      setShowRestoreModal(true);
    } catch (err: any) {
      showToast('⚠️ فشل استعادة وفحص النسخة الاحتياطية: ' + (err?.message || 'خطأ في تنسيق JSON'));
    } finally {
      setIsPastingRestore(false);
    }
  };

  const handleConfirmExecuteRestore = async (summary: BackupValidationSummary) => {
    setIsExecutingRestore(true);
    try {
      if (onPerformRestore) {
        const res = await onPerformRestore(summary);
        if (res.success) {
          showToast('✓ ' + res.message);
          setShowRestoreModal(false);
          setRestorePreviewSummary(null);
        } else {
          showToast('⚠️ ' + res.message);
        }
      } else {
        const res = await restoreAllDataFromJson(summary.rawPayload);
        if (res.success) {
          showToast('✓ ' + res.message);
          setShowRestoreModal(false);
          setRestorePreviewSummary(null);
        } else {
          showToast('⚠️ ' + res.message);
        }
      }
    } catch (err: any) {
      showToast('⚠️ فشل تنفيذ الدمج: ' + (err?.message || err));
    } finally {
      setIsExecutingRestore(false);
    }
  };

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newRoleLabel.trim();
    const email = newRoleEmail.trim().toLowerCase() || `${newRoleKey.trim() || 'user'}@monglish.local`;

    if (!label) {
      showToast('يرجى إدخال مسمى المستخدم / الدور');
      return;
    }

    const key = newRoleKey.trim() || 'user_' + Date.now().toString(36);
    if (roles[key]) {
      showToast('⚠️ هذا المعرف مستخدم بالفعل');
      return;
    }

    const newRole: RoleConfig = {
      key,
      label,
      icon: newRoleIcon,
      email,
      tabs: newRoleTabs.length > 0 ? newRoleTabs : ['requests'],
      isCustom: true
    };

    onSaveRoles({
      ...roles,
      [key]: newRole
    });

    setShowAddUserModal(false);
    setNewRoleKey('');
    setNewRoleLabel('');
    setNewRoleEmail('');
    setNewRoleTabs(['requests']);
    showToast(`تم إضافة الحساب الجديد "${label}" بنجاح ✓`);
  };

  const handleDeleteRole = (key: string) => {
    if (key === 'manager') {
      showToast('⚠️ لا يمكن حذف حساب المدير الرئيسي');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف حساب "${roles[key]?.label}" نهائياً؟`)) {
      return;
    }

    const updated = { ...roles };
    delete updated[key];
    onSaveRoles(updated);
    showToast('تم حذف الحساب بنجاح ✓');
  };

  const handleOpenEditRole = (r: RoleConfig) => {
    setEditingRole(r);
    setEditLabel(r.label);
    setEditEmail(r.email || `${r.key}@monglish.local`);
    setEditIcon(r.icon);
    setEditTabs([...r.tabs]);
  };

  const handleSaveRolePermissions = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;

    const updated: RoleConfig = {
      ...editingRole,
      label: editLabel.trim() || editingRole.label,
      email: editEmail.trim().toLowerCase() || editingRole.email,
      icon: editIcon || editingRole.icon,
      tabs: editTabs.length > 0 ? editTabs : ['dashboard']
    };

    onSaveRoles({
      ...roles,
      [editingRole.key]: updated
    });

    setEditingRole(null);
    showToast(`تم تحديث بيانات وصلاحيات "${updated.label}" بنجاح ✓`);
  };

  const handleResetDefaults = () => {
    if (!window.confirm('هل تريد فعلاً استعادة جميع الحسابات والأدوار الافتراضية للأكاديمية؟')) {
      return;
    }
    const def = resetRolesToDefault();
    onSaveRoles(def);
    showToast('تم استعادة الحسابات والمستخدمين الافتراضيين بنجاح ✓');
  };

  const allAvailableTabs: TabKey[] = [
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">⚙️ لوحة التحكم والإعدادات والمستخدمين</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            التحكم الكامل في حسابات النظام، وتعيين صلاحيات الأقسام والشاشات المسموح بالوصول إليها
          </p>
        </div>
      </div>

      {/* Cloud Account Management (Firebase Auth & users collection RBAC) */}
      <UserManagementView currentUser={authUser || null} showToast={showToast} />

      {/* Security Notice Banner */}
      <div className="bg-blue-50/80 border border-blue-200/90 rounded-2xl p-4 flex items-start gap-3 text-stone-800">
        <ShieldCheck className="w-5 h-5 text-[#075073] shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold text-[#075073]">المصادقة السحابية والصلاحيات (Firebase Auth & RBAC):</p>
          <p className="text-stone-600 leading-relaxed">
            يتم توثيق دخول الموظفين حصرياً عبر حسابات Firebase Auth السحابية (البريد الإلكتروني وكلمة المرور المشفرة). يتم تعيين الصلاحيات والأدوار عبر مستند users/{'{uid}'} لضمان أمان النظام.
          </p>
        </div>
      </div>

      {/* Users & Roles Management Grid */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-[#f8f5ee] border-b border-stone-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#075073]" />
            <h3 className="text-sm font-black text-[#075073]">حسابات الأقسام والمستخدمين ({Object.keys(roles).length})</h3>
          </div>
          <span className="text-[11px] text-stone-500 font-medium">إدارة الحسابات وربط الصلاحيات السحابية</span>
        </div>

        <div className="divide-y divide-stone-100">
          {(Object.entries(roles) as [string, RoleConfig][]).map(([key, role]) => {
            const isManagerRole = key === 'manager';
            const roleEmail = role.email || `${key}@monglish.local`;

            return (
              <div
                key={key}
                className="p-4 hover:bg-stone-50/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* User Identity */}
                <div className="flex items-start gap-3 min-w-[240px]">
                  <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-2xl shadow-inner shrink-0">
                    {role.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-stone-900">{role.label}</h4>
                      {isManagerRole ? (
                        <span className="bg-[#075073] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                          المدير العام
                        </span>
                      ) : role.isCustom ? (
                        <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200">
                          حساب مخصص
                        </span>
                      ) : (
                        <span className="bg-stone-100 text-stone-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          افتراضي
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-stone-500 mt-0.5 font-mono" dir="ltr">
                      {roleEmail}
                    </div>

                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-stone-100 text-stone-600 text-[10px] font-medium border border-stone-200">
                        <Lock className="w-3 h-3 text-stone-500" />
                        <span>توثيق الدخول: Firebase Auth</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tabs & Permissions Chips */}
                <div className="flex-1 max-w-md">
                  <div className="text-[11px] font-bold text-stone-500 mb-1.5 flex items-center justify-between">
                    <span>الشاشات والأقسام المصرح بها ({role.tabs?.length || 0}):</span>
                    <button
                      type="button"
                      onClick={() => handleOpenEditRole(role)}
                      className="text-blue-700 hover:underline cursor-pointer font-bold"
                    >
                      تعديل الصلاحيات والحساب ✏️
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(role.tabs || []).map((t) => {
                      const meta = TABS_META[t] || { label: t, icon: '📁' };
                      return (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white text-stone-700 border border-stone-200 px-2 py-0.5 rounded-lg"
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      downloadDepartmentLauncher(key, role.label);
                      showToast(`تم تنزيل ملف تشغيل قسم (${role.label}) بنجاح ✓`);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#075073] bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-all cursor-pointer shadow-2xs"
                    title={`تنزيل ملف تشغيل منفرد لجهاز ${role.label} — يفتح مباشرة على القسم ويزامن مع باقي الأجهزة`}
                  >
                    <Laptop className="w-3.5 h-3.5 text-amber-700" />
                    <span>تنزيل رابط الجهاز</span>
                  </button>

                  {!isManagerRole && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRole(key)}
                      className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                      title="حذف هذا الحساب"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dedicated Department Launchers Section */}
      <div className="bg-white rounded-2xl border-2 border-[#075073]/20 shadow-md p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-r from-[#075073] to-[#03151F] flex items-center justify-center text-xl text-[#E68131]">
              🖥️
            </div>
            <div>
              <h3 className="text-base font-black text-[#075073]">
                توزيع نسخ الأقسام المنفردة (تسمع كلها معاً تلقائياً في السحابة)
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                حمّل ملف تشغيل مخصص لكل جهاز بالفرع (بوفيه، نظافة، مخازن، صيانة، إلخ)؛ يفتح فوراً بصلاحيات القسم ويزامن كل العمليات لحظياً مع باقي الأجهزة عبر Firestore.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              Object.entries(roles).forEach(([k, r], idx) => {
                setTimeout(() => {
                  downloadDepartmentLauncher(k, r.label);
                }, idx * 250);
              });
              showToast('جاري تنزيل مشغلات كافة الأقسام تباعاً ✓');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#E68131]" />
            <span>تنزيل نسخ كافة الأقسام معاً ({Object.keys(roles).length})</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.entries(roles) as [string, RoleConfig][]).map(([k, r]) => (
            <div
              key={k}
              className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/70 hover:bg-stone-50 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{r.icon}</span>
                <div>
                  <div className="text-xs font-bold text-stone-900">{r.label}</div>
                  <div className="text-[10px] text-stone-500">مزامنة سحابية نشطة (Firestore)</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  downloadDepartmentLauncher(k, r.label);
                  showToast(`تم تنزيل نسخة مشغل (${r.label}) ✓`);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-[#075073] text-stone-700 hover:text-white border border-stone-300 hover:border-[#075073] transition-all cursor-pointer shadow-2xs"
              >
                <Download className="w-3 h-3 text-amber-600" />
                <span>تنزيل</span>
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>ميزة العمل الجماعي المشترك:</strong> كل ملف يتم تنزيله يحتوي على توجيه ذكي للمنظومة مع صلاحية القسم، وأي طلب أو استهلاك أو إضافة يقوم بها أي جهاز تُسجل في السحابة فوراً وتظهر في شاشة المدير وباقي الأجهزة خلال ثوانٍ عبر Firestore.
          </p>
        </div>
      </div>

      {/* System Organization Info & Backup */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-[#075073]">
            <Building2 className="w-5 h-5 text-[#c9920a]" />
            <h4 className="font-bold text-sm">بيانات المؤسسة والفرع</h4>
          </div>
          <div className="text-xs space-y-2 text-stone-600">
            <div className="flex justify-between border-b border-stone-100 pb-1.5">
              <span className="font-medium text-stone-500">اسم المؤسسة:</span>
              <span className="font-bold text-stone-800">Monglish International Academy</span>
            </div>
            <div className="flex justify-between border-b border-stone-100 pb-1.5">
              <span className="font-medium text-stone-500">الفرع الحالي:</span>
              <span className="font-bold text-stone-800">مقر الإسكندرية</span>
            </div>
            <div className="flex justify-between border-b border-stone-100 pb-1.5">
              <span className="font-medium text-stone-500">حالة المزامنة:</span>
              <span className="font-bold text-emerald-700">مفعلة وتعمل محلياً وسحابياً</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#075073]">
              <Save className="w-5 h-5 text-emerald-600" />
              <h4 className="font-bold text-sm">النسخ الاحتياطي والحفظ الدائم</h4>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              حفظ ثلاثي (IndexedDB + Storage + Firestore Cloud)
            </span>
          </div>
          <p className="text-xs text-stone-500 leading-relaxed">
            بياناتك محفوظة تلقائياً ضد انقطاع الكهرباء أو إعادة تشغيل الجهاز. يمكنك أيضاً تنزيل ملف نسخة احتياطية كاملة (JSON) أو استعادتها في أي وقت.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            accept=".json,.xlsx,.xls,.csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={handleRestoreFile}
          />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={exportAllDataJson}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#075073]" />
              <span>تنزيل نسخة احتياطية كاملة (JSON)</span>
            </button>

            <button
              type="button"
              disabled={isRestoring}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-emerald-700" />
              <span>{isRestoring ? 'جاري استعادة ورفع البيانات...' : 'استعادة نسخة من ملف (JSON / Excel)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPasteModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white shadow-xs transition-colors cursor-pointer"
            >
              <Database className="w-4 h-4 text-[#E68131]" />
              <span>لصق كود النسخة واستعادتها (Paste JSON)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Firestore Collections Architecture & Migration Card */}
      <div id="firestore_migration_card" className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[#075073]">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center border border-sky-200">
              <Layers className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-black text-sm text-[#075073]">
                  البنية السحابية المتقدمة: مجموعات Firestore المستقلة (Collection Architecture)
                </h4>
                {migrationReport?.status === 'completed' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
                    <Check className="w-3 h-3 text-emerald-600" />
                    مفعلة وتعمل بنجاح
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-300">
                    جاهزة للترحيل
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500">
                فصل بيانات الأقسام (المخازن، المشتريات، الصيانة، النظافة، الطلبات، الخطوط) إلى مجموعات سحابية منفصلة لمنع تضارب النسخ وضمان المزامنة اللحظية
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn_run_cloud_migration"
            disabled={isMigrating}
            onClick={handleRunMigration}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-white ${isMigrating ? 'animate-spin' : ''}`} />
            <span>{isMigrating ? 'جاري الترحيل السحابي...' : 'ترحيل وتوزيع البيانات سحابياً الآن'}</span>
          </button>
        </div>

        {isMigrating && (
          <div className="bg-sky-50/70 p-4 rounded-xl border border-sky-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-sky-900">
              <span>{migrationStep}</span>
              <span>{migrationProgressPct}%</span>
            </div>
            <div className="w-full h-2 bg-sky-200/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-600 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, migrationProgressPct)}%` }}
              />
            </div>
          </div>
        )}

        {migrationReport && migrationReport.status === 'completed' && migrationReport.counts && (
          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200 space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-600 font-bold">
              <span>إجمالي السجلات الموزعة سحابياً: {migrationReport.totalMigrated} سجل</span>
              <span className="text-stone-400 font-normal">آخر ترحيل: {new Date(migrationReport.timestamp).toLocaleString('ar-EG')}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
              {Object.entries(migrationReport.counts).map(([col, count]) => (
                <span
                  key={col}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-stone-200 font-bold text-stone-700 shadow-2xs"
                >
                  <span className="text-sky-600 font-mono">[{col}]</span>
                  <span className="text-[#075073] font-black">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="text-[11px] text-stone-500 space-y-1 bg-stone-50/50 p-2.5 rounded-xl border border-stone-200/60">
          <p className="font-bold text-stone-700">مميزات هذه المعمارية للأقسام الموزعة:</p>
          <ul className="list-disc list-inside space-y-0.5 text-stone-600 pr-1">
            <li>كل قسم يقوم بتحديث سجلاته الخاصة فقط بدون كتابة كامل قاعدة البيانات.</li>
            <li>تحديثات أي قسم تظهر فوراً في الأقسام الأخرى والنسخة الرئيسية عبر مستمعات Firestore الحية.</li>
            <li>حماية كاملة من استنفاد حصص Firebase المجانية بفضل تقليل حجم ونطاق عمليات الكتابة بنسبة 95%.</li>
          </ul>
        </div>
      </div>

      {/* Storage & Database Diagnostics Card */}
      <div id="storage_diagnostics_card" className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[#075073]">
            <HardDrive className="w-5 h-5 text-sky-600" />
            <div>
              <h4 className="font-bold text-sm">تشخيص وسلامة التخزين المحلي وقاعدة IndexedDB</h4>
              <p className="text-xs text-stone-500">فحص مستمر لسلامة البيانات ومنع أي تضارب أو تلف يتسبب في انهيار الشاشة</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn_run_storage_diag"
              onClick={handleRunHealthCheck}
              disabled={isRunningDiag}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Activity className={`w-3.5 h-3.5 text-sky-600 ${isRunningDiag ? 'animate-spin' : ''}`} />
              <span>{isRunningDiag ? 'جاري الفحص...' : 'فحص شامل الآن'}</span>
            </button>
            <button
              type="button"
              id="btn_run_storage_repair"
              onClick={handleRunAutoRepair}
              disabled={isRepairingStorage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Wrench className={`w-3.5 h-3.5 text-amber-600 ${isRepairingStorage ? 'animate-spin' : ''}`} />
              <span>{isRepairingStorage ? 'جاري الإصلاح...' : 'إصلاح التضارب وتصحيح التخزين'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
            <span className="text-stone-500 block mb-1">LocalStorage:</span>
            <span className={`font-bold flex items-center gap-1 ${diagnostics?.localStorageAvailable ? 'text-emerald-700' : 'text-rose-600'}`}>
              <span className={`w-2 h-2 rounded-full ${diagnostics?.localStorageAvailable ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              {diagnostics?.localStorageAvailable ? 'متاح ونشط' : 'محظور / ممتلئ'}
            </span>
          </div>

          <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
            <span className="text-stone-500 block mb-1">IndexedDB الدائم:</span>
            <span className={`font-bold flex items-center gap-1 ${diagnostics?.indexedDBAvailable ? 'text-emerald-700' : 'text-amber-600'}`}>
              <span className={`w-2 h-2 rounded-full ${diagnostics?.indexedDBAvailable ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              {diagnostics?.indexedDBAvailable ? 'متصل ومحمي' : 'احتياطي'}
            </span>
          </div>

          <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
            <span className="text-stone-500 block mb-1">عدد المفاتيح والذاكرة:</span>
            <span className="font-bold text-stone-800 font-mono">
              {diagnostics?.localStorageKeysCount || 0} مفتاح (~{Math.round((diagnostics?.localStorageEstimatedBytes || 0) / 1024)} KB)
            </span>
          </div>

          <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
            <span className="text-stone-500 block mb-1">حالة التضارب والتلف:</span>
            <span className={`font-bold ${diagnostics?.hasCorruptedKeys ? 'text-amber-600' : 'text-emerald-700'}`}>
              {diagnostics?.hasCorruptedKeys ? 'توجد مفاتيح تم إصلاحها' : 'لا توجد بيانات تالفة ✓'}
            </span>
          </div>
        </div>

        {diagnostics?.details && diagnostics.details.length > 0 && (
          <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-xs text-stone-600 space-y-1">
            <span className="font-bold text-stone-700 block mb-1">سجل الفحص الأخير:</span>
            {diagnostics.details.map((d, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-stone-600">
                <span className="text-sky-500">•</span>
                <span>{d}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-stone-500 pt-1">
          <span>لحماية إضافية تمنع المتصفح من مسح البيانات عند انخفاض مساحة القرص:</span>
          <button
            type="button"
            onClick={handleRequestPersist}
            className="text-sky-700 hover:text-sky-900 font-bold underline cursor-pointer"
          >
            طلب إذن الحفظ الدائم (Persistent Storage)
          </button>
        </div>
      </div>

      {/* Modal: Add User / Role */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#075073]" />
                <h3 className="font-black text-[#075073] text-base">إضافة مستخدم / دور وظيفي جديد</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  مسمى الحساب أو الوظيفة (مثال: شؤون الطلاب، المبيعات، المحاسب):
                </label>
                <input
                  type="text"
                  required
                  value={newRoleLabel}
                  onChange={(e) => {
                    setNewRoleLabel(e.target.value);
                    if (!newRoleKey) {
                      setNewRoleKey('role_' + Date.now().toString(36).slice(2, 6));
                    }
                  }}
                  placeholder="مثال: إدارة المبيعات"
                  className="w-full text-xs font-bold py-2.5 px-3 rounded-xl border border-stone-300 focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">البريد الإلكتروني للحساب:</label>
                  <input
                    type="email"
                    value={newRoleEmail}
                    onChange={(e) => setNewRoleEmail(e.target.value)}
                    placeholder="dept@monglish.local"
                    className="w-full text-left font-mono text-xs py-2.5 px-3 rounded-xl border border-stone-300 focus:border-[#075073] focus:outline-none"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الأيقونة المعبرة:</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {AVAILABLE_EMOJIS.slice(0, 8).map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewRoleIcon(emoji)}
                        className={`text-lg p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          newRoleIcon === emoji ? 'bg-amber-100 border-amber-500' : 'border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2">
                  اختر الأقسام والشاشات المسموح له بالوصول إليها:
                </label>
                <div className="grid grid-cols-2 gap-2 bg-stone-50 p-3 rounded-2xl border border-stone-200/80">
                  {allAvailableTabs.map((t) => {
                    const meta = TABS_META[t] || { label: t, icon: '📁' };
                    const isChecked = newRoleTabs.includes(t);
                    return (
                      <label
                        key={t}
                        className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-[#075073]/10 border-[#075073] text-[#075073]'
                            : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewRoleTabs([...newRoleTabs, t]);
                            } else {
                              setNewRoleTabs(newRoleTabs.filter((x) => x !== t));
                            }
                          }}
                          className="rounded text-[#075073] focus:ring-0 cursor-pointer"
                        />
                        <span className="text-base">{meta.icon}</span>
                        <span>{meta.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white font-bold text-xs shadow-sm cursor-pointer"
                >
                  حفظ وإنشاء الحساب
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="py-2.5 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Role Permissions */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-[#075073] text-base">تعديل بيانات وحساب ({editingRole.label})</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingRole(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRolePermissions} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">المسمى الظاهر:</label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full text-xs font-bold py-2.5 px-3 rounded-xl border border-stone-300 focus:border-[#075073] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full text-left font-mono text-xs py-2.5 px-3 rounded-xl border border-stone-300 focus:border-[#075073] focus:outline-none"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2">
                  الشاشات والأقسام المصرح له بالدخول إليها:
                </label>
                <div className="grid grid-cols-2 gap-2 bg-stone-50 p-3 rounded-2xl border border-stone-200/80">
                  {allAvailableTabs.map((t) => {
                    const meta = TABS_META[t] || { label: t, icon: '📁' };
                    const isChecked = editTabs.includes(t);
                    return (
                      <label
                        key={t}
                        className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-[#075073]/10 border-[#075073] text-[#075073]'
                            : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditTabs([...editTabs, t]);
                            } else {
                              setEditTabs(editTabs.filter((x) => x !== t));
                            }
                          }}
                          className="rounded text-[#075073] focus:ring-0 cursor-pointer"
                        />
                        <span className="text-base">{meta.icon}</span>
                        <span>{meta.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white font-bold text-xs shadow-sm cursor-pointer"
                >
                  حفظ البيانات والصلاحيات
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRole(null)}
                  className="py-2.5 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Paste Backup JSON & Restore */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-stone-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-[#075073] text-base">استعادة نسخة احتياطية من كود JSON (مزامنة فورية)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mt-4 flex-1 flex flex-col">
              <p className="text-xs text-stone-600 leading-relaxed">
                الصق محتوى النسخة الاحتياطية (كود JSON) في المربع أدناه. سيتم تحديث وتثبيت كافة بيانات المخزن، الأصناف، الفواتير، الحركات، ورفعها مباشرة ومزامنتها مع سحابة Firestore دون أن تتراجع البيانات أبداً:
              </p>

              <textarea
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='الصق نص ملف JSON هنا مثل: { "branch": "Monglish...", "items": [...], "moves": [...] }'
                className="w-full flex-1 min-h-[220px] font-mono text-[11px] p-3 rounded-2xl border border-stone-300 focus:border-[#075073] focus:outline-none bg-stone-50/70"
                dir="ltr"
              />

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  disabled={isPastingRestore || !pastedJson.trim()}
                  onClick={handlePasteRestore}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Upload className={`w-4 h-4 ${isPastingRestore ? 'animate-spin' : ''}`} />
                  <span>{isPastingRestore ? 'جاري الاستعادة والمزامنة مع الخوادم السحابية...' : 'استعادة ومزامنة سحابية الآن ✓'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasteModal(false)}
                  className="py-3 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Double-Confirmation & Inspection Modal for Backup Restore */}
      <RestorePreviewModal
        isOpen={showRestoreModal}
        summary={restorePreviewSummary}
        onClose={() => {
          if (!isExecutingRestore) {
            setShowRestoreModal(false);
            setRestorePreviewSummary(null);
          }
        }}
        onConfirm={handleConfirmExecuteRestore}
        isRestoring={isExecutingRestore}
      />
    </div>
  );
};
