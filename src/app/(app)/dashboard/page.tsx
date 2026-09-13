import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { PageHeader, Stat } from '@/components/ui';
import { FunnelBars, CallsChart } from '@/components/Charts';
import Timeline from '@/components/Timeline';
import TaskList from '@/components/TaskList';
import { eur, pct, contactName } from '@/lib/format';
import { REACHED_OUTCOMES } from '@/lib/labels';
import type { Activity, Deal, Stage, Task } from '@/lib/types';
import { nowMs, nowDate } from '@/lib/clock';

export default async function DashboardPage() {
  const { supabase, orgId, profile } = await ctx();

  const now = nowDate();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const last14 = new Date(nowMs() - 13 * 86400000);
  last14.setHours(0, 0, 0, 0);

  const [
    { data: deals }, { data: pipelines }, { data: activities }, { data: tasks },
  ] = await Promise.all([
    supabase.from('deals').select('*, contact:contacts(company, persons:contact_persons(first_name, last_name))').eq('org_id', orgId),
    supabase.from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position'),
    supabase.from('activities').select('*, user:profiles(full_name, email)')
      .eq('org_id', orgId).gte('occurred_at', last14.toISOString())
      .order('occurred_at', { ascending: false }).limit(400),
    supabase.from('tasks').select('*, deal:deals(id, title)')
      .eq('org_id', orgId).eq('assignee_id', profile.id).eq('done', false)
      .order('due_at', { nullsFirst: false }).limit(8),
  ]);

  const allDeals = (deals ?? []) as (Deal & { contact: { company: string | null; persons: { first_name: string | null; last_name: string | null }[] } | null })[];
  const open = allDeals.filter((d) => d.status === 'offen');
  const wonMonth = allDeals.filter((d) => d.status === 'gewonnen' && d.won_at && d.won_at >= monthStart);
  const lostMonth = allDeals.filter((d) => d.status === 'verloren' && d.lost_at && d.lost_at >= monthStart);
  const closedMonth = wonMonth.length + lostMonth.length;

  const openValue = open.reduce((a, d) => a + Number(d.value || 0), 0);
  const openHint = (pipelines ?? [])
    .map((p) => ({ name: p.name, n: open.filter((d) => d.pipeline_id === p.id).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${x.name}`)
    .join(' · ') || '0 Deals';
  const wonValue = wonMonth.reduce((a, d) => a + Number(d.value || 0), 0);

  const firstPipeline = pipelines?.[0];
  const { data: stages } = firstPipeline
    ? await supabase.from('pipeline_stages').select('*').eq('pipeline_id', firstPipeline.id).order('position')
    : { data: [] };

  const funnel = ((stages ?? []) as Stage[]).map((s) => {
    const inStage = allDeals.filter((d) => d.stage_id === s.id);
    return {
      name: s.name,
      anzahl: inStage.length,
      wert: inStage.reduce((a, d) => a + Number(d.value || 0), 0),
      color: s.color,
    };
  });

  const acts = (activities ?? []) as Activity[];
  const calls = acts.filter((a) => a.type === 'call');
  const todayStr = nowDate().toDateString();
  const callsToday = calls.filter((a) => new Date(a.occurred_at).toDateString() === todayStr);

  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(last14.getTime() + i * 86400000);
    const label = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const dayCalls = calls.filter((a) => new Date(a.occurred_at).toDateString() === d.toDateString());
    return {
      tag: label,
      calls: dayCalls.length,
      erreicht: dayCalls.filter((a) => a.outcome && REACHED_OUTCOMES.includes(a.outcome)).length,
    };
  });

  const hotDeals = [...open]
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title={`Hallo ${profile.full_name?.split(' ')[0] ?? ''}`.trim()}
        subtitle="Überblick über Pipeline, Aktivität und offene Aufgaben"
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Offene Pipeline" value={eur(openValue)} hint={openHint} />
          <Stat label="Gewonnen (Monat)" value={eur(wonValue)} hint={`${wonMonth.length} Abschlüsse`} tone="win" />
          <Stat
            label="Abschlussquote (Monat)"
            value={closedMonth ? pct((wonMonth.length / closedMonth) * 100) : '–'}
            hint={`${wonMonth.length} von ${closedMonth} entschieden`}
          />
          <Stat label="Calls heute" value={String(callsToday.length)}
                hint={`${calls.length} in 14 Tagen`} tone="warn" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h2 className="mb-4 text-sm font-semibold">
              Funnel – {firstPipeline?.name ?? 'Pipeline'}
            </h2>
            {funnel.length ? <FunnelBars data={funnel} /> : <p className="text-sm text-muted">Keine Phasen.</p>}
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Calls der letzten 14 Tage</h2>
            <CallsChart data={daily} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Größte offene Deals</h2>
            {hotDeals.length ? (
              <ul className="space-y-1.5">
                {hotDeals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/pipelines?p=${d.pipeline_id}&open=${d.contact_id ?? ''}`}
                          className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.title}</span>
                        <span className="text-xs text-muted">{contactName(d.contact)}</span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">{eur(d.value)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">Keine offenen Deals.</p>}
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Deine nächsten Aufgaben</h2>
            <TaskList tasks={(tasks ?? []) as (Task & { deal: { id: string; title: string } | null })[]} showContext />
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Letzte Aktivitäten</h2>
          <Timeline activities={acts.slice(0, 10)} />
        </section>
      </div>
    </>
  );
}
