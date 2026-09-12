import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { PageHeader, Empty } from '@/components/ui';
import PipelineBoard from '@/components/PipelineBoard';
import { moveDeal, createDeal } from '@/app/actions/crm';
import { eur } from '@/lib/format';
import { PIPELINE_KIND_LABEL } from '@/lib/labels';
import type { Contact, DealWithContact, Pipeline, Profile, Stage } from '@/lib/types';

export default async function PipelinePage({
  searchParams,
}: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { supabase, orgId } = await ctx();

  const { data: pipelines } = await supabase
    .from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position');

  if (!pipelines?.length) {
    return (
      <>
        <PageHeader title="Pipeline" />
        <div className="p-4 sm:p-6">
          <Empty title="Noch keine Pipeline"
                 hint="Lege unter Einstellungen → Pipelines deine erste Pipeline an." />
        </div>
      </>
    );
  }

  const current = (pipelines as Pipeline[]).find((x) => x.id === p) ?? (pipelines[0] as Pipeline);

  const [{ data: stages }, { data: deals }, { data: contacts }, { data: team }] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('pipeline_id', current.id).order('position'),
    supabase.from('deals')
      .select('*, contact:contacts(*)')
      .eq('pipeline_id', current.id)
      .order('position'),
    supabase.from('contacts').select('*').eq('org_id', orgId).order('last_name').limit(500),
    supabase.from('profiles').select('*').eq('org_id', orgId).eq('active', true),
  ]);

  const dealList = (deals ?? []) as DealWithContact[];
  const open = dealList.filter((d) => d.status === 'offen');
  const openValue = open.reduce((a, d) => a + Number(d.value || 0), 0);
  const won = dealList.filter((d) => d.status === 'gewonnen');
  const wonValue = won.reduce((a, d) => a + Number(d.value || 0), 0);

  return (
    <>
      <PageHeader
        title={current.name}
        subtitle={`${PIPELINE_KIND_LABEL[current.kind]} · ${open.length} offene Deals · ${eur(openValue)} Pipeline-Wert · ${eur(wonValue)} gewonnen`}
      />

      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5 sm:px-6">
        {(pipelines as Pipeline[]).map((pl) => (
          <Link
            key={pl.id}
            href={`/pipeline?p=${pl.id}`}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              pl.id === current.id ? 'bg-brand-soft font-medium text-brand' : 'text-muted hover:bg-surface-2'
            }`}
          >
            {pl.name}
          </Link>
        ))}
      </div>

      <PipelineBoard
        stages={(stages ?? []) as Stage[]}
        deals={dealList}
        contacts={(contacts ?? []) as Contact[]}
        team={(team ?? []) as Profile[]}
        moveDeal={moveDeal}
        createDeal={createDeal}
      />
    </>
  );
}
