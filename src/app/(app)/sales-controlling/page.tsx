import { ctx } from '@/lib/ctx';
import { PageHeader, Stat } from '@/components/ui';
import { RevenueChart, SourceChart, FunnelBars } from '@/components/Charts';
import { eur, pct, num, duration } from '@/lib/format';
import { CALL_OUTCOME_LABEL, REACHED_OUTCOMES } from '@/lib/labels';
import type { Activity, CallOutcome, Deal, Pipeline, Profile, Stage } from '@/lib/types';
import { daysAgoIso, nowDate } from '@/lib/clock';

export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<{ tage?: string; p?: string; anlass?: string; von?: string; bis?: string }> }) {
  const { tage, p: pipeParam, anlass: anlassParam, von, bis } = await searchParams;
  const days = Number(tage ?? 90);
  const since = daysAgoIso(days);

  const { supabase, orgId } = await ctx();

  const [{ data: deals }, { data: activities }, { data: team }, { data: pipelines }, { data: stages }, { data: dealPipes }] =
    await Promise.all([
      supabase.from('deals').select('*').eq('org_id', orgId).gte('created_at', since),
      supabase.from('activities').select('*').eq('org_id', orgId).gte('occurred_at', since).limit(5000),
      supabase.from('profiles').select('*').eq('org_id', orgId),
      supabase.from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position'),
      supabase.from('pipeline_stages').select('*').order('position'),
      supabase.from('deals').select('id, pipeline_id').eq('org_id', orgId),
    ]);

  // Pipeline-Auswahl: Standard ist die Kaltakquise, damit Bestandsprojekte
  // aus dem Projekttool die Akquise-Zahlen nicht verfaelschen.
  const pipeList = (pipelines ?? []) as Pipeline[];
  const kalt = pipeList.find((pl) => pl.name.toLowerCase() === 'kaltakquise');
  const selected = pipeParam === 'alle' ? null : pipeList.find((pl) => pl.id === pipeParam) ?? kalt ?? null;
  const pipeOfDeal = new Map((dealPipes ?? []).map((d) => [d.id as string, d.pipeline_id as string]));
  const inPipe = (pipelineId?: string | null) => !selected || pipelineId === selected.id;

  const allDeals = ((deals ?? []) as Deal[]).filter((d) => inPipe(d.pipeline_id));
  const acts = ((activities ?? []) as Activity[]).filter((a) => !selected || (a.deal_id && inPipe(pipeOfDeal.get(a.deal_id))));
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
  const funnels = pipeList.filter((pl) => inPipe(pl.id)).map((p) => ({
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

  // Kreuztabellen: Quelle x Phase und Produkt x Phase
  const phasenSpalten = selected
    ? stageList.filter((st) => st.pipeline_id === selected.id).map((st) => ({ ids: [st.id], name: st.name }))
    : [...new Set(stageList.map((st) => st.name))].map((n) => ({ ids: stageList.filter((st) => st.name === n).map((st) => st.id), name: n }));
  // Eigene Datengrundlage fuer die Kreuztabellen: alle Deals der Auswahl,
  // gefiltert nach Anlass und Datum der ersten Aktivitaet
  const kreuzBasis: { id: string; stage_id: string; pipeline_id: string; custom: Record<string, string | null> | null }[] = [];
  for (let ab = 0; ; ab += 1000) {
    let q = supabase.from('deals').select('id, stage_id, pipeline_id, custom').eq('org_id', orgId);
    if (selected) q = q.eq('pipeline_id', selected.id);
    const { data } = await q.range(ab, ab + 999);
    kreuzBasis.push(...((data ?? []) as typeof kreuzBasis));
    if (!data || data.length < 1000) break;
  }
  const anlaesse = [...new Set(kreuzBasis.map((d) => d.custom?.anlass).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'de'));
  let kreuzDeals = anlassParam ? kreuzBasis.filter((d) => (d.custom?.anlass ?? '') === anlassParam) : kreuzBasis;
  if (von || bis) {
    const erste = new Map<string, string>();
    for (let ab = 0; ; ab += 1000) {
      const { data } = await supabase.from('activities').select('deal_id, occurred_at').eq('org_id', orgId)
        .not('deal_id', 'is', null).order('occurred_at').range(ab, ab + 999);
      for (const a of data ?? []) if (!erste.has(a.deal_id as string)) erste.set(a.deal_id as string, a.occurred_at as string);
      if (!data || data.length < 1000) break;
    }
    const vonMs = von ? new Date(`${von}T00:00`).getTime() : -Infinity;
    const bisMs = bis ? new Date(`${bis}T23:59:59`).getTime() : Infinity;
    kreuzDeals = kreuzDeals.filter((d) => {
      const e = erste.get(d.id);
      if (!e) return false;
      const t = new Date(e).getTime();
      return t >= vonMs && t <= bisMs;
    });
  }
  const kreuz = (feld: 'quelle' | 'anlass') => {
    const werte = [...new Set(kreuzDeals.map((d) => d.custom?.[feld] || '(leer)'))].sort((a, b) =>
      a === '(leer)' ? 1 : b === '(leer)' ? -1 : a.localeCompare(b, 'de'));
    return werte.map((w) => ({
      wert: w,
      je: phasenSpalten.map((ph) => kreuzDeals.filter((d) => (d.custom?.[feld] || '(leer)') === w && ph.ids.includes(d.stage_id)).length),
      gesamt: kreuzDeals.filter((d) => (d.custom?.[feld] || '(leer)') === w).length,
    }));
  };
  const kreuzTabellen = [
    { titel: 'Quelle × Phase', zeilen: kreuz('quelle') },
    { titel: 'Anlass × Phase', zeilen: kreuz('anlass') },
  ];

  return (
    <>
      <PageHeader title="Sales-Controlling"
                  subtitle={`${selected ? selected.name : 'Alle Pipelines'} · letzte ${days} Tage`}>
        {[...pipeList.map((pl) => ({ id: pl.id, name: pl.name })), { id: 'alle', name: 'Alle' }].map((o) => (
          <a key={o.id} href={`/sales-controlling?tage=${days}&p=${o.id}`}
             className={(selected ? selected.id : 'alle') === o.id ? 'btn-primary' : 'btn-ghost'}>
            {o.name}
          </a>
        ))}
        <span className="mx-1 h-6 w-px bg-line" />
        {[30, 90, 365].map((d) => (
          <a key={d} href={`/sales-controlling?tage=${d}&p=${selected ? selected.id : 'alle'}`} className={d === days ? 'btn-primary' : 'btn-ghost'}>
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
          <h2 className="mb-4 text-sm font-semibold">Anrufe nach Ergebnis</h2>
          {calls.length === 0 && <p className="text-sm text-muted">Im Zeitraum noch keine Anrufe protokolliert.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[])
              .map((k) => ({ k, n: calls.filter((c) => c.outcome === k).length }))
              .filter((x) => x.n > 0)
              .map(({ k, n }) => (
                <div key={k} className="rounded-lg bg-surface-2 p-3.5">
                  <div className="text-xs text-muted">{CALL_OUTCOME_LABEL[k]}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{n}</div>
                  <div className="mt-1 text-xs text-muted">{pct((n / calls.length) * 100)} der Anrufe</div>
                </div>
              ))}
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

        <form className="card flex flex-wrap items-end gap-3 p-4" action="/sales-controlling">
          <input type="hidden" name="tage" value={days} />
          <input type="hidden" name="p" value={selected ? selected.id : 'alle'} />
          <div>
            <label className="label" htmlFor="kr-anlass">Anlass</label>
            <select id="kr-anlass" name="anlass" className="input" defaultValue={anlassParam ?? ''}>
              <option value="">alle</option>
              {anlaesse.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="kr-von">Erste Aktivität ab</label>
            <input id="kr-von" name="von" type="date" className="input" defaultValue={von ?? ''} />
          </div>
          <div>
            <label className="label" htmlFor="kr-bis">bis</label>
            <input id="kr-bis" name="bis" type="date" className="input" defaultValue={bis ?? ''} />
          </div>
          <button className="btn-primary">Anwenden</button>
          {(anlassParam || von || bis) && (
            <a className="btn-ghost" href={`/sales-controlling?tage=${days}&p=${selected ? selected.id : 'alle'}`}>Zurücksetzen</a>
          )}
          <span className="text-xs text-muted">{kreuzDeals.length} Deals in den Tabellen</span>
        </form>

        {kreuzTabellen.map((t) => (
          <div key={t.titel} className="card overflow-x-auto">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{t.titel}</h2>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line bg-surface-2/50">
                <tr>
                  <th className="th">{t.titel.split(' ')[0]}</th>
                  {phasenSpalten.map((ph) => <th key={ph.name} className="th text-right">{ph.name}</th>)}
                  <th className="th text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {t.zeilen.map((z) => (
                  <tr key={z.wert} className="border-b border-line last:border-0">
                    <td className="td font-medium">{z.wert}</td>
                    {z.je.map((n, i) => <td key={i} className={`td text-right tabular-nums ${n ? '' : 'text-muted/50'}`}>{n}</td>)}
                    <td className="td text-right font-medium tabular-nums">{z.gesamt}</td>
                  </tr>
                ))}
                {t.zeilen.length === 0 && (
                  <tr><td className="td text-muted" colSpan={phasenSpalten.length + 2}>Keine Deals im Zeitraum.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}

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
