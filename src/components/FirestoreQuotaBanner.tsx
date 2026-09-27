import React, { useState, useEffect } from 'react';
import { AlertTriangle, ExternalLink, X, ShieldCheck, RefreshCw } from 'lucide-react';
import {
  getFirestoreQuotaStatus,
  subscribeToQuotaStatus,
  testFirestoreWriteCapacity,
  FirestoreQuotaStatus,
  FIRESTORE_UPGRADE_URL
} from '../utils/firebaseSync';

export const FirestoreQuotaBanner: React.FC = () => {
  const [quotaStatus, setQuotaStatus] = useState<FirestoreQuotaStatus>(getFirestoreQuotaStatus());
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('monglish_quota_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const unsub = subscribeToQuotaStatus((status) => {
      setQuotaStatus(status);
    });
    return () => unsub();
  }, []);

  if (!quotaStatus.isExceeded || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('monglish_quota_banner_dismissed', 'true');
    } catch {
      // Ignore
    }
  };

  const handleTestCapacity = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testFirestoreWriteCapacity();
      setTestResult(res.message);
      if (res.success) {
        setTimeout(() => setTestResult(null), 4000);
      }
    } catch {
      setTestResult('فشل فحص الحصة حالياً.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div
      id="firestore-quota-banner"
      className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-b border-amber-500/30 text-stone-800 px-4 py-3 shadow-xs transition-all animate-fadeIn"
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 mt-0.5 shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-amber-900 text-sm">
                تم بلوغ الحد اليومي المجاني للكتابة في قاعدة البيانات السحابية (Firebase Quota Exceeded)
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-600/15 text-emerald-800 px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3 text-emerald-700" />
                الحفظ المحلي نشط وآمن 100%
              </span>
            </div>
            <p className="text-xs text-stone-600 mt-1 leading-relaxed">
              استُنفدت حصة الكتابة اليومية المجانية لقاعدة البيانات (Free daily write units). يتم حالياً حفظ جميع البلاغات
              والبيانات والعمليات محلياً دون أي فقدان، وستُستأنف المزامنة السحابية تلقائياً فور تجديد الحصة.
            </p>
            {testResult && (
              <p className="text-xs font-semibold text-amber-800 mt-1 bg-amber-100/80 px-2 py-1 rounded inline-block">
                {testResult}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleTestCapacity}
            disabled={isTesting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium border border-stone-300 shadow-xs transition-colors disabled:opacity-50"
            title="فحص ما إذا كانت إمكانية الكتابة في السحابة قد تجددت"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? 'جاري الفحص...' : 'فحص استعادة الحصة'}</span>
          </button>
          <a
            href={quotaStatus.upgradeUrl || FIRESTORE_UPGRADE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors"
            title="فتح صفحة ترقية الحصة وإعدادات الفوترة في Firebase Console"
          >
            <span>ترقية الحصة في Firebase</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
            title="إخفاء هذا التنبيه مؤقتاً"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
