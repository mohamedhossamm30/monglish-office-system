import React from 'react';
import { RoleKey, SyncStatusType, TabKey } from '../types';
import { ROLES } from '../data/seedData';
import { MonglishLogo } from './MonglishLogo';
import {
  LogOut,
  Wifi,
  WifiOff,
  Loader2,
  Menu,
  Download,
  RefreshCw,
  Bell,
  Smartphone,
  ShieldCheck
} from 'lucide-react';

interface TopNavProps {
  currentRole: RoleKey;
  activeTab?: TabKey;
  syncStatus: SyncStatusType;
  syncError?: string;
  lastSyncTime?: string | null;
  isOfflineMode?: boolean;
  pendingQueueCount?: number;
  isLockedDept?: boolean;
  unreadNotificationsCount?: number;
  onOpenNotifications?: () => void;
  onOpenAuditLog?: () => void;
  onOpenInstallApp?: () => void;
  onOpenSync?: () => void;
  onRefresh?: () => void;
  onRetryPending?: () => void;
  onLogout: () => void;
  onToggleMobileMenu?: () => void;
  onExportAll?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentRole,
  syncStatus,
  syncError,
  lastSyncTime,
  isOfflineMode,
  pendingQueueCount = 0,
  isLockedDept = false,
  unreadNotificationsCount = 0,
  onOpenNotifications,
  onOpenAuditLog,
  onOpenInstallApp,
  onRefresh,
  onRetryPending,
  onLogout,
  onToggleMobileMenu,
  onExportAll,
}) => {
  const roleInfo = (currentRole && ROLES[currentRole]) || {
    label: 'مستخدم النظام',
    icon: '👤',
    email: '',
    tabs: []
  };

  const isSyncing = syncStatus === 'syncing';

  const getSyncBadge = () => {
    if (pendingQueueCount > 0) {
      return (
        <button
          type="button"
          onClick={onRetryPending}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/25 hover:bg-amber-500/35 text-amber-300 border border-amber-400/40 cursor-pointer transition-all animate-pulse"
          title="توجد بيانات معلقة بانتظار استقرار الاتصال. اضغط لإعادة الإرسال فوراً"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          <span>{pendingQueueCount} معلق (إعادة الإرسال ⟳)</span>
        </button>
      );
    }

    switch (syncStatus) {
      case 'synced':
      case 'ok':
      case 'saved':
      case 'idle':
        if (isOfflineMode) {
          return (
            <div
              title={`تعمل حالياً في وضع الأوفلاين (كاش). سيتم الرفع تلقائياً عند عودة الاتصال${lastSyncTime ? ` (آخر تحديث: ${lastSyncTime})` : ''}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-500/20 text-stone-300 border border-stone-400/30"
            >
              <WifiOff className="w-3.5 h-3.5 text-stone-400" />
              <span className="hidden sm:inline">أوفلاين (كاش)</span>
              {lastSyncTime && <span className="text-[10px] opacity-75 hidden md:inline">({lastSyncTime})</span>}
            </div>
          );
        }
        return (
          <div
            title={`متصل بالسحابة — أي تحديث يسمع فورياً في باقي الأجهزة${lastSyncTime ? ` (آخر تحديث: ${lastSyncTime})` : ''}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
          >
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">متزامن ✓</span>
            {lastSyncTime && <span className="text-[10px] opacity-75 hidden md:inline">({lastSyncTime})</span>}
          </div>
        );
      case 'syncing':
        return (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30"
          >
            <Loader2 className="w-3.5 h-3.5 text-amber-300 animate-spin" />
            <span className="hidden sm:inline">جاري المزامنة...</span>
          </div>
        );
      case 'fail':
      case 'offline':
        return (
          <div
            title={syncError ? `السبب: ${syncError}` : 'تعذر الاتصال بالسحابة — يتم الحفظ محلياً'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-400/30"
          >
            <WifiOff className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">حفظ محلي</span>
          </div>
        );
      default:
        return (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/80 border border-white/20"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="hidden sm:inline">نشط</span>
          </div>
        );
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[#075073] to-[#03151F] text-white h-14 px-3 sm:px-6 flex items-center justify-between shadow-md border-b border-white/10">
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Mobile menu toggle */}
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
            title="القائمة الرئيسية"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Company Logo Emblem (Subtle & Elegant) */}
        <div className="flex items-center gap-2.5 pl-2.5 border-l border-white/10 ml-0.5 sm:ml-1">
          <MonglishLogo variant="emblem" size="sm" className="w-8 h-8 rounded-lg shadow-2xs border border-white/20" />
          <div className="hidden sm:flex flex-col text-right leading-tight">
            <span className="font-bold text-xs tracking-tight text-white">أكاديمية مونجلش الدولية</span>
            <span className="text-[9px] text-[#E68131] font-bold font-mono tracking-wide">Mônglish International</span>
          </div>
        </div>

        {/* Role Badge */}
        <div className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold border ${isLockedDept && currentRole !== 'manager' ? 'bg-[#E68131]/20 text-amber-200 border-[#E68131]/40' : 'bg-white/10 border-white/15'}`}>
          <span>{roleInfo.icon}</span>
          <span className="truncate max-w-[130px] sm:max-w-[160px]">
            {isLockedDept && currentRole !== 'manager' ? `🔒 بوابة ${roleInfo.label}` : roleInfo.label}
          </span>
        </div>

        {/* Sync Badge */}
        {getSyncBadge()}

        {/* Manual Sync Button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isSyncing}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 hover:bg-white/20 text-white/90 hover:text-white border border-white/20 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="فحص السحابة وتحديث البيانات الآن"
          >
            <RefreshCw className={`w-3 h-3 text-[#E68131] ${isSyncing ? 'animate-spin' : ''}`} />
            <span>مزامنة سحابية</span>
          </button>
        )}
      </div>

      {/* Center/Left Actions: Notification Bell, Install App, Audit Log, Export, Logout */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Install as Mobile App Button */}
        {onOpenInstallApp && (
          <button
            type="button"
            onClick={onOpenInstallApp}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#E68131]/20 hover:bg-[#E68131]/30 text-amber-200 border border-[#E68131]/40 transition-all cursor-pointer shadow-2xs"
            title="تثبيت التطبيق على الموبايل كبرنامج مستقل بدون إطار المتصفح"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#E68131]" />
            <span className="hidden sm:inline">تثبيت التطبيق 📲</span>
          </button>
        )}

        {/* Audit Log Trigger */}
        {onOpenAuditLog && (
          <button
            type="button"
            onClick={onOpenAuditLog}
            className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 transition-all border border-white/15 cursor-pointer"
            title="سجل أحداث وتدقيق النظام (Audit Log)"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">سجل الأحداث</span>
          </button>
        )}

        {/* Real-time Notification Bell Indicator */}
        {onOpenNotifications && (
          <button
            type="button"
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl text-white/90 hover:text-white bg-white/10 hover:bg-white/20 border border-white/15 transition-all cursor-pointer"
            title="مركز الإشعارات والتنبيهات الحية"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-[#075073] animate-pulse">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            )}
          </button>
        )}

        {/* Full Excel Export */}
        {onExportAll && (
          <button
            type="button"
            onClick={onExportAll}
            className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 transition-all border border-white/15 cursor-pointer"
            title="تصدير مصنف Excel كامل"
          >
            <Download className="w-3.5 h-3.5 text-[#E68131]" />
            <span>Excel</span>
          </button>
        )}

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl text-xs font-semibold text-white/80 hover:text-white hover:bg-rose-600/80 transition-all border border-white/20 hover:border-rose-500 cursor-pointer"
          title="تسجيل الخروج"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">خروج</span>
        </button>
      </div>
    </header>
  );
};
