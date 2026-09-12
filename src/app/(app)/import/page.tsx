import { ctx } from '@/lib/ctx';
import CsvImport from '@/components/CsvImport';
import type { Pipeline, Stage } from '@/lib/types';

export default async function ImportPage() {
  const { supabase, orgId } = await ctx();
  const [{ data: pipelines }, { data: stages }] = await Promise.all([
    supabase.from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position'),
    supabase.from('pipeline_stages').select('*').order('position'),
  ]);

  const options = ((pipelines ?? []) as Pipeline[]).flatMap((p) =>
    ((stages ?? []) as Stage[]).filter((s) => s.pipeline_id === p.id && !s.is_won && !s.is_lost)
      .map((s) => ({ id: s.id, label: `${p.name} → ${s.name}` })),
  );

  return (
    <div className="mx-auto max-w-4xl p-5 sm:p-7">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">CSV-Import</h1>
        <p className="mt-1 text-sm text-muted">Messelisten, gekaufte Listen, Excel-Exporte – als Kontakte und Deals ins CRM.</p>
      </div>
      <CsvImport stageOptions={options} />
    </div>
  );
}
