#!/usr/bin/env node
/**
 * Importiert eine Messe-Ausstellerliste (JSON-Export der Numbers-Tabelle)
 * als Kontakte + Ansprechpartner + Deals in die Pipeline "Kaltakquise".
 *
 *   set -a; source migrate.env; set +a
 *   DRY_RUN=1 node scripts/import-messeliste.mjs expo-real-2026.json "Expo Real 2026"
 *
 * - Kanal A (LinkedIn angeschrieben) -> Phase "LinkedIn angeschrieben" + LinkedIn-Aktivitaet
 * - Kanal B / leer                    -> Phase "Offen"
 * - Prio, Standtyp, Halle/Stand, Hauptaussteller, Budgetklasse, Geschaeftsfuehrung -> Zusatzfelder
 * - Zentrale (Telefon/E-Mail) als eigene Person, Ansprechpartner als Hauptkontakt
 * - Notiz -> Notiz, Beschreibung -> Kontaktnotiz
 * - legt gespeicherte Filter "<Messe>" und "<Messe> · Prio 1" an
 * Bereits vorhandene Firmen werden uebersprungen (mehrfach ausfuehrbar).
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [,, filePath, listName] = process.argv;
if (!filePath || !listName) {
  console.error('Aufruf: node scripts/import-messeliste.mjs <datei.json> "<Name der Messe/Liste>"');
  process.exit(1);
}
const env = (k) => { const v = process.env[k]; if (!v) { console.error(`Fehlt: ${k}`); process.exit(1); } return v; };
const DRY = process.env.DRY_RUN === '1';
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
async function must(p, label) { const { data, error } = await p; if (error) throw new Error(`${label}: ${error.message}`); return data; }
const norm = (s) => String(s ?? '').trim().toLowerCase();
const clean = (s) => (s == null ? null : String(s).trim() || null);
const cleanUrl = (u) => (u ? String(u).trim().replace(/^https?:\/\//, '').replace(/\/$/, '') : null);

const STAGES = [
  ['Offen', 5, '#64748b'], ['LinkedIn angeschrieben', 15, '#0a66c2'], ['Niemand rangegangen', 10, '#a1a1aa'],
  ['Nochmal anrufen', 20, '#f59e0b'], ['Gatekeeper erreicht', 25, '#0ea5e9'], ['Entscheider erreicht', 50, '#6366f1'],
  ['Erfolg', 100, '#22c55e', 'won'], ['An Gatekeeper gescheitert', 0, '#f97316', 'lost'],
  ['Entscheider kein Interesse', 0, '#ef4444', 'lost'],
];

/** "Oliver Gruß (Kontakt Pressebereich)" / "Jörg Ramms, Head of Marketing" / "Annette Hubeny Marketing" */
function parsePerson(raw) {
  const t = clean(raw);
  if (!t || /^nicht im verzeichnis/i.test(t)) return null;
  let name = t, role = null;
  const m = t.match(/^([^(,]+)(?:\(([^)]*)\))?(?:,\s*(.+))?$/);
  if (m) { name = m[1].trim(); role = clean(m[2] || m[3]); }
  const words = name.split(/\s+/);
  if (!role && words.length > 2) { name = words.slice(0, 2).join(' '); role = words.slice(2).join(' '); }
  const parts = name.split(/\s+/);
  return { first_name: parts.slice(0, -1).join(' ') || null, last_name: parts.at(-1) || null, job_title: role };
}

