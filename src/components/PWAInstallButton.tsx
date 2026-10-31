import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 text-amber-400" />
        <span>Installa App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-amber-400" />
          <span>Installa su iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
              <h3 className="text-base font-semibold text-white">
                Installa RadioWeb su iPhone / iPad
              </h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                1. Tocca il pulsante <strong>Condividi</strong> nella barra di Safari.<br />
                2. Scorri in basso e seleziona <strong>Aggiungi alla schermata Home</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-amber-500 hover:bg-amber-400 py-2 text-xs font-semibold text-slate-950 transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
