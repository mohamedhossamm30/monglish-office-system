import React, { useMemo } from 'react';
import { RoleKey, TabKey } from '../types';
import { ROLES, TABS_META } from '../data/seedData';
import { loadRoles, ROLE_ALLOWED_TABS } from '../utils/storage';
import { MonglishLogo } from './MonglishLogo';
import {
  X,
  Lock,
  ShieldCheck,
  Smartphone,
  Bell,
  MoreHorizontal
} from 'lucide-react';

interface SidebarProps {
  currentRole: RoleKey;
  activeTab: TabKey;
  isLockedDept?: boolean;
  allowedTabs?: TabKey[];
  badgeCounts?: Record<TabKey, number>;
  pendingRequestsCount?: number;
  unreadNotificationsCount?: number;
  onSelectTab: (tab: TabKey) => void;
  onOpenAuditLog?: () => void;
  onOpenInstallApp?: () => void;
  onOpenNotifications?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  activeTab,
  isLockedDept = false,
  allowedTabs: propAllowedTabs,
  badgeCounts,
  pendingRequestsCount,
  unreadNotificationsCount = 0,
  onSelectTab,
  onOpenAuditLog,
  onOpenInstallApp,
  onOpenNotifications,
  mobileOpen,
  onCloseMobile,
  onOpenMobile
}) => {
  const dynamicRoles = useMemo(() => loadRoles(), []);
  const roleConfig = dynamicRoles[currentRole] || ROLES[currentRole];

  // Enforce strict Department Isolation:
  // Managers have access to all tabs; other roles are strictly confined to their allowed tabs
  const allowedTabs: TabKey[] = useMemo(() => {
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
    if (propAllowedTabs && Array.isArray(propAllowedTabs) && propAllowedTabs.length > 0) {
      return propAllowedTabs;
    }
    const cfg = dynamicRoles[currentRole] || ROLES[currentRole];
    if (cfg?.tabs && Array.isArray(cfg.tabs) && cfg.tabs.length > 0) {
      return cfg.tabs;
    }
    return ROLE_ALLOWED_TABS[currentRole] || ['requests'];
  }, [currentRole, propAllowedTabs, dynamicRoles]);

  const getBadge = (t: TabKey) => {
    if (badgeCounts && typeof badgeCounts[t] === 'number' && badgeCounts[t] > 0) {
      return badgeCounts[t];
    }
    if (t === 'requests' && pendingRequestsCount && pendingRequestsCount > 0) {
      return pendingRequestsCount;
    }
    return 0;
  };

  const navContent = (
    <div className="flex flex-col gap-1 p-3">
      {/* Department Lock Indicator if not manager */}
      {currentRole !== 'manager' && (
        <div className="mb-2 p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/30 text-right">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>بوابة معزولة: {roleConfig?.label || currentRole}</span>
          </div>
          <p className="text-[10px] text-white/60 mt-1 leading-tight">
            الأقسام الأخرى والمصروفات محجوبة وفقاً لصلاحيات الدور (RBAC).
          </p>
        </div>
      )}

      {/* Main Tabs Navigation */}
      {allowedTabs.map((t) => {
        const isActive = activeTab === t;
        const meta = TABS_META[t] || { label: t, icon: '📁' };
        const badge = getBadge(t);

        return (
          <React.Fragment key={t}>
            <button
              type="button"
              onClick={() => {
                onSelectTab(t);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer text-right relative ${
                isActive
                  ? 'bg-[#E68131]/25 text-white border border-[#E68131]/60 shadow-xs'
                  : 'text-white/70 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <span className="text-base">{meta.icon}</span>
              <span className="flex-1">{meta.label}</span>
              {badge > 0 && (
                <span className="bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {badge}
                </span>
              )}
            </button>
            {(t === 'dashboard' || t === 'requests' || t === 'reports') && (
              <div className="h-px bg-white/10 my-1 mx-2" />
            )}
          </React.Fragment>
        );
      })}

      {/* Quick Utilities Section */}
      <div className="h-px bg-white/10 my-2 mx-2" />

      {/* Notification Center Trigger */}
      {onOpenNotifications && (
        <button
          type="button"
          onClick={() => {
            if (onCloseMobile) onCloseMobile();
            onOpenNotifications();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors text-right cursor-pointer"
        >
          <Bell className="w-4 h-4 text-[#E68131]" />
          <span className="flex-1">مركز الإشعارات والتنبيهات</span>
          {unreadNotificationsCount > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {unreadNotificationsCount}
            </span>
          )}
        </button>
      )}

      {/* Audit Log Trigger */}
      {onOpenAuditLog && (
        <button
          type="button"
          onClick={() => {
            if (onCloseMobile) onCloseMobile();
            onOpenAuditLog();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors text-right cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>سجل أحداث وتدقيق النظام (Audit Log)</span>
        </button>
      )}

      {/* Install as Mobile App */}
      {onOpenInstallApp && (
        <button
          type="button"
          onClick={() => {
            if (onCloseMobile) onCloseMobile();
            onOpenInstallApp();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-amber-200 bg-[#E68131]/20 border border-[#E68131]/40 hover:bg-[#E68131]/30 transition-colors text-right cursor-pointer mt-1"
        >
          <Smartphone className="w-4 h-4 text-[#E68131]" />
          <span>تثبيت التطبيق على الموبايل 📲</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 bg-gradient-to-b from-[#075073] to-[#03151F] flex-col shrink-0 h-full overflow-y-auto border-l border-white/10 shadow-lg">
        {/* Subtle Brand Header in Sidebar */}
        <div className="p-3.5 border-b border-white/10 bg-white/5 flex items-center gap-2.5">
          <MonglishLogo variant="emblem" size="sm" className="w-8 h-8 rounded-lg shadow-2xs border border-white/20" />
          <div className="flex flex-col text-right leading-none">
            <span className="font-serif font-black text-xs tracking-tight text-white">أكاديمية مونجلش الدولية</span>
            <span className="text-[10px] text-[#E68131] font-bold font-mono mt-1">المقر الرئيسي — الإسكندرية</span>
          </div>
        </div>
        {navContent}
      </aside>

      {/* Mobile Drawer (When Opened) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" dir="rtl">
          <div
            className="fixed inset-0 bg-[#03151F]/80 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] bg-gradient-to-b from-[#075073] to-[#03151F] text-white flex flex-col h-full z-10 shadow-2xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MonglishLogo variant="emblem" size="xs" className="w-7 h-7 rounded-lg shadow-2xs border border-white/20" />
                <span className="font-black text-sm text-[#E68131]">أكاديمية مونجلش الدولية</span>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pb-12">{navContent}</div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Bar: Optimized layout with safe-area padding so content is NEVER cut off */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#03151F]/95 border-t border-white/10 px-1 pt-1.5 flex items-center justify-around shadow-2xl backdrop-blur-md"
        style={{ paddingBottom: 'max(0.6rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {allowedTabs.slice(0, 4).map((t) => {
          const isActive = activeTab === t;
          const meta = TABS_META[t] || { label: t, icon: '📁' };
          const badge = getBadge(t);

          return (
            <button
              key={t}
              type="button"
              onClick={() => onSelectTab(t)}
              className={`flex flex-col items-center justify-center min-w-[54px] py-1 px-1 rounded-lg text-[10px] font-bold transition-all relative shrink-0 cursor-pointer ${
                isActive
                  ? 'text-[#E68131] bg-white/10'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <span className="text-lg leading-none mb-0.5">{meta.icon}</span>
              <span className="truncate max-w-[58px]">{meta.label}</span>
              {badge > 0 && (
                <span className="absolute top-0 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-[#03151F]"></span>
              )}
            </button>
          );
        })}

        {/* Notifications Icon Button on Mobile Bottom Bar */}
        {onOpenNotifications && (
          <button
            type="button"
            onClick={onOpenNotifications}
            className="flex flex-col items-center justify-center min-w-[54px] py-1 px-1 rounded-lg text-[10px] font-bold text-white/70 hover:text-white transition-all relative shrink-0 cursor-pointer"
          >
            <span className="text-lg leading-none mb-0.5 relative">
              <Bell className="w-4 h-4 text-amber-300" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-[#03151F]"></span>
              )}
            </span>
            <span>تنبيهات</span>
          </button>
        )}

        {/* More / All Sections Trigger if there are more than 4 tabs */}
        {allowedTabs.length > 4 && onOpenMobile && (
          <button
            type="button"
            onClick={onOpenMobile}
            className="flex flex-col items-center justify-center min-w-[54px] py-1 px-1 rounded-lg text-[10px] font-bold text-white/70 hover:text-[#E68131] transition-all relative shrink-0 cursor-pointer"
          >
            <span className="text-lg leading-none mb-0.5">
              <MoreHorizontal className="w-5 h-5 text-stone-300" />
            </span>
            <span>المزيد</span>
          </button>
        )}
      </nav>
    </>
  );
};
