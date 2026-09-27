import React, { useState } from 'react';
import { DOCUMENT_TYPES, DocumentTypeKey, parseDocumentSequence } from '../utils/documentSequences';
import { Copy, Check, Printer } from 'lucide-react';

interface DocumentSequenceBadgeProps {
  code: string;
  type?: DocumentTypeKey;
  showIcon?: boolean;
  showCopy?: boolean;
  onPrint?: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const DocumentSequenceBadge: React.FC<DocumentSequenceBadgeProps> = ({
  code,
  type,
  showIcon = true,
  showCopy = true,
  onPrint,
  size = 'md',
  className = ''
}) => {
  const [copied, setCopied] = useState(false);

  if (!code) return null;

  // Auto-detect type if not provided
  let resolvedType = type;
  if (!resolvedType) {
    const parsed = parseDocumentSequence(code);
    if (parsed) {
      resolvedType = parsed.type;
    }
  }

  const meta = resolvedType ? DOCUMENT_TYPES[resolvedType] : null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2'
  };

  const badgeTheme = meta
    ? meta.badgeBg
    : 'bg-stone-100 text-stone-800 border-stone-200';

  return (
    <div
      className={`inline-flex items-center font-mono font-bold rounded-lg border shadow-2xs transition-all select-all ${sizeClasses[size]} ${badgeTheme} ${className}`}
      title={meta ? `${meta.nameAr} (${meta.nameEn})` : `كود المستند: ${code}`}
      dir="ltr"
    >
      {showIcon && meta && <span className="font-sans text-xs">{meta.icon}</span>}
      <span className="tracking-wide">{code}</span>

      <div className="inline-flex items-center gap-0.5 ml-1 select-none">
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className="p-0.5 rounded hover:bg-black/10 text-stone-500 hover:text-stone-800 cursor-pointer transition-colors"
            title={copied ? 'تم النسخ!' : 'نسخ رقم المستند'}
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          </button>
        )}

        {onPrint && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrint();
            }}
            className="p-0.5 rounded hover:bg-black/10 text-stone-500 hover:text-stone-800 cursor-pointer transition-colors"
            title="معاينة وطباعة المستند الرسمي"
          >
            <Printer className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
