'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trash2, Building2, Pencil, X } from 'lucide-react';
import { toggleTask, deleteTask, updateTask } from '@/app/actions/crm';
import { dateTime } from '@/lib/format';
import { nowMs } from '@/lib/clock';
import type { Task } from '@/lib/types';

type Row = Task & {
  deal?: { id: string; title: string } | null;
  contact?: { id: string; company: string | null } | null;
};

const PRIORITY = ['', 'Hoch', 'Mittel', 'Niedrig'];

/** datetime-local erwartet lokale Zeit ohne Zonen-Angabe. */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function TaskRow({ t, now, showContext, showContact }: {
  t: Row; now: number; showContext?: boolean;
  /** Firma in der Zeile nennen (Terminansicht); in der Firmenansicht steht sie in der Ueberschrift. */
  showContact?: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const overdue = !t.done && t.due_at && new Date(t.due_at).getTime() < now;

  if (edit) {
    return (
      <li className="card p-3">
        <form action={async (fd) => { await updateTask(fd); setEdit(false); }} className="space-y-2">
          <input type="hidden" name="id" value={t.id} />
          <textarea name="title" className="input min-h-16 text-sm" defaultValue={t.title} required />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[190px] flex-1">
              <label className="label" htmlFor={`due-${t.id}`}>Fällig am</label>
              <input id={`due-${t.id}`} name="due_at" type="datetime-local" className="input"
                     defaultValue={toLocalInput(t.due_at)} />
            </div>
            <div className="w-32">
              <label className="label" htmlFor={`prio-${t.id}`}>Priorität</label>
              <select id={`prio-${t.id}`} name="priority" className="input" defaultValue={String(t.priority)}>
                <option value="1">Hoch</option>
                <option value="2">Mittel</option>
                <option value="3">Niedrig</option>
              </select>
            </div>
            <button className="btn-primary !py-2 text-[13px]">Speichern</button>
            <button type="button" className="btn-ghost !py-2 text-[13px]" onClick={() => setEdit(false)}>
              <X size={14} /> Abbrechen
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="card flex items-start gap-3 p-3">
      <form action={toggleTask} className="pt-0.5">
        <input type="hidden" name="id" value={t.id} />
        <input type="hidden" name="done" value={String(t.done)} />
        <button aria-label={t.done ? 'Als offen markieren' : 'Als erledigt markieren'}
                className={`grid h-5 w-5 place-items-center rounded border transition
                            ${t.done ? 'border-win bg-win text-white' : 'border-line hover:border-brand'}`}>
          {t.done ? '✓' : ''}
        </button>
      </form>

      {/* Ganze Zeile oeffnet die Bearbeitung, nicht nur der Stift. Kein
          <button>, weil der Firmenlink darin ein eigenes Ziel hat. */}
      <div role="button" tabIndex={0} onClick={() => setEdit(true)}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEdit(true); } }}
           className="group min-w-0 flex-1 cursor-pointer rounded-md text-left transition hover:bg-surface-2/60"
           title="Aufgabe bearbeiten">
        <p className={`text-sm ${t.done ? 'text-muted line-through' : 'font-medium'}`}>{t.title}</p>
        {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className={overdue ? 'font-medium text-lose' : ''}>
            {t.due_at ? dateTime(t.due_at) : 'ohne Frist'}
          </span>
          <span>· {PRIORITY[t.priority] ?? 'Mittel'}</span>
          {showContact && t.contact && (
            <Link href={`/kontakte?open=${t.contact.id}`} onClick={(e) => e.stopPropagation()}
                  className="inline-flex min-w-0 items-center gap-1 font-medium text-brand hover:underline"
                  title="Kontakt öffnen">
              <Building2 size={12} className="shrink-0" />
              <span className="truncate">{t.contact.company || 'Kontakt'}</span>
            </Link>
          )}
          {showContext && !t.contact && t.deal && <span className="truncate">· {t.deal.title}</span>}
          <Pencil size={11} className="opacity-0 transition group-hover:opacity-100" />
        </span>
      </div>

      <form action={deleteTask} className="shrink-0">
        <input type="hidden" name="id" value={t.id} />
        <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-lose/10 hover:text-lose"
                aria-label="Aufgabe löschen" title="Aufgabe löschen"
                onClick={(e) => { if (!window.confirm('Diese Aufgabe löschen?')) e.preventDefault(); }}>
          <Trash2 size={16} />
        </button>
      </form>
    </li>
  );
}

