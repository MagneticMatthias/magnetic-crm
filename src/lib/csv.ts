/**
 * Kleiner CSV-Parser: erkennt Trennzeichen (; , Tab), Anfuehrungszeichen,
 * Zeilenumbrueche in Feldern und BOM. Reicht fuer Excel-Exporte.
 */
export type ParsedCsv = { headers: string[]; rows: string[][]; delimiter: string };

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? '';
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

export function parseCsv(text: string, delimiter?: string): ParsedCsv {
  const clean = text.replace(/^﻿/, '');
  const delim = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') { inQuotes = true; continue; } // sonst Zoll-Zeichen wie 19"-Rack
    if (c === delim) { row.push(field); field = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows, delimiter: delim };
}

/** Zielfelder des Imports mit Erkennungsmustern fuer die automatische Zuordnung. */
export const IMPORT_FIELDS = [
  { key: 'company', label: 'Firmenname', patterns: ['firma', 'company', 'unternehmen', 'aussteller', 'organisation', 'name der firma'] },
  { key: 'first_name', label: 'Vorname', patterns: ['vorname', 'first', 'firstname', 'given'] },
  { key: 'last_name', label: 'Nachname', patterns: ['nachname', 'last', 'lastname', 'surname', 'familienname'] },
  { key: 'full_name', label: 'Name (Vor- und Nachname)', patterns: ['ansprechpartner', 'kontakt', 'contact', 'name'] },
  { key: 'email', label: 'E-Mail', patterns: ['mail', 'email', 'e-mail'] },
  { key: 'phone', label: 'Telefon', patterns: ['telefon', 'phone', 'tel', 'mobil', 'handy', 'rufnummer'] },
  { key: 'website', label: 'Website', patterns: ['website', 'web', 'url', 'homepage', 'domain'] },
  { key: 'job_title', label: 'Position', patterns: ['position', 'titel', 'title', 'funktion', 'rolle'] },
  { key: 'postal_code', label: 'PLZ', patterns: ['plz', 'postleitzahl', 'zip', 'postal'] },
  { key: 'city', label: 'Stadt', patterns: ['stadt', 'ort', 'city', 'town'] },
  { key: 'country', label: 'Land', patterns: ['land', 'country'] },
  { key: 'notes', label: 'Notiz', patterns: ['notiz', 'bemerkung', 'kommentar', 'note', 'comment', 'info'] },
  { key: 'value', label: 'Dealwert', patterns: ['wert', 'volumen', 'value', 'budget', 'umsatz'] },
  // Zusatzfelder (Messelisten). Reihenfolge zaehlt: "Signalstaerke" vor "Signal".
  { key: 'produkt', label: 'Produkt / Tätigkeit', patterns: ['produkt', 'taetigkeit', 'tätigkeit', 'beschreibung', 'branche'] },
  { key: 'prio', label: 'Prio', patterns: ['prio'] },
  { key: 'kanal', label: 'Kanal (A = LinkedIn, B = Telefon)', patterns: ['kanal'] },
  { key: 'halle_stand', label: 'Halle / Stand', patterns: ['halle', 'messestand'] },
  { key: 'region', label: 'Region / Bundesland', patterns: ['region', 'bundesland'] },
  { key: 'signalstaerke', label: 'Signalstärke (A/B/C)', patterns: ['signalst'] },
  { key: 'signal', label: 'Signal-Hinweis', patterns: ['signal'] },
  { key: 'signal_quelle', label: 'Quelle (Link)', patterns: ['quelle', 'fundstelle'] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key'];

export function guessMapping(headers: string[]): Record<number, ImportFieldKey | ''> {
  const mapping: Record<number, ImportFieldKey | ''> = {};
  const used = new Set<ImportFieldKey>();
  headers.forEach((h, i) => {
    const lower = h.toLowerCase();
    const hit = IMPORT_FIELDS.find((f) => !used.has(f.key) && f.patterns.some((p) => lower.includes(p)));
    mapping[i] = hit?.key ?? '';
    if (hit) used.add(hit.key);
  });
  return mapping;
}
