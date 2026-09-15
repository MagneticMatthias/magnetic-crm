#!/usr/bin/env node
/**
 * Prueft die Kaltakquise-Pipeline auf Deals, die in "Offen" stehen, obwohl
 * sie laengst angeschrieben wurden - erkennbar an einer LinkedIn-Aktivitaet
 * oder am Kanal "A" aus der Messeliste.
 *
 *   set -a; source migrate.env; set +a
 *   node scripts/phasen-pruefen.mjs           # nur berichten
 *   FIX=1 node scripts/phasen-pruefen.mjs     # Phasen korrigieren
 *
 * Meldet ausserdem Firmen mit mehreren Deals in derselben Pipeline, weil
 * das die zweite haeufige Ursache fuer "steht trotzdem bei Offen" ist.
 */
import { createClient } from '@supabase/supabase-js';

const env = (k) => { const v = process.env[k]; if (!v) { console.error(`Fehlt: ${k}`); process.exit(1); } return v; };
const FIX = process.env.FIX === '1';
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
async function must(p, label) { const { data, error } = await p; if (error) throw new Error(`${label}: ${error.message}`); return data; }
const norm = (s) => String(s ?? '').trim().toLowerCase();

const pipelines = await must(sb.from('pipelines').select('id, name'), 'pipelines');
const pipeline = pipelines.find((p) => norm(p.name) === 'kaltakquise');
if (!pipeline) { console.error('Pipeline "Kaltakquise" nicht gefunden.'); process.exit(1); }

const stages = await must(
  sb.from('pipeline_stages').select('id, name, position').eq('pipeline_id', pipeline.id).order('position'), 'stages');
const offen = stages.find((s) => norm(s.name) === 'offen');
const linkedin = stages.find((s) => norm(s.name) === 'linkedin angeschrieben');
if (!offen || !linkedin) { console.error('Phasen "Offen" und/oder "LinkedIn angeschrieben" fehlen.'); process.exit(1); }

const deals = await must(
  sb.from('deals')
    .select('id, title, stage_id, custom, contact:contacts(id, company, custom)')
    .eq('pipeline_id', pipeline.id), 'deals');

// Alle LinkedIn-Aktivitaeten einsammeln, nach Kontakt gebuendelt.
const acts = await must(sb.from('activities').select('contact_id').eq('type', 'linkedin'), 'activities');
const mitLinkedIn = new Set(acts.map((a) => a.contact_id).filter(Boolean));

const stageName = Object.fromEntries(stages.map((s) => [s.id, s.name]));
const kanalA = (d) => norm(d.contact?.custom?.kanal ?? d.custom?.kanal) === 'a';

const falsch = deals.filter((d) =>
  d.stage_id === offen.id && (mitLinkedIn.has(d.contact?.id) || kanalA(d)));

// Mehrfache Deals derselben Firma in dieser Pipeline
const proFirma = new Map();
for (const d of deals) {
  const key = d.contact?.id ?? d.id;
  proFirma.set(key, [...(proFirma.get(key) ?? []), d]);
}
const doppelt = [...proFirma.values()].filter((xs) => xs.length > 1);

console.log(`Pipeline "${pipeline.name}": ${deals.length} Deals`);
for (const s of stages) {
  const n = deals.filter((d) => d.stage_id === s.id).length;
  if (n) console.log(`  ${s.name}: ${n}`);
}

console.log(`\nIn "Offen", obwohl angeschrieben: ${falsch.length}`);
for (const d of falsch.slice(0, 40)) {
  const grund = mitLinkedIn.has(d.contact?.id) ? 'LinkedIn-Aktivitaet' : 'Kanal A';
  console.log(`  ${d.contact?.company ?? d.title}  (${grund})`);
}
if (falsch.length > 40) console.log(`  … und ${falsch.length - 40} weitere`);

if (doppelt.length) {
  console.log(`\nFirmen mit mehreren Deals in dieser Pipeline: ${doppelt.length}`);
  for (const xs of doppelt.slice(0, 20)) {
    console.log(`  ${xs[0].contact?.company ?? xs[0].title}: ${xs.map((d) => stageName[d.stage_id] ?? '?').join(' + ')}`);
  }
}

if (!FIX) {
  console.log(`\nNichts geaendert. Zum Korrigieren:  FIX=1 node scripts/phasen-pruefen.mjs`);
  process.exit(0);
}

for (const d of falsch) {
  await must(sb.from('deals').update({ stage_id: linkedin.id }).eq('id', d.id), 'update');
}
console.log(`\n${falsch.length} Deals auf "LinkedIn angeschrieben" gesetzt.`);
