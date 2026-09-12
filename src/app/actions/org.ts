'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PIPELINE_TEMPLATES } from '@/lib/pipeline-templates';
import { LEAD_SOURCES } from '@/lib/labels';

/** Legt Organisation samt Standard-Pipelines an und macht den Nutzer zum Admin. */
export async function createOrganization(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const withDemo = formData.get('demo') === 'on';
  if (!name) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // ID vorab erzeugen: ein INSERT ... RETURNING wuerde an RLS scheitern,
  // weil das Profil in diesem Moment noch keiner Organisation gehoert.
  const org = { id: crypto.randomUUID() };
  const { error: orgError } = await supabase.from('organizations').insert({ id: org.id, name });
  if (orgError) throw new Error(orgError.message);

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      org_id: org.id,
      role: 'admin',
      email: user.email,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? user.email,
    }, { onConflict: 'id' });
  if (profileError) throw new Error(profileError.message);

  for (const [i, tpl] of PIPELINE_TEMPLATES.entries()) {
    const { data: pipeline, error } = await supabase
      .from('pipelines')
      .insert({ org_id: org.id, name: tpl.name, kind: tpl.kind, position: i })
      .select('id').single();
    if (error) throw new Error(error.message);

    await supabase.from('pipeline_stages').insert(
      tpl.stages.map((s, j) => ({
        pipeline_id: pipeline.id,
        name: s.name,
        position: j,
        probability: s.probability,
        color: s.color,
        is_won: s.is_won ?? false,
        is_lost: s.is_lost ?? false,
      })),
    );
  }

  if (withDemo) await seedDemoData(org.id, user.id);

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

const FIRST = ['Anna', 'Ben', 'Clara', 'David', 'Elena', 'Felix', 'Greta', 'Hannes', 'Ida', 'Jonas', 'Katrin', 'Lars'];
const LAST = ['Berger', 'Fischer', 'Gruber', 'Hoffmann', 'Keller', 'Lang', 'Meier', 'Neumann', 'Richter', 'Schulz', 'Vogel', 'Weber'];
const COMPANY = ['Nordlicht GmbH', 'Auriga Media', 'Kranich Consulting', 'Blue Harbor', 'Stellar Coaching',
  'Feldmann & Partner', 'Orbit Agentur', 'Hansa Digital', 'Vertex Studio', 'Lumen Group'];

async function seedDemoData(orgId: string, userId: string) {
  const supabase = await createClient();

  const { data: pipelines } = await supabase
    .from('pipelines').select('id, name').eq('org_id', orgId).order('position');
  if (!pipelines?.length) return;

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, pipeline_id, position, is_won, is_lost')
    .in('pipeline_id', pipelines.map((p) => p.id));
  if (!stages?.length) return;

  const contacts = Array.from({ length: 24 }, (_, i) => ({
    org_id: orgId,
    company: COMPANY[i % COMPANY.length],
    website: `${COMPANY[i % COMPANY.length].toLowerCase().replace(/[^a-z]+/g, '-')}.example.com`,
    city: ['Berlin', 'Hamburg', 'München', 'Köln', 'Graz', 'Zürich'][i % 6],
    postal_code: String(10000 + i * 1234).slice(0, 5),
    country: i % 7 === 0 ? 'Österreich' : i % 11 === 0 ? 'Schweiz' : 'Deutschland',
    lead_source: LEAD_SOURCES[i % LEAD_SOURCES.length],
    opener_kuerzel: ['MM', 'AK', 'LS'][i % 3],
    owner_id: userId,
    created_by: userId,
  }));

  const { data: insertedContacts } = await supabase.from('contacts').insert(contacts).select('id');
  if (!insertedContacts?.length) return;

  const persons = insertedContacts.flatMap((c, i) => {
    const extra = i % 3 === 0 ? 1 : i % 5 === 0 ? 2 : 0;
    return Array.from({ length: 1 + extra }, (_, j) => {
      const fi = (i + j * 4) % FIRST.length;
      const li = (i * 5 + j) % LAST.length;
      return {
        org_id: orgId,
        contact_id: c.id,
        first_name: FIRST[fi],
        last_name: LAST[li],
        email: `${FIRST[fi].toLowerCase()}.${LAST[li].toLowerCase()}@example.com`,
        phone: `+49 151 ${String(1000000 + i * 13457 + j * 991).slice(0, 7)}`,
        is_primary: j === 0,
        position: j,
      };
    });
  });
  await supabase.from('contact_persons').insert(persons);

  const deals = insertedContacts.map((c, i) => {
    const pipeline = pipelines[i % pipelines.length];
    const pipelineStages = stages.filter((s) => s.pipeline_id === pipeline.id)
      .sort((a, b) => a.position - b.position);
    const stage = pipelineStages[i % pipelineStages.length];
    const daysAgo = (i * 3) % 60;
    return {
      org_id: orgId,
      contact_id: c.id,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      title: `${COMPANY[i % COMPANY.length]} – ${pipeline.name}`,
      value: 1500 + ((i * 737) % 12000),
      source: LEAD_SOURCES[i % LEAD_SOURCES.length],
      owner_id: userId,
      setter_id: userId,
      closer_id: userId,
      position: i,
      created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    };
  });

  const { data: insertedDeals } = await supabase.from('deals').insert(deals).select('id, contact_id');
  if (!insertedDeals?.length) return;

  const kinds = ['opening', 'setting', 'closing', 'followup'] as const;
  const outcomes = ['erreicht', 'nicht_erreicht', 'mailbox', 'termin_vereinbart',
    'kein_interesse', 'wiedervorlage', 'abgeschlossen'] as const;

  const activities = insertedDeals.flatMap((d, i) =>
    Array.from({ length: 3 }, (_, j) => ({
      org_id: orgId,
      deal_id: d.id,
      contact_id: d.contact_id,
      user_id: userId,
      type: 'call' as const,
      call_kind: kinds[(i + j) % kinds.length],
      outcome: outcomes[(i * 2 + j) % outcomes.length],
      duration_seconds: 60 + ((i * 47 + j * 13) % 900),
      subject: 'Demo-Gespräch',
      occurred_at: new Date(Date.now() - (((i * 3 + j) % 45) * 86400000)).toISOString(),
    })),
  );
  await supabase.from('activities').insert(activities);

  await supabase.from('tasks').insert(
    insertedDeals.slice(0, 8).map((d, i) => ({
      org_id: orgId,
      deal_id: d.id,
      contact_id: d.contact_id,
      assignee_id: userId,
      created_by: userId,
      title: i % 2 ? 'Angebot nachfassen' : 'Wiedervorlage anrufen',
      due_at: new Date(Date.now() + (i - 3) * 86400000).toISOString(),
      priority: (i % 3) + 1,
    })),
  );
}
