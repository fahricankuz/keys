import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { S, ui, subscribe, snapshot } from '../domain/state';
import { onLang } from '../domain/i18n';

/** Durum değişince (save → emit) bileşeni yeniden çizer. */
export function useStore() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return { S, ui };
}

/** Dil değişince yeniden çizer. */
export function useLangTick() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { const off = onLang(() => bump()); return () => { off(); }; }, []);
}
