'use client';

import { useState, useTransition } from 'react';
import { usePipelineArt } from './StagesContext';
import { KALT_EINTRAEGE, FAEDEN_EINTRAEGE } from '@/lib/passiert';
import { wasIstPassiert, wiedervorlageSetzen } from '@/app/actions/records';

const inTagen = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * "Was ist passiert?" direkt in der Tabellenzeile: Auswahl legt Aktivitaet an,
 * setzt Phase und Quelle. Wo noetig erscheint gleich das Feld fuer die
 * Wiedervorlage (Enter speichert). Nichts oeffnet sich.
 */
export default function PassiertCell({ dealId }: { dealId: string }) {
  const art = usePipelineArt();
  const [pending, start] = useTransition();
  const [wv, setWv] = useState(false);
  const [datum, setDatum] = useState(inTagen(3));
  const [betreff, setBetreff] = useState('');
  const [fertig, setFertig] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const eintraege = art === 'faeden' ? FAEDEN_EINTRAEGE : art === 'kalt' ? KALT_EINTRAEGE : null;
  if (!eintraege) return <span className="text-muted">–</span>;

  const waehlen = (eintrag: string) => start(async () => {
    setFehler(null);
    try {
      const r = await wasIstPassiert(dealId, eintrag);
      setFertig(eintrag);
      if (r.wiedervorlage) { setDatum(inTagen(3)); setBetreff(''); setWv(true); }
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Fehler'); }
  });

  const speichern = () => start(async () => {
    setFehler(null);
    try {
      await wiedervorlageSetzen(dealId, new Date(`${datum}T09:00`).toISOString(), betreff);
      setWv(false);
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Fehler'); }
  });

  return (
    <div data-kein-zeilenklick className="min-w-0" onClick={(e) => e.stopPropagation()}>
      {wv ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); speichern(); }}
              onKeyDown={(e) => { if (e.key === 'Escape') setWv(false); }}>
          <input type="date" required value={datum} onChange={(e) => setDatum(e.target.value)}
                 className="input !w-[8.5rem] !px-1.5 !py-1 text-[12px]" aria-label="Wiedervorlage am" />
          <input value={betreff} onChange={(e) => setBetreff(e.target.value)} autoFocus
                 placeholder="Betreff, Enter" className="input min-w-0 flex-1 !px-1.5 !py-1 text-[12px]" aria-label="Betreff der Wiedervorlage" />
          <button className="sr-only">Speichern</button>
        </form>
      ) : (
        <select value="" disabled={pending} onChange={(e) => e.target.value && waehlen(e.target.value)}
                className="input !w-full !py-1 text-[13px]" aria-label="Was ist passiert?">
          <option value="">{pending ? 'Speichern …' : fertig ? `✓ ${fertig}` : 'Was ist passiert?'}</option>
          {eintraege.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      )}
      {wv && <p className="mt-0.5 text-[11px] text-muted">Wiedervorlage setzen – ohne Datum kein Interesse.</p>}
      {fehler && <p className="mt-0.5 text-[11px] text-lose">{fehler}</p>}
    </div>
  );
}
