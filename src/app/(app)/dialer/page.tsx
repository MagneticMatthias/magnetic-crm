import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { PageHeader, Empty } from '@/components/ui';
import PowerDialer from '@/components/PowerDialer';
import { logDialerCall } from '@/app/actions/dialer';
import type { CallKind, DealWithContact, Pipeline, Stage } from '@/lib/types';

export default async function DialerPage({
  searchParams,
}: { searchParams: Promise<{ p?: string; s?: string }> }) {
  const { p, s } = await searchParams;
  const { supabase, orgId } = await ctx();

  const { data: pipelines } = await supabase
    .from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position');

  if (!pipelines?.length) {
    return (
      <>
        <PageHeader title="Power Dialer" />
        <div className="p-4 sm:p-6">
          <Empty title="Keine Pipeline vorhanden" hint="Lege zuerst eine Pipeline an." />
        </div>
      </>
    );
  }

  const pipeline = (pipelines as Pipeline[]).find((x) => x.id === p) ?? (pipelines[0] as Pipeline);

  const { data: stages } = await supabase
    .from('pipeline_stages').select('*').eq('pipeline_id', pipeline.id).order('position');

  const stageList = ((stages ?? []) as Stage[]).filter((x) => !x.is_won && !x.is_lost);
  const stage = stageList.find((x) => x.id === s) ?? stageList[0];

  const { data: deals } = stage
    ? await supabase
        .from('deals')
        .select('*, contact:contacts(*)')
        .eq('stage_id', stage.id)
        .eq('status', 'offen')
        .order('position')
        .limit(200)
    : { data: [] };

  const defaultKind: CallKind =
    pipeline.kind === 'closer' ? 'closing' : pipeline.kind === 'reaktivierung' ? 'followup' : 'setting';

  return (
    <>
      <PageHeader
        title="Power Dialer"
        subtitle="Arbeite eine Phase Deal für Deal ab – Ergebnis erfassen, automatisch weiter"
      />

      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5 sm:px-6">
        {(pipelines as Pipeline[]).map((pl) => (
          <Link key={pl.id} href={`/dialer?p=${pl.id}`}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  pl.id === pipeline.id ? 'bg-brand-soft font-medium text-brand' : 'text-muted hover:bg-surface-2'
                }`}>
            {pl.name}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5 sm:px-6">
        {stageList.map((st) => (
          <Link key={st.id} href={`/dialer?p=${pipeline.id}&s=${st.id}`}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition"
                style={st.id === stage?.id
                  ? { background: st.color, color: '#fff' }
                  : { background: 'var(--surface-2)', color: 'var(--muted)' }}>
            {st.name}
          </Link>
        ))}
      </div>

      <div className="p-4 sm:p-6">
        <PowerDialer
          deals={(deals ?? []) as DealWithContact[]}
          stages={(stages ?? []) as Stage[]}
          defaultCallKind={defaultKind}
          logCall={logDialerCall}
        />
      </div>
    </>
  );
}
