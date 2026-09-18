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

type Db = Awaited<ReturnType<typeof ctx>>['supabase'];

/**
 * Welche Phase eine Aktivitaet nahelegt. Namen, weil die Phasen zur
 * Laufzeit umbenannt werden koennen - passt keiner, passiert nichts.
 */
function phaseAusAktivitaet(formData: FormData, type: string): string[] {
  if (type === 'linkedin') return ['LinkedIn angeschrieben'];
  // E-Mail bewusst NICHT: von Hand protokolliert steht nicht fest, wer
  // geschrieben hat, und eine eingehende Absage ist nicht "E-Mail
  // geschrieben". Fuer selbst verschickte Mails setzt sendDealEmail die
  // Phase, dort ist die Richtung bekannt.
  if (type !== 'call') return [];

  const wer = str(formData, 'answered_by');
  if (wer === 'entscheider') return ['Entscheider erreicht'];
  if (wer === 'gatekeeper') return ['Gatekeeper erreicht'];

  const ergebnis = str(formData, 'outcome');
  if (ergebnis === 'nicht_erreicht' || ergebnis === 'mailbox') return ['Niemand rangegangen'];
  if (ergebnis === 'wiedervorlage') return ['Nochmal anrufen'];
  if (ergebnis === 'kein_interesse') return ['Entscheider kein Interesse'];
  return [];
}

/**
 * Die Phase der Aktivitaet nachziehen. Zwei Sicherungen: es wird nur nach
 * VORNE geschoben (Position in der Pipeline), und gewonnene oder verlorene
 * Phasen werden nie automatisch gesetzt. Damit kann ein nachtraeglich
 * erfasster Anruf keinen weit fortgeschrittenen Deal zurueckwerfen.
 */
export async function phaseNachziehen(supabase: Db, dealId: string, namen: string[]) {
  if (!namen.length) return;

  const { data: deal } = await supabase
    .from('deals').select('pipeline_id, stage_id, status').eq('id', dealId).single();
  if (!deal?.pipeline_id || deal.status !== 'offen') return;

  const { data: stages } = await supabase
    .from('pipeline_stages').select('id, name, position, is_won, is_lost')
    .eq('pipeline_id', deal.pipeline_id).order('position');
  if (!stages?.length) return;

  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const ziel = stages.find((s) => namen.some((n) => gleich(s.name, n)));
  if (!ziel || ziel.is_won || ziel.is_lost) return;

  const jetzt = stages.find((s) => s.id === deal.stage_id);
  if (jetzt && jetzt.position >= ziel.position) return;

  await supabase.from('deals').update({ stage_id: ziel.id }).eq('id', dealId);
}

/**
 * Wiedervorlage aus dem Formular: wird als Aufgabe angelegt und bleibt mit
 * Kontakt und Deal verknuepft, damit sie aus der Aufgabenliste heraus
 * auffindbar ist. Ohne `followup_at` passiert nichts.
 */
async function createFollowUp(
  supabase: Db, orgId: string, profileId: string,
  formData: FormData, contactId: string | null, dealId: string | null,
) {
  const at = str(formData, 'followup_at');
  if (!at) return;

  let titel = str(formData, 'followup_title');
  if (!titel) {
    let firma: string | null = null;
    if (contactId) {
      const { data: c } = await supabase.from('contacts').select('company').eq('id', contactId).single();
      firma = c?.company ?? null;
    }
    titel = firma ? `Nochmal anrufen: ${firma}` : 'Nochmal anrufen';
  }

  const prio = Number(str(formData, 'followup_priority') ?? 2);
  await supabase.from('tasks').insert({
    org_id: orgId, contact_id: contactId, deal_id: dealId,
    assignee_id: profileId, created_by: profileId,
    title: titel, due_at: at, priority: [1, 2, 3].includes(prio) ? prio : 2,
  });
}

