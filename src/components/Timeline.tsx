'use client';

import { useRef, useState } from 'react';
import {
  Phone, StickyNote, Mail, CalendarDays, MessageCircle, CheckSquare, Share2, Trash2, X,
} from 'lucide-react';
import { ACTIVITY_TYPE_LABEL, CALL_KIND_LABEL, CALL_OUTCOME_LABEL } from '@/lib/labels';
import { dateTime, duration } from '@/lib/format';
import { Badge } from '@/components/Badge';
import { sanitizeHtml } from '@/lib/sanitize';
import { updateActivity, deleteActivity } from '@/app/actions/crm';
import FollowUpPicker from '@/components/FollowUpPicker';
import type { Activity, ActivityType, CallKind, CallOutcome } from '@/lib/types';

const ICON: Record<ActivityType, typeof Phone> = {
  call: Phone, note: StickyNote, email: Mail,
  meeting: CalendarDays, whatsapp: MessageCircle, linkedin: Share2, task: CheckSquare,
};

const POSITIVE = ['termin_vereinbart', 'abgeschlossen', 'erreicht'];
const NEGATIVE = ['kein_interesse', 'verloren', 'falsche_nummer', 'no_show'];

type Row = Activity & { user?: { full_name: string | null; email: string | null } | null };

/** Notizen aus dem Call-Flow sind Rich-Text, alles andere einfacher Text. */
const istHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);

