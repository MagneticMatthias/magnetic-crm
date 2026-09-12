import { ctx } from '@/lib/ctx';
import { PageHeader, Stat } from '@/components/ui';
import { RevenueChart, SourceChart, FunnelBars } from '@/components/Charts';
import { eur, pct, num, duration } from '@/lib/format';
import { CALL_KIND_LABEL, REACHED_OUTCOMES } from '@/lib/labels';
import type { Activity, CallKind, Deal, Pipeline, Profile, Stage } from '@/lib/types';
import { daysAgoIso, nowDate } from '@/lib/clock';

export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<{ tage?: string }> }) {
  const { tage } = await searchParams;
  const days = Number(tage ?? 90);
  const since = daysAgoIso(days);

  const { supabase, orgId } = await ctx();

  const [{ data: deals }, { data: activities }, { data: team }, { data: pipelines }, { data: stages }] =
    await Promise.all([
      supabase.from('deals').select('*').eq('org_id', orgId).gte('created_at', since),
      supabase.from('activities').select('*').eq('org_id', orgId).gte('occurred_at', since).limit(5000),
      supabase.from('profiles').select('*').eq('org_id', orgId),
      supabase.from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position'),
      supabase.from('pipeline_stages').select('*').order('position'),
    ]);

  const allDeals = (deals ?? []) as Deal[];
  const acts = (activities ?? []) as Activity[];
  const teamList = (team ?? []) as Profile[];
  const stageList = (stages ?? []) as Stage[];

  const won = allDeals.filter((d) => d.status === 'gewonnen');
  const lost = allDeals.filter((d) => d.status === 'verloren');
  const wonValue = won.reduce((a, d) => a + Number(d.value || 0), 0);
  const decided = won.length + lost.length;
  const avgDeal = won.length ? wonValue / won.length : 0;

  const calls = acts.filter((a) => a.type === 'call');
  const reached = calls.filter((a) => a.outcome && REACHED_OUTCOMES.includes(a.outcome));
  const appointments = calls.filter((a) => a.outcome === 'termin_vereinbart');

  // Umsatz je Monat
  const months = new Map<string, { umsatz: number; deals: number }>();
  for (let i = Math.min(11, Math.ceil(days / 30)); i >= 0; i--) {
    const d = nowDate();
    d.setMonth(d.getMonth() - i, 1);
    months.set(d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }), { umsatz: 0, deals: 0 });
  }
  won.forEach((d) => {
    if (!d.won_at) return;
    const key = new Date(d.won_at).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
    const entry = months.get(key);
    if (entry) { entry.umsatz += Number(d.value || 0); entry.deals += 1; }
  });
  const revenue = [...months.entries()].map(([monat, v]) => ({ monat, ...v }));

  // Leadquellen
  const sourceMap = new Map<string, { umsatz: number; deals: number; gewonnen: number }>();
  allDeals.forEach((d) => {
    const key = d.source || 'Ohne Quelle';
    const e = sourceMap.get(key) ?? { umsatz: 0, deals: 0, gewonnen: 0 };
    e.deals += 1;
    if (d.status === 'gewonnen') { e.gewonnen += 1; e.umsatz += Number(d.value || 0); }
    sourceMap.set(key, e);
  });
  const sources = [...sourceMap.entries()]
    .map(([quelle, v]) => ({ quelle, ...v }))
    .sort((a, b) => b.umsatz - a.umsatz)
    .slice(0, 8);

  // Team-Leaderboard
  const leaderboard = teamList.map((p) => {
    const userCalls = calls.filter((a) => a.user_id === p.id);
    const userWon = won.filter((d) => d.closer_id === p.id || d.owner_id === p.id);
    const userSet = calls.filter((a) => a.user_id === p.id && a.outcome === 'termin_vereinbart');
    return {
      id: p.id,
      name: p.full_name || p.email || '–',
      calls: userCalls.length,
      talk: userCalls.reduce((a, c) => a + (c.duration_seconds ?? 0), 0),
      termine: userSet.length,
      abschluesse: userWon.length,
      umsatz: userWon.reduce((a, d) => a + Number(d.value || 0), 0),
    };
  }).sort((a, b) => b.umsatz - a.umsatz);

  // Funnel je Pipeline
  const funnels = ((pipelines ?? []) as Pipeline[]).map((p) => ({
    pipeline: p,
    rows: stageList.filter((s) => s.pipeline_id === p.id).map((s) => {
      const inStage = allDeals.filter((d) => d.stage_id === s.id);
      return {
        name: s.name,
        anzahl: inStage.length,
        wert: inStage.reduce((a, d) => a + Number(d.value || 0), 0),
        color: s.color,
      };
    }),
  })).filter((f) => f.rows.length > 0);

  return (
    <>
      <PageHeader title="Berichte" subtitle={`Sales-Controlling über ${days} Tage`}>
        {[30, 90, 365].map((d) => (
          <a key={d} href={`/berichte?tage=${d}`} className={d === days ? 'btn-primary' : 'btn-ghost'}>
            {d} Tage
          </a>
        ))}
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Umsatz gewonnen" value={eur(wonValue)} hint={`${won.length} Deals`} tone="win" />
          <Stat label="Abschlussquote" value={decided ? pct((won.length / decided) * 100) : '–'}
                hint={`${decided} entschiedene Deals`} />
          <Stat label="Ø Dealgröße" value={eur(avgDeal)} />
          <Stat label="Termin je Call" value={calls.length ? pct((appointments.length / calls.length) * 100) : '–'}
                hint={`${appointments.length} Termine aus ${num(calls.length)} Calls`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Gewonnener Umsatz je Monat</h2>
            <RevenueChart data={revenue} />
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Umsatz nach Leadquelle</h2>
            {sources.length ? <SourceChart data={sources} /> : <p className="text-sm text-muted">Keine Daten.</p>}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-4 text-sm font-semibold">Call-Funnel</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(CALL_KIND_LABEL) as CallKind[]).map((k) => {
              const kindCalls = calls.filter((c) => c.call_kind === k);
              const kindReached = kindCalls.filter((c) => c.outcome && REACHED_OUTCOMES.includes(c.outcome));
              return (
                <div key={k} className="rounded-lg bg-surface-2 p-3.5">
                  <div className="text-xs text-muted">{CALL_KIND_LABEL[k]}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{kindCalls.length}</div>
                  <div className="mt-1 text-xs text-muted">
                    {kindCalls.length ? `${pct((kindReached.length / kindCalls.length) * 100)} erreicht` : '–'}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            Kontaktquote gesamt: {calls.length ? pct((reached.length / calls.length) * 100) : '–'} ·
            Gesprächszeit: {duration(calls.reduce((a, c) => a + (c.duration_seconds ?? 0), 0))}
          </p>
        </div>

        <div className="card overflow-x-auto">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Team-Leistung</h2>
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-line bg-surface-2/50">
              <tr>
                <th className="th">Mitarbeiter</th>
                <th className="th">Calls</th>
                <th className="th">Gesprächszeit</th>
                <th className="th">Termine</th>
                <th className="th">Abschlüsse</th>
                <th className="th">Umsatz</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="td font-medium">{r.name}</td>
                  <td className="td tabular-nums">{num(r.calls)}</td>
                  <td className="td tabular-nums text-muted">{duration(r.talk)}</td>
                  <td className="td tabular-nums">{num(r.termine)}</td>
                  <td className="td tabular-nums">{num(r.abschluesse)}</td>
                  <td className="td tabular-nums font-medium">{eur(r.umsatz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {funnels.map((f) => (
            <div key={f.pipeline.id} className="card p-4">
              <h2 className="mb-4 text-sm font-semibold">Funnel – {f.pipeline.name}</h2>
              <FunnelBars data={f.rows} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
