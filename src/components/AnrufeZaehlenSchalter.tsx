'use client';

import { useOptimistic, useTransition } from 'react';
import { Phone } from 'lucide-react';
import { anrufeZaehlenSetzen } from '@/app/actions/akquise';

/**
 * Schalter "Anrufe mitzaehlen": an = jeder ausgehende Fritzbox-Anruf zaehlt
 * fuer die Akquise-Statistik, auch ohne Telefonnummer im CRM.
 */
export default function AnrufeZaehlenSchalter({ an, seit }: { an: boolean; seit: string | null }) {
  const [, start] = useTransition();
  const [zeigt, setZeigt] = useOptimistic(an);
  const umschalten = () => start(async () => { setZeigt(!zeigt); await anrufeZaehlenSetzen(!zeigt); });
  const seitText = seit ? new Date(seit).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <button type="button" onClick={umschalten} role="switch" aria-checked={zeigt}
            title={zeigt
              ? 'Jeder ausgehende Anruf über die Fritzbox zählt für die Akquise-Statistik. Klicken zum Ausschalten.'
              : 'Nur Anrufe zu Kontakten im CRM zählen. Klicken, damit jeder ausgehende Anruf mitzählt.'}
            className={`mx-3 mb-2 flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[13px] transition ${
              zeigt ? 'border-brand/40 bg-brand-soft/60 text-brand' : 'border-line text-ink/80 hover:bg-surface-2'
            }`}>
      <Phone size={15} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Anrufe mitzählen</span>
        <span className="block truncate text-[11px] text-muted">{zeigt ? (seitText ? `an seit ${seitText}` : 'an') : 'aus'}</span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${zeigt ? 'bg-brand' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${zeigt ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
