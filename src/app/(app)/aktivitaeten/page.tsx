import { ctx } from '@/lib/ctx';
import { PageHeader, Stat } from '@/components/ui';
import Timeline from '@/components/Timeline';
import { CALL_KIND_LABEL, REACHED_OUTCOMES } from '@/lib/labels';
import { pct } from '@/lib/format';
import type { Activity, CallKind } from '@/lib/types';
import { daysAgoIso } from '@/lib/clock';

export default async function ActivitiesPage({
  searchParams,
}: { searchParams: Promise<{ typ?: string; tage?: string }> }) {
  const { typ, tage } = await searchParams;
  const { supabase, orgId } = await ctx();

  const days = Number(tage ?? 30);
  const since = daysAgoIso(days);

  let query = supabase
    .from('activities')
    .select('*, user:profiles(full_name, email)')
    .eq('org_id', orgId)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(200);
  if (typ && typ !== 'alle') query = query.eq('type', typ);

  const { data } = await query;
  const rows = (data ?? []) as Activity[];

  const calls = rows.filter((a) => a.type === 'call');
  const reached = calls.filter((a) => a.outcome && REACHED_OUTCOMES.includes(a.outcome));
  const talkTime = calls.reduce((sum, a) => sum + (a.duration_seconds ?? 0), 0);

  const filters = [
    { key: 'alle', label: 'Alle' },
    { key: 'call', label: 'Anrufe' },
    { key: 'email', label: 'E-Mails' },
    { key: 'meeting', label: 'Termine' },
    { key: 'note', label: 'Notizen' },
  ];

  return (
    <>
      <PageHeader title="Aktivitäten" subtitle={`Letzte ${days} Tage`}>
        {[7, 30, 90].map((d) => (
          <a key={d} href={`/aktivitaeten?typ=${typ ?? 'alle'}&tage=${d}`}
             className={d === days ? 'btn-primary' : 'btn-ghost'}>{d} T</a>
        ))}
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Aktivitäten" value={String(rows.length)} />
          <Stat label="Calls" value={String(calls.length)} />
          <Stat label="Kontaktquote"
                value={calls.length ? pct((reached.length / calls.length) * 100) : '–'}
                hint="erreichte Gespräche je Anruf" />
          <Stat label="Gesprächszeit" value={`${Math.round(talkTime / 60)} Min.`} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <a key={f.key} href={`/aktivitaeten?typ=${f.key}&tage=${days}`}
               className={`rounded-lg px-3 py-1.5 text-sm transition ${
                 (typ ?? 'alle') === f.key ? 'bg-brand-soft font-medium text-brand' : 'text-muted hover:bg-surface-2'
               }`}>
              {f.label}
            </a>
          ))}
        </div>

        {calls.length > 0 && (
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Calls nach Typ</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              {(Object.keys(CALL_KIND_LABEL) as CallKind[]).map((k) => (
                <div key={k} className="rounded-lg bg-surface-2 p-3">
                  <div className="text-xs text-muted">{CALL_KIND_LABEL[k]}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">
                    {calls.filter((c) => c.call_kind === k).length}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Timeline activities={rows} />
      </div>
    </>
  );
}
