import React, { useState, useEffect } from 'react';
import { SystemActivity, TabKey } from '../types';
import { formatActivityClock, formatActivityRelative } from '../utils/storage';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendBrowserNotification
} from '../utils/notifications';
import {
  SoundTheme,
  SOUND_THEMES,
  getSelectedSoundTheme,
  setSelectedSoundTheme,
  IconTheme,
  ICON_THEMES,
  getSelectedIconTheme,
  setSelectedIconTheme,
  playNotificationTone
} from '../utils/audioAlert';
import {
  Bell,
  CheckCheck,
  Volume2,
  VolumeX,
  X,
  AlertTriangle,
  ArrowLeft,
  Filter,
  Layers,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Info,
  Clock,
  Radio,
  SlidersHorizontal,
  Play
} from 'lucide-react';

interface NotificationCenterModalProps {
  activities: SystemActivity[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: (silent?: boolean) => void;
  onOpenAuditLog: () => void;
  onNavigateTab: (tab: TabKey) => void;
  onClose: () => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  activities,
  soundEnabled,
  onToggleSound,
  onMarkAsRead,
  onMarkAllAsRead,
  onOpenAuditLog,
  onNavigateTab,
  onClose
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical' | 'warehouse' | 'purchase' | 'maint' | 'reqs'>('all');
  const [browserPerm, setBrowserPerm] = useState<string>(getNotificationPermission());
  const [liveTime, setLiveTime] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [currentSoundTheme, setCurrentSoundTheme] = useState<SoundTheme>(getSelectedSoundTheme());
  const [currentIconTheme, setCurrentIconTheme] = useState<IconTheme>(getSelectedIconTheme());
  const [testSuccessMsg, setTestSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const updateTime = () => {
      setLiveTime(formatActivityClock(Date.now()));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Automatically mark all notifications as read once viewed by the user
  useEffect(() => {
    const hasUnread = activities.some((a) => !a.read);
    if (hasUnread) {
      onMarkAllAsRead(true);
    }
  }, []);

  const handleRequestBrowserNotifications = async () => {
    const ok = await requestNotificationPermission();
    setBrowserPerm(getNotificationPermission());
    if (ok) {
      sendBrowserNotification('تم تفعيل إشعارات النظام الفورية 🔔', {
        body: 'ستصلك الآن تنبيهات العمليات واستلام المشتريات حتى عند تصغير المتصفح.'
      });
    }
  };

  const unreadCount = activities.filter((a) => !a.read).length;

  const filteredActivities = activities.filter((act) => {
    if (filter === 'unread') return !act.read;
    if (filter === 'critical') return act.severity === 'critical' || act.severity === 'warning';
    if (filter === 'warehouse') return act.type === 'warehouse' || act.dept?.includes('مخازن') || act.dept?.includes('المخزن');
    if (filter === 'purchase') return act.type === 'purchase' || act.dept?.includes('مشتريات');
    if (filter === 'maint') return act.type === 'maint' || act.dept?.includes('صيانة');
    if (filter === 'reqs') return act.type === 'request' || act.dept?.includes('طلب');
    return true;
  });

  const getTargetTab = (act: SystemActivity): TabKey => {
    if (act.type === 'warehouse' || act.dept?.includes('مخازن') || act.dept?.includes('المخزن')) return 'inventory';
    if (act.type === 'purchase' || act.dept?.includes('مشتريات')) return 'procurement';
    if (act.type === 'maint' || act.dept?.includes('صيانة')) return 'maintenance';
    if (act.type === 'clean' || act.dept?.includes('نظافة')) return 'cleaning';
    if (act.dept?.includes('بوفيه')) return 'buffet';
    if (act.type === 'line' || act.dept?.includes('خطوط')) return 'lines';
    if (act.type === 'request' || act.dept?.includes('طلب')) return 'requests';
    return 'dashboard';
  };

  const getDeptBadge = (act: SystemActivity) => {
    const d = act.dept || '';
    if (d.includes('مخازن') || d.includes('المخزن')) {
      return { bg: 'bg-amber-100 text-amber-900 border-amber-300', icon: '📦' };
    }
    if (d.includes('مشتريات')) {
      return { bg: 'bg-blue-100 text-blue-900 border-blue-300', icon: '🛒' };
    }
    if (d.includes('صيانة')) {
      return { bg: 'bg-orange-100 text-orange-900 border-orange-300', icon: '🔧' };
    }
    if (d.includes('بوفيه')) {
      return { bg: 'bg-amber-100 text-amber-800 border-amber-300', icon: '☕' };
    }
    if (d.includes('نظافة')) {
      return { bg: 'bg-teal-100 text-teal-900 border-teal-300', icon: '🧹' };
    }
    if (d.includes('استقبال') || d.includes('خطوط')) {
      return { bg: 'bg-indigo-100 text-indigo-900 border-indigo-300', icon: '📞' };
    }
    return { bg: 'bg-stone-100 text-stone-800 border-stone-300', icon: '🏢' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#03151F]/70 backdrop-blur-xs" dir="rtl">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92dvh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#075073] to-[#03151F] text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E68131]/20 border border-[#E68131]/40 flex items-center justify-center text-[#E68131] relative shadow-inner">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-[#075073] animate-pulse">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>مركز الإشعارات والتنبيهات الفورية</span>
                {unreadCount > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 border border-rose-400/40">
                    {unreadCount} تنبيه جديد
                  </span>
                )}
              </h2>
              <p className="text-xs text-white/70">
                إشعار فوري للمدير عند تحديث أو تنفيذ أي عملية هامة في الأقسام
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Clock Display */}
            {liveTime && (
              <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 text-white/90 border border-white/15 font-mono text-[11px]">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>الوقت:</span>
                <strong className="text-amber-300 font-bold">{liveTime}</strong>
              </span>
            )}

            {/* Browser notification toggle button */}
            {isNotificationSupported() && (
              <button
                type="button"
                onClick={handleRequestBrowserNotifications}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                  browserPerm === 'granted'
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/30'
                    : 'bg-amber-400 text-[#075073] hover:bg-amber-300 font-black'
                }`}
                title="تفعيل الإشعارات الفورية على جهازك حتى عند تصغير البرنامج"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{browserPerm === 'granted' ? 'إشعارات المتصفح مفعلة ✓' : 'تفعيل إشعارات الجهاز'}</span>
              </button>
            )}

            {/* Customize Sound & Icon button */}
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                showSettings
                  ? 'bg-amber-400 text-[#075073] border-amber-300 font-black'
                  : 'bg-white/10 text-white/90 border-white/15 hover:bg-white/20'
              }`}
              title="تغيير صوت الإشعار واختيار أيقونة التنبيه وتجربتها"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>الصوت والأيقونة</span>
            </button>

            {/* Sound alert toggle */}
            <button
              type="button"
              onClick={onToggleSound}
              className={`p-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                soundEnabled
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 hover:bg-amber-400/30'
                  : 'bg-white/10 text-white/60 border-white/10 hover:bg-white/20'
              }`}
              title={soundEnabled ? 'تنبيه الصوت مفعل' : 'تنبيه الصوت مكتوم'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Expandable Sound & Icon Customization Panel */}
        {showSettings && (
          <div className="bg-[#faf8f3] border-b border-amber-200/70 p-4 space-y-4 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-[#075073] flex items-center gap-1.5">
                <span>🔔 تخصيص نغمة وشارة التنبيهات الفورية</span>
              </h3>
              {testSuccessMsg && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                  {testSuccessMsg}
                </span>
              )}
            </div>

            {/* Sound selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 flex items-center gap-1">
                <span>🎵 اختر نغمة التنبيه الصوتية:</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {SOUND_THEMES.map((theme) => {
                  const isSelected = currentSoundTheme === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => {
                        setCurrentSoundTheme(theme.id);
                        setSelectedSoundTheme(theme.id);
                        playNotificationTone('normal', theme.id);
                        setTestSuccessMsg(`تم ضبط النغمة: ${theme.label}`);
                        setTimeout(() => setTestSuccessMsg(null), 2500);
                      }}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#075073] text-white border-[#075073] shadow-xs'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{theme.icon}</span>
                        <div>
                          <div className="text-xs font-bold">{theme.label}</div>
                          <div className={`text-[10px] ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                            {theme.desc}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playNotificationTone('normal', theme.id);
                        }}
                        className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                          isSelected
                            ? 'bg-[#E68131] text-white border-[#E68131]'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200'
                        }`}
                        title="استماع فوري للنغمة"
                      >
                        <Play className="w-3 h-3 fill-current" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Icon Theme Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 flex items-center gap-1">
                <span>🎨 اختر شارة وأيقونة التنبيه:</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {ICON_THEMES.map((item) => {
                  const isSelected = currentIconTheme === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setCurrentIconTheme(item.id);
                        setSelectedIconTheme(item.id);
                        setTestSuccessMsg(`تم اختيار الأيقونة: ${item.emoji} ${item.label}`);
                        setTimeout(() => setTestSuccessMsg(null), 2500);
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#075073] text-white border-[#075073] shadow-xs'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      <span className="text-base">{item.emoji}</span>
                      <span>{item.label}</span>
                      {isSelected && <span className="text-amber-400 font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Test Action Row */}
            <div className="flex items-center justify-between border-t border-stone-200/80 pt-3 flex-wrap gap-2">
              <span className="text-[11px] text-stone-500">
                يتم حفظ تفضيلات النغمة والأيقونة فورياً وتطبيقها على كافة إشعاراتك
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playNotificationTone('normal', currentSoundTheme);
                    sendBrowserNotification('تنبيه تجريبي من نظام مونجلش', {
                      body: 'هذا إشعار تجريبي للتحقق من عمل الصوت والأيقونة والشاشة بشكل مثالي ✓',
                      playSound: false
                    });
                    setTestSuccessMsg('تم إطلاق تنبيه صوتي وإشعار تجريبي بنجاح ✓');
                    setTimeout(() => setTestSuccessMsg(null), 3500);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>🔊 تجربة الإشعار والصوت الآن</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action & Filter Bar */}
        <div className="p-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                filter === 'all'
                  ? 'bg-[#075073] text-white border-[#075073]'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
            >
              الكل ({activities.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                filter === 'unread'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
            >
              غير مقروءة ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('critical')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                filter === 'critical'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
            >
              ⚠️ عاجلة
            </button>
            <button
              type="button"
              onClick={() => setFilter('warehouse')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                filter === 'warehouse'
                  ? 'bg-[#075073] text-white border-[#075073]'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
            >
              📦 المخازن
            </button>
            <button
              type="button"
              onClick={() => setFilter('purchase')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                filter === 'purchase'
                  ? 'bg-[#075073] text-white border-[#075073]'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
            >
              🛒 المشتريات
            </button>
            <button
              type="button"
              onClick={() => setFilter('maint')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                filter === 'maint'
                  ? 'bg-[#075073] text-white border-[#075073]'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
            >
              🔧 الصيانة
            </button>
            <button
              type="button"
              onClick={() => setFilter('reqs')}
              className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                filter === 'reqs'
                  ? 'bg-[#075073] text-white border-[#075073]'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
            >
              📋 الطلبات
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => onMarkAllAsRead(false)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-stone-700 bg-white hover:bg-stone-100 border border-stone-300 transition-all flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>تحديد الكل كمقروء</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 bg-stone-50/50">
          {filteredActivities.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-stone-800">لا توجد إشعارات في هذا التصنيف</h4>
              <p className="text-xs text-stone-500 mt-1">
                جميع الأقسام مستقرة ولا توجد عمليات معلقة أو غير مقروءة حالياً.
              </p>
            </div>
          ) : (
            filteredActivities.map((act) => {
              const isUnread = !act.read;
              const badge = getDeptBadge(act);
              const targetTab = getTargetTab(act);

              return (
                <div
                  key={act.id}
                  className={`p-3.5 rounded-2xl border transition-all text-right relative ${
                    isUnread
                      ? 'bg-white border-amber-300/80 shadow-xs ring-1 ring-amber-400/20'
                      : 'bg-white/80 border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Dept Icon / Status */}
                      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 text-base ${badge.bg}`}>
                        {badge.icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${badge.bg}`}>
                            {act.dept}
                          </span>
                          <span className="font-bold text-xs text-stone-900">
                            {act.action}
                          </span>
                          <span className="text-[11px] text-stone-500">
                            بواسطة: <strong className="text-stone-700 font-semibold">{act.by}</strong>
                          </span>
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                          )}
                        </div>

                        <p className="text-xs text-stone-700 leading-relaxed break-words">
                          {act.details}
                        </p>

                        <div className="flex items-center gap-2.5 mt-2.5 text-[11px] font-medium flex-wrap">
                          <span className="flex items-center gap-1.5 font-mono bg-stone-100 text-stone-700 px-2.5 py-0.5 rounded-lg border border-stone-200">
                            <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>{act.date}</span>
                            <span className="font-bold text-[#075073]">{formatActivityClock(act.ts, act.time)}</span>
                          </span>
                          {act.ts && (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 font-mono">
                              {formatActivityRelative(act.ts)}
                            </span>
                          )}
                          {act.amount !== undefined && act.amount > 0 && (
                            <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 font-mono">
                              القيمة: {act.amount.toLocaleString()} ج.م
                            </span>
                          )}
                          {act.quantity !== undefined && (
                            <span className="font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200 font-mono">
                              الكمية: {act.quantity}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateTab(targetTab);
                          onMarkAsRead(act.id);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold text-[#075073] bg-teal-50 hover:bg-teal-100 transition-colors flex items-center gap-1 cursor-pointer border border-teal-200"
                        title="الانتقال إلى شاشة القسم"
                      >
                        <span>عرض</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>

                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => onMarkAsRead(act.id)}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
                          title="تحديد كمقروء"
                        >
                          تحديد كمقروء
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Audit Log Trigger */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-stone-200 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAuditLog();
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#075073] bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            <span>فتح سجل أحداث وتدقيق النظام الكامل (Audit Log) ←</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
