import { useEffect } from 'react';
import { handlePlayerKeydown, ShortcutHandlers } from '../utils/shortcuts';

export function useShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      handlePlayerKeydown(e, handlers);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handlers]);
}
