'use client';

import type { ReactNode } from 'react';
import { Users, ListTree, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/Badge';
import { dateTime, eur, personName, primaryPerson, phoneOf } from '@/lib/format';
import type { ContactWithPersons, DealWithContact } from '@/lib/types';
import { dialHref } from '@/lib/dial';

export type ColumnDef<T> = {
  key: string;
  label: string;
  width?: string;
  render: (row: T) => ReactNode;
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
       className="inline-flex items-center gap-1 text-brand hover:underline"
       onClick={(e) => e.stopPropagation()}>
      <span className="max-w-[220px] truncate">{value}</span>
      <ExternalLink size={11} className="shrink-0" />
    </a>
  );
};

export const CONTACT_COLUMNS: ColumnDef<ContactWithPersons>[] = [
  { key: 'first_name', label: 'Vorname', render: (r) => <Muted>{primaryPerson(r.persons)?.first_name}</Muted> },
  { key: 'last_name', label: 'Nachname', render: (r) => <Muted>{primaryPerson(r.persons)?.last_name}</Muted> },
  { key: 'persons', label: 'Ansprechpartner', render: (r) => <PrimaryPerson persons={r.persons} /> },
  { key: 'person_count', label: 'Anzahl Personen', render: (r) => <PersonChip count={r.persons?.length ?? 0} /> },
  { key: 'email', label: 'E-Mail', render: (r) => <Muted>{primaryPerson(r.persons)?.email}</Muted> },
  { key: 'phone', label: 'Telefon', render: (r) => <Tel value={phoneOf(r.persons)} /> },
  { key: 'company', label: 'Firmenname', render: (r) => <Muted>{r.company}</Muted> },
  { key: 'website', label: 'Website', render: (r) => <Web value={r.website} /> },
  {
    key: 'deals', label: 'Verknüpft',
    render: (r) => (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <ListTree size={13} /> {r.deals?.length ?? 0} Deals
      </span>
    ),
  },
  { key: 'lead_source', label: 'Leadherkunft', render: (r) => <Muted>{r.lead_source}</Muted> },
  { key: 'city', label: 'Stadt', render: (r) => <Muted>{r.city}</Muted> },
  { key: 'postal_code', label: 'PLZ', render: (r) => <Muted>{r.postal_code}</Muted> },
  { key: 'country', label: 'Land', render: (r) => <Muted>{r.country}</Muted> },
  { key: 'opener_kuerzel', label: 'Opener-Kürzel', render: (r) => <Muted>{r.opener_kuerzel}</Muted> },
  {
    key: 'last_contacted_at', label: 'Zuletzt kontaktiert',
    render: (r) => <span className="text-muted">{dateTime(r.last_contacted_at)}</span>,
  },
  { key: 'custom.prio', label: 'Prio', render: (r) => <Muted>{r.custom?.prio}</Muted> },
  { key: 'custom.kanal', label: 'Kanal', render: (r) => r.custom?.kanal ? <Badge>{r.custom.kanal === 'A' ? 'A · LinkedIn' : 'B · Telefon'}</Badge> : <span className="text-muted">–</span> },
  { key: 'custom.standtyp', label: 'Standtyp', render: (r) => <Muted>{r.custom?.standtyp}</Muted> },
  { key: 'custom.halle_stand', label: 'Halle / Stand', render: (r) => <Muted>{r.custom?.halle_stand}</Muted> },
  { key: 'custom.hauptaussteller', label: 'Hauptaussteller', render: (r) => <Muted>{r.custom?.hauptaussteller}</Muted> },
  { key: 'custom.budgetklasse', label: 'Budgetklasse', render: (r) => <Muted>{r.custom?.budgetklasse}</Muted> },
];

export const CONTACT_DEFAULT_COLUMNS = [
  'company', 'persons', 'email', 'phone', 'website', 'lead_source', 'deals',
];

export const DEAL_COLUMNS: ColumnDef<DealWithContact>[] = [
  { key: 'company', label: 'Firmenname', render: (r) => <Muted>{r.contact?.company}</Muted> },
  { key: 'website', label: 'Website', render: (r) => <Web value={r.contact?.website} /> },
  {
    key: 'persons', label: 'Ansprechpartner',
    render: (r) => {
      const p = primaryPerson(r.contact?.persons);
      const count = r.contact?.persons?.length ?? 0;
      return (
        <span className="flex items-center gap-2">
          <span className="truncate">{personName(p) || '–'}</span>
          {count > 1 && <PersonChip count={count} />}
        </span>
      );
    },
  },
  {
    key: 'created_at', label: 'Deal erstellt am',
    render: (r) => <span className="text-muted">{dateTime(r.created_at)}</span>,
  },
  { key: 'phone', label: 'Telefon', render: (r) => <Tel value={phoneOf(r.contact?.persons)} /> },
  { key: 'email', label: 'E-Mail', render: (r) => <Muted>{primaryPerson(r.contact?.persons)?.email}</Muted> },
  { key: 'title', label: 'Deal', render: (r) => <Muted>{r.title}</Muted> },
  { key: 'value', label: 'Wert', render: (r) => <span className="tabular-nums">{eur(r.value)}</span> },
  { key: 'source', label: 'Leadherkunft', render: (r) => <Muted>{r.source}</Muted> },
  { key: 'next_step', label: 'Nächster Schritt', render: (r) => <Muted>{r.next_step}</Muted> },
  {
    key: 'last_activity_at', label: 'Letzte Aktivität',
    render: (r) => <span className="text-muted">{dateTime(r.last_activity_at)}</span>,
  },
  { key: 'custom.prio', label: 'Prio', render: (r) => <Muted>{r.contact?.custom?.prio}</Muted> },
  { key: 'custom.kanal', label: 'Kanal', render: (r) => r.contact?.custom?.kanal ? <Badge>{r.contact.custom.kanal === 'A' ? 'A · LinkedIn' : 'B · Telefon'}</Badge> : <span className="text-muted">–</span> },
  { key: 'custom.standtyp', label: 'Standtyp', render: (r) => <Muted>{r.contact?.custom?.standtyp}</Muted> },
  { key: 'custom.halle_stand', label: 'Halle / Stand', render: (r) => <Muted>{r.contact?.custom?.halle_stand}</Muted> },
  { key: 'custom.budgetklasse', label: 'Budgetklasse', render: (r) => <Muted>{r.contact?.custom?.budgetklasse}</Muted> },
];

export const DEAL_DEFAULT_COLUMNS = [
  'company', 'website', 'persons', 'created_at', 'phone', 'email',
];
