import React, { useState, useEffect } from 'react';
import { Smartphone, Download, CheckCircle2, Share2, PlusSquare, X, Monitor, ShieldCheck } from 'lucide-react';

interface InstallAppModalProps {
  onClose: () => void;
  deferredPrompt: any;
  onInstalled?: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  onClose,
  deferredPrompt,
  onInstalled
}) => {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Check if running on iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    // Check if already installed in standalone mode
    const standaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(!!standaloneMode);
  }, []);

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        if (onInstalled) onInstalled();
        onClose();
      }
    } catch (err) {
      console.warn('Install prompt error:', err);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#03151F]/80 backdrop-blur-xs" dir="rtl">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-[#075073] to-[#03151F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg border border-white/20 shrink-0 bg-[#03151F]">
              <img src="/icon.svg" alt="أيقونة إدارة المكتب" className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>تثبيت تطبيق إدارة المكتب</span>
              </h2>
              <p className="text-xs text-[#FF9E42] font-medium">
                أكاديمية مونجلش الدولية — المقر الرئيسي
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {isStandalone ? (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <div className="font-black text-sm text-emerald-900">
                التطبيق مثبت بالفعل على جهازك!
              </div>
              <p className="text-xs text-emerald-700 mt-1">
                أنت الآن تستخدم التطبيق في وضع الهاتف المخصص وتتم المزامنة تلقائياً.
              </p>
            </div>
          ) : deferredPrompt ? (
            /* Android / Chrome Native 1-Click Install */
            <div className="space-y-3">
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200/80 text-xs text-amber-950 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Download className="w-4 h-4 text-amber-700" />
                  <span>تثبيت فوري بنقرة واحدة</span>
                </div>
                <p className="text-stone-600 leading-relaxed">
                  سيتم تثبيت أيقونة التطبيق على شاشة هاتفك الرئيسية، ويعمل ملء الشاشة مع حفظ البيانات بدون بطء.
                </p>
              </div>

              <button
                type="button"
                onClick={handleNativeInstall}
                disabled={installing}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-5 h-5 text-[#E68131]" />
                <span>{installing ? 'جاري التثبيت...' : 'تثبيت التطبيق الآن على الهاتف'}</span>
              </button>
            </div>
          ) : isIOS ? (
            /* iPhone / iPad Safari Instructions */
            <div className="space-y-3">
              <div className="font-bold text-xs text-stone-800">
                خطوات تثبيت التطبيق على هواتف آيفون (iOS):
              </div>
              <div className="space-y-2.5 text-xs text-stone-700">
                <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">1</span>
                  <div className="flex-1">
                    اضغط على زر المشاركة <Share2 className="w-3.5 h-3.5 inline text-blue-600 mx-1" /> أسفل متصفح Safari.
                  </div>
                </div>

                <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">2</span>
                  <div className="flex-1">
                    مرر للأسفل واضغط على <strong className="text-stone-900">«إضافة إلى الشاشة الرئيسية»</strong> (Add to Home Screen <PlusSquare className="w-3.5 h-3.5 inline text-stone-700 mx-1" />).
                  </div>
                </div>

                <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">3</span>
                  <div className="flex-1">
                    اضغط على <strong className="text-emerald-700">«إضافة» (Add)</strong> في الزاوية العلوية.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Android Chrome / Generic Browser Instructions */
            <div className="space-y-3">
              <div className="font-bold text-xs text-stone-800">
                طريقة التثبيت على الهاتف عبر المتصفح:
              </div>
              <div className="space-y-2 text-xs text-stone-700">
                <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center shrink-0">1</span>
                  <span>اضغط على قائمة الثلاث نقاط <strong>(⋮)</strong> بأعلى المتصفح.</span>
                </div>
                <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center shrink-0">2</span>
                  <span>اختر <strong>«تثبيت التطبيق» (Install app)</strong> أو «إضافة إلى الشاشة الرئيسية».</span>
                </div>
              </div>
            </div>
          )}

          {/* Key Advantages */}
          <div className="pt-2 border-t border-stone-100 grid grid-cols-2 gap-2 text-[11px] text-stone-600">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>واجهة كاملة ملء الشاشة</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>أبعاد متناسقة دون حواف مخفية</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>دخول فوري من الشاشة الرئيسية</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>مزامنة لحظية بين الأجهزة</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-stone-50 border-t border-stone-200 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-200 transition-colors cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