const pad = (n: number) => String(n).padStart(2, '0');
const teileDatum = (iso: string) => {
  const d = new Date(iso);
  return {
    datum: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    zeit: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

function EditForm({ a, onDone }: { a: Row; onDone: () => void }) {
  const editor = useRef<HTMLDivElement>(null);
  const { datum, zeit } = teileDatum(a.occurred_at);
  const html = istHtml(a.body ?? '');

  return (
    <form
      className="space-y-3"
      action={async (fd) => {
        if (html) fd.set('body', sanitizeHtml(editor.current?.innerHTML ?? ''));
        await updateActivity(fd);
        onDone();
      }}
    >
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="type" value={a.type} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`d-${a.id}`}>Datum</label>
          <input id={`d-${a.id}`} name="date" type="date" className="input" defaultValue={datum} />
        </div>
        <div>
          <label className="label" htmlFor={`t-${a.id}`}>Uhrzeit</label>
          <input id={`t-${a.id}`} name="time" type="time" className="input" defaultValue={zeit} />
        </div>
      </div>

      {a.type === 'call' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`k-${a.id}`}>Gesprächstyp</label>
            <select id={`k-${a.id}`} name="call_kind" className="input" defaultValue={a.call_kind ?? ''}>
              <option value="">–</option>
              {(Object.keys(CALL_KIND_LABEL) as CallKind[]).map((k) => (
                <option key={k} value={k}>{CALL_KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`o-${a.id}`}>Ergebnis</label>
            <select id={`o-${a.id}`} name="outcome" className="input" defaultValue={a.outcome ?? ''}>
              <option value="">–</option>
              {(Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[]).map((o) => (
                <option key={o} value={o}>{CALL_OUTCOME_LABEL[o]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`a-${a.id}`}>Wer hat abgenommen?</label>
            <select id={`a-${a.id}`} name="answered_by" className="input" defaultValue={a.answered_by ?? ''}>
              <option value="">–</option>
              <option value="gatekeeper">Gatekeeper</option>
              <option value="entscheider">Entscheider</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`m-${a.id}`}>Dauer (Min.)</label>
            <input id={`m-${a.id}`} name="duration_minutes" className="input" inputMode="numeric"
                   defaultValue={a.duration_seconds ? Math.round(a.duration_seconds / 60) : ''} />
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor={`s-${a.id}`}>Betreff</label>
        <input id={`s-${a.id}`} name="subject" className="input" defaultValue={a.subject ?? ''} />
      </div>

      <div>
        <p className="label">Notiz</p>
        {html ? (
          <div ref={editor} contentEditable suppressContentEditableWarning
               className="input min-h-24 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc"
               dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.body ?? '') }} />
        ) : (
          <textarea name="body" className="input min-h-24" defaultValue={a.body ?? ''} />
        )}
      </div>

      <FollowUpPicker />

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary !py-2 text-[13px]">Speichern</button>
        <button type="button" className="btn-ghost !py-2 text-[13px]" onClick={onDone}>
          <X size={14} /> Abbrechen
        </button>
      </div>
    </form>
  );
}

export default function Timeline({
  activities, editable, onChanged,
}: { activities: Row[]; editable?: boolean; onChanged?: () => void }) {
  const [editId, setEditId] = useState<string | null>(null);

  if (!activities.length) {
    return <p className="px-1 py-6 text-sm text-muted">Noch keine Aktivitäten erfasst.</p>;
  }

  return (
    <ol className="space-y-3">
      {activities.map((a) => {
        const Icon = ICON[a.type] ?? StickyNote;
        const tone = a.outcome
          ? POSITIVE.includes(a.outcome) ? 'win' : NEGATIVE.includes(a.outcome) ? 'lose' : 'muted'
          : 'muted';

        if (editable && editId === a.id) {
          return (
            <li key={a.id} className="card p-3.5">
              <EditForm a={a} onDone={() => { setEditId(null); onChanged?.(); }} />
            </li>
          );
        }

        return (
          <li key={a.id} className="card flex gap-3 p-3.5">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
              <Icon size={15} />
            </span>

            <Inhalt a={a} tone={tone} editable={editable} onEdit={() => setEditId(a.id)} />

            {editable && (
              <form action={async (fd) => { await deleteActivity(fd); onChanged?.(); }}>
                <input type="hidden" name="id" value={a.id} />
                <button className="text-muted hover:text-lose" aria-label="Aktivität löschen"
                        onClick={(e) => { if (!window.confirm('Diese Aktivität löschen?')) e.preventDefault(); }}>
                  <Trash2 size={15} />
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Inhalt({
  a, tone, editable, onEdit,
}: { a: Row; tone: string; editable?: boolean; onEdit: () => void }) {
  const inhalt = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {a.type === 'call' && a.call_kind ? CALL_KIND_LABEL[a.call_kind] : ACTIVITY_TYPE_LABEL[a.type]}
        </span>
        {a.outcome && <Badge tone={tone as 'win' | 'lose' | 'muted'}>{CALL_OUTCOME_LABEL[a.outcome]}</Badge>}
        {a.duration_seconds ? <span className="text-xs text-muted">{duration(a.duration_seconds)}</span> : null}
        {a.answered_by && <Badge>{a.answered_by === 'gatekeeper' ? 'Gatekeeper' : 'Entscheider'}</Badge>}
        <span className="ml-auto text-xs text-muted">{dateTime(a.occurred_at)}</span>
      </div>
      {a.subject && <p className="mt-1 text-sm">{a.subject}</p>}
      {a.body && (istHtml(a.body)
        ? <div className="mt-1 text-sm text-muted [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc"
               dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.body) }} />
        : <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{a.body}</p>)}
      {a.user && <p className="mt-1.5 text-xs text-muted">{a.user.full_name || a.user.email}</p>}
    </>
  );

  if (!editable) return <div className="min-w-0 flex-1">{inhalt}</div>;

  // Bewusst kein <button>: der Notiztext kann Links enthalten, und ein
  // Link in einem Knopf ist ungueltiges HTML.
  return (
    <div role="button" tabIndex={0} onClick={onEdit} title="Aktivität bearbeiten"
         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } }}
         className="min-w-0 flex-1 cursor-pointer rounded-md text-left transition hover:bg-surface-2/60">
      {inhalt}
    </div>
  );
}
