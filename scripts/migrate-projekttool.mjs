#!/usr/bin/env node
/**
 * Uebernimmt Kunden, Ansprechpartner, Projekte/Pipeline, Akquise-Listen mit
 * Leads, Status-Historie und Kontaktliste aus dem Projekttool (PocketBase)
 * nach Magnetic_CRM (Supabase).
 *
 * Aufruf (auf dem Mac im Ordner crm/):
 *   PB_URL=http://magnetic-nas:8090 PB_ADMIN_EMAIL=... PB_ADMIN_PASS=... \
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/migrate-projekttool.mjs
 *
 * Optionen:
 *   DRY_RUN=1   nur zaehlen, nichts schreiben
 *   CLEAR=1     vorher alle Kontakte/Deals/Aktivitaeten der Organisation loeschen (Beispieldaten!)
 *
 * Der Service-Role-Key umgeht RLS und gehoert NUR auf deinen Rechner, nie ins Repo.
 */
import { createClient } from '@supabase/supabase-js';

const env = (k, optional = false) => {
  const v = process.env[k];
  if (!v && !optional) { console.error(`Fehlt: ${k}`); process.exit(1); }
  return v;
};
const PB_URL = env('PB_URL').replace(/\/$/, '');
const PB_EMAIL = env('PB_ADMIN_EMAIL');
const PB_PASS = env('PB_ADMIN_PASS');
const SB_URL = env('SUPABASE_URL');
const SB_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const DRY = process.env.DRY_RUN === '1';
const CLEAR = process.env.CLEAR === '1';

