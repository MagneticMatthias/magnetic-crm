'use client';

import { useSyncExternalStore } from 'react';

/** Zaehlt Speichervorgaenge, die im Hintergrund laufen (fuer Hinweis und Warnung beim Schliessen). */
let offen = 0;
const hoerer = new Set<() => void>();
const melden = () => hoerer.forEach((h) => h());

export function imHintergrundSpeichern<T>(p: Promise<T>): Promise<T> {
  offen++; melden();
  return p.finally(() => { offen--; melden(); });
}

export function useOffeneSpeicherungen() {
  return useSyncExternalStore(
    (h) => { hoerer.add(h); return () => { hoerer.delete(h); }; },
    () => offen,
    () => 0,
  );
}
