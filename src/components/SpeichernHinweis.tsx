'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useOffeneSpeicherungen } from '@/lib/speichern';

/** Zeigt, wie viele Eintraege noch gespeichert werden, und warnt beim Schliessen des Tabs. */
export default function SpeichernHinweis() {
  const offen = useOffeneSpeicherungen();
  const router = useRouter();
  const vorher = useRef(0);
  // Sind alle Eintraege gespeichert, die Seite einmal mit frischen Daten laden
  useEffect(() => {
    if (vorher.current > 0 && offen === 0) router.refresh();
    vorher.current = offen;
  }, [offen, router]);
  useEffect(() => {
    if (!offen) return;
    const warnen = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [offen]);
  if (!offen) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-surface shadow-lg">
      Speichere noch {offen} {offen === 1 ? 'Eintrag' : 'Einträge'} … bitte Tab noch nicht schließen
    </div>
  );
}
