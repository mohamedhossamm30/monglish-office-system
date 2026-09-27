import React from 'react';
import { AlertTriangle, Trash2, X, Check } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  confirmIcon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'نعم، متأكد',
  cancelLabel = 'إلغاء التراجع',
  variant = 'danger',
  confirmIcon,
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  const getButtonStyles = () => {
    switch (variant) {
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white';
      case 'primary':
        return 'bg-[#075073] hover:bg-[#03151F] text-white';
      case 'danger':
      default:
        return 'bg-rose-600 hover:bg-rose-700 text-white';
    }
  };

  const getIcon = () => {
    if (confirmIcon) return confirmIcon;
    if (variant === 'danger') return <Trash2 className="w-5 h-5 text-rose-600" />;
    if (variant === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-600" />;
    return <Check className="w-5 h-5 text-emerald-600" />;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/70 backdrop-blur-xs transition-opacity"
      dir="rtl"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${
              variant === 'danger'
                ? 'bg-rose-50 text-rose-600 border border-rose-100'
                : variant === 'warning'
                ? 'bg-amber-50 text-amber-600 border border-amber-100'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            }`}>
              {getIcon()}
            </div>
            <div>
              <h3 className="text-base font-black text-[#075073]">{title}</h3>
              <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 ${getButtonStyles()}`}
          >
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