const TAG = 86400000;

/** Zeitblock einer Aufgabe, gemessen am Ende des heutigen Tages. */
function zeitBlock(t: Row, heuteEnde: number): string {
  if (t.done) return 'Erledigt';
  if (!t.due_at) return 'Ohne Frist';
  const d = new Date(t.due_at).getTime();
  if (d < heuteEnde - TAG) return 'Überfällig';
  if (d < heuteEnde) return 'Heute';
  if (d < heuteEnde + 6 * TAG) return 'Diese Woche';
  return 'Später';
}

const BLOCK_REIHE = ['Überfällig', 'Heute', 'Diese Woche', 'Später', 'Ohne Frist', 'Erledigt'];

export default function TaskList({
  tasks, showContext, groupBy = 'kontakt',
}: { tasks: Row[]; showContext?: boolean; groupBy?: 'kontakt' | 'zeit' }) {
  const now = nowMs();
  if (!tasks.length) return <p className="px-1 py-4 text-sm text-muted">Keine offenen Aufgaben.</p>;

  // Im Kontakt-Panel gehoeren ohnehin alle Aufgaben zur selben Firma.
  if (!showContext) {
    return (
      <ul className="space-y-2">
        {tasks.map((t) => <TaskRow key={t.id} t={t} now={now} />)}
      </ul>
    );
  }

  if (groupBy === 'zeit') {
    const heute = new Date(now);
    heute.setHours(23, 59, 59, 999);
    const heuteEnde = heute.getTime();

    const bloecke = new Map<string, Row[]>();
    for (const t of tasks) {
      const key = zeitBlock(t, heuteEnde);
      bloecke.set(key, [...(bloecke.get(key) ?? []), t]);
    }

    return (
      <div className="space-y-5">
        {BLOCK_REIHE.filter((b) => bloecke.get(b)?.length).map((b) => (
          <div key={b}>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span className={`text-sm font-semibold ${b === 'Überfällig' ? 'text-lose' : b === 'Heute' ? 'text-warn' : 'text-muted'}`}>
                {b}
              </span>
              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                {bloecke.get(b)!.length}
              </span>
            </div>
            <ul className="space-y-2">
              {bloecke.get(b)!.map((t) => <TaskRow key={t.id} t={t} now={now} showContext showContact />)}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  // Nach Firma buendeln: drei Wiedervorlagen zum selben Kunden sind ein
  // Vorgang, keine drei Zeilen quer durch die Liste.
  const gruppen = new Map<string, { titel: string; kontaktId: string | null; tasks: Row[] }>();
  for (const t of tasks) {
    const key = t.contact?.id ?? 'ohne';
    const g = gruppen.get(key) ?? {
      titel: t.contact?.company || (t.contact ? 'Kontakt' : 'Ohne Kontakt'),
      kontaktId: t.contact?.id ?? null,
      tasks: [],
    };
    g.tasks.push(t);
    gruppen.set(key, g);
  }

  // Reihenfolge: naechste Frist zuerst, dann ohne Frist, ganz unten erledigt.
  // (Infinity - 1 waere wieder Infinity, deshalb echte Zahlen.)
  const OHNE_FRIST = Number.MAX_SAFE_INTEGER - 1;
  const frist = (t: Row) =>
    t.done ? Number.MAX_SAFE_INTEGER : t.due_at ? new Date(t.due_at).getTime() : OHNE_FRIST;
  const sortiert = [...gruppen.values()]
    .map((g) => ({ ...g, tasks: [...g.tasks].sort((a, b) => frist(a) - frist(b)) }))
    .sort((a, b) => frist(a.tasks[0]) - frist(b.tasks[0]));

  return (
    <div className="space-y-5">
      {sortiert.map((g) => (
        <div key={g.kontaktId ?? 'ohne'}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            {g.kontaktId ? (
              <Link href={`/kontakte?open=${g.kontaktId}`}
                    className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
                <Building2 size={14} className="shrink-0" />
                <span className="truncate">{g.titel}</span>
              </Link>
            ) : (
              <span className="text-sm font-semibold text-muted">{g.titel}</span>
            )}
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
              {g.tasks.filter((t) => !t.done).length}
            </span>
          </div>
          <ul className="space-y-2">
            {g.tasks.map((t) => <TaskRow key={t.id} t={t} now={now} showContext />)}
          </ul>
        </div>
      ))}
    </div>
  );
}
