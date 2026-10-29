import { ctx } from '@/lib/ctx';
import { nurPassendeFilter } from '@/lib/listenfilter';
import { listenVonDeal } from '@/lib/listen';
import { Empty } from '@/components/ui';
import { istFaeden, istKaltakquise, ERLEDIGT_PHASEN } from '@/lib/faeden';
import { eur } from '@/lib/format';
import PipelineView from '@/components/PipelineView';
import { applyFilter, DEAL_FIELDS, parseFilterParam } from '@/lib/filters';
import type {
  ContactWithPersons, DealWithContact, Pipeline, Profile, SavedFilter, Stage,
} from '@/lib/types';

export default async function PipelinesPage({
  searchParams,
}: { searchParams: Promise<{ p?: string; s?: string; q?: string; filter?: string; open?: string; erledigt?: string }> }) {
  const { p, s, q, filter, open, erledigt } = await searchParams;
  const { supabase, orgId } = await ctx();

  const { data: pipelines } = await supabase
    .from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position');

  if (!pipelines?.length) {
    return (
      <div className="p-3 sm:p-7">
        <h1 className="mb-5 text-2xl font-semibold">Pipelines</h1>
        <Empty title="Noch keine Pipeline" hint="Lege unter Einstellungen deine erste Pipeline an." />
      </div>
    );
  }

  const pipeline = (pipelines as Pipeline[]).find((x) => x.id === p) ?? (pipelines[0] as Pipeline);

  const [{ data: stages }, { data: deals }, { data: saved }, { data: contacts }, { data: team }] =
    await Promise.all([
      supabase.from('pipeline_stages').select('*').eq('pipeline_id', pipeline.id).order('position'),
      supabase.from('deals')
        .select('*, contact:contacts(*, persons:contact_persons(*)), stage:pipeline_stages(name, color)')
        .eq('pipeline_id', pipeline.id)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase.from('saved_filters').select('*').eq('org_id', orgId).eq('entity', 'deals').order('name'),
      supabase.from('contacts').select('*, persons:contact_persons(*)').eq('org_id', orgId)
        .order('company').limit(500),
      supabase.from('profiles').select('*').eq('org_id', orgId).eq('active', true),
    ]);

  let rows = (deals ?? []) as DealWithContact[];

  // Naechste offene Wiedervorlage je Deal; rot "ohne Datum", wo eine fehlt:
  // in den Faeden bei jedem offenen Deal, in der Kaltakquise bei Interesse
  const faeden = istFaeden(pipeline.name);
  const kalt = istKaltakquise(pipeline.name);
  {
    const { data: offen } = await supabase.from('tasks').select('deal_id, contact_id, due_at, title')
      .eq('org_id', orgId).eq('done', false).not('due_at', 'is', null).order('due_at').limit(5000);
    const proDeal = new Map<string, { due_at: string; title: string }>();
    const proKontakt = new Map<string, { due_at: string; title: string }>();
    for (const t of offen ?? []) {
      const w = { due_at: t.due_at as string, title: t.title as string };
      if (t.deal_id) { if (!proDeal.has(t.deal_id)) proDeal.set(t.deal_id, w); }
      else if (t.contact_id && !proKontakt.has(t.contact_id)) proKontakt.set(t.contact_id, w);
    }
    rows = rows.map((d) => {
      const wv = proDeal.get(d.id) ?? (d.contact_id ? proKontakt.get(d.contact_id) : undefined) ?? null;
      const braucht = d.status === 'offen' && (faeden || (kalt && d.stage?.name?.trim().toLowerCase() === 'interesse'));
      return { ...d, naechste_wv: wv, ohne_datum: braucht && !wv };
    });
  }

  if (q?.trim()) {
    const term = q.trim().toLowerCase();
    rows = rows.filter((d) => {
      const c = d.contact;
      const hay = [
        d.title, d.source, d.next_step, c?.company, c?.website, c?.city,
        ...(c?.persons ?? []).flatMap((x) => [x.first_name, x.last_name, x.email, x.phone]),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }

  const def = parseFilterParam(filter);
  rows = applyFilter(rows, def, DEAL_FIELDS);

  // Faeden: Geliefert und Verloren nur auf Wunsch zeigen
  const stageListAlle = (stages ?? []) as Stage[];
  const erledigtIds = new Set(stageListAlle.filter((x) => ERLEDIGT_PHASEN.includes(x.name.trim().toLowerCase())).map((x) => x.id));
  const zeigeErledigte = !faeden || erledigt === '1' || (s ? erledigtIds.has(s) : false);
  if (!zeigeErledigte) rows = rows.filter((d) => !erledigtIds.has(d.stage_id));

  const counts: Record<string, number> = {};
  rows.forEach((d) => { counts[d.stage_id] = (counts[d.stage_id] ?? 0) + 1; });

  const stageList = (stages ?? []) as Stage[];
  const stageId = stageList.some((x) => x.id === s) ? (s as string) : null;

  return (
    <div className="p-3 sm:p-7">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:mb-5">
        <h1 className="text-xl font-semibold sm:text-2xl">{pipeline.name}</h1>
        <span className="text-sm text-muted">{rows.length} Datensätze</span>
        {faeden && (
          <>
            <span className="text-sm font-medium tabular-nums">
              Summe: {eur((stageId ? rows.filter((d) => d.stage_id === stageId) : rows).reduce((a, d) => a + Number(d.value || 0), 0))} netto
            </span>
            <a href={`/pipelines?p=${pipeline.id}${zeigeErledigte && erledigt === '1' ? '' : '&erledigt=1'}`}
               className="text-sm text-brand hover:underline">
              {zeigeErledigte && erledigt === '1' ? 'Erledigte ausblenden' : 'Erledigte anzeigen'}
            </a>
          </>
        )}
      </div>

      <PipelineView
        pipeline={pipeline}
        stages={stageList}
        stageId={stageId}
        counts={counts}
        rows={rows}
        filter={def}
        savedFilters={nurPassendeFilter((saved ?? []) as SavedFilter[],
          new Set(((deals ?? []) as DealWithContact[]).flatMap((d) => listenVonDeal(d))))}
        contacts={(contacts ?? []) as ContactWithPersons[]}
        team={(team ?? []) as Profile[]}
        initialOpen={open ?? null}
        faeden={faeden}
      />
    </div>
  );
}
