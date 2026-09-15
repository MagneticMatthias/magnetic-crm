'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, Monitor, RefreshCw, Calendar, Clock, Bold, Italic, Underline, Strikethrough, List, ListOrdered } from 'lucide-react';
import { CALL_KIND_LABEL, CALL_OUTCOME_LABEL } from '@/lib/labels';
import FollowUpPicker from '@/components/FollowUpPicker';
import type { CallKind, CallOutcome, Stage } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

/**
 * Call-Flow Tracking: erscheint oben im Panel, sobald ein Anruf gestartet
 * oder ueber das Zahnrad geoeffnet wird. Timer laeuft mit, Notizen sind
 * Rich-Text, Ergebnis kann die Deal-Phase weiterschieben.
 */
export default function CallFlowCard({
  name, phone, contactId, dealId, stages, defaultKind = 'opening', autoStart, onSave, onClose,
}: {
  name: string;
  phone: string | null | undefined;
  contactId: string;
  dealId?: string | null;
  stages?: Stage[];
  defaultKind?: CallKind;
  autoStart?: boolean;
  onSave: (fd: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const now = new Date();
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(Boolean(autoStart));
  const [kind, setKind] = useState<CallKind>(defaultKind);
  const [answered, setAnswered] = useState<'gatekeeper' | 'entscheider' | ''>('');
  const [outcome, setOutcome] = useState<CallOutcome>('erreicht');
  const [date, setDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [time, setTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [busy, setBusy] = useState(false);
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const setNow = () => {
    const d = new Date();
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const exec = (cmd: string, value?: string) => { editor.current?.focus(); document.execCommand(cmd, false, value); };

  return (
    <section className="card overflow-hidden border-brand/40">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
            {phone && <span className="flex items-center gap-1"><Phone size={12} /> {phone}</span>}
            <span className="flex items-center gap-1"><Monitor size={12} /> Aktueller Browser</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          className={`chip tabular-nums ${running ? 'bg-win/15 text-win' : 'bg-surface-2 text-muted'}`}
          title={running ? 'Timer anhalten' : 'Timer starten'}
        >
          <Phone size={12} /> {fmt(seconds)}
        </button>
      </div>

      <form
        className="space-y-4 px-5 py-4"
        action={async (fd) => {
          setBusy(true);
          try {
            fd.set('body', editor.current?.innerHTML ?? '');
            fd.set('duration_seconds', String(seconds));
            await onSave(fd);
            onClose();
          } finally { setBusy(false); }
        }}
      >
        <input type="hidden" name="type" value="call" />
        <input type="hidden" name="contact_id" value={contactId} />
        {dealId && <input type="hidden" name="deal_id" value={dealId} />}
        {phone && <input type="hidden" name="phone_number" value={phone} />}
        <input type="hidden" name="answered_by" value={answered} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cf-kind">Anruf-Typ <span className="text-lose">*</span></label>
            <div className="input flex !cursor-default items-center gap-2">
              <Phone size={13} className="text-muted" />
              <select id="cf-kind" name="call_kind" className="w-full bg-transparent outline-none"
                      value={kind} onChange={(e) => setKind(e.target.value as CallKind)}>
                {(Object.keys(CALL_KIND_LABEL) as CallKind[]).map((k) => (
                  <option key={k} value={k}>{CALL_KIND_LABEL[k].replace(' Call', '-Call')}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className="label">Wer hat abgenommen?</p>
            <div className="grid grid-cols-2 gap-2">
              {([['gatekeeper', 'Gatekeeper'], ['entscheider', 'Entscheider']] as const).map(([v, l]) => (
                <button key={v} type="button"
                        onClick={() => setAnswered((a) => (a === v ? '' : v))}
                        className={`rounded-lg border px-3 py-2 text-sm transition ${
                          answered === v ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface-2/60 text-muted hover:text-ink'
                        }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="cf-date">Datum</label>
            <div className="relative">
              <input id="cf-date" name="date" type="date" className="input pr-9" value={date} onChange={(e) => setDate(e.target.value)} />
              <Calendar size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="cf-time">Uhrzeit</label>
              <button type="button" onClick={setNow} className="mb-1.5 flex items-center gap-1 text-xs text-brand hover:underline">
                <RefreshCw size={11} /> Jetzt
              </button>
            </div>
            <div className="relative">
              <input id="cf-time" name="time" type="time" className="input pr-9" value={time} onChange={(e) => setTime(e.target.value)} />
              <Clock size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="cf-outcome">Ergebnis</label>
            <select id="cf-outcome" name="outcome" className="input" value={outcome}
                    onChange={(e) => setOutcome(e.target.value as CallOutcome)}>
              {(Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[]).map((o) => (
                <option key={o} value={o}>{CALL_OUTCOME_LABEL[o]}</option>
              ))}
            </select>
          </div>

          {stages && stages.length > 0 && (
            <div>
              <label className="label" htmlFor="cf-stage">Deal danach verschieben nach</label>
              <select id="cf-stage" name="next_stage_id" className="input" defaultValue="">
                <option value="">– automatisch aus dem Ergebnis –</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <FollowUpPicker />

        <div>
          <p className="label">Notizen</p>
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex items-center gap-0.5 border-b border-line bg-surface-2/50 px-2 py-1">
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'h1'); }}
                      className="grid h-7 min-w-7 place-items-center rounded px-1 text-[11px] font-semibold text-muted hover:bg-surface hover:text-ink">H1</button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'h2'); }}
                      className="grid h-7 min-w-7 place-items-center rounded px-1 text-[11px] font-semibold text-muted hover:bg-surface hover:text-ink">H2</button>
              <span className="mx-1 h-4 w-px bg-line" />
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface hover:text-ink"><Bold size={14} /></button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface hover:text-ink"><Italic size={14} /></button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('underline'); }}
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface hover:text-ink"><Underline size={14} /></button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('strikeThrough'); }}
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface hover:text-ink"><Strikethrough size={14} /></button>
              <span className="mx-1 h-4 w-px bg-line" />
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface hover:text-ink"><List size={14} /></button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }}
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface hover:text-ink"><ListOrdered size={14} /></button>
            </div>
            <div ref={editor} contentEditable suppressContentEditableWarning
                 className="min-h-[120px] px-3 py-2.5 text-sm outline-none [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-ghost !border-0" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Speichern …' : 'Anruf speichern'}</button>
        </div>
      </form>
    </section>
  );
}
