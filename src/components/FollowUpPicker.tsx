'use client';

import { useId, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';

const PRESETS: { label: string; days: number }[] = [
  { label: 'morgen', days: 1 },
  { label: 'in 3 Tagen', days: 3 },
  { label: 'in 1 Woche', days: 7 },
  { label: 'in 2 Wochen', days: 14 },
];

const dateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Wiedervorlage direkt beim Protokollieren setzen: ein Klick statt den
 * Umweg ueber die Aufgaben-Karte. Gibt `followup_at` (ISO mit Zeitzone,
 * 9 Uhr morgens) und optional `followup_title` ins Formular.
 */
export default function FollowUpPicker() {
  const id = useId();
  const [iso, setIso] = useState('');
  const [aktiv, setAktiv] = useState('');
  const [datum, setDatum] = useState('');

  const setzen = (days: number, label: string) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    setIso(d.toISOString());
    setAktiv(label);
    setDatum(dateInput(d));
  };

  const ausDatum = (wert: string) => {
    setDatum(wert);
    if (!wert) { setIso(''); setAktiv(''); return; }
    const d = new Date(`${wert}T09:00`);
    setIso(d.toISOString());
    setAktiv('datum');
  };

  const loeschen = () => { setIso(''); setAktiv(''); setDatum(''); };

  return (
    <div>
      <input type="hidden" name="followup_at" value={iso} />
      <p className="label flex items-center gap-1.5">
        <CalendarClock size={13} /> Wiedervorlage
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => setzen(p.days, p.label)}
                  className={`chip border transition ${
                    aktiv === p.label
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-line bg-surface-2 text-muted hover:border-brand hover:text-brand'
                  }`}>
            {p.label}
          </button>
        ))}
        <input type="date" value={datum} onChange={(e) => ausDatum(e.target.value)}
               aria-label="Wiedervorlage an einem bestimmten Tag"
               className="input !w-auto !py-1 text-[13px]" />
        {iso && (
          <button type="button" onClick={loeschen}
                  className="chip border border-line bg-surface-2 text-muted hover:text-lose"
                  title="Wiedervorlage entfernen">
            <X size={12} /> keine
          </button>
        )}
      </div>

      {/* Immer sichtbar, nicht erst nach Wahl des Datums - sonst sucht man es. */}
      <div className="mt-2">
        <label className="label" htmlFor={`fu-title-${id}`}>Betreff der Wiedervorlage</label>
        <input id={`fu-title-${id}`} name="followup_title" className="input text-[13px]"
               placeholder={iso ? 'z. B. Video 2027 ansprechen (leer = „Nochmal anrufen“)' : 'Erst oben ein Datum wählen'} />
      </div>
    </div>
  );
}
