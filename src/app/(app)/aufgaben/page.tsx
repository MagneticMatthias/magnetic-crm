import { ctx } from '@/lib/ctx';
import { PageHeader, Stat } from '@/components/ui';
import TaskList from '@/components/TaskList';
import TaskComposer from '@/components/TaskComposer';
import { createTask } from '@/app/actions/crm';
import type { Profile, Task } from '@/lib/types';
import { nowMs, nowDate } from '@/lib/clock';

type Row = Task & {
  deal: { id: string; title: string } | null;
  contact: { id: string; company: string | null;
             persons?: { first_name: string | null; last_name: string | null; is_primary: boolean }[] } | null;
};

export default async function TasksPage({
  searchParams,
}: { searchParams: Promise<{ f?: string; g?: string }> }) {
  const { f, g } = await searchParams;
  // Standard ist die zeitliche Sicht: sie beantwortet "was steht an".
  const nachFirma = g === 'firma';
  const { supabase, orgId, profile } = await ctx();
  const mine = f !== 'alle';

  let query = supabase
    .from('tasks')
    .select('*, deal:deals(id, title), contact:contacts(id, company, persons:contact_persons(first_name, last_name, is_primary))')
    .eq('org_id', orgId)
    .order('done')
    .order('due_at', { nullsFirst: false })
    .limit(200);
  if (mine) query = query.eq('assignee_id', profile.id);

  const [{ data: tasks }, { data: team }] = await Promise.all([
    query,
    supabase.from('profiles').select('*').eq('org_id', orgId).eq('active', true),
  ]);

  const rows = (tasks ?? []) as Row[];
  const open = rows.filter((t) => !t.done);
  const now = nowMs();
  const overdue = open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const today = open.filter((t) => {
    if (!t.due_at) return false;
    const d = new Date(t.due_at);
    return d.toDateString() === nowDate().toDateString();
  });

  return (
    <>
      <PageHeader title="Aufgaben" subtitle={mine ? 'Deine Aufgaben' : 'Alle Aufgaben im Team'}>
        <a href={`/aufgaben?${new URLSearchParams({ ...(nachFirma ? { g: 'firma' } : {}) })}`}
           className={mine ? 'btn-primary' : 'btn-ghost'}>Meine</a>
        <a href={`/aufgaben?${new URLSearchParams({ f: 'alle', ...(nachFirma ? { g: 'firma' } : {}) })}`}
           className={mine ? 'btn-ghost' : 'btn-primary'}>Team</a>
        <span className="mx-1 h-6 w-px bg-line" />
        <a href={`/aufgaben?${new URLSearchParams({ ...(mine ? {} : { f: 'alle' }) })}`}
           className={nachFirma ? 'btn-ghost' : 'btn-primary'}>Nach Termin</a>
        <a href={`/aufgaben?${new URLSearchParams({ ...(mine ? {} : { f: 'alle' }), g: 'firma' })}`}
           className={nachFirma ? 'btn-primary' : 'btn-ghost'}>Nach Firma</a>
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Offen" value={String(open.length)} />
          <Stat label="Heute fällig" value={String(today.length)} tone="warn" />
          <Stat label="Überfällig" value={String(overdue.length)} tone={overdue.length ? 'lose' : 'default'} />
        </div>

        <TaskComposer action={createTask} team={(team ?? []) as Profile[]} />
        <TaskList tasks={rows} showContext groupBy={nachFirma ? 'kontakt' : 'zeit'} />
      </div>
    </>
  );
}
