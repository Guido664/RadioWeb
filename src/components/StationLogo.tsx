import React, { useState, useEffect } from 'react';
import { Radio } from 'lucide-react';

interface StationLogoProps {
  name: string;
  availableLogos: string[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StationLogo: React.FC<StationLogoProps> = ({
  name,
  availableLogos,
  size = 'md',
  className = '',
}) => {
  const [logoIndex, setLogoIndex] = useState(0);
  const [allFailed, setAllFailed] = useState(availableLogos.length === 0);

  useEffect(() => {
    setLogoIndex(0);
    setAllFailed(availableLogos.length === 0);
  }, [availableLogos]);

  const currentUrl = !allFailed && logoIndex < availableLogos.length ? availableLogos[logoIndex] : '';

  const handleError = () => {
    if (logoIndex + 1 < availableLogos.length) {
      setLogoIndex((prev) => prev + 1);
    } else {
      setAllFailed(true);
    }
  };

  const initials = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('') || 'FM';

  const dimensions =
    size === 'sm'
      ? 'w-11 h-11 text-xs'
      : size === 'lg'
      ? 'w-16 h-16 text-base'
      : 'w-14 h-14 text-sm';

  if (!currentUrl) {
    return (
      <div
        className={`${dimensions} ${className} shrink-0 rounded-lg bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-400 select-none overflow-hidden`}
        aria-label={`Logo placeholder per ${name}`}
      >
        <Radio className="w-3.5 h-3.5 text-amber-500/80 mb-0.5" />
        <span className="font-mono font-medium tracking-tight text-[11px] text-slate-300">
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${dimensions} ${className} shrink-0 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center relative`}
    >
      <img
        src={currentUrl}
        alt={`Logo ${name}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={handleError}
        className="w-full h-full object-cover"
      />
    </div>
  );
};
