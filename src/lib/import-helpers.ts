/** Hilfen fuer den CSV-Import von Messelisten (Browser-Import und Skript). */

const n = (s?: string | null) => (s ?? '').trim().toLowerCase();

const REGIONEN: Record<string, string> = {
  bayern: 'Bayern', oberbayern: 'Bayern', muenchen: 'Bayern', 'münchen': 'Bayern',
  bw: 'Baden-Württemberg', 'baden-wuerttemberg': 'Baden-Württemberg', 'baden-württemberg': 'Baden-Württemberg',
  nrw: 'Nordrhein-Westfalen', hessen: 'Hessen', sachsen: 'Sachsen', sh: 'Schleswig-Holstein',
  rlp: 'Rheinland-Pfalz', niedersachsen: 'Niedersachsen', hamburg: 'Hamburg', bremen: 'Bremen',
  berlin: 'Berlin', thueringen: 'Thüringen', 'thüringen': 'Thüringen', brandenburg: 'Brandenburg', saarland: 'Saarland',
};

/** "Gilching (Bayern)" -> Gilching / Bayern; "Leonberg (BW - Tochter frz. Axon' Cable)" -> Region + Konzern-Hinweis. */
export function ortUndRegion(raw?: string | null): { ort: string | null; region: string | null; konzern: string | null } {
  const t = (raw ?? '').trim();
  if (!t) return { ort: null, region: null, konzern: null };
  const m = t.match(/^([^(]*?)\s*\(([^)]*)\)\s*$/);
  let ort: string | null = (m ? m[1] : t).trim() || null;
  let region = REGIONEN[n(ort)] ?? null;
  const hinweise: string[] = [];
  for (const teil of (m ? m[2] : '').split(/\s+-\s+/)) {
    const k = n(teil);
    if (!k) continue;
    if (REGIONEN[k]) region = REGIONEN[k]; else hinweise.push(teil.trim());
  }
  if (n(ort) === 'oberbayern') ort = null;
  return { ort, region, konzern: hinweise.join(', ') || null };
}

const LAENDER: Record<string, string> = { de: 'Deutschland', at: 'Österreich', ch: 'Schweiz' };
export const landName = (raw?: string | null) => LAENDER[n(raw)] ?? ((raw ?? '').trim() || null);

/** Signalstaerke A/B/C -> Prio 1/2/3 */
export const prioAusSignal = (s?: string | null) => ({ a: '1', b: '2', c: '3' } as Record<string, string>)[n(s)] ?? null;

/** Firmen-Schluessel ohne Rechtsform: "Bott Systems GmbH" == "Bott Systems". */
export const firmKey = (s?: string | null) => n(s)
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/\(.*?\)/g, ' ')
  .replace(/\b(gmbh|mbh|ag|se|kg|co|ohg|ug|e\.?k|haftungsbeschraenkt|group|gruppe|deutschland|germany)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '');

/** Firmenname aufraeumen: erste Zeile, bei "A GmbH / B GmbH" die erste Firma. */
export function firmenName(raw?: string | null): string | null {
  let v = (raw ?? '').split(/\r?\n/)[0].trim();
  if (v.length > 40 && v.includes(' / ')) v = v.split(' / ')[0].trim();
  return v || null;
}