export async function logActivity(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();
  const type = String(formData.get('type') || 'note');
  const minutes = Number(str(formData, 'duration_minutes') ?? 0);
  const contactId = str(formData, 'contact_id');
  const dealId = str(formData, 'deal_id');

  const { error } = await supabase.from('activities').insert({
    org_id: orgId,
    deal_id: dealId,
    contact_id: contactId,
    user_id: profile.id,
    type,
    call_kind: type === 'call' ? str(formData, 'call_kind') : null,
    outcome: type === 'call' ? str(formData, 'outcome') : null,
    duration_seconds: type === 'call'
      ? (Number(str(formData, 'duration_seconds') ?? 0) || (minutes > 0 ? Math.round(minutes * 60) : null))
      : null,
    answered_by: type === 'call' ? str(formData, 'answered_by') : null,
    phone_number: str(formData, 'phone_number'),
    subject: str(formData, 'subject'),
    body: str(formData, 'body'),
    occurred_at: (() => {
      const d = str(formData, 'date'); const t = str(formData, 'time');
      if (d) return new Date(`${d}T${t ?? '12:00'}`).toISOString();
      return str(formData, 'occurred_at') ?? new Date().toISOString();
    })(),
  });
  if (error) throw new Error(error.message);

  await createFollowUp(supabase, orgId, profile.id, formData, contactId, dealId);

  // Eine ausdrueckliche Wahl im Formular gewinnt immer. Fehlt sie, zieht
  // die Phase der Aktivitaet nach: wer angeschrieben wurde, steht nicht
  // mehr auf "Offen".
  const nextStage = str(formData, 'next_stage_id');
  if (nextStage && dealId) {
    const { data: stage } = await supabase
      .from('pipeline_stages').select('pipeline_id').eq('id', nextStage).single();
    if (stage) {
      await supabase.from('deals')
        .update({ stage_id: nextStage, pipeline_id: stage.pipeline_id }).eq('id', dealId);
    }
  } else if (dealId) {
    await phaseNachziehen(supabase, dealId, phaseAusAktivitaet(formData, type));
  }

  refreshAll();
  if (dealId) revalidatePath(`/deals/${dealId}`);
  if (contactId) revalidatePath(`/kontakte/${contactId}`);
}

export async function updateActivity(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();
  const type = String(formData.get('type') || 'note');
  const minutes = Number(str(formData, 'duration_minutes') ?? 0);
  const datum = str(formData, 'date');

  // Importierte Mails schicken weder Betreff noch Text mit - die bleiben,
  // wie sie sind. Nur Felder aendern, die das Formular tatsaechlich enthaelt.
  const patch: Record<string, unknown> = {};
  if (type === 'call') {
    patch.call_kind = str(formData, 'call_kind');
    patch.outcome = str(formData, 'outcome');
    patch.answered_by = str(formData, 'answered_by');
    patch.duration_seconds = minutes > 0 ? Math.round(minutes * 60) : null;
  }
  if (formData.has('subject')) patch.subject = str(formData, 'subject');
  if (formData.has('body')) patch.body = str(formData, 'body');
  if (formData.has('comment')) patch.comment = str(formData, 'comment');
  if (datum) patch.occurred_at = new Date(`${datum}T${str(formData, 'time') ?? '12:00'}`).toISOString();

  const { error } = await supabase.from('activities').update(patch).eq('id', String(formData.get('id')));
  if (error) throw new Error(error.message);

  // Kontakt und Deal stehen nicht im Formular, sie kommen aus der Aktivitaet.
  const { data: a } = await supabase
    .from('activities').select('contact_id, deal_id').eq('id', String(formData.get('id'))).single();

  // Auch beim Nachtragen laesst sich eine Wiedervorlage setzen ...
  if (str(formData, 'followup_at')) {
    await createFollowUp(supabase, orgId, profile.id, formData, a?.contact_id ?? null, a?.deal_id ?? null);
  }
  // ... und der Deal verschieben, z. B. eine importierte Absage auf Verloren.
  const nextStage = str(formData, 'next_stage_id');
  if (nextStage && a?.deal_id) {
    const { data: stage } = await supabase
      .from('pipeline_stages').select('pipeline_id').eq('id', nextStage).single();
    if (stage) {
      await supabase.from('deals')
        .update({ stage_id: nextStage, pipeline_id: stage.pipeline_id }).eq('id', a.deal_id);
    }
  }

  refreshAll();
}