/* ------------------------------ PocketBase ------------------------------ */
let pbToken = '';
async function pbLogin() {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS }),
  });
  if (!r.ok) throw new Error(`PocketBase-Login fehlgeschlagen: ${r.status} ${await r.text()}`);
  pbToken = (await r.json()).token;
}
async function pbAll(collection) {
  const items = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${PB_URL}/api/collections/${collection}/records?perPage=500&page=${page}`,
      { headers: { Authorization: pbToken } });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(`${collection}: ${r.status} ${await r.text()}`);
    const j = await r.json();
    items.push(...j.items);
    if (page >= j.totalPages) break;
  }
  return items;
}

/* ------------------------------- Supabase ------------------------------- */
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
async function must(p, label) {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();
const splitName = (full) => {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) };
};
const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toDate = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/* --------------------------- Pipelines sicherstellen -------------------- */
const PIPELINES = {
  kaltakquise: {
    name: 'Kaltakquise', kind: 'setter',
    stages: [
      ['Offen', 5, '#64748b'], ['Niemand rangegangen', 10, '#a1a1aa'], ['Nochmal anrufen', 20, '#f59e0b'],
      ['Gatekeeper erreicht', 25, '#0ea5e9'], ['Entscheider erreicht', 50, '#6366f1'],
      ['Erfolg', 100, '#22c55e', 'won'], ['An Gatekeeper gescheitert', 0, '#f97316', 'lost'],
      ['Entscheider kein Interesse', 0, '#ef4444', 'lost'],
    ],
  },
  angebot: {
    name: 'Angebot / Closing', kind: 'closer',
    stages: [
      ['Anfrage eingegangen', 30, '#0ea5e9'], ['Angebot verschickt', 60, '#8b5cf6'],
      ['Angebot angenommen', 100, '#22c55e', 'won'], ['Verloren', 0, '#ef4444', 'lost'],
    ],
  },
  bestand: {
    name: 'Bestandskunden', kind: 'upsell',
    stages: [
      ['Aktiv', 50, '#22c55e'], ['Projekt läuft', 60, '#6366f1'], ['Upsell-Potenzial', 70, '#8b5cf6'],
      ['Abgesprungen', 0, '#ef4444', 'lost'],
    ],
  },
};
const LEAD_STATUS_TO_STAGE = {
  'Offen': 'Offen', 'Niemand rangegangen': 'Niemand rangegangen', 'Nochmal anrufen': 'Nochmal anrufen',
  'Gatekeeper niemand erreicht': 'Gatekeeper erreicht', 'An Gatekeeper gescheitert': 'An Gatekeeper gescheitert',
  'Entscheider erreicht': 'Entscheider erreicht', 'Entscheider kein Interesse': 'Entscheider kein Interesse',
  'Erfolg': 'Erfolg',
};

async function ensurePipelines(orgId) {
  const existing = await must(sb.from('pipelines').select('id, name').eq('org_id', orgId), 'pipelines');
  const stagesAll = await must(sb.from('pipeline_stages').select('id, name, pipeline_id'), 'stages');
  const out = {};
  let pos = existing.length;
  for (const [key, def] of Object.entries(PIPELINES)) {
    let p = existing.find((x) => norm(x.name) === norm(def.name));
    if (!p && !DRY) {
      p = (await must(sb.from('pipelines').insert({ org_id: orgId, name: def.name, kind: def.kind, position: pos++ }).select('id, name').single(), 'pipeline insert'));
      console.log(`+ Pipeline "${def.name}" angelegt`);
    }
    const stageMap = {};
    if (p) {
      const have = stagesAll.filter((s) => s.pipeline_id === p.id);
      for (const [i, [name, prob, color, flag]] of def.stages.entries()) {
        let s = have.find((x) => norm(x.name) === norm(name));
        if (!s && !DRY) {
          s = await must(sb.from('pipeline_stages').insert({
            pipeline_id: p.id, name, position: i, probability: prob, color,
            is_won: flag === 'won', is_lost: flag === 'lost',
          }).select('id, name').single(), 'stage insert');
        }
        if (s) stageMap[name] = s.id;
      }
    }
    out[key] = { id: p?.id, stages: stageMap };
  }
  return out;
}

/* --------------------------------- Main --------------------------------- */
async function main() {
  console.log(DRY ? '🔍 Probelauf – es wird nichts geschrieben.' : '🚀 Migration startet.');
  await pbLogin();

  const orgs = await must(sb.from('organizations').select('id, name').limit(1), 'organizations');
  if (!orgs.length) throw new Error('Keine Organisation in Supabase – bitte zuerst im CRM anlegen.');
  const orgId = orgs[0].id;
  const admins = await must(sb.from('profiles').select('id').eq('org_id', orgId).eq('role', 'admin').limit(1), 'profiles');
  const userId = admins[0]?.id ?? null;
  console.log(`Organisation: ${orgs[0].name}`);

  if (CLEAR && !DRY) {
    for (const t of ['tasks', 'notes', 'activities', 'deals', 'contacts']) {
      await must(sb.from(t).delete().eq('org_id', orgId), `clear ${t}`);
    }
    console.log('🧹 Bestehende Kontakte, Deals, Aktivitäten, Notizen, Aufgaben gelöscht.');
  }

  const pipes = await ensurePipelines(orgId);

  const [customers, pbContacts, projects, lists, leads, leadUpdates, akqContacts] = await Promise.all([
    pbAll('customers'), pbAll('contacts'), pbAll('projects'), pbAll('acq_lists'),
    pbAll('leads'), pbAll('lead_updates'), pbAll('akq_contacts'),
  ]);
  console.log(`PocketBase: ${customers.length} Kunden, ${pbContacts.length} Ansprechpartner, ${projects.length} Projekte, ` +
    `${lists.length} Listen, ${leads.length} Leads, ${leadUpdates.length} Stand-Einträge, ${akqContacts.length} Kontaktlisten-Einträge`);

  // Bereits vorhandene Kontakte (Idempotenz)
  const existing = await must(sb.from('contacts').select('id, company').eq('org_id', orgId), 'contacts');
  const byCompany = new Map(existing.map((c) => [norm(c.company), c.id]));
  const stats = { contacts: 0, persons: 0, deals: 0, notes: 0, activities: 0, tasks: 0, skipped: 0 };

  async function insertContact(row) {
    stats.contacts++;
    if (DRY) return crypto.randomUUID();
    const id = crypto.randomUUID();
    await must(sb.from('contacts').insert({ id, org_id: orgId, owner_id: userId, created_by: userId, country: 'Deutschland', ...row }), 'contact');
    if (row.company) byCompany.set(norm(row.company), id);
    return id;
  }
  async function insertPerson(contactId, row, primary = false) {
    if (!row.first_name && !row.last_name && !row.email && !row.phone) return;
    stats.persons++;
    if (DRY) return;
    await must(sb.from('contact_persons').insert({ org_id: orgId, contact_id: contactId, is_primary: primary, ...row }), 'person');
  }
  async function insertDeal(row) {
    stats.deals++;
    if (DRY) return crypto.randomUUID();
    const id = crypto.randomUUID();
    await must(sb.from('deals').insert({ id, org_id: orgId, owner_id: userId, setter_id: userId, ...row }), 'deal');
    return id;
  }
  async function insertNote(row) {
    stats.notes++;
    if (!DRY) await must(sb.from('notes').insert({ org_id: orgId, user_id: userId, ...row }), 'note');
  }
  async function insertActivity(row) {
    stats.activities++;
    if (!DRY) await must(sb.from('activities').insert({ org_id: orgId, user_id: userId, ...row }), 'activity');
  }

  /* 1) Bestandskunden */
  const customerToContact = new Map();
  for (const c of customers) {
    let contactId = byCompany.get(norm(c.name));
    if (contactId) { stats.skipped++; }
    else {
      contactId = await insertContact({ company: c.name, notes: c.note || null, lead_source: 'Bestandskunde', created_at: toIso(c.created) });
      const persons = pbContacts.filter((p) => p.customer === c.id);
      if (persons.length) {
        for (const [i, p] of persons.entries()) await insertPerson(contactId, { ...splitName(p.name), position: i }, i === 0);
      } else if (c.contact) {
        await insertPerson(contactId, splitName(c.contact), true);
      }
      await insertDeal({
        contact_id: contactId, pipeline_id: pipes.bestand.id, stage_id: pipes.bestand.stages['Aktiv'],
        title: `${c.name} – Bestandskunde`, source: 'Bestandskunde', created_at: toIso(c.created),
      });
    }
    customerToContact.set(c.id, contactId);
  }

  /* 2) Projekte / Pipeline-Deals */
  for (const p of projects) {
    const contactId = p.customer ? customerToContact.get(p.customer) ?? null : null;
    const isPipeline = p.kind === 'pipeline';
    let stageId;
    if (p.outcome === 'verloren') stageId = pipes.angebot.stages['Verloren'];
    else if (p.won_at || !isPipeline || p.phase === 'Angebot angenommen') stageId = pipes.angebot.stages['Angebot angenommen'];
    else if (p.phase === 'Angebot verschickt') stageId = pipes.angebot.stages['Angebot verschickt'];
    else stageId = pipes.angebot.stages['Anfrage eingegangen'];
    if (!stageId) continue;
    await insertDeal({
      contact_id: contactId, pipeline_id: pipes.angebot.id, stage_id: stageId, title: p.name,
      value: Number(p.amount) || 0, expected_close_date: toDate(p.followup),
      created_at: toIso(p.created), won_at: toIso(p.won_at),
      next_step: !isPipeline ? `Projekt · Phase ${p.phase ?? '–'}` : null,
    });
  }

  /* 3) Akquise-Listen + Leads */
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const leadToContact = new Map();
  for (const l of leads) {
    const source = listName.get(l.list) ?? 'Kaltakquise';
    let contactId = byCompany.get(norm(l.company));
    if (contactId) { stats.skipped++; leadToContact.set(l.id, contactId); continue; }
    contactId = await insertContact({
      company: l.company, website: l.website || null, notes: l.note || null, lead_source: source,
      last_contacted_at: toIso(l.last_activity), created_at: toIso(l.created),
    });
    leadToContact.set(l.id, contactId);
    await insertPerson(contactId, { phone: l.phone || null, email: l.email || null }, true);

    const stageName = LEAD_STATUS_TO_STAGE[l.status] ?? 'Offen';
    const dealId = await insertDeal({
      contact_id: contactId, pipeline_id: pipes.kaltakquise.id, stage_id: pipes.kaltakquise.stages[stageName],
      title: l.company, source, created_at: toIso(l.created), last_activity_at: toIso(l.last_activity),
      custom: { aufregung: l.aufregung || null, sterne: l.sterne || null },
    });

    // Historie -> Aktivitaeten
    let history = [];
    try { history = l.history ? JSON.parse(l.history) : []; } catch { /* kaputtes JSON ignorieren */ }
    for (const h of history) {
      await insertActivity({
        contact_id: contactId, deal_id: dealId, type: h.k === 'status' ? 'call' : 'note',
        call_kind: h.k === 'status' ? 'opening' : null,
        subject: h.k === 'status' ? `Status: ${h.v}` : null, body: h.k === 'note' ? h.v : null,
        occurred_at: toIso(h.t) ?? new Date().toISOString(),
      });
    }
    for (const u of leadUpdates.filter((x) => x.lead === l.id)) {
      await insertNote({ contact_id: contactId, deal_id: dealId, body: u.body, created_at: toIso(u.created) });
    }
    if (l.follow_up || l.followup_flag) {
      stats.tasks++;
      if (!DRY) await must(sb.from('tasks').insert({
        org_id: orgId, contact_id: contactId, deal_id: dealId, assignee_id: userId, created_by: userId,
        title: 'Wiedervorlage anrufen', due_at: l.follow_up ? new Date(l.follow_up).toISOString() : null, priority: 1,
      }), 'task');
    }
  }

  /* 4) Kontaktliste */
  for (const k of akqContacts) {
    const person = { ...splitName(k.name), email: k.email || null, phone: k.phone || null, job_title: k.role || null };
    let contactId = k.company ? byCompany.get(norm(k.company)) : null;
    if (!contactId) {
      contactId = await insertContact({ company: k.company || k.name, notes: k.note || null, lead_source: 'Kontaktliste', created_at: toIso(k.created) });
      await insertPerson(contactId, person, true);
    } else {
      await insertPerson(contactId, person, false);
      if (k.note) await insertNote({ contact_id: contactId, body: k.note, created_at: toIso(k.created) });
    }
  }

  console.log('\n✅ Fertig.');
  console.log(`   ${stats.contacts} Kontakte, ${stats.persons} Ansprechpartner, ${stats.deals} Deals,`);
  console.log(`   ${stats.activities} Aktivitäten, ${stats.notes} Notizen, ${stats.tasks} Wiedervorlagen`);
  if (stats.skipped) console.log(`   ${stats.skipped} bereits vorhandene Firmen übersprungen`);
  if (DRY) console.log('\n   Probelauf – zum Schreiben ohne DRY_RUN=1 starten.');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
