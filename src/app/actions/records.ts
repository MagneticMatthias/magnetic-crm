'use server';

import { revalidatePath } from 'next/cache';
import { ctx, str } from '@/lib/ctx';
import { smtpConfigured } from '@/lib/mailer';
import type {
  Activity, ContactPerson, ContactWithPersons, Deal, EmailTemplate, FilterDefinition, NoteWithUser,
  Pipeline, Stage, Task,
} from '@/lib/types';

function refresh() {
  revalidatePath('/kontakte');
  revalidatePath('/pipelines');
  revalidatePath('/dashboard');
  revalidatePath('/dialer');
}

/* ------------------------- Detail-Panel laden ------------------------- */

export type ContactDetail = {
  contact: ContactWithPersons;
  deals: (Deal & { pipeline: { name: string } | null; stage: { name: string; color: string } | null })[];
  pipelines: Pipeline[];
  stages: Stage[];
  activities: (Activity & { user: { full_name: string | null; email: string | null } | null })[];
  notes: NoteWithUser[];
  tasks: Task[];
  templates: EmailTemplate[];
  smtpReady: boolean;
};

export async function loadContactDetail(contactId: string): Promise<ContactDetail | null> {
  const { supabase, orgId } = await ctx();

  const { data: contact } = await supabase
    .from('contacts')
    .select('*, persons:contact_persons(*)')
    .eq('id', contactId)
    .maybeSingle();
  if (!contact) return null;

  const [{ data: deals }, { data: pipelines }, { data: stages }, { data: activities }, { data: notes }, { data: tasks }, { data: templates }] =
    await Promise.all([
      supabase.from('deals')
        .select('*, pipeline:pipelines(name), stage:pipeline_stages(name, color)')
        .eq('contact_id', contactId).order('created_at', { ascending: false }),
      supabase.from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position'),
      supabase.from('pipeline_stages').select('*').order('position'),
      supabase.from('activities').select('*, user:profiles(full_name, email)')
        .eq('contact_id', contactId).order('occurred_at', { ascending: false }).limit(100),
      supabase.from('notes').select('*, user:profiles(full_name, email)')
        .eq('contact_id', contactId).order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('contact_id', contactId).order('done').order('due_at').limit(30),
      supabase.from('email_templates').select('*').eq('org_id', orgId).order('name'),
    ]);

  const c = contact as ContactWithPersons;
  c.persons = [...(c.persons ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);

  return {
    contact: c,
    deals: (deals ?? []) as ContactDetail['deals'],
    pipelines: (pipelines ?? []) as Pipeline[],
    stages: (stages ?? []) as Stage[],
    activities: (activities ?? []) as ContactDetail['activities'],
    notes: (notes ?? []) as NoteWithUser[],
    tasks: (tasks ?? []) as Task[],
    templates: (templates ?? []) as EmailTemplate[],
    smtpReady: smtpConfigured(),
  };
}

/* ----------------------------- Stammdaten ----------------------------- */

const CONTACT_FIELDS = new Set([
  'company', 'website', 'postal_code', 'city', 'country', 'lead_source', 'opener_kuerzel', 'notes', 'owner_id',
]);

export async function updateContactFields(contactId: string, patch: Record<string, string | null>) {
  const { supabase } = await ctx();
  const clean: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (CONTACT_FIELDS.has(k)) clean[k] = v?.trim() ? v.trim() : null;
  }
  if (Object.keys(clean).length === 0) return;

  const { error } = await supabase.from('contacts').update(clean).eq('id', contactId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function createContactQuick(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();

  const { data: contact, error } = await supabase.from('contacts').insert({
    org_id: orgId,
    company: str(formData, 'company'),
    website: str(formData, 'website'),
    lead_source: str(formData, 'lead_source'),
    owner_id: profile.id,
    created_by: profile.id,
  }).select('id').single();
  if (error) throw new Error(error.message);

  const first = str(formData, 'first_name');
  const last = str(formData, 'last_name');
  const email = str(formData, 'email');
  const phone = str(formData, 'phone');
  if (first || last || email || phone) {
    await supabase.from('contact_persons').insert({
      org_id: orgId, contact_id: contact.id,
      first_name: first, last_name: last, email, phone, is_primary: true,
    });
  }

  refresh();
  return contact.id as string;
}

export async function deleteContactRecord(contactId: string) {
  const { supabase } = await ctx();
  await supabase.from('contacts').delete().eq('id', contactId);
  refresh();
}

/* --------------------------- Ansprechpartner -------------------------- */

const PERSON_FIELDS = new Set(['first_name', 'last_name', 'email', 'phone', 'job_title']);

export async function addPerson(contactId: string): Promise<ContactPerson> {
  const { supabase, orgId } = await ctx();
  const { count } = await supabase
    .from('contact_persons').select('id', { count: 'exact', head: true }).eq('contact_id', contactId);

  const { data, error } = await supabase.from('contact_persons').insert({
    org_id: orgId, contact_id: contactId, position: count ?? 0, is_primary: (count ?? 0) === 0,
  }).select('*').single();
  if (error) throw new Error(error.message);
  refresh();
  return data as ContactPerson;
}

export async function updatePerson(personId: string, patch: Record<string, string | null>) {
  const { supabase } = await ctx();
  const clean: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (PERSON_FIELDS.has(k)) clean[k] = v?.trim() ? v.trim() : null;
  }
  if (Object.keys(clean).length === 0) return;
  const { error } = await supabase.from('contact_persons').update(clean).eq('id', personId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function setPrimaryPerson(personId: string) {
  const { supabase } = await ctx();
  await supabase.from('contact_persons').update({ is_primary: true }).eq('id', personId);
  refresh();
}

export async function deletePerson(personId: string) {
  const { supabase } = await ctx();
  await supabase.from('contact_persons').delete().eq('id', personId);
  refresh();
}

/* ------------------------------ Deal-Status --------------------------- */

export async function setDealStage(dealId: string, stageId: string) {
  const { supabase } = await ctx();
  const { data: stage } = await supabase
    .from('pipeline_stages').select('pipeline_id').eq('id', stageId).single();
  if (!stage) throw new Error('Phase nicht gefunden');
  const { error } = await supabase.from('deals')
    .update({ stage_id: stageId, pipeline_id: stage.pipeline_id }).eq('id', dealId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function createDealForContact(contactId: string, stageId: string) {
  const { supabase, orgId, profile } = await ctx();
  const [{ data: stage }, { data: contact }] = await Promise.all([
    supabase.from('pipeline_stages').select('pipeline_id').eq('id', stageId).single(),
    supabase.from('contacts').select('company, lead_source').eq('id', contactId).single(),
  ]);
  if (!stage) throw new Error('Phase nicht gefunden');

  const { error } = await supabase.from('deals').insert({
    org_id: orgId,
    contact_id: contactId,
    pipeline_id: stage.pipeline_id,
    stage_id: stageId,
    title: contact?.company ?? 'Neuer Deal',
    source: contact?.lead_source ?? null,
    owner_id: profile.id,
    setter_id: profile.id,
  });
  if (error) throw new Error(error.message);
  refresh();
}

/* -------------------------------- Notizen ----------------------------- */

export async function createNote(input: { contactId: string; dealId?: string | null; body: string }) {
  const { supabase, orgId, profile } = await ctx();
  const body = input.body.trim();
  if (!body || body === '<br>') return;
  const { error } = await supabase.from('notes').insert({
    org_id: orgId, contact_id: input.contactId, deal_id: input.dealId ?? null,
    user_id: profile.id, body,
  });
  if (error) throw new Error(error.message);
}

export async function togglePinNote(noteId: string, pinned: boolean) {
  const { supabase } = await ctx();
  await supabase.from('notes').update({ pinned }).eq('id', noteId);
}

export async function deleteNote(noteId: string) {
  const { supabase } = await ctx();
  await supabase.from('notes').delete().eq('id', noteId);
}

/* --------------------------- Gespeicherte Filter ---------------------- */

export async function saveFilter(entity: 'contacts' | 'deals', name: string, definition: FilterDefinition) {
  const { supabase, orgId, profile } = await ctx();
  const { error } = await supabase.from('saved_filters').insert({
    org_id: orgId, user_id: profile.id, entity, name, definition,
  });
  if (error) throw new Error(error.message);
  revalidatePath(entity === 'contacts' ? '/kontakte' : '/pipelines');
}

export async function deleteSavedFilter(id: string) {
  const { supabase } = await ctx();
  await supabase.from('saved_filters').delete().eq('id', id);
  revalidatePath('/kontakte');
  revalidatePath('/pipelines');
}
