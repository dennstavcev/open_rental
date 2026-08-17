'use client';

import { useEffect } from 'react';

// Периодически перевызывает fn, пока вкладка видима — MVP-замена
// realtime для общих экранов (ADR-0016). fn должна быть стабильной
// между рендерами (обычно уже useCallback с [id] в зависимостях —
// тот же load(), что вызывается при заходе на страницу).
export function usePolling(fn: () => void, intervalMs: number): void {
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fn();
    }, intervalMs);
    return () => clearInterval(id);
  }, [fn, intervalMs]);
}
