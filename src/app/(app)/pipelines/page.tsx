import { ctx } from '@/lib/ctx';
import { Empty } from '@/components/ui';
import PipelineView from '@/components/PipelineView';
import { applyFilter, DEAL_FIELDS, parseFilterParam } from '@/lib/filters';
import type {
  ContactWithPersons, DealWithContact, Pipeline, Profile, SavedFilter, Stage,
} from '@/lib/types';

export default async function PipelinesPage({
  searchParams,
}: { searchParams: Promise<{ p?: string; s?: string; q?: string; filter?: string; open?: string }> }) {
  const { p, s, q, filter, open } = await searchParams;
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

  const counts: Record<string, number> = {};
  rows.forEach((d) => { counts[d.stage_id] = (counts[d.stage_id] ?? 0) + 1; });

  const stageList = (stages ?? []) as Stage[];
  const stageId = stageList.some((x) => x.id === s) ? (s as string) : null;

  return (
    <div className="p-3 sm:p-7">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:mb-5">
        <h1 className="text-xl font-semibold sm:text-2xl">{pipeline.name}</h1>
        <span className="text-sm text-muted">{rows.length} Datensätze</span>
      </div>

      <PipelineView
        pipeline={pipeline}
        stages={stageList}
        stageId={stageId}
        counts={counts}
        rows={rows}
        filter={def}
        savedFilters={(saved ?? []) as SavedFilter[]}
        contacts={(contacts ?? []) as ContactWithPersons[]}
        team={(team ?? []) as Profile[]}
        initialOpen={open ?? null}
      />
    </div>
  );
}
