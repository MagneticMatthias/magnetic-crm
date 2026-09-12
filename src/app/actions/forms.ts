'use server';

import { revalidatePath } from 'next/cache';
import { ctx, str, numOrZero } from '@/lib/ctx';

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'formular';

export async function createLeadForm(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();
  const name = str(formData, 'name') ?? 'Neues Formular';
  const base = slugify(name);
  const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

  const stageId = str(formData, 'stage_id');
  let pipelineId: string | null = null;
  if (stageId) {
    const { data } = await supabase
      .from('pipeline_stages').select('pipeline_id').eq('id', stageId).maybeSingle();
    pipelineId = data?.pipeline_id ?? null;
  }

  const { error } = await supabase.from('lead_forms').insert({
    org_id: orgId,
    slug,
    name,
    headline: str(formData, 'headline'),
    description: str(formData, 'description'),
    stage_id: stageId,
    pipeline_id: pipelineId,
    owner_id: str(formData, 'owner_id') ?? profile.id,
    source: str(formData, 'source') ?? 'Formular',
    deal_value: numOrZero(formData, 'deal_value'),
    ask_company: formData.get('ask_company') === 'on',
    ask_message: formData.get('ask_message') === 'on',
    ask_email: formData.get('ask_email') === 'on',
    ask_phone: formData.get('ask_phone') === 'on',
    ask_last_name: formData.get('ask_last_name') === 'on',
  });
  if (error) throw new Error(error.message);

  revalidatePath('/formulare');
}

export async function updateLeadForm(formData: FormData) {
  const { supabase } = await ctx();
  const stageId = str(formData, 'stage_id');
  let pipelineId: string | null = null;
  if (stageId) {
    const { data } = await supabase
      .from('pipeline_stages').select('pipeline_id').eq('id', stageId).maybeSingle();
    pipelineId = data?.pipeline_id ?? null;
  }

  await supabase.from('lead_forms').update({
    name: str(formData, 'name') ?? 'Formular',
    headline: str(formData, 'headline'),
    description: str(formData, 'description'),
    success_message: str(formData, 'success_message'),
    stage_id: stageId,
    pipeline_id: pipelineId,
    source: str(formData, 'source'),
    deal_value: numOrZero(formData, 'deal_value'),
    ask_company: formData.get('ask_company') === 'on',
    ask_message: formData.get('ask_message') === 'on',
    ask_email: formData.get('ask_email') === 'on',
    ask_phone: formData.get('ask_phone') === 'on',
    ask_last_name: formData.get('ask_last_name') === 'on',
    active: formData.get('active') === 'on',
  }).eq('id', String(formData.get('id')));

  revalidatePath('/formulare');
}

export async function deleteLeadForm(formData: FormData) {
  const { supabase } = await ctx();
  await supabase.from('lead_forms').delete().eq('id', String(formData.get('id')));
  revalidatePath('/formulare');
}