async function main() {
  const rows = JSON.parse(readFileSync(filePath, 'utf8'));
  console.log(`${DRY ? '🔍 Probelauf' : '🚀 Import'}: ${rows.length} Zeilen aus ${filePath} als "${listName}"`);

  const org = (await must(sb.from('organizations').select('id, name').limit(1), 'org'))[0];
  const admin = (await must(sb.from('profiles').select('id').eq('org_id', org.id).eq('role', 'admin').limit(1), 'admin'))[0];
  const userId = admin?.id ?? null;

  // Pipeline Kaltakquise sicherstellen
  let pipeline = (await must(sb.from('pipelines').select('id').eq('org_id', org.id).ilike('name', 'Kaltakquise').limit(1), 'pipeline'))[0];
  if (!pipeline && !DRY) {
    pipeline = await must(sb.from('pipelines').insert({ org_id: org.id, name: 'Kaltakquise', kind: 'setter', position: 0 }).select('id').single(), 'pipeline insert');
  }
  const stageIds = {};
  if (pipeline) {
    const have = await must(sb.from('pipeline_stages').select('id, name').eq('pipeline_id', pipeline.id), 'stages');
    for (const [i, [name, prob, color, flag]] of STAGES.entries()) {
      let st = have.find((x) => norm(x.name) === norm(name));
      if (!st && !DRY) st = await must(sb.from('pipeline_stages').insert({ pipeline_id: pipeline.id, name, position: i, probability: prob, color, is_won: flag === 'won', is_lost: flag === 'lost' }).select('id').single(), 'stage');
      stageIds[name] = st?.id ?? `dry-${i}`;
    }
  }

  const existing = await must(sb.from('contacts').select('id, company').eq('org_id', org.id), 'contacts');
  const byCompany = new Map(existing.map((c) => [norm(c.company), c.id]));
  const stats = { contacts: 0, persons: 0, deals: 0, linkedin: 0, notes: 0, skipped: 0 };

  for (const r of rows) {
    const company = clean(r.firma);
    if (!company) continue;
    if (byCompany.has(norm(company))) { stats.skipped++; continue; }

    const contactId = crypto.randomUUID();
    const custom = {
      messe: listName, prio: clean(r.prio), kanal: clean(r.kanal), standtyp: clean(r.standtyp),
      halle_stand: clean(r.halle_stand), hauptaussteller: clean(r.hauptaussteller),
      budgetklasse: clean(r.budgetklasse), geschaeftsfuehrung: clean(r.geschaeftsfuehrung), fundstelle: clean(r.fundstelle),
    };
    stats.contacts++;
    if (!DRY) await must(sb.from('contacts').insert({
      id: contactId, org_id: org.id, company, website: cleanUrl(r.website || r.website2),
      city: clean(r.ort), postal_code: clean(r.plz), country: 'Deutschland', lead_source: listName,
      notes: clean(r.beschreibung), owner_id: userId, created_by: userId, custom,
    }), 'contact');
    byCompany.set(norm(company), contactId);

    // Ansprechpartner + Zentrale
    const persons = [];
    const ap = parsePerson(r.ansprechpartner);
    const apPhone = clean(r.durchwahl) || clean(r.ap_telefon);
    if (ap) persons.push({ ...ap, phone: apPhone, email: clean(r.ap_email), is_primary: true, position: 0 });
    if (clean(r.zentrale_telefon) || clean(r.zentrale_email)) {
      persons.push({ first_name: null, last_name: 'Zentrale', phone: clean(r.zentrale_telefon), email: clean(r.zentrale_email), is_primary: persons.length === 0, position: persons.length });
    }
    stats.persons += persons.length;
    if (!DRY && persons.length) await must(sb.from('contact_persons').insert(persons.map((p) => ({ org_id: org.id, contact_id: contactId, ...p }))), 'persons');

    // Deal
    const isLinkedIn = norm(r.kanal) === 'a';
    const dealId = crypto.randomUUID();
    stats.deals++;
    if (!DRY) await must(sb.from('deals').insert({
      id: dealId, org_id: org.id, contact_id: contactId, pipeline_id: pipeline.id,
      stage_id: stageIds[isLinkedIn ? 'LinkedIn angeschrieben' : 'Offen'], title: company, source: listName,
      owner_id: userId, setter_id: userId, custom: { prio: custom.prio, kanal: custom.kanal },
    }), 'deal');

    if (isLinkedIn) {
      stats.linkedin++;
      if (!DRY) await must(sb.from('activities').insert({
        org_id: org.id, contact_id: contactId, deal_id: dealId, user_id: userId, type: 'linkedin',
        subject: 'Auf LinkedIn angeschrieben', body: clean(r.ap_hinweis) && norm(r.ap_hinweis) !== 'auf linkedin angeschrieben' ? clean(r.ap_hinweis) : null,
      }), 'activity');
    }
    if (clean(r.notiz)) {
      stats.notes++;
      if (!DRY) await must(sb.from('notes').insert({ org_id: org.id, contact_id: contactId, deal_id: dealId, user_id: userId, body: clean(r.notiz) }), 'note');
    }
  }

  // Gespeicherte Filter
  const filters = [
    { entity: 'contacts', name: listName, definition: { groups: [[{ field: 'lead_source', operator: 'eq', value: listName }]] } },
    { entity: 'deals', name: listName, definition: { groups: [[{ field: 'source', operator: 'eq', value: listName }]] } },
    { entity: 'deals', name: `${listName} · Prio 1`, definition: { groups: [[{ field: 'source', operator: 'eq', value: listName }, { field: 'custom.prio', operator: 'eq', value: '1' }]] } },
    { entity: 'deals', name: `${listName} · noch nicht angerufen`, definition: { groups: [[{ field: 'source', operator: 'eq', value: listName }, { field: 'last_contacted_at', operator: 'is_empty', value: '' }]] } },
  ];
  if (!DRY) {
    const have = await must(sb.from('saved_filters').select('name, entity').eq('org_id', org.id), 'filters');
    for (const f of filters) {
      if (have.some((h) => h.name === f.name && h.entity === f.entity)) continue;
      await must(sb.from('saved_filters').insert({ org_id: org.id, user_id: userId, ...f }), 'filter');
    }
  }

  console.log(`\n✅ ${DRY ? 'Würde anlegen' : 'Angelegt'}: ${stats.contacts} Kontakte, ${stats.persons} Personen, ${stats.deals} Deals,`);
  console.log(`   ${stats.linkedin} davon LinkedIn angeschrieben, ${stats.notes} Notizen · ${stats.skipped} bereits vorhandene Firmen übersprungen`);
  console.log(`   Filter: "${listName}", "${listName} · Prio 1", "${listName} · noch nicht angerufen"`);
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
