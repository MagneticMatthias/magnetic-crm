'use server';

import { revalidatePath } from 'next/cache';
import { wiedervorlagenZuordnen, type Wiedervorlage } from '@/lib/wiedervorlage';
import { nachPhasenwechsel, passiertAnwenden, zuFaden } from '@/lib/phasenwechsel';
import { passiertRegel } from '@/lib/passiert';
import { istFaeden } from '@/lib/faeden';
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
  /** Wiedervorlage je Aktivitaet (Aktivitaets-ID -> Aufgabe) */
  wiedervorlagen: Record<string, Wiedervorlage>;
  templates: EmailTemplate[];
  smtpReady: boolean;
  team: { id: string; full_name: string | null; email: string | null }[];
  focusDealId: string | null;
  layout: string[] | null;
};

export async function loadContactDetail(contactId: string, dealId?: string | null): Promise<ContactDetail | null> {
  const { supabase, orgId } = await ctx();

  const { data: contact } = await supabase
    .from('contacts')
    .select('*, persons:contact_persons(*)')
    .eq('id', contactId)
    .maybeSingle();
  if (!contact) return null;

  const [{ data: deals }, { data: pipelines }, { data: stages }, { data: activities }, { data: notes }, { data: tasks }, { data: templates }, { data: team }, { data: layout }] =
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
      supabase.from('tasks').select('*').eq('contact_id', contactId).order('done').order('due_at').limit(300),
      supabase.from('email_templates').select('*').eq('org_id', orgId).order('name'),
      supabase.from('profiles').select('id, full_name, email').eq('org_id', orgId).eq('active', true),
      supabase.from('column_layouts').select('columns').eq('view_key', 'deal_panel').maybeSingle(),
    ]);

  const c = contact as ContactWithPersons;
  c.persons = [...(c.persons ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);

  // Anhaenge der Notizen mit signierten URLs (1 h)
  const noteList = (notes ?? []) as NoteWithUser[];
  if (noteList.length) {
    const { data: atts } = await supabase.from('note_attachments').select('*')
      .in('note_id', noteList.map((n) => n.id)).order('created_at');
    if (atts?.length) {
      const { data: signed } = await supabase.storage.from('attachments')
        .createSignedUrls(atts.map((a) => a.path), 3600);
      const urlByPath = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
      noteList.forEach((n) => {
        n.attachments = atts.filter((a) => a.note_id === n.id)
          .map((a) => ({ ...a, url: urlByPath.get(a.path) ?? undefined }));
      });
    }
  }

  return {
    contact: c,
    deals: (deals ?? []) as ContactDetail['deals'],
    pipelines: (pipelines ?? []) as Pipeline[],
    stages: (stages ?? []) as Stage[],
    activities: (activities ?? []) as ContactDetail['activities'],
    notes: noteList,
    tasks: ((tasks ?? []) as Task[]).slice(0, 30),
    wiedervorlagen: wiedervorlagenZuordnen(
      (activities ?? []) as { id: string; contact_id: string | null; deal_id: string | null; created_at: string }[],
      (tasks ?? []) as unknown as Parameters<typeof wiedervorlagenZuordnen>[1],
    ),
    templates: (templates ?? []) as EmailTemplate[],
    smtpReady: smtpConfigured(),
    team: (team ?? []) as ContactDetail['team'],
    focusDealId: dealId ?? null,
    layout: Array.isArray(layout?.columns) ? (layout.columns as string[]) : null,
  };
}

/* ----------------------------- Stammdaten ----------------------------- */

const CONTACT_FIELDS = new Set([
  'company', 'website', 'postal_code', 'city', 'country', 'lead_source', 'opener_kuerzel', 'notes', 'owner_id',
]);

/** Ein Zusatzfeld (custom.*) am Kontakt setzen, z. B. kanal oder groesse. */
export async function updateContactCustom(contactId: string, key: string, value: string | null) {
  const { supabase } = await ctx();
  const { data } = await supabase.from('contacts').select('custom').eq('id', contactId).single();
  const custom = { ...((data?.custom as Record<string, unknown>) ?? {}), [key]: value?.trim() || null };
  const { error } = await supabase.from('contacts').update({ custom }).eq('id', contactId);
  if (error) throw new Error(error.message);
  refresh();
}

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
  await nachPhasenwechsel(supabase, dealId, stageId);
  refresh();
}