export async function deleteActivity(formData: FormData) {
  const { supabase } = await ctx();
  const { error } = await supabase.from('activities').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error(`Aktivitaet konnte nicht geloescht werden: ${error.message}`);
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

export async function updateTask(formData: FormData) {
  const { supabase } = await ctx();
  const { error } = await supabase.from('tasks').update({
    title: str(formData, 'title') ?? 'Aufgabe',
    due_at: str(formData, 'due_at'),
    priority: Number(str(formData, 'priority') ?? 2),
  }).eq('id', String(formData.get('id')));
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function toggleTask(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();
  const id = String(formData.get('id'));
  const done = formData.get('done') === 'true';

  // Beim Abhaken einen Eintrag in die Zeitleiste schreiben. Sonst fehlt in
  // der Geschichte des Kontakts genau das, was tatsaechlich getan wurde.
  if (!done) {
    const { data: t } = await supabase
      .from('tasks').select('title, contact_id, deal_id').eq('id', id).single();
    if (t?.contact_id || t?.deal_id) {
      await supabase.from('activities').insert({
        org_id: orgId, contact_id: t.contact_id, deal_id: t.deal_id, user_id: profile.id,
        type: 'task', subject: `Erledigt: ${t.title}`, occurred_at: new Date().toISOString(),
      });
    }
  }

  await supabase.from('tasks')
    .update({ done: !done, done_at: !done ? new Date().toISOString() : null })
    .eq('id', id);
  refreshAll();
}

export async function deleteTask(formData: FormData) {
  const { supabase } = await ctx();
  const { error } = await supabase.from('tasks').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error(`Aufgabe konnte nicht geloescht werden: ${error.message}`);
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

/**
 * Phase eine Position nach oben oder unten. Nummeriert die ganze Pipeline
 * neu durch, damit doppelte Positionen aus Altbestaenden nicht zu einer
 * zufaelligen Reihenfolge fuehren.
 */
export async function moveStage(formData: FormData) {
  const { supabase } = await ctx();
  const id = String(formData.get('id'));
  const dir = formData.get('dir') === 'up' ? -1 : 1;

  const { data: stage } = await supabase
    .from('pipeline_stages').select('id, pipeline_id').eq('id', id).single();
  if (!stage) return;

  const { data: list } = await supabase
    .from('pipeline_stages').select('id').eq('pipeline_id', stage.pipeline_id).order('position');
  if (!list) return;

  const i = list.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;

  const neu = [...list];
  [neu[i], neu[j]] = [neu[j], neu[i]];
  for (const [pos, s] of neu.entries()) {
    await supabase.from('pipeline_stages').update({ position: pos }).eq('id', s.id);
  }
  revalidatePath('/einstellungen');
  revalidatePath('/pipelines');
}

/** Reihenfolge der Phasen einer Pipeline komplett neu setzen (Drag & Drop). */
export async function reorderStages(pipelineId: string, ids: string[]) {
  const { supabase } = await ctx();
  const { data: list } = await supabase
    .from('pipeline_stages').select('id').eq('pipeline_id', pipelineId);
  const erlaubt = new Set((list ?? []).map((s) => s.id));
  const reihe = ids.filter((id) => erlaubt.has(id));
  for (const [pos, id] of reihe.entries()) {
    await supabase.from('pipeline_stages').update({ position: pos }).eq('id', id);
  }
  revalidatePath('/pipelines');
  revalidatePath('/einstellungen');
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
