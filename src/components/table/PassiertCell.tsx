'use client';

import { useState } from 'react';
import { usePipelineArt, useStages, useZeilenPatch, type ZeilenPatch } from './StagesContext';
import { KALT_EINTRAEGE, FAEDEN_EINTRAEGE, passiertRegel, wiedervorlageTage } from '@/lib/passiert';
import { wasIstPassiert, wiedervorlageSetzen } from '@/app/actions/records';
import { imHintergrundSpeichern } from '@/lib/speichern';

const inTagen = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * "Was ist passiert?" direkt in der Tabellenzeile: Auswahl legt Aktivitaet an,
 * setzt Phase und Quelle. Die Zeile aendert sich sofort, gespeichert wird im
 * Hintergrund. Wo noetig erscheint gleich das Feld fuer die Wiedervorlage
 * (Enter speichert). Nichts oeffnet sich.
 */
export default function PassiertCell({ dealId, quelle }: { dealId: string; quelle: string | null }) {
  const art = usePipelineArt();
  const stages = useStages();
  const patchRow = useZeilenPatch();
  const [wv, setWv] = useState(false);
  const [datum, setDatum] = useState(inTagen(3));
  const [betreff, setBetreff] = useState('');
  const [fertig, setFertig] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(0);

  const eintraege = art === 'faeden' ? FAEDEN_EINTRAEGE : art === 'kalt' ? KALT_EINTRAEGE : null;
  if (!eintraege) return <span className="text-muted">–</span>;

  const imHintergrund = (fn: () => Promise<unknown>, rueckgaengig: () => void) => {
    setLaeuft((n) => n + 1);
    imHintergrundSpeichern(fn()).catch((e) => { rueckgaengig(); setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'); })
      .finally(() => setLaeuft((n) => n - 1));
  };

  const waehlen = (eintrag: string) => {
    setFehler(null);
    const regel = passiertRegel(eintrag, quelle);
    if (!regel) return;
    // Sofort anzeigen: Phase, Quelle
    const patch: ZeilenPatch = {};
    const ziel = regel.phase ? stages?.find((s) => s.name.trim().toLowerCase() === regel.phase!.toLowerCase()) : null;
    if (ziel) { patch.stage_id = ziel.id; patch.stage = { name: ziel.name, color: ziel.color }; }
    if (regel.quelle && !quelle) patch.custom = { quelle: regel.quelle };
    patchRow?.(dealId, patch);
    setFertig(eintrag);
    if (regel.wiedervorlage) { setDatum(inTagen(wiedervorlageTage(eintrag))); setBetreff(''); setWv(true); }
    imHintergrund(() => wasIstPassiert(dealId, eintrag), () => { patchRow?.(dealId, null); setFertig(null); });
  };

  const speichern = () => {
    setFehler(null);
    const iso = new Date(`${datum}T09:00`).toISOString();
    const titel = betreff.trim() || 'Nachfassen';
    setWv(false);
    patchRow?.(dealId, { naechste_wv: { due_at: iso, title: titel }, ohne_datum: false });
    imHintergrund(() => wiedervorlageSetzen(dealId, iso, betreff), () => setWv(true));
  };

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
        <select value="" onChange={(e) => e.target.value && waehlen(e.target.value)}
                className="input !w-full !py-1 text-[13px]" aria-label="Was ist passiert?">
          <option value="">{fertig ? `✓ ${fertig}${laeuft ? ' …' : ''}` : 'Was ist passiert?'}</option>
          {eintraege.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      )}
      {wv && (
        <p className="mt-0.5 text-[11px] text-muted">
          {art === 'kalt' ? 'Wiedervorlage setzen – kein Interesse ohne Datum. Enter speichert.' : 'Wiedervorlage setzen, Enter speichert.'}
        </p>
      )}
      {fehler && <p className="mt-0.5 text-[11px] text-lose">{fehler}</p>}
    </div>
  );
}
