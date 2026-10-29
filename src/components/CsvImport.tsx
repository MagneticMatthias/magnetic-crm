'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ArrowRight, Check, AlertTriangle } from 'lucide-react';
import { parseCsv, guessMapping, IMPORT_FIELDS, type ImportFieldKey, type ParsedCsv } from '@/lib/csv';
import { importRows, type ImportResult, type ImportRow } from '@/app/actions/import';
import { LEAD_SOURCES } from '@/lib/labels';

type StageOption = { id: string; label: string };

export default function CsvImport({ stageOptions }: { stageOptions: StageOption[] }) {
  const router = useRouter();
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<number, ImportFieldKey | ''>>({});
  const [leadSource, setLeadSource] = useState('');
  // Vorauswahl: Kaltakquise -> Offen, sonst die erste Phase
  const [stageId, setStageId] = useState(
    stageOptions.find((o) => /kaltakquise/i.test(o.label) && /offen$/i.test(o.label))?.id ?? stageOptions[0]?.id ?? '');
  const [ziehen, setZiehen] = useState(false);
  const pipelineZiele = useMemo(() => {
    const m = new Map<string, StageOption>();
    for (const o of stageOptions) {
      const [pipe, phase] = o.label.split(' → ');
      const bisher = m.get(pipe);
      if (!bisher || (/^offen$/i.test(phase ?? '') && !/ → offen$/i.test(bisher.label))) m.set(pipe, o);
    }
    return [...m.entries()].map(([pipe, o]) => ({ id: o.id, label: `${pipe} (Phase ${o.label.split(' → ')[1]})` }));
  }, [stageOptions]);
  const duplicates = 'replace' as const;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFile(file: File) {
    const text = await file.text();
    const p = parseCsv(text);
    setFileName(file.name);
    setParsed(p);
    setMapping(guessMapping(p.headers));
    setResult(null);
    if (!leadSource) setLeadSource(file.name.replace(/\.(csv|txt|tsv)$/i, ''));
  }

  const rows: ImportRow[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((r) => {
      const obj: ImportRow = {};
      Object.entries(mapping).forEach(([idx, key]) => {
        if (key) obj[key] = r[Number(idx)] ?? '';
      });
      return obj;
    });
  }, [parsed, mapping]);

  const mapped = Object.values(mapping).filter(Boolean);
  const hasIdentity = mapped.some((k) => ['company', 'full_name', 'last_name', 'email'].includes(k as string));

  async function run() {
    if (!parsed) return;
    setBusy(true);
    setResult(null);
    const total: ImportResult = { created: 0, deals: 0, skipped: 0, merged: 0, moved: 0, enriched: [], errors: [] };
    const chunk = 50;
    for (let i = 0; i < rows.length; i += chunk) {
      const part = await importRows({
        rows: rows.slice(i, i + chunk), leadSource: leadSource.trim() || 'Import',
        stageId: stageId || null, duplicates,
      });
      total.created += part.created; total.deals += part.deals; total.skipped += part.skipped;
      total.merged += part.merged; total.moved += part.moved; total.enriched.push(...part.enriched); total.errors.push(...part.errors);
      setProgress(Math.min(100, Math.round(((i + chunk) / rows.length) * 100)));
    }
    setResult(total);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Schritt 1: Datei */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">1. Datei auswählen</h2>
        <p className="mt-1 text-sm text-muted">CSV oder aus Excel „Speichern unter → CSV UTF-8“. Trennzeichen wird automatisch erkannt.</p>
        <label
          onDragOver={(e) => { e.preventDefault(); setZiehen(true); }}
          onDragLeave={() => setZiehen(false)}
          onDrop={(e) => {
            e.preventDefault();
            setZiehen(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void onFile(f);
          }}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition hover:border-brand hover:bg-brand-soft/30 ${ziehen ? 'border-brand bg-brand-soft/40' : 'border-line'}`}>
          <Upload size={22} className="text-brand" />
          <span className="text-sm font-medium">{fileName || 'Datei hierher ziehen oder klicken'}</span>
          {parsed && <span className="text-xs text-muted">{parsed.rows.length} Zeilen · {parsed.headers.length} Spalten</span>}
          <input type="file" accept=".csv,.txt,.tsv,text/csv" className="hidden"
                 onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      </section>

      {parsed && (
        <>
          {/* Schritt 2: Spalten zuordnen */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold">2. Spalten zuordnen</h2>
            <p className="mt-1 text-sm text-muted">Ich habe die Spalten vorbelegt – bitte prüfen. Nicht benötigte Spalten auf „– ignorieren –“ lassen.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-surface-2/60">
                  <tr>
                    <th className="th">Spalte in Datei</th>
                    <th className="th">Beispiel</th>
                    <th className="th">Wird zu</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.headers.map((h, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="td font-medium">{h || <span className="text-muted">Spalte {i + 1}</span>}</td>
                      <td className="td max-w-[240px] truncate text-muted">{parsed.rows[0]?.[i] ?? ''}</td>
                      <td className="td">
                        <select className="input !py-1.5" value={mapping[i] ?? ''}
                                onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value as ImportFieldKey | '' }))}>
                          <option value="">– ignorieren –</option>
                          {IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!hasIdentity && (
              <p className="mt-3 flex items-center gap-2 text-sm text-warn">
                <AlertTriangle size={15} /> Mindestens Firmenname, Name oder E-Mail zuordnen.
              </p>
            )}
          </section>

          {/* Schritt 3: Ziel */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold">3. Name der Liste</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="imp-source">So heißt die Liste im CRM</label>
                <input id="imp-source" className="input" list="imp-sources" value={leadSource}
                       onChange={(e) => setLeadSource(e.target.value)} placeholder="z. B. electronica 2026 Signale" />
                <datalist id="imp-sources">{LEAD_SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div>
                <label className="label" htmlFor="imp-stage">Die Firmen landen in</label>
                <select id="imp-stage" className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
                  {pipelineZiele.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">
              Firmen, die schon im CRM sind, werden nicht doppelt angelegt. Sie stehen danach in ihrer alten und in dieser Liste, mit allen Anrufen und Notizen.
            </p>
          </section>

          {/* Schritt 4: Los */}
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">4. Importieren</h2>
                <p className="mt-1 text-sm text-muted">{rows.length} Zeilen bereit.</p>
              </div>
              <button type="button" className="btn-primary" disabled={busy || !hasIdentity || rows.length === 0} onClick={run}>
                {busy ? `Importiere … ${progress} %` : <><ArrowRight size={16} /> {rows.length} Zeilen importieren</>}
              </button>
            </div>
            {busy && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            {result && (
              <div className="mt-4 rounded-lg bg-win/10 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium text-win"><Check size={16} /> Import abgeschlossen</p>
                <p className="mt-1">{result.created + result.moved} Firmen in der Liste · davon {result.created} neu und {result.moved} auch in einer anderen Liste{result.skipped ? ` · ${result.skipped} leere Zeilen übersprungen` : ''}</p>
                {result.enriched.length > 0 && (
                  <p className="mt-1 text-muted">Signal ergänzt bei: {result.enriched.join(', ')}</p>
                )}
                {result.errors.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-lose">
                    {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                    {result.errors.length > 10 && <li>… und {result.errors.length - 10} weitere</li>}
                  </ul>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