/** Tabelle: "Was ist passiert?" - Aktivitaet anlegen, Phase und Quelle setzen. */
export async function wasIstPassiert(dealId: string, eintrag: string): Promise<{ wiedervorlage: boolean }> {
  const { supabase, orgId, profile } = await ctx();
  const { data: deal } = await supabase.from('deals').select('contact_id, custom').eq('id', dealId).single();
  if (!deal) throw new Error('Deal nicht gefunden');
  const regel = passiertRegel(eintrag, (deal.custom as Record<string, string | null> | null)?.quelle);
  if (!regel) throw new Error('Unbekannter Eintrag');
  const { error } = await supabase.from('activities').insert({
    org_id: orgId, deal_id: dealId, contact_id: deal.contact_id, user_id: profile.id,
    type: regel.type, outcome: regel.outcome ?? null, subject: eintrag, occurred_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  await passiertAnwenden(supabase, dealId, regel);
  refresh();
  return { wiedervorlage: regel.wiedervorlage };
}

/** Wiedervorlage direkt aus der Tabelle (Aufgabe mit Datum am Deal). */
export async function wiedervorlageSetzen(dealId: string, faelligIso: string, betreff: string) {
  if (!faelligIso) throw new Error('Datum fehlt');
  const { supabase, orgId, profile } = await ctx();
  const { data: deal } = await supabase.from('deals').select('contact_id, title').eq('id', dealId).single();
  const { error } = await supabase.from('tasks').insert({
    org_id: orgId, deal_id: dealId, contact_id: deal?.contact_id ?? null,
    assignee_id: profile.id, created_by: profile.id, priority: 2,
    title: betreff.trim() || `Nachfassen: ${deal?.title ?? 'Deal'}`,
    due_at: faelligIso,
  });
  if (error) throw new Error(error.message);
  refresh();
}

/** Knopf „Zu Faden machen“: Deal wandert nach Faeden, Betrag (netto) ist Pflicht. */
export async function dealZuFaden(dealId: string, betragText: string, faelligIso: string) {
  const betrag = Number(String(betragText).replace(/\./g, '').replace(',', '.'));
  if (!betrag || betrag <= 0) throw new Error('Bitte einen Betrag angeben, eine Schätzung reicht.');
  if (!faelligIso) throw new Error('Bitte ein Datum für die Wiedervorlage angeben.');
  const { supabase, orgId, profile } = await ctx();
  await zuFaden(supabase, dealId, orgId, betrag);
  const { data: deal } = await supabase.from('deals').select('contact_id, title').eq('id', dealId).single();
  await supabase.from('tasks').insert({
    org_id: orgId, deal_id: dealId, contact_id: deal?.contact_id ?? null,
    assignee_id: profile.id, created_by: profile.id, priority: 2,
    title: `Nachfassen: ${deal?.title ?? 'Faden'}`, due_at: faelligIso,
  });
  refresh();
}

export async function createDealForContact(
  contactId: string, stageId: string,
  felder: { quelle: string; produkt: string; anlass?: string | null; title?: string | null; betrag?: string | null },
) {
  if (!felder.quelle?.trim() || !felder.produkt?.trim()) throw new Error('Quelle und Produkt sind Pflicht.');
  const { supabase, orgId, profile } = await ctx();
  const [{ data: stage }, { data: contact }] = await Promise.all([
    supabase.from('pipeline_stages').select('pipeline_id, pipeline:pipelines(name)').eq('id', stageId).single(),
    supabase.from('contacts').select('company, lead_source').eq('id', contactId).single(),
  ]);
  if (!stage) throw new Error('Phase nicht gefunden');
  const betrag = Number(String(felder.betrag ?? '').replace(/\./g, '').replace(',', '.')) || 0;
  const pipeName = (stage as unknown as { pipeline: { name: string } | null }).pipeline?.name;
  if (istFaeden(pipeName) && betrag <= 0) throw new Error('Für einen Faden ist der Betrag Pflicht, eine Schätzung reicht.');

  const { error } = await supabase.from('deals').insert({
    org_id: orgId,
    value: betrag,
    contact_id: contactId,
    pipeline_id: stage.pipeline_id,
    stage_id: stageId,
    title: felder.title?.trim() || contact?.company || 'Neuer Deal',
    source: contact?.lead_source ?? null,
    owner_id: profile.id,
    setter_id: profile.id,
    custom: {
      quelle: felder.quelle.trim(), produkt: felder.produkt.trim(),
      ...(felder.anlass?.trim() ? { anlass: felder.anlass.trim() } : {}),
    },
  });
  if (error) throw new Error(error.message);
  refresh();
}

const DEAL_FIELDS = new Set([
  'title', 'value', 'expected_close_date', 'next_step', 'source', 'setter_id', 'closer_id', 'owner_id',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'lost_reason',
]);

export async function updateDealFields(dealId: string, patch: Record<string, string | null>) {
  const { supabase } = await ctx();
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!DEAL_FIELDS.has(k)) continue;
    const t = v?.trim() ? v.trim() : null;
    clean[k] = k === 'value' ? Number(String(t ?? '0').replace(/\./g, '').replace(',', '.')) || 0 : t;
  }
  if (Object.keys(clean).length === 0) return;
  const { error } = await supabase.from('deals').update(clean).eq('id', dealId);
  if (error) throw new Error(error.message);
  refresh();
}

