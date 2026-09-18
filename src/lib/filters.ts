import type {
  ContactWithPersons, DealWithContact, FilterDefinition, FilterOperator, FilterRule,
} from './types';

export type FieldType = 'text' | 'number' | 'date' | 'select';

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  group: string;
  icon: 'text' | 'list' | 'mail' | 'phone' | 'date' | 'link' | 'number' | 'money';
  options?: string[];
  get: (row: never) => string | number | null;
};

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  contains: 'Enthält',
  not_contains: 'Enthält nicht',
  eq: 'Gleich',
  neq: 'Ungleich',
  gt: 'Größer als',
  gte: 'Größer oder gleich',
  lt: 'Kleiner als',
  lte: 'Kleiner oder gleich',
  is_empty: 'Ist unbekannt',
  not_empty: 'Ist bekannt',
  before_days: 'Ist vor',
  after_days: 'Ist nach',
};

export const OPERATORS_BY_TYPE: Record<FieldType, FilterOperator[]> = {
  text: ['contains', 'not_contains', 'eq', 'neq', 'is_empty', 'not_empty'],
  select: ['eq', 'neq', 'is_empty', 'not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'not_empty'],
  date: ['before_days', 'after_days', 'is_empty', 'not_empty'],
};

export const NO_VALUE_OPERATORS: FilterOperator[] = ['is_empty', 'not_empty'];

const primary = (c: ContactWithPersons | null | undefined) =>
  c?.persons?.find((p) => p.is_primary) ?? c?.persons?.[0] ?? null;

const joined = (c: ContactWithPersons | null | undefined, key: 'first_name' | 'last_name' | 'email' | 'phone') =>
  (c?.persons ?? []).map((p) => p[key]).filter(Boolean).join(' ') || null;

/** Vorgang, der den Kontakt beschreibt: ein offener zuerst, sonst der erste. */
const hauptDeal = (r: ContactWithPersons) =>
  r.deals?.find((d) => d.status === 'offen') ?? r.deals?.[0];

export const CONTACT_FIELDS: FieldDef[] = [
  { key: 'stage', label: 'Phase', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'list',
    get: (r: ContactWithPersons) => hauptDeal(r)?.stage?.name ?? null },
  { key: 'pipeline', label: 'Pipeline', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'list',
    get: (r: ContactWithPersons) => hauptDeal(r)?.pipeline?.name ?? null },
  { key: 'person_count', label: 'Ansprechpartner-Anzahl', type: 'number', group: 'Kontakt-Eigenschaften', icon: 'list',
    get: (r: ContactWithPersons) => r.persons?.length ?? 0 },
  { key: 'first_name', label: 'Vorname', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'text',
    get: (r: ContactWithPersons) => joined(r, 'first_name') },
  { key: 'last_name', label: 'Nachname', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'text',
    get: (r: ContactWithPersons) => joined(r, 'last_name') },
  { key: 'email', label: 'E-Mail', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'mail',
    get: (r: ContactWithPersons) => joined(r, 'email') },
  { key: 'phone', label: 'Telefon', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'phone',
    get: (r: ContactWithPersons) => joined(r, 'phone') },
  { key: 'opener_kuerzel', label: 'Opener-Kürzel', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'text',
    get: (r: ContactWithPersons) => r.opener_kuerzel },
  { key: 'company', label: 'Firmenname', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'text',
    get: (r: ContactWithPersons) => r.company },
  { key: 'website', label: 'Website', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'link',
    get: (r: ContactWithPersons) => r.website },
  { key: 'lead_source', label: 'Leadherkunft', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'text',
    get: (r: ContactWithPersons) => r.lead_source },
  { key: 'city', label: 'Stadt', type: 'text', group: 'Adresse', icon: 'text',
    get: (r: ContactWithPersons) => r.city },
  { key: 'postal_code', label: 'Postleitzahl', type: 'text', group: 'Adresse', icon: 'text',
    get: (r: ContactWithPersons) => r.postal_code },
  { key: 'country', label: 'Land', type: 'select', group: 'Adresse', icon: 'list',
    options: ['Deutschland', 'Österreich', 'Schweiz'],
    get: (r: ContactWithPersons) => r.country },
  { key: 'last_contacted_at', label: 'Zuletzt kontaktiert', type: 'date', group: 'Aktivität', icon: 'date',
    get: (r: ContactWithPersons) => r.last_contacted_at },
  { key: 'created_at', label: 'Kontakt erstellt am', type: 'date', group: 'Aktivität', icon: 'date',
    get: (r: ContactWithPersons) => r.created_at },
  { key: 'deal_count', label: 'Verknüpfte Deals', type: 'number', group: 'Aktivität', icon: 'number',
    get: (r: ContactWithPersons) => r.deals?.length ?? 0 },
  { key: 'custom.prio', label: 'Prio', type: 'select', group: 'Messe / Zusatzfelder', icon: 'list',
    options: ['1', '2', '3'], get: (r: ContactWithPersons) => r.custom?.prio ?? null },
  { key: 'custom.kanal', label: 'Kanal (A = LinkedIn, B = Telefon)', type: 'select', group: 'Messe / Zusatzfelder', icon: 'list',
    options: ['A', 'B'], get: (r: ContactWithPersons) => r.custom?.kanal ?? null },
  { key: 'custom.standtyp', label: 'Standtyp', type: 'text', group: 'Messe / Zusatzfelder', icon: 'text',
    get: (r: ContactWithPersons) => r.custom?.standtyp ?? null },
  { key: 'custom.halle_stand', label: 'Halle / Stand', type: 'text', group: 'Messe / Zusatzfelder', icon: 'text',
    get: (r: ContactWithPersons) => r.custom?.halle_stand ?? null },
  { key: 'custom.hauptaussteller', label: 'Hauptaussteller', type: 'text', group: 'Messe / Zusatzfelder', icon: 'text',
    get: (r: ContactWithPersons) => r.custom?.hauptaussteller ?? null },
  { key: 'custom.budgetklasse', label: 'Budgetklasse', type: 'text', group: 'Messe / Zusatzfelder', icon: 'money',
    get: (r: ContactWithPersons) => r.custom?.budgetklasse ?? null },
  { key: 'custom.groesse', label: 'Firmengröße', type: 'select', group: 'Messe / Zusatzfelder', icon: 'list',
    options: ['klein', 'mittel', 'groß', 'unbekannt'], get: (r: ContactWithPersons) => r.custom?.groesse ?? null },
  { key: 'custom.region', label: 'Region', type: 'text', group: 'Messe / Zusatzfelder', icon: 'text',
    get: (r: ContactWithPersons) => r.custom?.region ?? null },
  { key: 'custom.konzern', label: 'Konzern', type: 'text', group: 'Messe / Zusatzfelder', icon: 'text',
    get: (r: ContactWithPersons) => r.custom?.konzern ?? null },
];

export const DEAL_FIELDS: FieldDef[] = [
  { key: 'title', label: 'Deal-Titel', type: 'text', group: 'Deal-Eigenschaften', icon: 'text',
    get: (r: DealWithContact) => r.title },
  { key: 'value', label: 'Dealwert', type: 'number', group: 'Deal-Eigenschaften', icon: 'money',
    get: (r: DealWithContact) => Number(r.value ?? 0) },
  { key: 'source', label: 'Leadherkunft', type: 'text', group: 'Deal-Eigenschaften', icon: 'text',
    get: (r: DealWithContact) => r.source },
  { key: 'next_step', label: 'Nächster Schritt', type: 'text', group: 'Deal-Eigenschaften', icon: 'text',
    get: (r: DealWithContact) => r.next_step },
  { key: 'created_at', label: 'Deal erstellt am', type: 'date', group: 'Deal-Eigenschaften', icon: 'date',
    get: (r: DealWithContact) => r.created_at },
  { key: 'expected_close_date', label: 'Erwarteter Abschluss', type: 'date', group: 'Deal-Eigenschaften', icon: 'date',
    get: (r: DealWithContact) => r.expected_close_date },
  { key: 'last_activity_at', label: 'Letzte Aktivität', type: 'date', group: 'Deal-Eigenschaften', icon: 'date',
    get: (r: DealWithContact) => r.last_activity_at ?? null },
  { key: 'company', label: 'Firmenname', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'text',
    get: (r: DealWithContact) => r.contact?.company ?? null },
  { key: 'website', label: 'Website', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'link',
    get: (r: DealWithContact) => r.contact?.website ?? null },
  { key: 'person_count', label: 'Ansprechpartner-Anzahl', type: 'number', group: 'Kontakt-Eigenschaften', icon: 'list',
    get: (r: DealWithContact) => r.contact?.persons?.length ?? 0 },
  { key: 'first_name', label: 'Vorname', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'text',
    get: (r: DealWithContact) => joined(r.contact, 'first_name') },
  { key: 'last_name', label: 'Nachname', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'text',
    get: (r: DealWithContact) => joined(r.contact, 'last_name') },
  { key: 'email', label: 'E-Mail', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'mail',
    get: (r: DealWithContact) => joined(r.contact, 'email') },
  { key: 'phone', label: 'Telefon', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'phone',
    get: (r: DealWithContact) => primary(r.contact)?.phone ?? null },
  { key: 'lead_source', label: 'Leadherkunft (Kontakt)', type: 'text', group: 'Kontakt-Eigenschaften', icon: 'text',
    get: (r: DealWithContact) => r.contact?.lead_source ?? null },
  { key: 'country', label: 'Land', type: 'select', group: 'Adresse', icon: 'list',
    options: ['Deutschland', 'Österreich', 'Schweiz'],
    get: (r: DealWithContact) => r.contact?.country ?? null },
  { key: 'city', label: 'Stadt', type: 'text', group: 'Adresse', icon: 'text',
    get: (r: DealWithContact) => r.contact?.city ?? null },
  { key: 'last_contacted_at', label: 'Zuletzt kontaktiert', type: 'date', group: 'Aktivität', icon: 'date',
    get: (r: DealWithContact) => r.contact?.last_contacted_at ?? null },
  { key: 'custom.prio', label: 'Prio', type: 'select', group: 'Messe / Zusatzfelder', icon: 'list',
    options: ['1', '2', '3'], get: (r: DealWithContact) => r.contact?.custom?.prio ?? null },
  { key: 'custom.kanal', label: 'Kanal (A = LinkedIn, B = Telefon)', type: 'select', group: 'Messe / Zusatzfelder', icon: 'list',
    options: ['A', 'B'], get: (r: DealWithContact) => r.contact?.custom?.kanal ?? null },
  { key: 'custom.standtyp', label: 'Standtyp', type: 'text', group: 'Messe / Zusatzfelder', icon: 'text',
    get: (r: DealWithContact) => r.contact?.custom?.standtyp ?? null },
  { key: 'custom.halle_stand', label: 'Halle / Stand', type: 'text', group: 'Messe / Zusatzfelder', icon: 'text',
    get: (r: DealWithContact) => r.contact?.custom?.halle_stand ?? null },
  { key: 'custom.budgetklasse', label: 'Budgetklasse', type: 'text', group: 'Messe / Zusatzfelder', icon: 'money',
    get: (r: DealWithContact) => r.contact?.custom?.budgetklasse ?? null },
  { key: 'custom.groesse', label: 'Firmengröße', type: 'select', group: 'Messe / Zusatzfelder', icon: 'list',
    options: ['klein', 'mittel', 'groß', 'unbekannt'], get: (r: DealWithContact) => r.contact?.custom?.groesse ?? null },
  { key: 'custom.region', label: 'Region', type: 'text', group: 'Messe / Zusatzfelder', icon: 'text',
    get: (r: DealWithContact) => r.contact?.custom?.region ?? null },
  { key: 'custom.konzern', label: 'Konzern', type: 'text', group: 'Messe / Zusatzfelder', icon: 'text',
    get: (r: DealWithContact) => r.contact?.custom?.konzern ?? null },
];

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

function matchRule(row: unknown, rule: FilterRule, fields: FieldDef[]): boolean {
  const field = fields.find((f) => f.key === rule.field);
  if (!field) return true;

  const raw = (field.get as (r: unknown) => string | number | null)(row);
  const empty = raw === null || raw === undefined || String(raw).trim() === '';

  switch (rule.operator) {
    case 'is_empty': return empty;
    case 'not_empty': return !empty;
    case 'contains': return norm(raw).includes(norm(rule.value));
    case 'not_contains': return !norm(raw).includes(norm(rule.value));
    case 'eq': return norm(raw) === norm(rule.value);
    case 'neq': return norm(raw) !== norm(rule.value);
    case 'gt': return Number(raw) > Number(rule.value);
    case 'gte': return Number(raw) >= Number(rule.value);
    case 'lt': return Number(raw) < Number(rule.value);
    case 'lte': return Number(raw) <= Number(rule.value);
    case 'before_days': {
      if (empty) return false;
      const days = Number(rule.value);
      if (!Number.isFinite(days)) return true;
      return new Date(String(raw)).getTime() < Date.now() - days * 86400000;
    }
    case 'after_days': {
      if (empty) return false;
      const days = Number(rule.value);
      if (!Number.isFinite(days)) return true;
      return new Date(String(raw)).getTime() >= Date.now() - days * 86400000;
    }
    default: return true;
  }
}

/**
 * Regeln innerhalb einer Gruppe sind UND-verknuepft, die Gruppen untereinander
 * ODER. Gefiltert wird auf dem Server ueber die geladene Seite - das erlaubt
 * auch Felder aus verknuepften Tabellen (Ansprechpartner) und ODER-Gruppen,
 * die PostgREST so nicht abbilden kann.
 */
export function applyFilter<T>(rows: T[], def: FilterDefinition | null, fields: FieldDef[]): T[] {
  const groups = (def?.groups ?? []).map((g) => g.filter((r) => r.field));
  const active = groups.filter((g) => g.length > 0);
  if (active.length === 0) return rows;
  return rows.filter((row) => active.some((group) => group.every((rule) => matchRule(row, rule, fields))));
}

export function countRules(def: FilterDefinition | null) {
  return (def?.groups ?? []).reduce((n, g) => n + g.filter((r) => r.field).length, 0);
}

export const EMPTY_FILTER: FilterDefinition = { groups: [[]] };

export function parseFilterParam(raw: string | undefined): FilterDefinition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as FilterDefinition;
    return Array.isArray(parsed?.groups) ? parsed : null;
  } catch {
    return null;
  }
}
