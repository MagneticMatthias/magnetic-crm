import { toggleTask, deleteTask } from '@/app/actions/crm';
import { dateTime } from '@/lib/format';
import { Trash2 } from 'lucide-react';
import type { Task } from '@/lib/types';
import { nowMs } from '@/lib/clock';

type Row = Task & {
  deal?: { id: string; title: string } | null;
  contact?: { id: string; first_name: string | null; last_name: string | null } | null;
};

const PRIORITY = ['', 'Hoch', 'Mittel', 'Niedrig'];

export default function TaskList({ tasks, showContext }: { tasks: Row[]; showContext?: boolean }) {
  if (!tasks.length) return <p className="px-1 py-4 text-sm text-muted">Keine offenen Aufgaben.</p>;

  const now = nowMs();

  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const overdue = !t.done && t.due_at && new Date(t.due_at).getTime() < now;
        return (
          <li key={t.id} className="card flex items-start gap-3 p-3">
            <form action={toggleTask} className="pt-0.5">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="done" value={String(t.done)} />
              <button aria-label={t.done ? 'Als offen markieren' : 'Als erledigt markieren'}
                      className={`grid h-5 w-5 place-items-center rounded border transition
                                  ${t.done ? 'border-win bg-win text-white' : 'border-line hover:border-brand'}`}>
                {t.done ? '✓' : ''}
              </button>
            </form>

            <div className="min-w-0 flex-1">
              <p className={`text-sm ${t.done ? 'text-muted line-through' : 'font-medium'}`}>{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className={overdue ? 'font-medium text-lose' : ''}>
                  {t.due_at ? dateTime(t.due_at) : 'ohne Frist'}
                </span>
                <span>· {PRIORITY[t.priority] ?? 'Mittel'}</span>
                {showContext && t.deal && <span className="truncate">· {t.deal.title}</span>}
              </div>
            </div>

            <form action={deleteTask}>
              <input type="hidden" name="id" value={t.id} />
              <button className="text-muted hover:text-lose" aria-label="Aufgabe löschen">
                <Trash2 size={15} />
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
