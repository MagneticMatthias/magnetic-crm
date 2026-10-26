'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Phone, X } from 'lucide-react';
import { syncAnrufe, type NeuerAnruf } from '@/app/actions/anrufe';

const INTERVALL_MS = 15 * 1000;

const dauer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;

/**
 * Holt alle 15 Sekunden fertige Telefonate vom Fritzbox-Anrufmonitor ab.
 * Nach einem Gespraech mit einem Kontakt erscheint unten rechts ein
 * Hinweis, ueber den du direkt das Ergebnis eintraegst.
 */
export default function AnrufPing() {
  const router = useRouter();
  const [hinweise, setHinweise] = useState<NeuerAnruf[]>([]);

  useEffect(() => {
    let aktiv = true;
    const lauf = async () => {
      try {
        const r = await syncAnrufe();
        if (!aktiv) return;
        if (r.neu.length) {
          setHinweise((h) => [...h, ...r.neu].slice(-4));
          router.refresh();
        }
      } catch { /* still: Fritzbox oder Netz gerade nicht da */ }
    };
    void lauf();
    const t = setInterval(lauf, INTERVALL_MS);
    return () => { aktiv = false; clearInterval(t); };
  }, [router]);

  if (!hinweise.length) return null;
  const weg = (id: string) => setHinweise((h) => h.filter((x) => x.activityId !== id));

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      {hinweise.map((a) => (
        <div key={a.activityId} className="card flex items-start gap-3 p-3 shadow-lg">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <Phone size={15} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">{a.richtung === 'out' ? 'Telefonat mit' : 'Anruf von'} {a.wer}</div>
            <div className="text-xs text-muted">{dauer(a.sekunden)} · im Verlauf eingetragen</div>
            <Link
              href={a.pipelineId ? `/pipelines?p=${a.pipelineId}&open=${a.contactId}` : `/kontakte?open=${a.contactId}`}
              onClick={() => weg(a.activityId)}
              className="mt-1.5 inline-block text-xs font-medium text-brand hover:underline">
              Ergebnis eintragen
            </Link>
          </div>
          <button type="button" aria-label="Schließen" onClick={() => weg(a.activityId)} className="text-muted hover:text-ink">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
