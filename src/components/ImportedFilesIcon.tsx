import { Files } from 'lucide-react';

export const IMPORTED_FILES_ICON_SURFACE_CLASS =
  'bg-sky-500/10 border border-sky-500/20 dark:bg-sky-400/10 dark:border-sky-400/20';

export function ImportedFilesIcon({ className = '' }: { className?: string }) {
  return <Files className={`text-sky-500 dark:text-sky-400 ${className}`} />;
}
