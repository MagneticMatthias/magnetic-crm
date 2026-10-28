import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { PageHeader, Stat } from '@/components/ui';
import { renameList, dealsFuerListeAnlegen } from '@/app/actions/listen';
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

  const [{ data: pipelines }, { data: stages }, { data: deals }, { data: kontakte }] = await Promise.all([
    supabase.from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position'),
    supabase.from('pipeline_stages').select('*').order('position'),
    supabase.from('deals').select('id, source, stage_id, pipeline_id, status, contact_id').eq('org_id', orgId),
    supabase.from('contacts').select('id, lead_source').eq('org_id', orgId).not('lead_source', 'is', null),
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
  // Firmen einer Liste ohne Deal in dieser Pipeline - tauchen sonst in keinem Deal-Filter auf
  const mitDealHier = new Set(alle.map((d) => d.contact_id));
  const ohneDeal = new Map<string, number>();
  for (const k of kontakte ?? []) {
    if (k.lead_source && k.lead_source !== 'Bestandskunde' && !mitDealHier.has(k.id)) {
      ohneDeal.set(k.lead_source, (ohneDeal.get(k.lead_source) ?? 0) + 1);
    }
  }
  // Listen, die es nur als Kontakte gibt, gehoeren auch in die Auswahl
  const nurKontakte = [...ohneDeal.keys()].filter((l) => !listen.includes(l) && (deals ?? []).every((d) => d.source !== l));
  const aktiv = liste && (listen.includes(liste) || nurKontakte.includes(liste)) ? liste : null;
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

        {nurKontakte.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Noch nicht in der {pipeline.name}:</span>
            {nurKontakte.map((l) => (
              <Link key={l} href={href({ liste: l })} className={aktiv === l ? 'btn-primary' : 'btn-ghost'}>
                {l} <span className="ml-1 text-xs opacity-70">{ohneDeal.get(l)}</span>
              </Link>
            ))}
          </div>
        )}

        {aktiv && (ohneDeal.get(aktiv) ?? 0) > 0 && (
          <form action={dealsFuerListeAnlegen}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            <input type="hidden" name="liste" value={aktiv} />
            <input type="hidden" name="p" value={pipeline.id} />
            <span>
              <b>{ohneDeal.get(aktiv)} Firmen</b> aus dieser Liste fehlen noch in der {pipeline.name}.
            </span>
            <button className="btn-primary">Jetzt aufnehmen</button>
          </form>
        )}

        {aktiv && aktiv !== 'Ohne Liste' && (
          <form action={renameList} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="alt" value={aktiv} />
            <input type="hidden" name="p" value={pipeline.id} />
            <label htmlFor="liste-neu" className="text-sm text-muted">Liste umbenennen:</label>
            <input id="liste-neu" name="neu" defaultValue={aktiv} key={aktiv} className="input !w-auto min-w-[240px] !py-1.5" required />
            <button className="btn-ghost">Umbenennen</button>
            <span className="text-xs text-muted">Filter und Zuordnungen werden mit umbenannt.</span>
          </form>
        )}

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
