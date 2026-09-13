'use client';

import type { ReactNode } from 'react';
import { Users, ListTree, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/Badge';
import { dateTime, eur, personName, primaryPerson, phoneOf } from '@/lib/format';
import { dialHref } from '@/lib/dial';
import type { ContactWithPersons, DealWithContact } from '@/lib/types';

export type ColumnDef<T> = {
  key: string;
  label: string;
  /** Standardbreite in Pixeln */
  width?: number;
  render: (row: T) => ReactNode;
  /** Wert fuer die Sortierung (Text, Zahl oder ISO-Datum) */
  sortValue?: (row: T) => string | number | null | undefined;
};

const Muted = ({ children }: { children: ReactNode }) =>
  children ? <>{children}</> : <span className="text-muted">–</span>;

const PersonChip = ({ count }: { count: number }) =>
  count === 0 ? (
    <span className="text-muted">Kein Ansprechpartner</span>
  ) : (
    <span className="chip bg-surface-2 text-muted">
      <Users size={12} /> {count} Ansprechpartner
    </span>
  );

/** Hauptansprechpartner mit Hinweis auf weitere Personen derselben Firma. */
const PrimaryPerson = ({ persons }: { persons: { first_name: string | null; last_name: string | null; is_primary: boolean }[] | undefined }) => {
  const p = primaryPerson(persons);
  const name = personName(p);
  const more = (persons?.length ?? 0) - 1;
  if (!name) return <span className="text-muted">Kein Ansprechpartner</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {name}
      {more > 0 && <span className="chip bg-surface-2 text-muted" title={`${more} weitere Person(en) bei dieser Firma`}>+{more}</span>}
    </span>
  );
};

const Tel = ({ value }: { value: string | null | undefined }) =>
  value ? <a href={dialHref(value)} className="text-brand hover:underline"
              onClick={(e) => e.stopPropagation()}>{value}</a>
        : <span className="text-muted">–</span>;

const Web = ({ value }: { value: string | null | undefined }) => {
  if (!value) return <span className="text-muted">–</span>;
  const href = value.startsWith('http') ? value : `https://${value}`;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener"
       className="inline-flex max-w-full items-center gap-1 text-brand hover:underline"
       onClick={(e) => e.stopPropagation()}>
      <span className="truncate">{value}</span>
      <ExternalLink size={11} className="shrink-0" />
    </a>
  );
};

const LastContact = ({ value }: { value: string | null | undefined }) =>
  value ? <span>{dateTime(value)}</span> : <span className="chip bg-surface-2 text-muted">noch nie</span>;

const Kanal = ({ value }: { value: string | null | undefined }) =>
  value ? <Badge>{value === 'A' ? 'A · LinkedIn' : 'B · Telefon'}</Badge> : <span className="text-muted">–</span>;

const prioNum = (v: string | null | undefined) => (v ? Number(v) || 9 : 9);
const pname = (persons?: { first_name: string | null; last_name: string | null; is_primary: boolean }[] | null) =>
  personName(primaryPerson(persons)) || '';

/* ------------------------------ Kontakte ------------------------------ */

