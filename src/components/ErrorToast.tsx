import React, { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorToastProps {
  message: string | null;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export const ErrorToast: React.FC<ErrorToastProps> = ({
  message,
  onDismiss,
  autoDismissMs = 6000,
}) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [message, onDismiss, autoDismissMs]);

  if (!message) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-28 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/95 dark:bg-slate-950/95 text-slate-100 border border-rose-500/40 shadow-2xl backdrop-blur-xl animate-fade-in max-w-md select-none"
    >
      <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-rose-300">Playback Notice</p>
        <p className="text-xs text-slate-200 mt-0.5 leading-snug">{message}</p>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
        aria-label="Dismiss error notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
