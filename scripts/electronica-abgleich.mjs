#!/usr/bin/env node
/**
 * Gleicht die importierte Liste "electronica 2026" (stammt aus dem
 * Ausstellerverzeichnis 2024) mit dem Ausstellerverzeichnis 2026 ab.
 *
 *   set -a; source migrate.env; set +a
 *   node scripts/electronica-abgleich.mjs          # nur berichten
 *   FIX=1 node scripts/electronica-abgleich.mjs    # Zusatzfeld "Aussteller 2026" setzen
 *
 * Was passiert:
 * 1. Verzeichnis 2026 lesen (https://exhibitors.electronica.de, alle Seiten,
 *    100 Aussteller pro Seite). Zwischenspeicher: electronica-2026-verzeichnis.json
 *    (loeschen, um neu zu laden).
 * 2. Jede Firma der Liste (lead_source = 'electronica 2026') tolerant abgleichen:
 *    Rechtsform, Gross-/Kleinschreibung, Umlaute und Satzzeichen zaehlen nicht.
 *    Unscharfe Treffer gelten nur mit gleichem Ort oder gleicher Website.
 *    -> custom.aussteller_2026 = 'ja' / 'nein', bei 'ja' auch custom.halle_stand
 *       auf den Stand 2026 (nur mit FIX=1).
 * 3. Bayerische Aussteller 2026, die nicht in der Liste sind, landen in
 *    electronica-2026-neu-bayern.csv (Format der Bayern-Liste, Prio/Groesse leer).
 *    Dafuer werden deren Detailseiten gelesen (Website, Telefon, E-Mail).
 * 4. Bericht je Firma: electronica-2026-abgleich.csv
 * 5. Gespeicherte Filter "electronica Telefon" / "electronica LinkedIn" bekommen
 *    die Bedingung Aussteller 2026 = ja (nur mit FIX=1).
 *
 * Testlauf ohne Datenbank: KONTAKTE=datei.json (Array mit company/city/website/custom).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const LISTE = 'electronica 2026';
const BASIS = 'https://exhibitors.electronica.de/ausstellerportal/2026/aussteller/';
const CACHE = process.env.CACHE || 'electronica-2026-verzeichnis.json';
const AUSGABE_BERICHT = 'electronica-2026-abgleich.csv';
const AUSGABE_NEU = 'electronica-2026-neu-bayern.csv';
const FIX = process.env.FIX === '1';
const KONTAKTE_DATEI = process.env.KONTAKTE || null;
const PRO_SEITE = 100;

/* ------------------------------------------------------------------ */
/* Hilfen                                                               */
/* ------------------------------------------------------------------ */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', szlig: 'ß', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ntilde: 'ñ', oslash: 'ø', aring: 'å', shy: '' };
const unescape = (s) => String(s ?? '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENT ? ENT[n] : m));
const text = (html) => unescape(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clean = (s) => { const v = String(s ?? '').trim(); return v || null; };

// Rechtsformen und Fuellwoerter, die beim Namensvergleich nicht zaehlen
const RECHTSFORM = new Set([
  'gmbh', 'mbh', 'ag', 'kg', 'kgaa', 'co', 'cokg', 'se', 'ohg', 'gbr', 'ek', 'ev', 'ug', 'haftungsbeschraenkt',
  'ltd', 'limited', 'inc', 'incorporated', 'corp', 'corporation', 'llc', 'plc', 'bv', 'nv', 'sa', 'sas', 'sarl', 'srl', 'spa', 'sro',
  'oy', 'ab', 'as', 'aps', 'sl', 'lda', 'pte', 'pvt', 'pty', 'zrt', 'kft', 'doo', 'gesmbh', 'holding',
  'und', 'and', 'the', 'of', 'group', 'gruppe',
]);
export function normName(s) {
  const t = unescape(s).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[&+]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ');
  return t.split(' ').filter((w) => w && !RECHTSFORM.has(w));
}
const key = (tokens) => tokens.join(' ');
// Woerter, die in Firmennamen so haeufig sind, dass sie allein keinen Treffer begruenden
const GENERISCH = new Set([
  'elektronik', 'electronic', 'electronics', 'elektro', 'electric', 'technik', 'technology', 'technologies', 'tech',
  'system', 'systems', 'systeme', 'solution', 'solutions', 'component', 'components', 'komponenten', 'industrie', 'industries', 'industrial',
  'engineering', 'international', 'europe', 'europa', 'european', 'germany', 'deutschland', 'german', 'global', 'power', 'energy',
  'semiconductor', 'semiconductors', 'software', 'hardware', 'service', 'services', 'design', 'digital', 'micro', 'mikro', 'sensor', 'sensors',
  'sensorik', 'automation', 'automotive', 'connect', 'connectors', 'cable', 'cables', 'kabel', 'display', 'displays', 'labs', 'lab',
  'partner', 'partners', 'vertrieb', 'distribution', 'products', 'produkte', 'manufacturing', 'ems', 'gmbhs', 'mess', 'test', 'net',
]);
// Ortsname vergleichbar machen: "Neubiberg (near Munich)" -> "neubiberg",
// "Frankfurt am Main" -> "frankfurt", "Bad Homburg v. d. Hoehe" -> "bad homburg"
const ORT_STOPP = new Set(['a', 'am', 'an', 'b', 'bei', 'i', 'im', 'in', 'd', 'der', 'dem', 'v', 'vor', 'unter', 'ob', 'near', 'ot', 'bez']);
const normOrt = (s) => {
  const t = unescape(s).toLowerCase().replace(/\(.*?\)/g, ' ').split(/[/,]/)[0]
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\bmunich\b/g, 'muenchen').replace(/\bnuremberg\b/g, 'nuernberg').replace(/\bcologne\b/g, 'koeln')
    .replace(/[^a-z]+/g, ' ').trim().split(' ');
  const out = [];
  for (const w of t) { if (ORT_STOPP.has(w)) break; out.push(w); }
  return out.join(' ');
};
const domain = (u) => {
  const v = String(u ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  return v && v.includes('.') ? v : null;
};

// Bayerische Postleitzahlen (Bereiche mit Ausnahmen an den Landesgrenzen)
export function istBayern(plz) {
  const p = parseInt(String(plz ?? '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(p) || String(plz ?? '').replace(/\D/g, '').length !== 5) return false;
  if (p >= 63739 && p <= 63939) return true;                       // Aschaffenburg, Miltenberg
  if (p >= 80000 && p <= 87999) return true;                       // Oberbayern, Schwaben, Allgaeu
  if (p >= 88131 && p <= 88179) return true;                       // Landkreis Lindau
  if ((p >= 89231 && p <= 89299) || (p >= 89312 && p <= 89447)) return true; // Neu-Ulm, Guenzburg, Dillingen
  if (p >= 90000 && p <= 95999) return true;                       // Franken, Oberpfalz, Niederbayern
  if (p >= 96000 && p <= 96999) return !(p >= 96515 && p <= 96529); // ohne Sonneberg (Thueringen)
  if (p >= 97000 && p <= 97999) {                                   // Unterfranken ohne Main-Tauber (BW)
    if ([97877, 97896, 97900, 97922].includes(p)) return false;
    return p < 97941;
  }
  return false;
}

function csvZeile(werte) {
  return werte.map((v) => {
    const s = v == null ? '' : String(v);
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';');
}

async function hole(url, body) {
  for (let versuch = 1; versuch <= 4; versuch++) {
    try {
      const res = await fetch(url, body
        ? { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 Magnetic_CRM Abgleich' }, body }
        : { headers: { 'user-agent': 'Mozilla/5.0 Magnetic_CRM Abgleich' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (versuch === 4) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * versuch));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Verzeichnis 2026 lesen                                               */
/* ------------------------------------------------------------------ */

// Formularfelder der Ausstellerliste (Blaettern per POST, wie im Browser)
function seitenFormular(startZeile, seite) {
  const p = new URLSearchParams({
    LNG: '1', nv: '2', rqt_spcListing: 'allEx', clgk: '', sb_reset: '', sb_sort: 'abc', sb_view: 'ext',
    sb_rpp: String(PRO_SEITE), sb_c: '4', sb_m: '1100', sb_n: 'mainSearch', sb_s: '',
    once_sb_additionalFields: 'E_ParentCount',
    sb1: 'IS NOT NULL', sb1_n: 'suche', sb1_t: 'basic', sb1_s: '',
    sb2: 'ex', sb2_n: 'bereiche', sb2_t: 'ignoreCondition', sb2_s: '',
    sb3: '', sb3_n: 'abc', sb3_t: '', sb3_s: 'LEFT', sb4: '', sb4_n: 'tabs', sb4_t: '',
    SRFieldtext: '', rqt_pagingDef: String(PRO_SEITE), rqt_pagingQuery: 'query_res',
    [`StartRow_query_res_${seite}`]: String(startZeile), StartRow_query_res_text: String(seite), SRField: String(seite),
  });
  return p.toString();
}

// Eine Listenseite in Eintraege zerlegen (Anzeigen werden uebersprungen)
export function parseListe(html) {
  const out = [];
  const bloecke = html.split(/<div class="pb_ce\b/).slice(1);
  for (const b of bloecke) {
    const kopf = b.slice(0, 200);
    if (/\badvert\b/.test(kopf)) continue;
    const m = b.match(/<div class="ce_head">\s*<h2><a href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>/);
    if (!m) continue;
    const url = unescape(m[1]).replace(/&uls=\d+$/, '');
    const name = text(m[2]);
    const topic = text((b.match(/<div class="ce_topic">([\s\S]*?)<\/div>/) || [])[1]);
    const teaser = text((b.match(/<div class="ce_text">([\s\S]*?)<\/div>/) || [])[1]) || null;
    const staende = [...b.matchAll(/class="boothNo[^"]*">([^<]+)<\/a>/g)].map((x) => text(x[1]));
    const typ = (b.match(/types\/exType_[a-z]+\.png"[^>]*title="([^"]+)"/) || [])[1] || null;
    // "80807 Munich, Deutschland" / "Bangalore 561203, Indien" / "St Petersburg, FL 33716, USA"
    let land = null, ort = topic, plz = null;
    const komma = topic.lastIndexOf(',');
    if (komma > 0) { land = topic.slice(komma + 1).trim(); ort = topic.slice(0, komma).trim(); }
    let pm = ort.match(/^([A-Z]{1,2}[- ]?)?(\d[\d -]{2,9})\s+(.+)$/);
    if (pm) { plz = ((pm[1] || '') + pm[2]).trim(); ort = pm[3].trim(); }
    else if ((pm = ort.match(/^(.+?)\s+(\d[\d -]{2,9})$/))) { ort = pm[1].trim(); plz = pm[2].trim(); }
    const id = (url.match(/elb=(\d+\.\d+\.\d+)/) || [])[1] || url;
    out.push({ id, name, url, plz, ort, land, stand: [...new Set(staende)].join(', ') || null, typ, teaser });
  }
  return out;
}

async function ladeVerzeichnis() {
  if (existsSync(CACHE)) {
    const c = JSON.parse(readFileSync(CACHE, 'utf8'));
    console.log(`📁 Verzeichnis aus ${CACHE} (${c.aussteller.length} Eintraege, geladen ${c.geladen_am})`);
    return c.aussteller;
  }
  console.log('🌐 Lese Ausstellerverzeichnis 2026 …');
  const alle = new Map();
  let seite = 1, start = 1, letzte = Infinity;
  while (start <= letzte) {
    const html = await hole(`${BASIS}?neuesuche`, seitenFormular(start, seite));
    const eintraege = parseListe(html);
    for (const e of eintraege) {
      const vorhanden = alle.get(e.id);
      if (vorhanden) { // gleiche Firma mit mehreren Staenden
        const s = new Set([...(vorhanden.stand ? vorhanden.stand.split(', ') : []), ...(e.stand ? e.stand.split(', ') : [])]);
        vorhanden.stand = [...s].join(', ') || null;
      } else alle.set(e.id, e);
    }
    const next = Number((html.match(/name="StartRow_query_res_next" value="(\d+)"/) || [])[1]);
    const last = Number((html.match(/name="StartRow_query_res_last" value="(\d+)"/) || [])[1]);
    if (!eintraege.length || !next || next <= start) break;
    letzte = last || letzte;
    process.stdout.write(`   Seite ${seite}: ${alle.size} Aussteller\r`);
    start = next; seite++;
  }
  const aussteller = [...alle.values()];
  console.log(`\n   ${aussteller.length} Aussteller gelesen`);
  writeFileSync(CACHE, JSON.stringify({ geladen_am: new Date().toISOString(), quelle: BASIS, aussteller }, null, 1));
  return aussteller;
}

// Detailseite: Website, Telefon, E-Mail, LinkedIn
export function parseDetail(html) {
  const block = (html.match(/<div class="ce_cntct">([\s\S]*?)<div class="ce_favi">/) || [, html])[1];
  const g = (re) => (block.match(re) || [])[1];
  return {
    adresse: text(g(/<div class="ce_addr">([\s\S]*?)<\/div>/)) || null,
    telefon: text(g(/<div class="ce_phone">[\s\S]*?<a [^>]*>([^<]*)<\/a>/)) || null,
    email: text(g(/<div class="ce_email">[\s\S]*?<a [^>]*>([^<]*)<\/a>/)) || null,
    website: clean(unescape(g(/<div class="ce_website">\s*<a href="([^"]*)"/))),
    linkedin: clean(unescape(g(/<div class="ce_smch ce_LinkedIn">\s*<a href="([^"]*)"/))),
  };
}
async function ladeDetail(e) {
  if (e.detail) return e.detail;
  e.detail = parseDetail(await hole(e.url));
  return e.detail;
}

/* ------------------------------------------------------------------ */
/* Abgleich                                                             */
/* ------------------------------------------------------------------ */

// Liefert { treffer, art } — art: exakt | website | unscharf | null (dann ggf. vorschlag)
export function findeAussteller(kontakt, index) {
  const tokens = normName(kontakt.company);
  const k = key(tokens);
  if (!k) return { treffer: null, art: null };
  const exakt = index.byKey.get(k);
  if (exakt?.length) return { treffer: exakt[0], art: 'exakt' };

  const dom = domain(kontakt.website);
  const ort = normOrt(kontakt.city);
  const plz = clean(kontakt.postal_code);
  const kandidaten = [];
  for (const e of index.alle) {
    const t = e.tokens;
    if (!t.length) continue;
    // Praefix in beide Richtungen ("Infineon" ~ "Infineon Technologies AG")
    const kurz = t.length <= tokens.length ? t : tokens, lang = kurz === t ? tokens : t;
    const praefix = kurz.every((w, i) => lang[i] === w);
    // Gemeinsame Woerter: mindestens ein unverwechselbares und die Haelfte des kuerzeren Namens
    const gemeinsam = t.filter((w) => tokens.includes(w));
    const eigen = gemeinsam.filter((w) => !GENERISCH.has(w) && w.length >= 3);
    const wesentlich = eigen.length >= 1 && gemeinsam.length >= Math.ceil(kurz.length / 2);
    if (!praefix && !wesentlich) continue;
    const gleicherOrt = (ort && normOrt(e.ort) === ort) || (plz && e.plz === plz);
    const gleicheDomain = dom && e.detail?.website && domain(e.detail.website) === dom;
    kandidaten.push({ e, praefix, eigen, gleicherOrt, gleicheDomain, score: (praefix ? 2 : 0) + (gleicherOrt ? 3 : 0) + (gleicheDomain ? 4 : 0) + gemeinsam.length });
  }
  if (!kandidaten.length) return { treffer: null, art: null };
  kandidaten.sort((a, b) => b.score - a.score);
  const best = kandidaten[0];
  if (best.gleicheDomain) return { treffer: best.e, art: 'website' };
  if (best.gleicherOrt && (best.praefix || best.eigen.length)) return { treffer: best.e, art: 'unscharf' };
  // Praefix ohne Ortsbestaetigung: nur wenn der kurze Name eindeutig ist (>= 2 Woerter oder >= 6 Zeichen) und es genau einen Kandidaten gibt
  const kurzLen = Math.min(best.e.tokens.length, tokens.length);
  const kurzKey = key(best.e.tokens.length <= tokens.length ? best.e.tokens : tokens);
  if (best.praefix && (kurzLen >= 2 || kurzKey.length >= 6) && !GENERISCH.has(kurzKey) && kandidaten.filter((c) => c.praefix).length === 1) {
    return { treffer: best.e, art: 'unscharf' };
  }
  return { treffer: null, art: null, vorschlag: best.e };
}

async function ladeKontakte() {
  if (KONTAKTE_DATEI) {
    const rows = JSON.parse(readFileSync(KONTAKTE_DATEI, 'utf8'));
    console.log(`🧪 Testmodus: ${rows.length} Kontakte aus ${KONTAKTE_DATEI}`);
    return { sb: null, rows };
  }
  const env = (k) => { const v = process.env[k]; if (!v) { console.error(`Fehlt: ${k} (migrate.env laden: set -a; source migrate.env; set +a)`); process.exit(1); } return v; };
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data, error } = await sb.from('contacts').select('id, company, city, postal_code, website, custom').eq('lead_source', LISTE).order('company');
  if (error) throw new Error(`Kontakte: ${error.message}`);
  console.log(`📇 ${data.length} Kontakte mit Herkunft "${LISTE}"`);
  return { sb, rows: data };
}

async function main() {
  console.log(FIX ? '🚀 Abgleich mit Schreiben (FIX=1)' : '🔍 Abgleich – nur Bericht (FIX=1 zum Schreiben)');
  const aussteller = await ladeVerzeichnis();
  for (const e of aussteller) e.tokens = normName(e.name);
  const index = { alle: aussteller, byKey: new Map() };
  for (const e of aussteller) {
    const k = key(e.tokens);
    if (!index.byKey.has(k)) index.byKey.set(k, []);
    index.byKey.get(k).push(e);
  }
  const deutsch = aussteller.filter((e) => /^deutschland$/i.test(e.land ?? ''));
  const bayern = deutsch.filter((e) => istBayern(e.plz));
  console.log(`   davon ${deutsch.length} aus Deutschland, ${bayern.length} aus Bayern`);

  const { sb, rows: kontakte } = await ladeKontakte();

  // 1. Durchgang ohne Detailseiten, 2. Durchgang: fuer offene Faelle mit Website die Kandidaten nachladen
  const ergebnis = new Map();
  for (const k of kontakte) ergebnis.set(k.id, findeAussteller(k, index));
  const offen = kontakte.filter((k) => !ergebnis.get(k.id).treffer && ergebnis.get(k.id).vorschlag && domain(k.website));
  if (offen.length) {
    console.log(`🌐 ${offen.length} unsichere Faelle: Website der Kandidaten pruefen …`);
    for (const k of offen) {
      await ladeDetail(ergebnis.get(k.id).vorschlag);
      ergebnis.set(k.id, findeAussteller(k, index));
    }
  }

  const getroffen = new Set();
  const bericht = [['Firma', 'Ort', 'Aussteller 2026', 'Art', 'Treffer im Verzeichnis', 'Ort 2026', 'Halle/Stand 2026', 'Vorschlag (nicht uebernommen)']];
  const stats = { ja: 0, nein: 0, unscharf: 0, vorschlag: 0, geschrieben: 0 };
  for (const k of kontakte) {
    const r = ergebnis.get(k.id);
    const wert = r.treffer ? 'ja' : 'nein';
    stats[wert]++;
    if (r.art === 'unscharf' || r.art === 'website') stats.unscharf++;
    if (r.vorschlag) stats.vorschlag++;
    if (r.treffer) getroffen.add(r.treffer.id);
    bericht.push([k.company, k.city, wert, r.art, r.treffer?.name, r.treffer ? `${r.treffer.plz ?? ''} ${r.treffer.ort ?? ''}`.trim() : null, r.treffer?.stand,
      r.vorschlag ? `${r.vorschlag.name} (${r.vorschlag.plz ?? ''} ${r.vorschlag.ort ?? ''})` : null]);
    const custom = { ...(k.custom ?? {}), aussteller_2026: wert };
    if (r.treffer?.stand) custom.halle_stand = r.treffer.stand;
    if (JSON.stringify(custom) !== JSON.stringify(k.custom ?? {})) {
      stats.geschrieben++;
      if (FIX && sb) {
        const { error } = await sb.from('contacts').update({ custom }).eq('id', k.id);
        if (error) throw new Error(`${k.company}: ${error.message}`);
      }
    }
  }
  writeFileSync(AUSGABE_BERICHT, '﻿' + bericht.map(csvZeile).join('\n') + '\n');

  // Neue bayerische Aussteller
  const neu = bayern.filter((e) => !getroffen.has(e.id));
  // Gleiche Firma nur einmal (Mitaussteller mit mehreren Eintraegen)
  const gesehen = new Set();
  const neuEindeutig = neu.filter((e) => { const k = key(e.tokens); if (gesehen.has(k)) return false; gesehen.add(k); return true; });
  console.log(`🌐 ${neuEindeutig.length} neue bayerische Aussteller: Detailseiten lesen …`);
  let n = 0;
  for (const e of neuEindeutig) {
    try { await ladeDetail(e); } catch (err) { console.warn(`   ⚠️ ${e.name}: ${err.message}`); e.detail = {}; }
    process.stdout.write(`   ${++n}/${neuEindeutig.length}\r`);
  }
  console.log('');
  const kopf = ['Firmenname', 'Prio', 'Kanal', 'Ort', 'PLZ', 'Website', 'Taetigkeit', 'Notiz Recherche', 'Halle/Stand 2026',
    'Telefon', 'E-Mail', 'Ansprechpartner', 'Region', 'Groesse', 'Groesse gesichert', 'Mitarbeiter ca.', 'Quelle Mitarbeiterzahl',
    'Konzern', 'Quelle Liste', 'Standtyp', 'Hauptaussteller', 'Aussteller 2026'];
  const zeilen = neuEindeutig.map((e) => [
    e.name, '', '', e.ort, e.plz, e.detail?.website ?? '', e.teaser ?? '',
    e.detail?.linkedin ? `LinkedIn: ${e.detail.linkedin}` : '', e.stand ?? '',
    e.detail?.telefon ?? '', e.detail?.email ?? '', '', 'Bayern', '', '', '', '', '',
    'Ausstellerverzeichnis electronica 2026', e.typ ?? '', '', 'ja',
  ]);
  writeFileSync(AUSGABE_NEU, '﻿' + [kopf, ...zeilen].map(csvZeile).join('\n') + '\n');
  if (existsSync(CACHE)) writeFileSync(CACHE, JSON.stringify({ geladen_am: JSON.parse(readFileSync(CACHE, 'utf8')).geladen_am, quelle: BASIS, aussteller: aussteller.map(({ tokens, ...e }) => e) }, null, 1));

  // Gespeicherte Filter "electronica Telefon" / "electronica LinkedIn" um Aussteller 2026 = ja ergaenzen
  const REGEL = { field: 'custom.aussteller_2026', operator: 'eq', value: 'ja' };
  let filterErgaenzt = 0;
  if (sb) {
    const { data: filter, error } = await sb.from('saved_filters').select('id, name, entity, definition').ilike('name', 'electronica%');
    if (error) throw new Error(`Filter: ${error.message}`);
    for (const f of filter ?? []) {
      if (!/telefon|linkedin/i.test(f.name)) continue;
      const groups = (f.definition?.groups ?? []).map((g) => (g.some((r) => r.field === REGEL.field) ? g : [...g, REGEL]));
      if (!groups.length) groups.push([REGEL]);
      if (JSON.stringify(groups) === JSON.stringify(f.definition?.groups ?? [])) continue;
      filterErgaenzt++;
      console.log(`   Filter "${f.name}" (${f.entity}): Aussteller 2026 = ja ${FIX ? 'ergaenzt' : 'wuerde ergaenzt'}`);
      if (FIX) {
        const { error: e2 } = await sb.from('saved_filters').update({ definition: { ...f.definition, groups } }).eq('id', f.id);
        if (e2) throw new Error(`Filter ${f.name}: ${e2.message}`);
      }
    }
  }

  console.log(`\n✅ ${kontakte.length} Firmen abgeglichen: ${stats.ja} stellen 2026 aus, ${stats.nein} nicht.`);
  console.log(`   ${stats.unscharf} davon ueber unscharfen Namens-/Website-Abgleich, ${stats.vorschlag} offene Vorschlaege zum Nachsehen (Spalte "Vorschlag").`);
  console.log(`   ${FIX && sb ? 'Geschrieben' : 'Wuerde schreiben'}: ${stats.geschrieben} Kontakte (Aussteller 2026, Halle/Stand).`);
  console.log(`   Gespeicherte Filter ${FIX && sb ? 'ergaenzt' : 'zu ergaenzen'}: ${filterErgaenzt}`);
  console.log(`   Bericht: ${AUSGABE_BERICHT} · Neue bayerische Aussteller: ${neuEindeutig.length} in ${AUSGABE_NEU}`);
  console.log(`   Import der neuen Firmen: node scripts/import-messeliste.mjs ${AUSGABE_NEU} "${LISTE}"`);
}

if (process.argv[1] && /electronica-abgleich\.mjs$/.test(process.argv[1])) {
  main().catch((e) => { console.error('❌', e.message); process.exit(1); });
}
