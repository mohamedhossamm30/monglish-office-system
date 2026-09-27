import React from 'react';

export interface MonglishLogoProps {
  variant?: 'emblem' | 'horizontal' | 'wordmark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showSubtitle?: boolean;
}

export const MonglishLogo: React.FC<MonglishLogoProps> = ({
  variant = 'emblem',
  size = 'md',
  className = '',
  showSubtitle = true
}) => {
  const sizeMap = {
    xs: { h: 'h-6', textH: 'text-xs', emblemSize: 24 },
    sm: { h: 'h-8', textH: 'text-sm', emblemSize: 32 },
    md: { h: 'h-10', textH: 'text-base', emblemSize: 40 },
    lg: { h: 'h-12', textH: 'text-lg', emblemSize: 48 },
    xl: { h: 'h-16', textH: 'text-xl', emblemSize: 64 }
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  if (variant === 'emblem') {
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 rounded-xl overflow-hidden shadow-xs border border-white/15 ${currentSize.h} aspect-square ${className}`}
        style={{
          background: 'linear-gradient(135deg, #075073 0%, #03151F 100%)'
        }}
        title="Monglish International Academy"
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full p-1"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="emblemOrange" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF9336" />
              <stop offset="100%" stopColor="#E68131" />
            </linearGradient>
          </defs>

          {/* Subtle star accent at top */}
          <polygon
            points="50,14 52,20 58,22 52,24 50,30 48,24 42,22 48,20"
            fill="url(#emblemOrange)"
            opacity="0.9"
          />

          {/* Elegant M letter */}
          <path
            d="M 28 66 L 28 32 L 35 32 L 50 54 L 65 32 L 72 32 L 72 66 L 65 66 L 65 43 L 53 60 L 47 60 L 35 43 L 35 66 Z"
            fill="#FFFFFF"
          />

          {/* Warm orange smile arc connecting at bottom */}
          <path
            d="M 26 71 Q 50 85 74 71"
            stroke="url(#emblemOrange)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (variant === 'wordmark') {
    return (
      <div className={`inline-flex items-center ${currentSize.h} ${className}`}>
        <img
          src="/monglish-logo.svg"
          alt="Monglish International Academy"
          className="h-full w-auto object-contain"
        />
      </div>
    );
  }

  // Full Horizontal Lockup
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Compact subtle emblem */}
      <div
        className={`relative inline-flex items-center justify-center shrink-0 rounded-xl overflow-hidden shadow-xs border border-white/15 ${currentSize.h} aspect-square`}
        style={{
          background: 'linear-gradient(135deg, #075073 0%, #03151F 100%)'
        }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full p-1"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="horizOrange" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF9336" />
              <stop offset="100%" stopColor="#E68131" />
            </linearGradient>
          </defs>
          <polygon
            points="50,14 52,20 58,22 52,24 50,30 48,24 42,22 48,20"
            fill="url(#horizOrange)"
            opacity="0.9"
          />
          <path
            d="M 28 66 L 28 32 L 35 32 L 50 54 L 65 32 L 72 32 L 72 66 L 65 66 L 65 43 L 53 60 L 47 60 L 35 43 L 35 66 Z"
            fill="#FFFFFF"
          />
          <path
            d="M 26 71 Q 50 85 74 71"
            stroke="url(#horizOrange)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Typography */}
      <div className="flex flex-col justify-center leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="font-serif font-black tracking-tight text-white text-base">
            Mônglish
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#E68131]/20 text-[#E68131] border border-[#E68131]/30">
            مقر الإسكندرية
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] tracking-wider uppercase text-white/60 font-semibold font-mono">
            International Academy
          </span>
        )}
      </div>
    </div>
  );
};
