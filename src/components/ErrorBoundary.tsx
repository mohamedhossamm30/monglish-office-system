import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  Info,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Wrench
} from 'lucide-react';
import {
  createEmergencyBackupJson,
  performFullStorageRepair,
  runStorageHealthCheck,
  StorageDiagnosticResult
} from '../utils/storageHealth';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  isRoot?: boolean;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  diagnostics: StorageDiagnosticResult | null;
  isRepairing: boolean;
  repairMessage: string | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      diagnostics: null,
      isRepairing: false,
      repairMessage: null,
      showDetails: false
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });

    // Run background storage diagnostics to check if corrupt LocalStorage/IndexedDB caused it
    runStorageHealthCheck()
      .then((diag) => {
        this.setState({ diagnostics: diag });
      })
      .catch((e) => {
        console.warn('[ErrorBoundary diagnostics failed]:', e);
      });
  }

  private handleAutoRepair = async () => {
    this.setState({ isRepairing: true, repairMessage: null });
    try {
      const res = await performFullStorageRepair();
      this.setState({
        diagnostics: res.diagnostics,
        repairMessage: res.message,
        isRepairing: false
      });

      // If repaired successfully, give user 1.5s visual feedback then reset error state to try recovering
      if (res.success) {
        setTimeout(() => {
          this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            repairMessage: null
          });
        }, 1200);
      }
    } catch (err: any) {
      this.setState({
        isRepairing: false,
        repairMessage: `تعذر الإصلاح التلقائي: ${err?.message || err}`
      });
    }
  };

  private handleSafeReload = () => {
    try {
      // Clear URL params that might cause boot loops
      const cleanUrl = window.location.origin + window.location.pathname;
      window.location.replace(cleanUrl);
    } catch {
      window.location.reload();
    }
  };

  private handleDownloadEmergencyBackup = () => {
    try {
      const json = createEmergencyBackupJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monglish_emergency_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('فشل تنزيل ملف النسخة الاحتياطية الطارئة');
    }
  };

  private handleResetDefaults = () => {
    if (window.confirm('هل أنت متأكد من رغبتك في إعادة ضبط النظام للبيانات الافتراضية الأولية؟ يفضل تنزيل نسخة احتياطية أولاً.')) {
      try {
        localStorage.clear();
        if (window.indexedDB) {
          window.indexedDB.deleteDatabase('monglish_academy_db');
        }
        window.location.replace(window.location.origin + window.location.pathname);
      } catch {
        window.location.reload();
      }
    }
  };

  public render() {
    if (this.state.hasError) {
      const { error, errorInfo, diagnostics, isRepairing, repairMessage, showDetails } = this.state;
      const isRoot = this.props.isRoot !== false;

      return (
        <div
          id="error_boundary_container"
          className={`flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-900 text-slate-100 font-sans ${
            isRoot ? 'min-h-screen w-full fixed inset-0 z-[99999]' : 'min-h-[400px] w-full rounded-2xl my-4'
          }`}
          dir="rtl"
        >
          <div
            id="error_boundary_card"
            className="w-full max-w-2xl bg-slate-800/95 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-sm overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {this.props.fallbackTitle || 'حماية النظام — تم احتواء خطأ تشغيلي بنجاح'}
                </h2>
                <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                  تم اعتراض الخطأ تلقائياً بواسطة نظام الحماية (Error Boundary) لحماية بيانات الأكاديمية ومنع إغلاق الشاشة أو انهيار التطبيق.
                </p>
              </div>
            </div>

            {/* Storage Status & Diagnostics Box */}
            <div className="bg-slate-950/60 border border-slate-700/60 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-sky-400" />
                  حالة التخزين والذاكرة المحلية:
                </span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    diagnostics?.status === 'healthy'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : diagnostics?.status === 'warning'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {diagnostics?.status === 'healthy'
                    ? 'التخزين سليم ✓'
                    : diagnostics?.status === 'warning'
                    ? 'تم رصد بيانات غير متناسقة ⚠️'
                    : 'فحص التخزين جارٍ...'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-300">
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block mb-0.5">LocalStorage:</span>
                  <span className={diagnostics?.localStorageAvailable ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                    {diagnostics?.localStorageAvailable ? 'يعمل بصورة طبيعية' : 'غير متاح / محظور'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block mb-0.5">IndexedDB:</span>
                  <span className={diagnostics?.indexedDBAvailable ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                    {diagnostics?.indexedDBAvailable ? 'نشط ومستقر' : 'غير مفعل أو احتياطي'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
                  <span className="text-slate-400 block mb-0.5">الأصناف المحفوظة:</span>
                  <span className="text-sky-300 font-medium">
                    {diagnostics?.itemsCount || 0} صنف
                  </span>
                </div>
              </div>

              {diagnostics?.conflictDetected && (
                <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>{diagnostics.conflictReason || 'تم رصد اختلاف بين الذاكرة وقاعدة البيانات وتم معالجته تلقائياً.'}</span>
                </div>
              )}
            </div>

            {/* Repair Feedback Message */}
            {repairMessage && (
              <div className="mb-5 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>{repairMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <button
                id="btn_error_auto_repair"
                onClick={this.handleAutoRepair}
                disabled={isRepairing}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-150 disabled:opacity-50 cursor-pointer text-sm"
              >
                <Wrench className={`w-4 h-4 ${isRepairing ? 'animate-spin' : ''}`} />
                <span>{isRepairing ? 'جاري الفحص والإصلاح...' : 'إصلاح التخزين واستعادة الشاشة'}</span>
              </button>

              <button
                id="btn_error_safe_reload"
                onClick={this.handleSafeReload}
                className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-medium py-3 px-4 rounded-xl shadow-md transition-all duration-150 cursor-pointer text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة تحميل التطبيق آمنة</span>
              </button>

              <button
                id="btn_error_download_backup"
                onClick={this.handleDownloadEmergencyBackup}
                className="flex items-center justify-center gap-2 bg-slate-700/80 hover:bg-slate-700 text-slate-200 font-medium py-2.5 px-4 rounded-xl border border-slate-600/70 transition-all duration-150 cursor-pointer text-xs"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>تنزيل نسخة احتياطية طارئة (JSON)</span>
              </button>

              <button
                id="btn_error_reset_defaults"
                onClick={this.handleResetDefaults}
                className="flex items-center justify-center gap-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-medium py-2.5 px-4 rounded-xl border border-rose-800/40 transition-all duration-150 cursor-pointer text-xs"
              >
                <RotateCcw className="w-4 h-4" />
                <span>إعادة ضبط المصنع (بيانات جديدة)</span>
              </button>
            </div>

            {/* Error Details Accordion */}
            <div className="border-t border-slate-700/60 pt-4">
              <button
                id="btn_toggle_error_details"
                onClick={() => this.setState({ showDetails: !showDetails })}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Info className="w-3.5 h-3.5 text-slate-500" />
                <span>{showDetails ? 'إخفاء التفاصيل الفنية للمشرف' : 'عرض التفاصيل الفنية والتقرير البرمجي'}</span>
              </button>

              {showDetails && (
                <div className="mt-3 p-3 bg-black/50 border border-slate-800 rounded-xl text-xs font-mono text-rose-300 overflow-x-auto max-h-48 scrollbar-thin">
                  <p className="font-bold text-rose-400 mb-1">
                    {error?.name}: {error?.message}
                  </p>
                  {error?.stack && <pre className="text-[11px] text-slate-400 whitespace-pre-wrap">{error.stack}</pre>}
                  {errorInfo?.componentStack && (
                    <div className="mt-2 pt-2 border-t border-slate-800 text-slate-500 text-[10px]">
                      {errorInfo.componentStack}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
