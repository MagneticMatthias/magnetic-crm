import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { PageHeader, Stat } from '@/components/ui';
import { FunnelBars } from '@/components/Charts';
import { num, pct } from '@/lib/format';
import { REACHED_OUTCOMES } from '@/lib/labels';
import type { Activity, Deal, Pipeline, Stage } from '@/lib/types';

/**
 * Auswertung je Akquise-Liste (Leadherkunft): wie viele Firmen stehen in
 * welcher Phase, wie viele wurden per LinkedIn angeschrieben, wie viele
 * angerufen und erreicht. Ohne Zeitraum - eine Liste ist ein Vorgang.
 */
export default async function ListenPage({
  searchParams,
}: { searchParams: Promise<{ liste?: string; p?: string }> }) {
  const { liste, p } = await searchParams;
  const { supabase, orgId } = await ctx();

  const [{ data: pipelines }, { data: stages }, { data: deals }] = await Promise.all([
    supabase.from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position'),
    supabase.from('pipeline_stages').select('*').order('position'),
    supabase.from('deals').select('id, source, stage_id, pipeline_id, status, contact_id').eq('org_id', orgId),
  ]);

  const pipelineList = (pipelines ?? []) as Pipeline[];
  const pipeline = pipelineList.find((x) => x.id === p)
    ?? pipelineList.find((x) => /kaltakquise/i.test(x.name))
    ?? pipelineList[0];
  if (!pipeline) {
    return <div className="p-6 text-sm text-muted">Noch keine Pipeline vorhanden.</div>;
  }

  const stageList = (stages ?? []).filter((s: Stage) => s.pipeline_id === pipeline.id) as Stage[];
  const alle = ((deals ?? []) as Pick<Deal, 'id' | 'source' | 'stage_id' | 'pipeline_id' | 'status' | 'contact_id'>[])
    .filter((d) => d.pipeline_id === pipeline.id);

  // Listen = Leadherkunft der Deals in dieser Pipeline
  const listen = [...new Set(alle.map((d) => d.source || 'Ohne Liste'))].sort((a, b) => a.localeCompare(b, 'de'));
  const aktiv = liste && listen.includes(liste) ? liste : null;
  const rows = aktiv ? alle.filter((d) => (d.source || 'Ohne Liste') === aktiv) : alle;

  // Aktivitaeten zu diesen Deals
  const dealIds = rows.map((d) => d.id);
  const acts: Pick<Activity, 'deal_id' | 'type' | 'outcome' | 'answered_by'>[] = [];
  for (let i = 0; i < dealIds.length; i += 500) {
    const { data } = await supabase
      .from('activities').select('deal_id, type, outcome, answered_by')
      .in('deal_id', dealIds.slice(i, i + 500));
    acts.push(...((data ?? []) as typeof acts));
  }

  const perDeal = (type: string) => new Set(acts.filter((a) => a.type === type).map((a) => a.deal_id)).size;
  const linkedin = perDeal('linkedin');
  const mails = perDeal('email');
  const calls = acts.filter((a) => a.type === 'call');
  const angerufen = new Set(calls.map((a) => a.deal_id)).size;
  const erreicht = new Set(calls.filter((a) => a.outcome && REACHED_OUTCOMES.includes(a.outcome)).map((a) => a.deal_id)).size;
  const entscheider = new Set(calls.filter((a) => a.answered_by === 'entscheider').map((a) => a.deal_id)).size;
  const unberuehrt = rows.filter((d) => !acts.some((a) => a.deal_id === d.id)).length;

  const funnel = stageList.map((s) => {
    const n = rows.filter((d) => d.stage_id === s.id).length;
    return { name: s.name, anzahl: n, wert: 0, color: s.color };
  });

  // Matrix Liste x Phase
  const matrix = listen.map((l) => {
    const ds = alle.filter((d) => (d.source || 'Ohne Liste') === l);
    return { liste: l, gesamt: ds.length, je: stageList.map((s) => ds.filter((d) => d.stage_id === s.id).length) };
  });

  const href = (q: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (q.p ?? pipeline.id) sp.set('p', q.p ?? pipeline.id);
    if (q.liste) sp.set('liste', q.liste);
    return `/listen?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader title="Listen" subtitle={`Akquise-Auswertung · ${pipeline.name}`}>
        {pipelineList.length > 1 && pipelineList.map((pl) => (
          <Link key={pl.id} href={href({ p: pl.id, liste: undefined })}
                className={pl.id === pipeline.id ? 'btn-primary' : 'btn-ghost'}>{pl.name}</Link>
        ))}
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <Link href={href({ liste: undefined })} className={!aktiv ? 'btn-primary' : 'btn-ghost'}>
            Alle Listen <span className="ml-1 text-xs opacity-70">{alle.length}</span>
          </Link>
          {listen.map((l) => (
            <Link key={l} href={href({ liste: l })} className={aktiv === l ? 'btn-primary' : 'btn-ghost'}>
              {l} <span className="ml-1 text-xs opacity-70">{alle.filter((d) => (d.source || 'Ohne Liste') === l).length}</span>
            </Link>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Firmen" value={num(rows.length)} hint={`${num(unberuehrt)} noch unberührt`} />
          <Stat label="LinkedIn angeschrieben" value={num(linkedin)}
                hint={rows.length ? `${pct((linkedin / rows.length) * 100)} der Liste` : undefined} />
          <Stat label="Angerufen" value={num(angerufen)}
                hint={`${num(calls.length)} Anrufe · ${num(mails)} per E-Mail`} />
          <Stat label="Erreicht" value={num(erreicht)} tone="win"
                hint={angerufen ? `${pct((erreicht / angerufen) * 100)} der Angerufenen · ${num(entscheider)} Entscheider` : 'noch keine Anrufe'} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h2 className="mb-4 text-sm font-semibold">Phasen · {aktiv ?? 'alle Listen'}</h2>
            <FunnelBars data={funnel} />
          </div>

          <div className="card overflow-x-auto">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Liste × Phase</h2>
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-line bg-surface-2/50">
                <tr>
                  <th className="th">Liste</th>
                  <th className="th text-right">Gesamt</th>
                  {stageList.map((s) => (
                    <th key={s.id} className="th text-right" title={s.name}>
                      <span className="inline-block max-w-[90px] truncate align-bottom">{s.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((m) => (
                  <tr key={m.liste} className={`border-b border-line last:border-0 ${aktiv === m.liste ? 'bg-brand-soft/40' : ''}`}>
                    <td className="td font-medium">
                      <Link href={href({ liste: m.liste })} className="hover:text-brand">{m.liste}</Link>
                    </td>
                    <td className="td text-right tabular-nums">{num(m.gesamt)}</td>
                    {m.je.map((n, i) => (
                      <td key={stageList[i].id} className={`td text-right tabular-nums ${n === 0 ? 'text-muted/50' : ''}`}>{num(n)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted">
          {'„Angeschrieben“ und „Angerufen“ zählen Firmen mit mindestens einer entsprechenden Aktivität, nicht die Anzahl der Nachrichten.'}
          {' '}Zum Arbeiten mit einer Liste: Pipelines, Filter {`„${aktiv ?? 'Listenname'}“`}.
        </p>
      </div>
    </>
  );
}
