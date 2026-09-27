import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserAccount, RoleKey, TabKey, AuthUser } from '../types';
import { ROLES, TABS_META } from '../data/seedData';
import { db, auth, firebaseConfig } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut as secondarySignOut,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword
} from 'firebase/auth';
import { logActivity, getRoleDefaultCanWrite } from '../utils/storage';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Lock,
  KeyRound,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Shield,
  Eye,
  EyeOff,
  UserCheck,
  UserX
} from 'lucide-react';

interface UserManagementViewProps {
  currentUser: AuthUser | null;
  showToast: (msg: string) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUser,
  showToast
}) => {
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Add User Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<RoleKey>('warehouse');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSubmittingNewUser, setIsSubmittingNewUser] = useState(false);
  const [addError, setAddError] = useState('');

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<RoleKey>('warehouse');
  const [editAllowedTabs, setEditAllowedTabs] = useState<TabKey[]>([]);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // Personal Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPersonalPassword, setNewPersonalPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPersonalPass, setShowPersonalPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passError, setPassError] = useState('');

  // Fetch all users from Firestore
  const fetchUsers = async () => {
    if (!currentUser || currentUser.role !== 'manager') return;
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: UserAccount[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          uid: d.id,
          username: data.username || data.email?.split('@')[0] || 'user',
          displayName: data.displayName || data.label || 'مستخدم',
          email: data.email || `${data.username || d.id}@monglish.local`,
          role: data.role || 'warehouse',
          label: data.label || data.displayName || 'مستخدم',
          canWrite: Array.isArray(data.canWrite) ? data.canWrite : [],
          canStockMove: !!data.canStockMove,
          allowedTabs: Array.isArray(data.allowedTabs) ? data.allowedTabs : ['requests'],
          active: data.active !== false,
          createdAt: data.createdAt,
          createdBy: data.createdBy
        });
      });
      setUsersList(list);
    } catch (err: any) {
      console.warn('Notice loading users list from Firestore:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [refreshKey, currentUser?.role]);

  // Handle Add New User via Secondary Firebase App
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    const cleanUsername = newUsername.trim().toLowerCase();
    const cleanDisplayName = newDisplayName.trim();

    // 1. Validation
    const usernameRegex = /^[a-zA-Z0-9._]{3,30}$/;
    if (!usernameRegex.test(cleanUsername)) {
      setAddError('اسم المستخدم يجب أن يتكون من 3-30 حرفاً باللغة الإنجليزية والأرقام والنقطة والشرطة السفلية فقط.');
      return;
    }

    if (!cleanDisplayName) {
      setAddError('يرجى كتابة الاسم الكامل للموظف/المستخدم.');
      return;
    }

    if (newPassword.length < 8) {
      setAddError('كلمة المرور يجب ألا تقل عن 8 أحرف وأرقام.');
      return;
    }

    setIsSubmittingNewUser(true);
    const secondaryAppName = `app_user_creator_${Date.now()}`;
    let secondaryAppInstance: any = null;

    try {
      // 2. Initialize secondary app to create user without disrupting manager's session
      secondaryAppInstance = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryAppInstance);

      const userEmail = `${cleanUsername}@monglish.local`;
      const cred = await createUserWithEmailAndPassword(secondaryAuth, userEmail, newPassword);
      const newUid = cred.user.uid;

      // Sign out from secondary auth
      await secondarySignOut(secondaryAuth).catch(() => {});

      // 3. Write user document to Firestore using Manager's session
      const targetRoleMeta = ROLES[newRole] || { tabs: ['requests'] };
      const userDocRef = doc(db, 'users', newUid);

      const canWritePerms = getRoleDefaultCanWrite(newRole);
      const canStockMove = ['manager', 'warehouse', 'buffet', 'cleaning', 'reception'].includes(newRole);

      await setDoc(userDocRef, {
        uid: newUid,
        username: cleanUsername,
        displayName: cleanDisplayName,
        email: userEmail,
        role: newRole,
        label: cleanDisplayName,
        canWrite: canWritePerms,
        canStockMove,
        allowedTabs: newRole === 'manager' ? ROLES.manager.tabs : (targetRoleMeta.tabs || ['requests']),
        active: true,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.uid || 'manager'
      });

      // 4. Log activity without password
      logActivity({
        action: 'إنشاء حساب موظف جديد',
        dept: 'إدارة الحسابات',
        by: currentUser?.label || 'المدير العام',
        details: `تم إنشاء حساب للمستخدم (${cleanDisplayName} - ${cleanUsername}) وتعيين دوره كـ (${ROLES[newRole]?.label || newRole})`,
        type: 'system',
        severity: 'info'
      });

      showToast(`✓ تم إنشاء وتفعيل حساب (${cleanDisplayName}) بنجاح!`);
      setShowAddModal(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      console.error('Error creating user:', err);
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setAddError('اسم المستخدم هذا محجوز مسبقاً، يرجى اختيار اسم مستخدم آخر.');
      } else if (code === 'auth/weak-password') {
        setAddError('كلمة المرور ضعيفة، يرجى اختيار كلمة مرور أقوى (8 أحرف على الأقل).');
      } else {
        setAddError(`تعذر إنشاء الحساب: ${err?.message || 'خطأ غير متوقع'}`);
      }
    } finally {
      if (secondaryAppInstance) {
        deleteApp(secondaryAppInstance).catch(() => {});
      }
      setIsSubmittingNewUser(false);
    }
  };

  // Toggle User Active Status (Enable / Disable)
  const handleToggleUserActive = async (targetUser: UserAccount) => {
    if (!currentUser || currentUser.role !== 'manager') return;

    // Protection 1: Manager cannot disable themselves
    if (targetUser.uid === auth.currentUser?.uid || targetUser.uid === currentUser.uid) {
      showToast('⚠️ لا يمكن للمدير تعطيل حسابه الشخصي');
      return;
    }

    // Protection 2: Last active manager cannot be disabled
    const activeManagers = usersList.filter((u) => u.active && u.role === 'manager');
    if (targetUser.active && targetUser.role === 'manager' && activeManagers.length <= 1) {
      showToast('⚠️ لا يمكن تعطيل آخر مدير نشط في النظام');
      return;
    }

    const newActiveState = !targetUser.active;
    const actionText = newActiveState ? 'تفعيل' : 'تعطيل';

    if (!window.confirm(`هل أنت متأكد من ${actionText} حساب "${targetUser.displayName}" (${targetUser.username})؟`)) {
      return;
    }

    try {
      const userDocRef = doc(db, 'users', targetUser.uid);
      await updateDoc(userDocRef, {
        active: newActiveState,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      logActivity({
        action: `${actionText} حساب مستخدم`,
        dept: 'إدارة الحسابات',
        by: currentUser.label,
        details: `قام المدير بـ ${actionText} حساب المستخدم (${targetUser.displayName} - ${targetUser.username})`,
        type: 'system',
        severity: newActiveState ? 'info' : 'warning'
      });

      showToast(`✓ تم ${actionText} الحساب بنجاح`);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      showToast(`تعذر تحديث حالة الحساب: ${err?.message || err}`);
    }
  };

  // Open Edit User Modal
  const handleOpenEditUser = (u: UserAccount) => {
    setEditingUser(u);
    setEditDisplayName(u.displayName);
    setEditRole(u.role);
    setEditAllowedTabs(u.allowedTabs || (ROLES[u.role]?.tabs || ['requests']));
  };

  // Save User Edit Changes
  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !currentUser || currentUser.role !== 'manager') return;

    // Protection: Manager cannot demote themselves to non-manager
    if ((editingUser.uid === auth.currentUser?.uid || editingUser.uid === currentUser.uid) && editRole !== 'manager') {
      showToast('⚠️ لا يمكن للمدير تخفيض دوره عن مدير عام');
      return;
    }

    // Protection: Last active manager cannot be demoted
    const activeManagers = usersList.filter((u) => u.active && u.role === 'manager');
    if (editingUser.role === 'manager' && editRole !== 'manager' && activeManagers.length <= 1) {
      showToast('⚠️ لا يمكن تخفيض دور آخر مدير نشط في النظام');
      return;
    }

    setIsUpdatingUser(true);
    try {
      const userDocRef = doc(db, 'users', editingUser.uid);
      const canWritePerms = getRoleDefaultCanWrite(editRole);
      const canStockMove = ['manager', 'warehouse', 'buffet', 'cleaning', 'reception'].includes(editRole);

      await updateDoc(userDocRef, {
        displayName: editDisplayName.trim(),
        label: editDisplayName.trim(),
        role: editRole,
        canWrite: canWritePerms,
        canStockMove,
        allowedTabs: editRole === 'manager' ? ROLES.manager.tabs : editAllowedTabs,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      logActivity({
        action: 'تعديل بيانات وصلاحيات مستخدم',
        dept: 'إدارة الحسابات',
        by: currentUser.label,
        details: `تم تحديث بيانات وصلاحيات المستخدم (${editDisplayName} - ${editingUser.username})`,
        type: 'system',
        severity: 'info'
      });

      showToast(`✓ تم تحديث بيانات (${editDisplayName}) بنجاح`);
      setEditingUser(null);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      showToast(`تعذر حفظ التعديلات: ${err?.message || err}`);
    } finally {
      setIsUpdatingUser(false);
    }
  };

  // Personal Password Change Handler
  const handleChangePersonalPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');

    if (!currentPassword) {
      setPassError('يرجى إدخال كلمة المرور الحالية.');
      return;
    }

    if (newPersonalPassword.length < 8) {
      setPassError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف أو أرقام.');
      return;
    }

    if (newPersonalPassword !== confirmPassword) {
      setPassError('كلمة المرور الجديدة وتأكيدها غير متطابقين.');
      return;
    }

    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.email) {
      setPassError('لا يوجد جلسة مستخدم نشطة.');
      return;
    }

    setIsChangingPass(true);
    try {
      // 1. Re-authenticate user
      const credential = EmailAuthProvider.credential(fbUser.email, currentPassword);
      await reauthenticateWithCredential(fbUser, credential);

      // 2. Update password
      await updatePassword(fbUser, newPersonalPassword);

      // 3. Log activity without password
      logActivity({
        action: 'تغيير كلمة المرور الشخصية',
        dept: 'أمان الحساب',
        by: currentUser?.label || 'المستخدم',
        details: `تم تغيير كلمة المرور الشخصية للمستخدم (${fbUser.email}) بنجاح`,
        type: 'system',
        severity: 'info'
      });

      showToast('✓ تم تغيير كلمة المرور الشخصية بنجاح!');
      setCurrentPassword('');
      setNewPersonalPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.warn('Password change error:', err);
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setPassError('كلمة المرور الحالية غير صحيحة.');
      } else if (code === 'auth/weak-password') {
        setPassError('كلمة المرور الجديدة ضعيفة جداً.');
      } else {
        setPassError(`تعذر تغيير كلمة المرور: ${err?.message || 'يرجى المحاولة لاحقاً'}`);
      }
    } finally {
      setIsChangingPass(false);
    }
  };

  const isManager = currentUser?.role === 'manager';

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
      {/* 1. Manager Users Management Card */}
      {isManager && (
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-stone-100">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#075073]/10 text-[#075073]">
                  <Users className="w-5 h-5 text-[#075073]" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-[#075073]">
                  إدارة حسابات الموظفين ومستخدمي النظام
                </h2>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                إضافة وتعديل حسابات العاملين وتعيين الأقسام وحالة النشاط بأمان سحابي كامل.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchUsers}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
                title="تحديث الجدول"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>تحديث</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white transition-all shadow-sm cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة حساب موظف</span>
              </button>
            </div>
          </div>

          {/* User note on password policy */}
          <div className="p-3 mb-4 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-800 flex items-start gap-2 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">ملاحظة أمنية هامة:</span> لتغيير كلمة مرور موظف: أنشئ حساباً جديداً وعطّل القديم. لا يتم تخزين كلمات المرور نهائياً في قواعد البيانات.
            </div>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-stone-50/80 text-stone-700 font-bold border-b border-stone-200">
                <tr>
                  <th className="py-3 px-3">اسم المستخدم</th>
                  <th className="py-3 px-3">الاسم الكامل</th>
                  <th className="py-3 px-3">القسم / الدور</th>
                  <th className="py-3 px-3 text-center">الحالة</th>
                  <th className="py-3 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {usersList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-stone-400">
                      {loading ? 'جاري تحميل الحسابات...' : 'لا يوجد مستخدمين مسجلين حالياً في قاعدة البيانات.'}
                    </td>
                  </tr>
                ) : (
                  usersList.map((u) => {
                    const roleMeta = ROLES[u.role] || { label: u.role, icon: '👤' };
                    const isSelf = u.uid === auth.currentUser?.uid || u.uid === currentUser?.uid;

                    return (
                      <tr key={u.uid} className={`hover:bg-stone-50/60 transition-colors ${!u.active ? 'bg-stone-50/40 opacity-70' : ''}`}>
                        <td className="py-3 px-3 font-mono font-medium text-stone-800 dir-ltr text-right">
                          {u.username}
                          {isSelf && (
                            <span className="mr-1.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800 font-sans font-bold">
                              (حسابك الحالي)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-bold text-stone-900">
                          {u.displayName}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-stone-100 text-stone-800">
                            <span>{roleMeta.icon}</span>
                            <span>{roleMeta.label}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {u.active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <UserCheck className="w-3 h-3" />
                              <span>مفعّل</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              <UserX className="w-3 h-3" />
                              <span>معطّل</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditUser(u)}
                              className="p-1.5 rounded-lg text-stone-600 hover:text-[#075073] hover:bg-stone-100 transition-colors cursor-pointer"
                              title="تعديل الاسم والصلاحيات"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleUserActive(u)}
                              disabled={isSelf}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isSelf
                                  ? 'text-stone-300 cursor-not-allowed'
                                  : u.active
                                  ? 'text-rose-600 hover:bg-rose-50'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={isSelf ? 'لا يمكن تعطيل حسابك' : u.active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                            >
                              {u.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Personal Password Change Card */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-stone-100">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
            <KeyRound className="w-5 h-5 text-[#c9920a]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-stone-900">
              تغيير كلمة المرور الشخصية
            </h3>
            <p className="text-xs text-stone-500">
              تحديث كلمة المرور لحسابك المسجل حالياً ({currentUser?.email || currentUser?.label})
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePersonalPassword} className="max-w-md space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              كلمة المرور الحالية:
            </label>
            <div className="relative">
              <input
                type={showPersonalPass ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPassError('');
                }}
                placeholder="أدخل كلمة المرور الحالية"
                className="w-full text-left font-mono text-sm py-2 px-3 rounded-xl border border-stone-200 focus:border-[#075073] focus:outline-none"
                dir="ltr"
                required
              />
              <button
                type="button"
                onClick={() => setShowPersonalPass(!showPersonalPass)}
                className="p-1 text-stone-400 hover:text-stone-600 absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                {showPersonalPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              كلمة المرور الجديدة (8 أحرف فأكثر):
            </label>
            <input
              type={showPersonalPass ? 'text' : 'password'}
              value={newPersonalPassword}
              onChange={(e) => {
                setNewPersonalPassword(e.target.value);
                setPassError('');
              }}
              placeholder="8 أحرف أو أرقام على الأقل"
              className="w-full text-left font-mono text-sm py-2 px-3 rounded-xl border border-stone-200 focus:border-[#075073] focus:outline-none"
              dir="ltr"
              minLength={8}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              تأكيد كلمة المرور الجديدة:
            </label>
            <input
              type={showPersonalPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPassError('');
              }}
              placeholder="أعد كتابة كلمة المرور الجديدة"
              className="w-full text-left font-mono text-sm py-2 px-3 rounded-xl border border-stone-200 focus:border-[#075073] focus:outline-none"
              dir="ltr"
              minLength={8}
              required
            />
          </div>

          {passError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
              {passError}
            </div>
          )}

          <button
            type="submit"
            disabled={isChangingPass}
            className="py-2.5 px-5 rounded-xl bg-[#075073] hover:bg-[#03151F] text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-70"
          >
            {isChangingPass ? 'جاري التحديث والمصادقة...' : 'حفظ كلمة المرور الجديدة'}
          </button>
        </form>
      </div>

      {/* Modal: Add User */}
      {showAddModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-stone-200 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#075073]" />
                  <h3 className="font-bold text-base text-stone-900">إضافة حساب موظف جديد</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    اسم المستخدم (الإنجليزية والأرقام فقط):
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => {
                      setNewUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, ''));
                      setAddError('');
                    }}
                    placeholder="مثال: warehouse2 أو ahmed.m"
                    className="w-full text-left font-mono text-sm py-2 px-3 rounded-xl border border-stone-200 focus:border-[#075073] focus:outline-none"
                    dir="ltr"
                    required
                  />
                  <p className="text-[11px] text-stone-400 mt-1">
                    سيكون البريد السحابي المسجل: <span className="font-mono text-stone-600">{newUsername ? `${newUsername.toLowerCase()}@monglish.local` : '...'}</span>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    الاسم الكامل للموظف:
                  </label>
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => {
                      setNewDisplayName(e.target.value);
                      setAddError('');
                    }}
                    placeholder="مثال: أحمد محمد (أمين المخازن)"
                    className="w-full text-sm py-2 px-3 rounded-xl border border-stone-200 focus:border-[#075073] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    القسم / الدور:
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as RoleKey)}
                    className="w-full text-sm py-2 px-3 rounded-xl border border-stone-200 focus:border-[#075073] focus:outline-none bg-white font-medium"
                  >
                    <option value="warehouse">📦 المخازن (أمين المخزن)</option>
                    <option value="purchase">🧾 المشتريات والمالية</option>
                    <option value="buffet">☕ البوفيه والضيافة</option>
                    <option value="maint">🛠️ الصيانة والأجهزة</option>
                    <option value="cleaning">🧴 النظافة (مشرف/تيم ليدر)</option>
                    <option value="reception">📞 الاستقبال والخطوط</option>
                    <option value="manager">👔 المدير العام</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    كلمة المرور الابتدائية (8 أحرف فأكثر):
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setAddError('');
                      }}
                      placeholder="أدخل كلمة مرور قوية للموظف"
                      className="w-full text-left font-mono text-sm py-2 px-3 rounded-xl border border-stone-200 focus:border-[#075073] focus:outline-none"
                      dir="ltr"
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="p-1 text-stone-400 hover:text-stone-600 absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {addError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
                    {addError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingNewUser}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-70 flex items-center gap-1.5"
                  >
                    {isSubmittingNewUser ? 'جاري الإنشاء والمزامنة...' : 'إنشاء وتفعيل الحساب'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Edit User */}
      {editingUser &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-stone-200 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-[#075073]" />
                  <h3 className="font-bold text-base text-stone-900">
                    تعديل بيانات ({editingUser.displayName})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveUserEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    اسم المستخدم:
                  </label>
                  <input
                    type="text"
                    value={editingUser.username}
                    disabled
                    className="w-full text-left font-mono text-sm py-2 px-3 rounded-xl border border-stone-200 bg-stone-100 text-stone-500 cursor-not-allowed"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    الاسم الكامل:
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full text-sm py-2 px-3 rounded-xl border border-stone-200 focus:border-[#075073] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    القسم / الدور:
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => {
                      const r = e.target.value as RoleKey;
                      setEditRole(r);
                      if (r === 'manager') {
                        setEditAllowedTabs(ROLES.manager.tabs);
                      } else if (ROLES[r]) {
                        setEditAllowedTabs(ROLES[r].tabs);
                      }
                    }}
                    className="w-full text-sm py-2 px-3 rounded-xl border border-stone-200 focus:border-[#075073] focus:outline-none bg-white font-medium"
                  >
                    <option value="warehouse">📦 المخازن (أمين المخزن)</option>
                    <option value="purchase">🧾 المشتريات والمالية</option>
                    <option value="buffet">☕ البوفيه والضيافة</option>
                    <option value="maint">🛠️ الصيانة والأجهزة</option>
                    <option value="cleaning">🧴 النظافة (مشرف/تيم ليدر)</option>
                    <option value="reception">📞 الاستقبال والخطوط</option>
                    <option value="manager">👔 المدير العام</option>
                  </select>
                </div>

                {/* Allowed Tabs for Custom/Advanced Customization */}
                {editRole !== 'manager' && (
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      الشاشات المسموح بالوصول إليها:
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200">
                      {allAvailableTabs.map((tKey) => {
                        const isChecked = editAllowedTabs.includes(tKey);
                        return (
                          <label
                            key={tKey}
                            className="flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setEditAllowedTabs(editAllowedTabs.filter((x) => x !== tKey));
                                } else {
                                  setEditAllowedTabs([...editAllowedTabs, tKey]);
                                }
                              }}
                              className="rounded text-[#075073] focus:ring-[#075073]"
                            />
                            <span>{TABS_META[tKey]?.label || tKey}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingUser}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-70"
                  >
                    {isUpdatingUser ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
