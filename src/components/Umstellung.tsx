'use client';

import { useState, useTransition } from 'react';
import { Download, Play, Check } from 'lucide-react';
import { backupErstellen, umstellungAusfuehren, type Uebersicht, type VorschauZeile } from '@/app/actions/umstellung';
import { eur } from '@/lib/format';

function Tabelle({ titel, werte }: { titel: string; werte: Record<string, number> }) {
  const zeilen = Object.entries(werte).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold">{titel}</h3>
      <table className="w-full text-sm">
        <tbody>
          {zeilen.map(([k, n]) => (
            <tr key={k} className="border-t border-line first:border-0">
              <td className="py-1.5">{k}</td>
              <td className="py-1.5 text-right tabular-nums">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Umstellung({ zeilen, fertig, ziele }: { zeilen: VorschauZeile[]; fertig: boolean; ziele: string[] }) {
  const [pending, start] = useTransition();
  const [backup, setBackup] = useState<string | null>(null);
  const [zuordnung, setZuordnung] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<Uebersicht | null>(null);

  const offen = zeilen.filter((z) => !z.regel && z.anzahl > 0 && !zuordnung[z.stageId]);

  const sichern = () => start(async () => {
    setFehler(null);
    try {
      const json = await backupErstellen();
      const stempel = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
      const datei = `crm-backup-${stempel}.json`;
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = datei; a.click();
      URL.revokeObjectURL(url);
      setBackup(datei);
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Backup fehlgeschlagen'); }
  });

  const los = () => start(async () => {
    setFehler(null);
    try { setErgebnis(await umstellungAusfuehren(zuordnung)); }
    catch (e) { setFehler(e instanceof Error ? e.message : 'Umstellung fehlgeschlagen'); }
  });

  return (
    <>
      <section className="card p-5">
        <h2 className="text-sm font-semibold">1. Backup</h2>
        <p className="mt-1 text-sm text-muted">
          Lädt alle Kontakte, Deals, Aktivitäten, Aufgaben, Notizen, Pipelines und Filter als Datei herunter.
        </p>
        <button type="button" className="btn-primary mt-3" onClick={sichern} disabled={pending}>
          <Download size={15} /> Backup herunterladen
        </button>
        {backup && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-win">
            <Check size={15} /> Gespeichert im Ordner „Downloads“: {backup}
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">2. Vorschau Kaltakquise</h2>
        {fertig && !ergebnis && <p className="mt-1 text-sm text-win">Die Kaltakquise hat schon die neuen Phasen.</p>}
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1">Alte Phase</th><th className="py-1 text-right">Deals</th><th className="py-1 pl-4">Wird zu</th></tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.stageId} className="border-t border-line">
                <td className="py-1.5">{z.name}</td>
                <td className="py-1.5 text-right tabular-nums">{z.anzahl}</td>
                <td className="py-1.5 pl-4">
                  {z.regel ? (
                    <span>
                      {z.regel.ziel === 'Faden' ? 'Pipeline Fäden · Erstgespräch' : z.regel.ziel}
                      {z.regel.quelle && <span className="text-muted"> · Quelle {z.regel.quelle}</span>}
                      {z.regel.produkt && <span className="text-muted"> · Produkt {z.regel.produkt}</span>}
                      {z.regel.notiz && <span className="text-muted"> · Notiz „{z.regel.notiz}“</span>}
                    </span>
                  ) : z.anzahl === 0 ? (
                    <span className="text-muted">leer, wird entfernt</span>
                  ) : (
                    <select className="input !w-auto !py-1 text-[13px]" value={zuordnung[z.stageId] ?? ''}
                            onChange={(e) => setZuordnung((m) => ({ ...m, [z.stageId]: e.target.value }))}>
                      <option value="" disabled>– bitte wählen –</option>
                      {ziele.map((n) => <option key={n} value={n}>{n === 'Faden' ? 'Faden (nach Fäden verschieben)' : n}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">
          Zusätzlich: Signal-Hinweis mit „electronica“ ergibt Produkt Messefilm und Anlass electronica 2026.
          Expo-Real-Bezug ergibt Anlass Expo Real 2026. Jede alte Phase wird als Notiz-Aktivität protokolliert.
          Die Pipeline Fäden bekommt die Phase „Geliefert“. Firmen, die der Import vom 28.10. aus
          „electronica 2026“ in die neue Liste verschoben hat, stehen danach wieder in beiden Listen.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">3. Umstellen</h2>
        {!backup && <p className="mt-1 text-sm text-muted">Erst das Backup herunterladen.</p>}
        {backup && offen.length > 0 && <p className="mt-1 text-sm text-warn">Bitte oben für jede markierte Phase ein Ziel wählen.</p>}
        <button type="button" className="btn-primary mt-3" onClick={los}
                disabled={pending || !backup || offen.length > 0 || !!ergebnis}>
          <Play size={15} /> {pending ? 'Läuft …' : 'Umstellung starten'}
        </button>
        {fehler && <p className="mt-2 text-sm text-lose">{fehler}</p>}
      </section>

      {ergebnis && (
        <section className="space-y-4">
          <p className="text-sm text-win">
            Fertig. {ergebnis.nachFaeden} Deals wurden in die Pipeline Fäden verschoben.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Tabelle titel="Deals je Phase (Kaltakquise)" werte={ergebnis.phase} />
            <Tabelle titel="Deals je Quelle" werte={ergebnis.quelle} />
            <Tabelle titel="Deals je Produkt" werte={ergebnis.produkt} />
            <Tabelle titel="Deals je Anlass" werte={ergebnis.anlass} />
          </div>
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Fäden in „Angebot angenommen“ ({ergebnis.angenommen.length})</h3>
            <ul className="space-y-1 text-sm">
              {ergebnis.angenommen.map((d) => (
                <li key={d.id} className="flex justify-between gap-3 border-t border-line pt-1 first:border-0">
                  <span>{d.title}{d.firma && d.firma !== d.title ? <span className="text-muted"> · {d.firma}</span> : null}</span>
                  <span className="tabular-nums">{eur(d.betrag)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
