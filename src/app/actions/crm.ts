'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ctx, str, numOrZero } from '@/lib/ctx';

function refreshAll() {
  revalidatePath('/dashboard');
  revalidatePath('/pipelines');
  revalidatePath('/kontakte');
  revalidatePath('/aufgaben');
  revalidatePath('/aktivitaeten');
  revalidatePath('/berichte');
}

/* -------------------------------- Deals ------------------------------- */

export async function createDeal(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();
  const stageId = String(formData.get('stage_id'));

  const { data: stage } = await supabase
    .from('pipeline_stages').select('pipeline_id').eq('id', stageId).single();
  if (!stage) throw new Error('Phase nicht gefunden');

  const { count } = await supabase
    .from('deals').select('id', { count: 'exact', head: true }).eq('stage_id', stageId);

  const { data, error } = await supabase.from('deals').insert({
    org_id: orgId,
    contact_id: str(formData, 'contact_id'),
    pipeline_id: stage.pipeline_id,
    stage_id: stageId,
    title: str(formData, 'title') ?? 'Neuer Deal',
    value: numOrZero(formData, 'value'),
    source: str(formData, 'source'),
    owner_id: str(formData, 'owner_id') ?? profile.id,
    setter_id: str(formData, 'setter_id'),
    closer_id: str(formData, 'closer_id'),
    expected_close_date: str(formData, 'expected_close_date'),
    next_step: str(formData, 'next_step'),
    position: count ?? 0,
  }).select('id').single();
  if (error) throw new Error(error.message);

  refreshAll();
  if (formData.get('redirect') === 'detail') redirect(`/deals/${data.id}`);
}

export async function updateDeal(formData: FormData) {
  const { supabase } = await ctx();
  const id = String(formData.get('id'));
  const stageId = str(formData, 'stage_id');

  const patch: Record<string, unknown> = {
    title: str(formData, 'title') ?? 'Deal',
    value: numOrZero(formData, 'value'),
    source: str(formData, 'source'),
    owner_id: str(formData, 'owner_id'),
    setter_id: str(formData, 'setter_id'),
    closer_id: str(formData, 'closer_id'),
    expected_close_date: str(formData, 'expected_close_date'),
    next_step: str(formData, 'next_step'),
    lost_reason: str(formData, 'lost_reason'),
    contact_id: str(formData, 'contact_id'),
  };

  if (stageId) {
    const { data: stage } = await supabase
      .from('pipeline_stages').select('pipeline_id').eq('id', stageId).single();
    patch.stage_id = stageId;
    if (stage) patch.pipeline_id = stage.pipeline_id;
  }

  const { error } = await supabase.from('deals').update(patch).eq('id', id);
  if (error) throw new Error(error.message);

  refreshAll();
  revalidatePath(`/deals/${id}`);
}

/** Drag & Drop im Pipeline-Board. */
export async function moveDeal(dealId: string, stageId: string, position: number) {
  const { supabase } = await ctx();
  const { data: stage } = await supabase
    .from('pipeline_stages').select('pipeline_id').eq('id', stageId).single();
  if (!stage) throw new Error('Phase nicht gefunden');

  const { error } = await supabase
    .from('deals')
    .update({ stage_id: stageId, pipeline_id: stage.pipeline_id, position })
    .eq('id', dealId);
  if (error) throw new Error(error.message);

  refreshAll();
}

export async function deleteDeal(formData: FormData) {
  const { supabase } = await ctx();
  const { error } = await supabase.from('deals').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error(error.message);
  refreshAll();
  redirect('/pipeline');
}

/* ----------------------------- Aktivitäten ---------------------------- */