/** Setter-Qualifizierung liegt als freie Schluessel in deals.custom. */
export async function updateDealCustom(dealId: string, key: string, value: string | null) {
  const { supabase } = await ctx();
  const { data } = await supabase.from('deals').select('custom').eq('id', dealId).single();
  const custom = { ...((data?.custom as Record<string, unknown>) ?? {}), [key]: value?.trim() || null };
  const { error } = await supabase.from('deals').update({ custom }).eq('id', dealId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function savePanelLayout(cards: string[]) {
  const { supabase, orgId, profile } = await ctx();
  const { error } = await supabase.from('column_layouts').upsert(
    { org_id: orgId, user_id: profile.id, view_key: 'deal_panel', columns: cards },
    { onConflict: 'user_id,view_key' },
  );
  if (error) throw new Error(error.message);
}

/* -------------------------------- Notizen ----------------------------- */

export type PendingAttachment = { path: string; name: string; size: number; mime: string | null };

export async function createNote(input: {
  contactId: string; dealId?: string | null; body: string; attachments?: PendingAttachment[];
}) {
  const { supabase, orgId, profile } = await ctx();
  const body = input.body.trim();
  const atts = input.attachments ?? [];
  if ((!body || body === '<br>') && atts.length === 0) return;

  const noteId = crypto.randomUUID();
  const { error } = await supabase.from('notes').insert({
    id: noteId, org_id: orgId, contact_id: input.contactId, deal_id: input.dealId ?? null,
    user_id: profile.id, body: body || '',
  });
  if (error) throw new Error(error.message);

  if (atts.length) {
    const { error: aErr } = await supabase.from('note_attachments').insert(
      atts.map((a) => ({ org_id: orgId, note_id: noteId, ...a })),
    );
    if (aErr) throw new Error(aErr.message);
  }
}

export async function togglePinNote(noteId: string, pinned: boolean) {
  const { supabase } = await ctx();
  await supabase.from('notes').update({ pinned }).eq('id', noteId);
}

export async function deleteNote(noteId: string) {
  const { supabase } = await ctx();
  const { data: atts } = await supabase.from('note_attachments').select('path').eq('note_id', noteId);
  if (atts?.length) await supabase.storage.from('attachments').remove(atts.map((a) => a.path));
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

/* ------------------------------ Mehrfach loeschen ------------------------ */

export async function deleteContacts(ids: string[]) {
  if (!ids.length) return;
  const { supabase } = await ctx();
  const { error } = await supabase.from('contacts').delete().in('id', ids);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteDeals(ids: string[]) {
  if (!ids.length) return;
  const { supabase } = await ctx();
  const { error } = await supabase.from('deals').delete().in('id', ids);
  if (error) throw new Error(error.message);
  refresh();
}