export const CONTACT_COLUMNS: ColumnDef<ContactWithPersons>[] = [
  { key: 'company', label: 'Firmenname', width: 240, render: (r) => <Muted>{r.company}</Muted>, sortValue: (r) => r.company ?? '' },
  { key: 'persons', label: 'Ansprechpartner', width: 200, render: (r) => <PrimaryPerson persons={r.persons} />, sortValue: (r) => pname(r.persons) },
  { key: 'first_name', label: 'Vorname', width: 130, render: (r) => <Muted>{primaryPerson(r.persons)?.first_name}</Muted>, sortValue: (r) => primaryPerson(r.persons)?.first_name ?? '' },
  { key: 'last_name', label: 'Nachname', width: 130, render: (r) => <Muted>{primaryPerson(r.persons)?.last_name}</Muted>, sortValue: (r) => primaryPerson(r.persons)?.last_name ?? '' },
  { key: 'person_count', label: 'Anzahl Personen', width: 160, render: (r) => <PersonChip count={r.persons?.length ?? 0} />, sortValue: (r) => r.persons?.length ?? 0 },
  { key: 'email', label: 'E-Mail', width: 220, render: (r) => <Muted>{primaryPerson(r.persons)?.email}</Muted>, sortValue: (r) => primaryPerson(r.persons)?.email ?? '' },
  { key: 'phone', label: 'Telefon', width: 170, render: (r) => <Tel value={phoneOf(r.persons)} />, sortValue: (r) => phoneOf(r.persons) ?? '' },
  { key: 'website', label: 'Website', width: 200, render: (r) => <Web value={r.website} />, sortValue: (r) => r.website ?? '' },
  { key: 'last_contacted_at', label: 'Zuletzt kontaktiert', width: 160, render: (r) => <LastContact value={r.last_contacted_at} />, sortValue: (r) => r.last_contacted_at ?? '' },
  { key: 'deals', label: 'Verknüpft', width: 110, render: (r) => (
      <span className="inline-flex items-center gap-1.5 text-muted"><ListTree size={13} /> {r.deals?.length ?? 0} Deals</span>
    ), sortValue: (r) => r.deals?.length ?? 0 },
  { key: 'lead_source', label: 'Leadherkunft', width: 160, render: (r) => <Muted>{r.lead_source}</Muted>, sortValue: (r) => r.lead_source ?? '' },
  { key: 'city', label: 'Stadt', width: 130, render: (r) => <Muted>{r.city}</Muted>, sortValue: (r) => r.city ?? '' },
  { key: 'postal_code', label: 'PLZ', width: 80, render: (r) => <Muted>{r.postal_code}</Muted>, sortValue: (r) => r.postal_code ?? '' },
  { key: 'country', label: 'Land', width: 120, render: (r) => <Muted>{r.country}</Muted>, sortValue: (r) => r.country ?? '' },
  { key: 'opener_kuerzel', label: 'Opener-Kürzel', width: 110, render: (r) => <Muted>{r.opener_kuerzel}</Muted>, sortValue: (r) => r.opener_kuerzel ?? '' },
  { key: 'custom.prio', label: 'Prio', width: 70, render: (r) => <Muted>{r.custom?.prio}</Muted>, sortValue: (r) => prioNum(r.custom?.prio) },
  { key: 'custom.kanal', label: 'Kanal', width: 120, render: (r) => <Kanal value={r.custom?.kanal} />, sortValue: (r) => r.custom?.kanal ?? 'Z' },
  { key: 'custom.standtyp', label: 'Standtyp', width: 160, render: (r) => <Muted>{r.custom?.standtyp}</Muted>, sortValue: (r) => r.custom?.standtyp ?? '' },
  { key: 'custom.halle_stand', label: 'Halle / Stand', width: 110, render: (r) => <Muted>{r.custom?.halle_stand}</Muted>, sortValue: (r) => r.custom?.halle_stand ?? '' },
  { key: 'custom.hauptaussteller', label: 'Hauptaussteller', width: 220, render: (r) => <Muted>{r.custom?.hauptaussteller}</Muted>, sortValue: (r) => r.custom?.hauptaussteller ?? '' },
  { key: 'custom.budgetklasse', label: 'Budgetklasse', width: 260, render: (r) => <Muted>{r.custom?.budgetklasse}</Muted>, sortValue: (r) => r.custom?.budgetklasse ?? '' },
];

export const CONTACT_DEFAULT_COLUMNS = [
  'company', 'persons', 'email', 'phone', 'website', 'lead_source', 'deals',
];

/* -------------------------------- Deals ------------------------------- */

