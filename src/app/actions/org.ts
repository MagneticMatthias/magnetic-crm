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

  const { data: org, error: orgError } = await supabase
    .from('organizations').insert({ name }).select('id').single();
  if (orgError) throw new Error(orgError.message);

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ org_id: org.id, role: 'admin', email: user.email })
    .eq('id', user.id);
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
    first_name: FIRST[i % FIRST.length],
    last_name: LAST[(i * 5) % LAST.length],
    email: `${FIRST[i % FIRST.length].toLowerCase()}.${LAST[(i * 5) % LAST.length].toLowerCase()}@example.com`,
    phone: `+49 151 ${String(1000000 + i * 13457).slice(0, 7)}`,
    company: COMPANY[i % COMPANY.length],
    lead_source: LEAD_SOURCES[i % LEAD_SOURCES.length],
    owner_id: userId,
    created_by: userId,
  }));

  const { data: insertedContacts } = await supabase.from('contacts').insert(contacts).select('id');
  if (!insertedContacts?.length) return;

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
