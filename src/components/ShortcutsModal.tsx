import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space', desc: 'Play / Pause audio' },
    { key: '← / →', desc: 'Seek backward / forward 5 seconds' },
    { key: '⌘ / Ctrl + ←', desc: 'Previous track' },
    { key: '⌘ / Ctrl + →', desc: 'Next track' },
    { key: '↑ / ↓', desc: 'Volume up / down (5%)' },
    { key: 'M', desc: 'Mute / unmute' },
    { key: 'L', desc: 'Toggle lyrics / now playing panel' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full max-w-md bg-white dark:bg-[#0a0e1c] text-[#182238] dark:text-slate-100 border border-[#DDE4EF] dark:border-white/[0.1] rounded-2xl shadow-2xl p-6 relative">
        <div className="flex items-center justify-between pb-4 border-b border-[#DDE4EF] dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-[#565ECF] dark:text-indigo-400" />
            <h3 className="font-bold text-base text-[#182238] dark:text-white">Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#687995] hover:text-[#182238] dark:hover:text-white hover:bg-[#E9EDF7] dark:hover:bg-white/[0.08] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 divide-y divide-slate-100 dark:divide-white/[0.04]">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
              <span className="text-[#687995] dark:text-slate-300">{s.desc}</span>
              <kbd className="px-2 py-1 bg-[#E9EDF7]/70 dark:bg-white/[0.08] border border-[#DDE4EF] dark:border-white/[0.12] rounded-md font-mono text-[11px] text-[#565ECF] dark:text-indigo-300 font-semibold shadow-sm">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-3 border-t border-[#DDE4EF] dark:border-white/[0.06] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#565ECF] hover:bg-[#4B52BA] text-white text-xs font-semibold cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
