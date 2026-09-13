'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Phone, PhoneOff, SkipForward, Pause, Play, Check } from 'lucide-react';
import { CALL_KIND_LABEL, CALL_OUTCOME_LABEL } from '@/lib/labels';
import { contactName, eur, duration, phoneOf } from '@/lib/format';
import type { CallKind, CallOutcome, DealWithContact, Stage } from '@/lib/types';
import { dialHref } from '@/lib/dial';

type Props = {
  deals: DealWithContact[];
  stages: Stage[];
  defaultCallKind: CallKind;
  logCall: (input: {
    dealId: string;
    contactId: string | null;
    callKind: string;
    outcome: string;
    durationSeconds: number;
    note: string | null;
    phone: string | null;
    nextStageId: string | null;
    followUpAt: string | null;
  }) => Promise<{ ok: boolean }>;
};

const QUICK: { outcome: CallOutcome; label: string; tone: string }[] = [
  { outcome: 'termin_vereinbart', label: 'Termin vereinbart', tone: 'bg-win text-white' },
  { outcome: 'erreicht', label: 'Erreicht', tone: 'bg-brand text-white' },
  { outcome: 'wiedervorlage', label: 'Wiedervorlage', tone: 'bg-warn text-white' },
  { outcome: 'nicht_erreicht', label: 'Nicht erreicht', tone: 'bg-surface-2 text-ink' },
  { outcome: 'mailbox', label: 'Mailbox', tone: 'bg-surface-2 text-ink' },
  { outcome: 'kein_interesse', label: 'Kein Interesse', tone: 'bg-lose text-white' },
];

export default function PowerDialer({ deals, stages, defaultCallKind, logCall }: Props) {
  const [queue] = useState(deals);
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const [note, setNote] = useState('');
  const [callKind, setCallKind] = useState<CallKind>(defaultCallKind);
  const [outcome, setOutcome] = useState<CallOutcome>('erreicht');
  const [nextStage, setNextStage] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [done, setDone] = useState<{ calls: number; termine: number }>({ calls: 0, termine: 0 });
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = queue[index];

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running]);

  function reset() {
    setSeconds(0);
    setRunning(false);
    setNote('');
    setOutcome('erreicht');
    setNextStage('');
    setFollowUp('');
  }

  function next() {
    reset();
    setIndex((i) => Math.min(i + 1, queue.length));
  }

  function save(chosen?: CallOutcome) {
    if (!current) return;
    const finalOutcome = chosen ?? outcome;
    const payload = {
      dealId: current.id,
      contactId: current.contact_id,
      callKind,
      outcome: finalOutcome,
      durationSeconds: seconds,
      note: note.trim() || null,
      phone: phoneOf(current.contact?.persons),
      nextStageId: nextStage || null,
      followUpAt: followUp ? new Date(followUp).toISOString() : null,
    };

    setDone((d) => ({
      calls: d.calls + 1,
      termine: d.termine + (finalOutcome === 'termin_vereinbart' ? 1 : 0),
    }));

    startTransition(async () => {
      await logCall(payload);
      if (autoNext) next();
      else reset();
    });
  }

  if (!queue.length) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm font-medium">Keine Deals in dieser Phase</p>
        <p className="mt-1 text-sm text-muted">Wähle oben eine andere Phase aus.</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="card p-10 text-center">
        <Check className="mx-auto mb-3 text-win" size={28} />
        <p className="text-sm font-medium">Liste abgearbeitet</p>
        <p className="mt-1 text-sm text-muted">
          {done.calls} Gespräche protokolliert, davon {done.termine} Termine.
        </p>
        <button className="btn-ghost mt-4" onClick={() => { setIndex(0); reset(); }}>
          Von vorn beginnen
        </button>
      </div>
    );
  }

  const phone = phoneOf(current.contact?.persons);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>Deal {index + 1} von {queue.length}</span>
          <span>{done.calls} protokolliert · {done.termine} Termine</span>
        </div>

        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-brand transition-all"
               style={{ width: `${(index / queue.length) * 100}%` }} />
        </div>

        <div className="mt-5">
          <Link href={`/deals/${current.id}`} className="text-lg font-semibold hover:text-brand">
            {current.title}
          </Link>
          <p className="mt-1 text-sm text-muted">
            {contactName(current.contact)}
            {current.contact?.company ? ` · ${current.contact.company}` : ''} · {eur(current.value)}
          </p>
          {current.next_step && (
            <p className="mt-2 text-sm"><span className="text-muted">Nächster Schritt: </span>{current.next_step}</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {phone ? (
            <a href={dialHref(phone)} className="btn-primary"
               onClick={() => { setRunning(true); }}>
              <Phone size={16} /> {phone}
            </a>
          ) : (
            <span className="chip bg-surface-2 text-muted">Keine Telefonnummer hinterlegt</span>
          )}

          <button className="btn-ghost" onClick={() => setRunning((r) => !r)}>
            {running ? <><Pause size={15} /> Timer stopp</> : <><Play size={15} /> Timer start</>}
          </button>
          <span className="tabular-nums text-sm text-muted">{duration(seconds) === '–' ? '0 s' : duration(seconds)}</span>

          <button className="btn-ghost ml-auto" onClick={next}>
            <SkipForward size={15} /> Überspringen
          </button>
        </div>

        <div className="mt-5">
          <p className="label">Ergebnis festhalten</p>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q.outcome}
                disabled={pending}
                onClick={() => save(q.outcome)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${q.tone}`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="dialer-note">Notiz</label>
          <textarea id="dialer-note" className="input min-h-20" value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Einwände, Kontext, Zusagen …" />
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="dialer-kind">Gesprächstyp</label>
          <select id="dialer-kind" className="input" value={callKind}
                  onChange={(e) => setCallKind(e.target.value as CallKind)}>
            {(Object.keys(CALL_KIND_LABEL) as CallKind[]).map((k) => (
              <option key={k} value={k}>{CALL_KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="dialer-outcome">Ergebnis (manuell)</label>
          <select id="dialer-outcome" className="input" value={outcome}
                  onChange={(e) => setOutcome(e.target.value as CallOutcome)}>
            {(Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[]).map((o) => (
              <option key={o} value={o}>{CALL_OUTCOME_LABEL[o]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="dialer-stage">Danach verschieben nach</label>
          <select id="dialer-stage" className="input" value={nextStage}
                  onChange={(e) => setNextStage(e.target.value)}>
            <option value="">– Phase unverändert –</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="dialer-followup">Wiedervorlage am</label>
          <input id="dialer-followup" type="datetime-local" className="input"
                 value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
          Automatisch zum nächsten Deal
        </label>

        <button className="btn-ghost w-full" disabled={pending} onClick={() => save()}>
          <PhoneOff size={15} /> Gespräch speichern
        </button>
      </div>
    </div>
  );
}
