import { redirect, notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';

/** Alte Deal-Detailroute: oeffnet das Kontakt-Panel in der passenden Pipeline. */
export default async function DealRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await ctx();
  const { data } = await supabase.from('deals').select('pipeline_id, contact_id').eq('id', id).maybeSingle();
  if (!data) notFound();
  redirect(`/pipelines?p=${data.pipeline_id}${data.contact_id ? `&open=${data.contact_id}` : ''}`);
}
