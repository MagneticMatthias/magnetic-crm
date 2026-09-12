'use server';

import { revalidatePath } from 'next/cache';
import { ctx, str } from '@/lib/ctx';

/**
 * Ergebnis eines Dialer-Gespraechs festhalten und den Deal optional
 * weiterschieben. Gibt die ID des Deals zurueck, damit der Client die
 * Liste lokal weiterdrehen kann.
 */
export async function logDialerCall(input: {
  dealId: string;
  contactId: string | null;
  callKind: string;
  outcome: string;
  durationSeconds: number;
  note: string | null;
  phone: string | null;
  nextStageId: string | null;
  followUpAt: string | null;
}) {
  const { supabase, orgId, profile } = await ctx();

  const { error } = await supabase.from('activities').insert({
    org_id: orgId,
    deal_id: input.dealId,
    contact_id: input.contactId,
    user_id: profile.id,
    type: 'call',
    call_kind: input.callKind,
    outcome: input.outcome,
    duration_seconds: input.durationSeconds > 0 ? input.durationSeconds : null,
    phone_number: input.phone,
    body: input.note,
  });
  if (error) throw new Error(error.message);

  if (input.nextStageId) {
    const { data: stage } = await supabase
      .from('pipeline_stages').select('pipeline_id').eq('id', input.nextStageId).single();
    if (stage) {
      await supabase.from('deals')
        .update({ stage_id: input.nextStageId, pipeline_id: stage.pipeline_id })
        .eq('id', input.dealId);
    }
  }

  if (input.followUpAt) {
    await supabase.from('tasks').insert({
      org_id: orgId,
      deal_id: input.dealId,
      contact_id: input.contactId,
      assignee_id: profile.id,
      created_by: profile.id,
      title: 'Wiedervorlage anrufen',
      due_at: input.followUpAt,
      priority: 1,
    });
  }

  revalidatePath('/dialer');
  revalidatePath('/pipeline');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function startDialerSession(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();
  await supabase.from('dialer_sessions').insert({
    org_id: orgId,
    user_id: profile.id,
    stage_id: str(formData, 'stage_id'),
  });
}