export const DEAL_COLUMNS: ColumnDef<DealWithContact>[] = [
  { key: 'company', label: 'Firmenname', width: 240, render: (r) => <Muted>{r.contact?.company}</Muted>, sortValue: (r) => r.contact?.company ?? '' },
  { key: 'custom.prio', label: 'Prio', width: 70, render: (r) => <Muted>{r.contact?.custom?.prio}</Muted>, sortValue: (r) => prioNum(r.contact?.custom?.prio) },
  { key: 'stage', label: 'Phase', width: 190, render: (r) => r.stage ? <Badge color={r.stage.color}>{r.stage.name}</Badge> : <span className="text-muted">–</span>, sortValue: (r) => r.stage?.name ?? '' },
  { key: 'last_contacted_at', label: 'Zuletzt kontaktiert', width: 160, render: (r) => <LastContact value={r.contact?.last_contacted_at} />, sortValue: (r) => r.contact?.last_contacted_at ?? '' },
  { key: 'custom.kanal', label: 'Kanal', width: 120, render: (r) => <Kanal value={r.contact?.custom?.kanal} />, sortValue: (r) => r.contact?.custom?.kanal ?? 'Z' },
  { key: 'persons', label: 'Ansprechpartner', width: 200, render: (r) => <PrimaryPerson persons={r.contact?.persons} />, sortValue: (r) => pname(r.contact?.persons) },
  { key: 'phone', label: 'Telefon', width: 170, render: (r) => <Tel value={phoneOf(r.contact?.persons)} />, sortValue: (r) => phoneOf(r.contact?.persons) ?? '' },
  { key: 'email', label: 'E-Mail', width: 220, render: (r) => <Muted>{primaryPerson(r.contact?.persons)?.email}</Muted>, sortValue: (r) => primaryPerson(r.contact?.persons)?.email ?? '' },
  { key: 'website', label: 'Website', width: 200, render: (r) => <Web value={r.contact?.website} />, sortValue: (r) => r.contact?.website ?? '' },
  { key: 'next_step', label: 'Nächster Schritt', width: 220, render: (r) => <Muted>{r.next_step}</Muted>, sortValue: (r) => r.next_step ?? '' },
  { key: 'expected_close_date', label: 'Fällig / Abschluss', width: 130, render: (r) => <Muted>{r.expected_close_date ? dateTime(r.expected_close_date).slice(0, 10) : null}</Muted>, sortValue: (r) => r.expected_close_date ?? '' },
  { key: 'value', label: 'Wert', width: 110, render: (r) => <span className="tabular-nums">{eur(r.value)}</span>, sortValue: (r) => Number(r.value ?? 0) },
  { key: 'title', label: 'Deal', width: 240, render: (r) => <Muted>{r.title}</Muted>, sortValue: (r) => r.title },
  { key: 'created_at', label: 'Deal erstellt am', width: 160, render: (r) => <span className="text-muted">{dateTime(r.created_at)}</span>, sortValue: (r) => r.created_at },
  { key: 'last_activity_at', label: 'Letzte Aktivität', width: 160, render: (r) => <span className="text-muted">{dateTime(r.last_activity_at)}</span>, sortValue: (r) => r.last_activity_at ?? '' },
  { key: 'source', label: 'Leadherkunft', width: 160, render: (r) => <Muted>{r.source}</Muted>, sortValue: (r) => r.source ?? '' },
  { key: 'city', label: 'Stadt', width: 130, render: (r) => <Muted>{r.contact?.city}</Muted>, sortValue: (r) => r.contact?.city ?? '' },
  { key: 'custom.standtyp', label: 'Standtyp', width: 160, render: (r) => <Muted>{r.contact?.custom?.standtyp}</Muted>, sortValue: (r) => r.contact?.custom?.standtyp ?? '' },
  { key: 'custom.halle_stand', label: 'Halle / Stand', width: 110, render: (r) => <Muted>{r.contact?.custom?.halle_stand}</Muted>, sortValue: (r) => r.contact?.custom?.halle_stand ?? '' },
  { key: 'custom.hauptaussteller', label: 'Hauptaussteller', width: 220, render: (r) => <Muted>{r.contact?.custom?.hauptaussteller}</Muted>, sortValue: (r) => r.contact?.custom?.hauptaussteller ?? '' },
  { key: 'custom.budgetklasse', label: 'Budgetklasse', width: 260, render: (r) => <Muted>{r.contact?.custom?.budgetklasse}</Muted>, sortValue: (r) => r.contact?.custom?.budgetklasse ?? '' },
];

export const DEAL_DEFAULT_COLUMNS = [
  'company', 'custom.prio', 'stage', 'last_contacted_at', 'custom.kanal', 'persons', 'phone', 'website',
];
