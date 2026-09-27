import React, { useState, useEffect } from 'react';
import { RoleConfig, RoleKey, AuthUser } from '../types';
import { isHostedMode, loadRoles, logActivity, clearAllLocalCachedData, getRoleDefaultCanWrite } from '../utils/storage';
import { ROLES } from '../data/seedData';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, signOut } from 'firebase/auth';
import { doc, getDoc, getDocFromCache, setDoc, serverTimestamp } from 'firebase/firestore';
import { Building2, Check, Eye, EyeOff, ShieldCheck, Lock, RefreshCw, User } from 'lucide-react';
import { MonglishLogo } from './MonglishLogo';

interface LoginScreenProps {
  onLogin: (user: AuthUser) => Promise<void> | void;
  showToast?: (msg: string) => void;
  onOpenSync?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  showToast,
  onOpenSync
}) => {
  const [roles, setRoles] = useState<Record<string, RoleConfig>>(() => loadRoles());
  const [selectedRole, setSelectedRole] = useState<RoleKey>('manager');
  const [username, setUsername] = useState('manager');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Check URL ?dept= parameter on mount (pre-selects department username)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const dept = params.get('dept');
      if (dept && (roles[dept] || ROLES[dept])) {
        setSelectedRole(dept);
        setUsername(dept);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, [roles]);

  const handleSelectRole = (role: RoleKey) => {
    setSelectedRole(role);
    setUsername(role);
    setPassword('');
    setError('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const rawUsername = username.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!rawUsername) {
      setError('يرجى إدخال اسم المستخدم');
      return;
    }

    if (!trimmedPassword) {
      setError('يرجى إدخال كلمة المرور');
      return;
    }

    const emailToAuth = rawUsername.includes('@') ? rawUsername : `${rawUsername}@monglish.local`;
    const isBootstrappedAdmin =
      emailToAuth.toLowerCase() === 'manager@monglish.local';

    setLoading(true);

    try {
      let fbUser: any = null;

      // 1. Authenticate with Firebase Authentication
      try {
        const userCredential = await signInWithEmailAndPassword(auth, emailToAuth, trimmedPassword);
        fbUser = userCredential.user;
      } catch (signInErr: any) {
        const code = signInErr?.code || '';

        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          setError('اسم المستخدم أو كلمة المرور غير صحيحة.');
          setLoading(false);
          return;
        } else if (code === 'auth/user-not-found') {
          // Allow first-time admin bootstrap if email matches manager
          if (isBootstrappedAdmin) {
            if (trimmedPassword.length < 8) {
              setError('كلمة المرور لإعداد حساب المدير لأول مرة يجب ألا تقل عن 8 أحرف.');
              setLoading(false);
              return;
            }
            try {
              const createCred = await createUserWithEmailAndPassword(auth, emailToAuth, trimmedPassword);
              fbUser = createCred.user;
            } catch (createErr: any) {
              const createCode = createErr?.code || '';
              if (createCode === 'auth/email-already-in-use') {
                setError('اسم المستخدم أو كلمة المرور غير صحيحة.');
              } else if (createCode === 'auth/weak-password') {
                setError('كلمة المرور ضعيفة، يجب أن تتكون من 8 أحرف على الأقل.');
              } else {
                setError('تعذر إنشاء حساب المدير الأول، يرجى المحاولة لاحقاً.');
              }
              setLoading(false);
              return;
            }
          } else {
            setError('الحساب غير موجود، يرجى التواصل مع المدير لإضافة حسابك.');
            setLoading(false);
            return;
          }
        } else if (code === 'auth/user-disabled') {
          setError('تم تعطيل هذا الحساب من قِبل إدارة النظام.');
          setLoading(false);
          return;
        } else if (code === 'auth/too-many-requests') {
          setError('تم حظر المحاولات مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى المحاولة لاحقاً.');
          setLoading(false);
          return;
        } else if (code === 'auth/operation-not-allowed') {
          setError('يرجى تفعيل موفر Email/Password في إعدادات Firebase Authentication.');
          setLoading(false);
          return;
        } else {
          setError('اسم المستخدم أو كلمة المرور غير صحيحة.');
          setLoading(false);
          return;
        }
      }

      if (!fbUser) {
        throw new Error('فشل تسجيل الدخول');
      }

      // 3. Fetch or bootstrap user profile and permissions in Firestore users/{uid}
      const userDocRef = doc(db, 'users', fbUser.uid);
      let userDocSnap: any = null;

      try {
        userDocSnap = await getDoc(userDocRef);
      } catch (err) {
        console.warn('Network issue or offline client when fetching user doc:', err);
        try {
          userDocSnap = await getDocFromCache(userDocRef);
        } catch {
          userDocSnap = null;
        }
      }

      const isManagerRole =
        rawUsername === 'manager' ||
        emailToAuth.toLowerCase() === 'manager@monglish.local' ||
        selectedRole === 'manager';

      if (!userDocSnap || !userDocSnap.exists || !userDocSnap.exists()) {
        const assignedRole: RoleKey = isManagerRole ? 'manager' : selectedRole;
        const targetRoleMeta = ROLES[assignedRole] || { label: assignedRole, tabs: ['requests'] };

        const defaultProfileData = {
          uid: fbUser.uid,
          username: rawUsername,
          displayName: isManagerRole ? 'المدير العام (مالك النظام)' : (targetRoleMeta.label || rawUsername),
          email: emailToAuth,
          role: assignedRole,
          label: isManagerRole ? 'المدير العام (مالك النظام)' : (targetRoleMeta.label || rawUsername),
          canWrite: getRoleDefaultCanWrite(assignedRole),
          canStockMove: ['manager', 'warehouse', 'buffet', 'cleaning', 'reception'].includes(assignedRole),
          allowedTabs: assignedRole === 'manager' ? ROLES.manager.tabs : (targetRoleMeta.tabs || ['requests']),
          active: true,
          createdAt: serverTimestamp()
        };

        setDoc(userDocRef, defaultProfileData, { merge: true }).catch((err) =>
          console.warn('Background profile save failed:', err)
        );

        userDocSnap = {
          exists: () => true,
          data: () => defaultProfileData
        };
      }

      // Verify that document exists, account is active, and role is valid
      const userData = userDocSnap.data ? userDocSnap.data() : null;
      const role = userData?.role || (isManagerRole ? 'manager' : selectedRole);
      const isActive = userData?.active !== false;
      const validRoles = ['manager', 'warehouse', 'purchase', 'buffet', 'cleaning', 'reception', 'maint'];

      if (!isActive || !role || (!validRoles.includes(role) && !roles[role])) {
        await signOut(auth);
        clearAllLocalCachedData();
        setError('حسابك غير مفعّل، تواصل مع المدير');
        setLoading(false);
        return;
      }

      const currentConfig = roles[role] || ROLES[role] || {
        key: role,
        label: userData?.label || userData?.displayName || role,
        tabs: ['requests']
      };

      const authUserData: AuthUser = {
        uid: fbUser.uid,
        email: fbUser.email || emailToAuth,
        username: userData?.username || rawUsername,
        displayName: userData?.displayName || userData?.label || currentConfig.label,
        role: role as RoleKey,
        label: userData?.label || userData?.displayName || currentConfig.label,
        canWrite: Array.isArray(userData?.canWrite) && userData.canWrite.length > 0
          ? userData.canWrite
          : getRoleDefaultCanWrite(role),
        canStockMove: userData?.canStockMove !== undefined
          ? !!userData.canStockMove
          : ['manager', 'warehouse', 'buffet', 'cleaning', 'reception'].includes(role),
        allowedTabs: Array.isArray(userData?.allowedTabs) && userData.allowedTabs.length > 0
          ? userData.allowedTabs
          : (role === 'manager'
              ? ROLES.manager.tabs
              : (currentConfig.tabs || ['dashboard'])),
        active: true
      };

      logActivity({
        action: 'تسجيل دخول معتمد',
        dept: authUserData.label,
        by: authUserData.label,
        details: `تم توثيق الدخول للنظام بنجاح بواسطة (${authUserData.username || authUserData.email})`,
        type: 'system',
        severity: 'info'
      });

      await onLogin(authUserData);

      if (showToast) {
        showToast(`مرحباً بك! تم الدخول بصلاحية (${authUserData.label}) بنجاح ✓`);
      }
    } catch (err: any) {
      const errorCode = err?.code || '';
      console.warn('Firebase Auth email sign in notice:', errorCode, err?.message);

      if (errorCode === 'auth/operation-not-allowed') {
        setError('تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في لوحة Firebase لهذا المشروع. يرجى تفعيل موفر البريد/كلمة المرور (Email/Password) في إعدادات Firebase Authentication.');
      } else if (errorCode === 'auth/user-disabled') {
        setError('تم تعطيل هذا الحساب من قِبل إدارة النظام.');
      } else if (errorCode === 'auth/too-many-requests') {
        setError('تم حظر المحاولات مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى المحاولة لاحقاً.');
      } else if (errorCode === 'auth/network-request-failed') {
        setError('تعذر الاتصال بالخوادم السحابية للمصادقة، يرجى التحقق من اتصال الإنترنت.');
      } else if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password' || errorCode === 'auth/user-not-found') {
        setError('بيانات الدخول غير صحيحة أو الحساب غير مسجل.');
      } else {
        setError(`تعذر تسجيل الدخول: ${err?.message || 'يرجى التأكد من صحة اسم المستخدم وكلمة المرور.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const hosted = isHostedMode();
  const currentRoleConfig = roles[selectedRole] || ROLES[selectedRole] || {
    key: selectedRole,
    label: selectedRole,
    icon: '👤',
    tabs: ['dashboard']
  };

  return (
    <div
      className="fade-in-entry min-h-[100dvh] flex items-center justify-center p-4 bg-gradient-to-br from-[#075073] via-[#053249] to-[#03151F]"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-stone-200/80">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-3">
            <MonglishLogo variant="emblem" size="lg" className="w-16 h-16 rounded-2xl shadow-md border border-stone-200" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#075073] tracking-tight">
            نظام إدارة المكتب والمخازن
          </h1>
          <p className="text-xs text-stone-500 mt-1 font-medium">
            Monglish International Academy — مقر الإسكندرية
          </p>
        </div>

        {/* Roles Quick-Select Grid */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-bold text-stone-700">
              اختر القسم للتعيين السريع:
            </label>
            <button
              type="button"
              onClick={() => setRoles(loadRoles())}
              className="text-[11px] text-stone-400 hover:text-stone-700 flex items-center gap-1 cursor-pointer"
              title="تحديث قائمة الحسابات"
            >
              <RefreshCw className="w-3 h-3" />
              <span>تحديث</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.entries(roles) as [RoleKey, RoleConfig][]).map(([key, r]) => {
              const isSelected = selectedRole === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectRole(key)}
                  className={`p-2.5 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                    isSelected
                      ? 'border-[#075073] bg-[#075073]/10 shadow-xs text-[#075073] font-black'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <span className="text-xl">{r.icon}</span>
                  <span className="text-xs font-bold leading-tight">{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Authentication Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-stone-700 flex items-center gap-1 mb-1.5">
              <User className="w-3.5 h-3.5 text-stone-400" />
              <span>اسم المستخدم:</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError('');
              }}
              placeholder="اسم المستخدم (مثال: manager أو warehouse)"
              className="w-full text-left font-mono text-sm py-2.5 px-3 rounded-xl border-2 border-stone-200 focus:border-[#075073] focus:ring-2 focus:ring-[#075073]/10 focus:outline-none transition-colors"
              dir="ltr"
              autoComplete="username"
              required
            />
            <p className="text-[11px] text-stone-400 mt-1">
              يتم تسجيل الدخول آلياً بـ: <span className="font-mono text-stone-600">{username.trim().toLowerCase().includes('@') ? username.trim().toLowerCase() : `${username.trim().toLowerCase() || '...' }@monglish.local`}</span>
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-stone-700 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-stone-400" />
                <span>كلمة المرور لـ</span>
                <span className="text-[#075073] font-black underline decoration-[#E68131]">
                  {currentRoleConfig.label}
                </span>:
              </label>
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="أدخل كلمة المرور الخاصة بحسابك"
                className="w-full text-left text-sm font-medium py-2.5 px-10 rounded-xl border-2 border-stone-200 focus:border-[#075073] focus:ring-2 focus:ring-[#075073]/10 focus:outline-none transition-colors"
                dir="ltr"
                autoComplete="current-password"
                minLength={6}
                required
              />
              <Lock className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-stone-400 hover:text-stone-600 absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <div className="mt-2.5 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold text-center leading-relaxed">
                {error}
              </div>
            )}
          </div>

          {/* Helpful First-Time Setup Tip */}
          <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 leading-relaxed">
            <span className="font-bold block mb-0.5 text-amber-950">💡 أول مرة تستخدم النظام؟</span>
            لا تحتاج لإنشاء بريد مسبقاً! فقط أدخل اسم المستخدم الذي تريده (مثال: <span className="font-mono font-bold">manager</span>) وكلمة مرور من اختيارك (8 أحرف/أرقام على الأقل) وانقر <strong>تسجيل الدخول</strong> وسيتم إنشاء حسابك وتفعيله سحابياً فوراً.
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 active:scale-[0.99]"
          >
            {loading ? (
              <span>جاري التحقق والمصادقة...</span>
            ) : (
              <>
                <span>تسجيل الدخول</span>
                <Check className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Security Assurance Footer */}
        <div className="mt-6 pt-3 border-t border-stone-200/80 flex items-center justify-center gap-2 text-[11px] text-stone-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>المصادقة السحابية مدعومة عبر Firebase Auth وقواعد RBAC المشددة.</span>
        </div>

        {/* Sync or Info Link */}
        {onOpenSync && (
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={onOpenSync}
              className="text-[11px] text-stone-400 hover:text-stone-700 underline cursor-pointer"
            >
              {hosted ? 'حالة المزامنة المباشرة بين الأجهزة' : 'إعدادات المزامنة'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
