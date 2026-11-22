import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  note,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[420px] bg-white dark:bg-[#0c192c] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl p-5 sm:p-6 select-none animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Icon + Title + Close */}
        <div
          data-testid="confirm-modal-header"
          className="flex items-center gap-3"
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isDanger
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>

          <h3
            id="confirm-modal-title"
            className="flex-1 min-w-0 text-base font-semibold text-slate-900 dark:text-white leading-snug"
          >
            {title}
          </h3>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Full-width description */}
        <div
          data-testid="confirm-modal-body"
          className="mt-4 space-y-2"
        >
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            {message}
          </p>
          {note && (
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {note}
            </p>
          )}
        </div>

        {/* Footer: Right-aligned actions */}
        <div
          data-testid="confirm-modal-footer"
          className="mt-5 flex items-center justify-end gap-2.5"
        >
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/[0.1] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl border border-transparent text-xs font-semibold text-white shadow-sm transition-all cursor-pointer ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                : 'bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] active:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(dialog, document.body);
  }
  return dialog;
};
