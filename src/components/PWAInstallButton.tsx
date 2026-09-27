import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'banner' | 'settings';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide
  if (isInstalled) {
    return null;
  }

  // If not installable and not iOS, render a helpful fallback in settings, or return null
  if (!isInstallable && !isIOS) {
    if (variant === 'settings') {
      return (
        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-stone-500" />
            <span>التطبيق متوافق مع الموبايل والكمبيوتر (PWA)</span>
          </div>
          <span className="text-[11px] text-stone-400 font-mono">جاهز للتثبيت من قائمة المتصفح</span>
        </div>
      );
    }
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    if (variant === 'settings') {
      return (
        <button
          type="button"
          onClick={install}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white font-bold text-xs shadow-md transition-all cursor-pointer"
        >
          <Download className="w-4 h-4 text-[#E68131]" />
          <span>تثبيت تطبيق مونجلش على هذا الجهاز (موبايل / كمبيوتر)</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={install}
        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-900 font-bold px-3 py-1.5 text-xs shadow-sm transition-all cursor-pointer"
        title="تثبيت التطبيق على شاشة الموبايل أو الكمبيوتر"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">تنزيل التطبيق</span>
        <span className="sm:hidden">تثبيت</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 font-bold px-2.5 py-1.5 text-xs shadow-xs transition-all cursor-pointer"
          title="تثبيت التطبيق على الآيفون / الآيباد"
        >
          <Smartphone className="w-3.5 h-3.5 text-stone-600" />
          <span>تثبيت على iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-stone-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-black text-[#075073] flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-amber-600" />
                  <span>تثبيت التطبيق على iPhone / iPad</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="text-xs text-stone-600 space-y-2.5 leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs shrink-0">1</span>
                  <span>اضغط على زر <strong>المشاركة (Share ⎋)</strong> في شريط متصفح Safari السفلي.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs shrink-0">2</span>
                  <span>مرر لأسفل واختر <strong>"إضافة إلى الصفحة الرئيسية" (Add to Home Screen ⊞)</strong>.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs shrink-0">3</span>
                  <span>اضغط على <strong>"إضافة" (Add)</strong> في أعلى الزاوية.</span>
                </div>
                <p className="text-[11px] text-stone-400 pt-2 border-t border-stone-100">
                  سيعمل التطبيق كبرنامج مستقل كامل بدون أشرطة المتصفح وبشاشة كاملة سريعة!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#075073] text-white py-2.5 text-xs font-bold hover:bg-[#03151F] transition cursor-pointer"
              >
                فهمت، إغلاق
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