export async function logActivity(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();
  const type = String(formData.get('type') || 'note');
  const minutes = Number(str(formData, 'duration_minutes') ?? 0);

  const { error } = await supabase.from('activities').insert({
    org_id: orgId,
    deal_id: str(formData, 'deal_id'),
    contact_id: str(formData, 'contact_id'),
    user_id: profile.id,
    type,
    call_kind: type === 'call' ? str(formData, 'call_kind') : null,
    outcome: type === 'call' ? str(formData, 'outcome') : null,
    duration_seconds: type === 'call' && minutes > 0 ? Math.round(minutes * 60) : null,
    phone_number: str(formData, 'phone_number'),
    subject: str(formData, 'subject'),
    body: str(formData, 'body'),
    occurred_at: str(formData, 'occurred_at') ?? new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  // Ergebnis kann die Phase weiterschieben (z. B. Termin vereinbart)
  const nextStage = str(formData, 'next_stage_id');
  const dealId = str(formData, 'deal_id');
  if (nextStage && dealId) {
    const { data: stage } = await supabase
      .from('pipeline_stages').select('pipeline_id').eq('id', nextStage).single();
    if (stage) {
      await supabase.from('deals')
        .update({ stage_id: nextStage, pipeline_id: stage.pipeline_id }).eq('id', dealId);
    }
  }

  refreshAll();
  if (dealId) revalidatePath(`/deals/${dealId}`);
  const contactId = str(formData, 'contact_id');
  if (contactId) revalidatePath(`/kontakte/${contactId}`);
}

export async function deleteActivity(formData: FormData) {
  const { supabase } = await ctx();
  await supabase.from('activities').delete().eq('id', String(formData.get('id')));
  refreshAll();
}

/* ------------------------------ Aufgaben ------------------------------ */

export async function createTask(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();
  const { error } = await supabase.from('tasks').insert({
    org_id: orgId,
    deal_id: str(formData, 'deal_id'),
    contact_id: str(formData, 'contact_id'),
    assignee_id: str(formData, 'assignee_id') ?? profile.id,
    created_by: profile.id,
    title: str(formData, 'title') ?? 'Aufgabe',
    description: str(formData, 'description'),
    due_at: str(formData, 'due_at'),
    priority: Number(str(formData, 'priority') ?? 2),
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function toggleTask(formData: FormData) {
  const { supabase } = await ctx();
  const id = String(formData.get('id'));
  const done = formData.get('done') === 'true';
  await supabase.from('tasks')
    .update({ done: !done, done_at: !done ? new Date().toISOString() : null })
    .eq('id', id);
  refreshAll();
}

export async function deleteTask(formData: FormData) {
  const { supabase } = await ctx();
  await supabase.from('tasks').delete().eq('id', String(formData.get('id')));
  refreshAll();
}

/* --------------------------- Pipelines/Phasen ------------------------- */

export async function createPipeline(formData: FormData) {
  const { supabase, orgId } = await ctx();
  const { count } = await supabase
    .from('pipelines').select('id', { count: 'exact', head: true }).eq('org_id', orgId);

  const { data, error } = await supabase.from('pipelines').insert({
    org_id: orgId,
    name: str(formData, 'name') ?? 'Neue Pipeline',
    kind: str(formData, 'kind') ?? 'sonstige',
    position: count ?? 0,
  }).select('id').single();
  if (error) throw new Error(error.message);

  await supabase.from('pipeline_stages').insert([
    { pipeline_id: data.id, name: 'Neu', position: 0, probability: 10, color: '#64748b' },
    { pipeline_id: data.id, name: 'In Arbeit', position: 1, probability: 50, color: '#6366f1' },
    { pipeline_id: data.id, name: 'Gewonnen', position: 2, probability: 100, color: '#22c55e', is_won: true },
    { pipeline_id: data.id, name: 'Verloren', position: 3, probability: 0, color: '#ef4444', is_lost: true },
  ]);

  revalidatePath('/einstellungen');
  revalidatePath('/pipelines');
}

export async function renamePipeline(formData: FormData) {
  const { supabase } = await ctx();
  await supabase.from('pipelines')
    .update({ name: str(formData, 'name') ?? 'Pipeline' })
    .eq('id', String(formData.get('id')));
  revalidatePath('/einstellungen');
  revalidatePath('/pipelines');
}

export async function deletePipeline(formData: FormData) {
  const { supabase } = await ctx();
  await supabase.from('pipelines').delete().eq('id', String(formData.get('id')));
  revalidatePath('/einstellungen');
  revalidatePath('/pipelines');
}

export async function createStage(formData: FormData) {
  const { supabase } = await ctx();
  const pipelineId = String(formData.get('pipeline_id'));
  const { count } = await supabase
    .from('pipeline_stages').select('id', { count: 'exact', head: true }).eq('pipeline_id', pipelineId);

  await supabase.from('pipeline_stages').insert({
    pipeline_id: pipelineId,
    name: str(formData, 'name') ?? 'Neue Phase',
    position: count ?? 0,
    probability: Number(str(formData, 'probability') ?? 0),
    color: str(formData, 'color') ?? '#64748b',
    is_won: formData.get('is_won') === 'on',
    is_lost: formData.get('is_lost') === 'on',
  });
  revalidatePath('/einstellungen');
  revalidatePath('/pipelines');
}

export async function updateStage(formData: FormData) {
  const { supabase } = await ctx();
  await supabase.from('pipeline_stages').update({
    name: str(formData, 'name') ?? 'Phase',
    probability: Number(str(formData, 'probability') ?? 0),
    color: str(formData, 'color') ?? '#64748b',
    is_won: formData.get('is_won') === 'on',
    is_lost: formData.get('is_lost') === 'on',
  }).eq('id', String(formData.get('id')));
  revalidatePath('/einstellungen');
  revalidatePath('/pipelines');
}

export async function deleteStage(formData: FormData) {
  const { supabase } = await ctx();
  const { error } = await supabase.from('pipeline_stages').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('Phase enthält noch Deals – bitte zuerst verschieben.');
  revalidatePath('/einstellungen');
  revalidatePath('/pipelines');
}

/* ----------------------------- Team/Rollen ---------------------------- */

export async function updateTeamMember(formData: FormData) {
  const { supabase, profile } = await ctx();
  if (profile.role !== 'admin' && profile.role !== 'manager') {
    throw new Error('Nur Manager dürfen Rollen ändern.');
  }
  await supabase.from('profiles').update({
    role: str(formData, 'role') ?? 'setter',
    active: formData.get('active') === 'on',
  }).eq('id', String(formData.get('id')));
  revalidatePath('/einstellungen');
}

export async function joinOrganization(formData: FormData) {
  const { supabase, profile } = await ctx();
  await supabase.from('profiles')
    .update({ full_name: str(formData, 'full_name'), phone: str(formData, 'phone') })
    .eq('id', profile.id);
  revalidatePath('/einstellungen');
}
