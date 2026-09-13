#!/usr/bin/env node
/**
 * Uebernimmt aus dem Projekttool (PocketBase) nach Magnetic_CRM (Supabase):
 *   - Kunden mit Ansprechpartnern        -> Kontakte + Deal "Bestandskunden / Aktiv"
 *   - offene Faeden (threads, done=false) -> Deals in "Angebot / Closing" nach Stufe
 *   - Projekte (alle)                     -> Deals; abgeschlossene als gewonnen (Auswertung)
 * Die alten Akquise-Listen (leads) und die Kontaktliste werden NICHT uebernommen.
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
  // PocketBase >= 0.23: _superusers, aeltere Versionen: /api/admins
  const attempts = [
    `${PB_URL}/api/collections/_superusers/auth-with-password`,
    `${PB_URL}/api/admins/auth-with-password`,
  ];
  let last = '';
  for (const url of attempts) {
    let r;
    try {
      r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: PB_EMAIL, email: PB_EMAIL, password: PB_PASS }),
      });
    } catch (e) {
      throw new Error(`PocketBase unter ${PB_URL} nicht erreichbar (${e.message}). Stimmt PB_URL? Läuft der Container?`);
    }
    if (r.ok) { pbToken = (await r.json()).token; return; }
    last = `${r.status} ${await r.text()}`;
    if (r.status !== 404) break;
  }
  throw new Error(
    `PocketBase-Login fehlgeschlagen (${last}).\n` +
    `   E-Mail: ${PB_EMAIL} · Passwort: ${PB_PASS.length} Zeichen, beginnt mit "${PB_PASS.slice(0, 2)}…"\n` +
    `   Wenn die Zeichenzahl nicht stimmt, wurde das Passwort von der Shell zerlegt – in migrate.env in 'einfache Anführungszeichen' setzen.`,
  );
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
  if (parts.length === 0) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts.at(-1) };
};
// Firmenname aus einem Faden-Titel: Teil vor Gedankenstrich/Komma/"ueber", max. 40 Zeichen
const companyFromTitle = (title) => {
  const head = String(title ?? '').split(/\s[–—-]\s|,|\süber\s|\s\(/)[0].trim();
  return (head || String(title ?? '').trim()).slice(0, 40);
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
      ['Erstgespräch', 10, '#0ea5e9'], ['Angebot verschickt', 50, '#8b5cf6'],
      ['Mündliche Zusage', 90, '#f59e0b'],
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
    if (!p && DRY) p = { id: `dry-${key}`, name: def.name };
    if (!p && !DRY) {
      p = (await must(sb.from('pipelines').insert({ org_id: orgId, name: def.name, kind: def.kind, position: pos++ }).select('id, name').single(), 'pipeline insert'));
      console.log(`+ Pipeline "${def.name}" angelegt`);
    }
    const stageMap = {};
    if (p) {
      const have = stagesAll.filter((s) => s.pipeline_id === p.id);
      for (const [i, [name, prob, color, flag]] of def.stages.entries()) {
        let s = have.find((x) => norm(x.name) === norm(name));
        if (!s && DRY) s = { id: `dry-${key}-${i}`, name };
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

    // Phasen, die nicht mehr zur Definition gehoeren und leer sind, aufraeumen
    if (p && !DRY) {
      const wanted = new Set(def.stages.map(([n]) => norm(n)));
      for (const st of stagesAll.filter((x) => x.pipeline_id === p.id && !wanted.has(norm(x.name)))) {
        const { count } = await sb.from('deals').select('id', { count: 'exact', head: true }).eq('stage_id', st.id);
        if (!count) await sb.from('pipeline_stages').delete().eq('id', st.id);
      }
    }
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

  const [customers, pbContacts, projects, threadsAll, statusUpdates, projectAmounts, revenues] = await Promise.all([
    pbAll('customers'), pbAll('contacts'), pbAll('projects'), pbAll('threads'), pbAll('status_updates'),
    pbAll('project_amounts'), pbAll('revenues'),
  ]);
  // Umsatz je Projekt = Summe seiner Betraege (wie in der Auswertung des Projekttools)
  const amountByProject = {};
  for (const a of projectAmounts) amountByProject[a.project] = (amountByProject[a.project] ?? 0) + (Number(a.amount) || 0);
  const revenueTotal = revenues.reduce((x, r) => x + (Number(r.amount) || 0), 0)
    + projects.filter((p) => (p.kind ?? 'projekt') === 'projekt').reduce((x, p) => x + (amountByProject[p.id] ?? 0), 0);
  const threads = threadsAll.filter((t) => !t.done);
  const finished = projects.filter((p) => p.kind !== 'pipeline');
  console.log(`PocketBase: ${customers.length} Kunden, ${pbContacts.length} Ansprechpartner, ` +
    `${threads.length} offene Fäden (${threadsAll.length - threads.length} erledigte übersprungen), ` +
    `${projects.length} Projekte (davon ${finished.length} abgeschlossen), ${statusUpdates.length} Projekt-Anmerkungen, ` +
    `${revenues.length} manuelle Umsätze · Gesamtumsatz ${revenueTotal.toLocaleString('de-DE')} €`);

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
      const bestandDeal = await insertDeal({
        contact_id: contactId, pipeline_id: pipes.bestand.id, stage_id: pipes.bestand.stages['Aktiv'],
        title: `${c.name} – Bestandskunde`, source: 'Bestandskunde', created_at: toIso(c.created),
      });
      if (c.note?.trim()) {
        await insertNote({ contact_id: contactId, deal_id: bestandDeal, body: c.note.trim(), created_at: toIso(c.created) });
      }
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
    else stageId = pipes.angebot.stages['Erstgespräch'];
    if (!stageId) continue;
    const isProjekt = (p.kind ?? 'projekt') === 'projekt';
    const projectDeal = await insertDeal({
      contact_id: contactId, pipeline_id: pipes.angebot.id, stage_id: stageId, title: p.name,
      value: amountByProject[p.id] ?? (Number(p.amount) || 0), expected_close_date: toDate(p.followup),
      created_at: toIso(p.created), won_at: isProjekt ? toIso(p.won_at || p.created) : toIso(p.won_at),
      next_step: !isPipeline ? `Projekt · Phase ${p.phase ?? '–'}` : null,
    });
    // Anmerkungen und Aufgaben des Projekts
    for (const u of statusUpdates.filter((x) => x.project === p.id)) {
      if (u.is_task && !u.done) {
        stats.tasks++;
        if (!DRY) await must(sb.from('tasks').insert({
          org_id: orgId, contact_id: contactId, deal_id: projectDeal, assignee_id: userId, created_by: userId,
          title: u.body, priority: 2, created_at: toIso(u.created),
        }), 'task');
      } else {
        await insertNote({ contact_id: contactId, deal_id: projectDeal,
          body: (u.is_task ? '✅ ' : '') + u.body, created_at: toIso(u.created) });
      }
    }
  }

  /* 2b) Manuell erfasste Umsaetze -> gewonnene Deals (Auswertung) */
  for (const r of revenues) {
    const cust = customers.find((c) => c.id === r.customer);
    const contactId = cust ? customerToContact.get(cust.id) ?? null : null;
    await insertDeal({
      contact_id: contactId, pipeline_id: pipes.angebot.id, stage_id: pipes.angebot.stages['Angebot angenommen'],
      title: r.note?.trim() || `${cust?.name ?? 'Kunde'} – Auftrag`, value: Number(r.amount) || 0,
      source: 'Bestandskunde', created_at: toIso(r.date || r.created), won_at: toIso(r.date || r.created),
    });
  }

  /* 3) Offene Faeden -> Deals in Angebot / Closing */
  // Kunde zum Faden wie im Projekttool: Kundenname (oder markantes erstes Wort) im Titel
  function customerOf(title) {
    const t = norm(title);
    let best = null, bestLen = 0;
    for (const c of customers) {
      const full = norm(c.name);
      if (!full) continue;
      const first = full.split(/[\s-]+/)[0];
      const hit = t.includes(full) ? full : first.length >= 4 && t.includes(first) ? first : '';
      if (hit && hit.length > bestLen) { best = c; bestLen = hit.length; }
    }
    return best;
  }
  const STUFE_TO_STAGE = {
    'erstgespräch': 'Erstgespräch', 'angebot verschickt': 'Angebot verschickt', 'mündliche zusage': 'Mündliche Zusage',
  };

  for (const t of threads) {
    const cust = customerOf(t.title);
    let contactId = cust ? customerToContact.get(cust.id) : null;
    if (!contactId) {
      // Kein bekannter Kunde: Firma aus dem Titel-Anfang (vor dem Gedankenstrich)
      const company = companyFromTitle(t.title);
      contactId = byCompany.get(norm(company))
        ?? await insertContact({ company, lead_source: 'Faden', created_at: toIso(t.created) });
    }

    const stageName = STUFE_TO_STAGE[norm(t.stufe)] ?? 'Erstgespräch';
    const dealId = await insertDeal({
      contact_id: contactId, pipeline_id: pipes.angebot.id, stage_id: pipes.angebot.stages[stageName],
      title: t.title, value: Number(t.wert) || 0, next_step: t.next_step || null,
      expected_close_date: toDate(t.due), source: cust ? 'Bestandskunde' : 'Faden',
      created_at: toIso(t.created), last_activity_at: toIso(t.updated),
      custom: { wer: t.wer || null, aufregung: t.aufregung || null, sterne: t.sterne || null },
    });

    // Verlauf der frueheren "naechsten Schritte" -> Notizen
    let history = [];
    try { history = t.history ? JSON.parse(t.history) : []; } catch { /* kaputtes JSON ignorieren */ }
    for (const h of history) {
      if (!h?.v) continue;
      await insertNote({ contact_id: contactId, deal_id: dealId, body: `Schritt: ${h.v}`, created_at: toIso(h.t) });
    }

    // Wer ist dran + Faelligkeit -> Aufgabe
    if (t.next_step && (t.wer === 'ich' || t.due)) {
      stats.tasks++;
      if (!DRY) await must(sb.from('tasks').insert({
        org_id: orgId, contact_id: contactId, deal_id: dealId, assignee_id: userId, created_by: userId,
        title: t.next_step, description: t.wer === 'kunde' ? 'Wartet auf Antwort vom Kunden' : null,
        due_at: t.due ? new Date(t.due).toISOString() : null, priority: t.wer === 'ich' ? 1 : 2,
      }), 'task');
    }
  }

  console.log('\n✅ Fertig.');
  console.log(`   ${stats.contacts} Kontakte, ${stats.persons} Ansprechpartner, ${stats.deals} Deals,`);
  console.log(`   ${stats.activities} Aktivitäten, ${stats.notes} Notizen, ${stats.tasks} Aufgaben`);
  if (stats.skipped) console.log(`   ${stats.skipped} bereits vorhandene Firmen übersprungen`);
  if (DRY) console.log('\n   Probelauf – zum Schreiben ohne DRY_RUN=1 starten.');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
