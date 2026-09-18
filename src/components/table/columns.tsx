'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Users, ListTree, ExternalLink, Phone, ChevronDown, Check, Share2 } from 'lucide-react';
import CopyButton from '@/components/CopyButton';
import { setDealStage } from '@/app/actions/records';
import { useStages } from './StagesContext';
import { Badge } from '@/components/Badge';
import { dateTime, eur, personName, primaryPerson, phoneOf } from '@/lib/format';
import { dialHref, splitPhones, useDialScheme } from '@/lib/dial';
import type { ContactDeal, ContactWithPersons, DealWithContact } from '@/lib/types';

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

/**
 * Firmenname mit zwei Griffen davor: kopieren und bei LinkedIn suchen.
 * Direkt in der Zeile, damit die Recherche vor dem Anruf ein Klick ist.
 * Beide stoppen den Klick, sonst ginge zusaetzlich die Detailansicht auf.
 */
const Firma = ({ name }: { name: string | null | undefined }) => {
  if (!name) return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-0.5">
      <span onClick={(e) => e.stopPropagation()} className="inline-flex shrink-0 items-center">
        <a href={`https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(name)}`}
           target="_blank" rel="noreferrer noopener" title="Bei LinkedIn suchen" aria-label="Bei LinkedIn suchen"
           className="grid h-6 w-6 place-items-center rounded-md text-muted/60 transition hover:bg-surface-2 hover:text-[#0a66c2]">
          <Share2 size={13} />
        </a>
        <CopyButton text={name} label="Namen kopieren" small />
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
};

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

/** Stehen mehrere Nummern im Feld, wird jede ein eigener Link. */
const Tel = ({ value }: { value: string | null | undefined }) => {
  const scheme = useDialScheme();
  const nummern = splitPhones(value);
  if (!nummern.length) return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {nummern.map((n, i) => (
        <span key={`${n.number}-${i}`} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-muted">·</span>}
          <a href={dialHref(n.number, scheme)} className="text-brand hover:underline"
             title={n.label ? `${n.label}: ${n.number}` : n.number}
             onClick={(e) => e.stopPropagation()}>{n.number}</a>
        </span>
      ))}
    </span>
  );
};

/**
 * Anruf-Knopf: kleines Telefonsymbol, waehlt die hinterlegte Nummer direkt
 * im eingestellten Schema (tel/callto/sip). Der Klick oeffnet NICHT die
 * Detailansicht - beim Durchtelefonieren will man nur waehlen.
 */
const knopfCls =
  'inline-grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-brand transition hover:bg-brand hover:text-white';

const DialButton = ({ value }: { value: string | null | undefined }) => {
  const scheme = useDialScheme();
  const nummern = splitPhones(value);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (!nummern.length) return <span className="text-muted" title="Keine Nummer hinterlegt">–</span>;

  if (nummern.length === 1) {
    const n = nummern[0].number;
    return (
      <a href={dialHref(n, scheme)} onClick={(e) => e.stopPropagation()}
         title={`${n} anrufen`} aria-label={`${n} anrufen`} className={knopfCls}>
        <Phone size={14} />
      </a>
    );
  }

  // Mehrere Nummern: erst fragen, welche. Sonst wuerde die Telefon-App eine
  // zusammengesetzte Nummer bekommen, die es nicht gibt.
  const oeffnen = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const hoehe = nummern.length * 36 + 12;
    setPos({
      top: window.innerHeight - r.bottom < hoehe ? Math.max(8, r.top - hoehe - 4) : r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - 248),
    });
  };

  return (
    <>
      <button type="button" onClick={oeffnen} className={`${knopfCls} relative`}
              title={`${nummern.length} Nummern – auswählen`} aria-label="Nummer zum Anrufen wählen">
        <Phone size={14} />
        <span className="absolute -right-0.5 -top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-brand text-[9px] font-semibold text-white">
          {nummern.length}
        </span>
      </button>

      {pos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setPos(null); }} />
          <div className="card fixed z-50 w-60 p-1.5 shadow-xl"
               onClick={(e) => e.stopPropagation()}
               style={{ top: pos.top, left: pos.left }}>
            {nummern.map((n, i) => (
              <a key={`${n.number}-${i}`} href={dialHref(n.number, scheme)} onClick={() => setPos(null)}
                 className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] hover:bg-surface-2">
                <Phone size={13} className="shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate">{n.number}</span>
                {n.label && <span className="shrink-0 text-xs text-muted">{n.label}</span>}
              </a>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
};

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

/**
 * Phase in der Tabelle: ein Tippen oeffnet direkt die Phasenliste, ohne
 * den ganzen Kontakt aufzuklappen. Das Menue haengt per Portal am Body,
 * sonst wuerde die Tabellenzelle es abschneiden.
 */
function StageCell({ dealId, stageId, stage, pipelineId }: {
  dealId: string;
  stageId: string | null | undefined;
  stage: { name: string; color: string } | null | undefined;
  /** Nur die Phasen dieser Pipeline anbieten (Kontaktliste kennt mehrere). */
  pipelineId?: string | null;
}) {
  const alle = useStages();
  const stages = pipelineId ? alle?.filter((s) => s.pipeline_id === pipelineId) : alle;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const label = stage ? <Badge color={stage.color}>{stage.name}</Badge> : <span className="text-muted">–</span>;
  if (!stages?.length) return label;

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const hoehe = Math.min(stages.length * 36 + 12, 320);
    const platzUnten = window.innerHeight - r.bottom;
    setPos({
      top: platzUnten < hoehe ? Math.max(8, r.top - hoehe - 4) : r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - 248),
    });
  };

  const waehlen = (id: string) => {
    setPos(null);
    if (id === stageId) return;
    startTransition(() => setDealStage(dealId, id));
  };

  return (
    <>
      <button type="button" onClick={openMenu} disabled={pending}
              title="Phase ändern"
              className="inline-flex max-w-full items-center gap-1 rounded-md text-left hover:bg-surface-2 disabled:opacity-50">
        <span className="truncate">{label}</span>
        <ChevronDown size={12} className="shrink-0 text-muted" />
      </button>

      {/* React leitet Klicks aus einem Portal am DOM vorbei an die Tabellen-
          zeile weiter - ohne stopPropagation ginge nach der Auswahl zusaetzlich
          die Detailansicht auf. */}
      {pos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-40"
               onClick={(e) => { e.stopPropagation(); setPos(null); }} />
          <div className="card fixed z-50 max-h-80 w-60 overflow-y-auto p-1.5 shadow-xl"
               onClick={(e) => e.stopPropagation()}
               style={{ top: pos.top, left: pos.left }}>
            {stages.map((s) => (
              <button key={s.id} type="button" onClick={() => waehlen(s.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.name}</span>
                {s.id === stageId && <Check size={13} className="shrink-0 text-brand" />}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** Der Vorgang, der den Kontakt beschreibt: ein offener zuerst, sonst der erste. */
const hauptDeal = (deals?: ContactDeal[]): ContactDeal | undefined =>
  deals?.find((d) => d.status === 'offen') ?? deals?.[0];

const prioNum = (v: string | null | undefined) => (v ? Number(v) || 9 : 9);
const pname = (persons?: { first_name: string | null; last_name: string | null; is_primary: boolean }[] | null) =>
  personName(primaryPerson(persons)) || '';

/* ------------------------------ Kontakte ------------------------------ */

export const CONTACT_COLUMNS: ColumnDef<ContactWithPersons>[] = [
  { key: 'company', label: 'Firmenname', width: 260, render: (r) => <Firma name={r.company} />, sortValue: (r) => r.company ?? '' },
  { key: 'persons', label: 'Ansprechpartner', width: 200, render: (r) => <PrimaryPerson persons={r.persons} />, sortValue: (r) => pname(r.persons) },
  { key: 'first_name', label: 'Vorname', width: 130, render: (r) => <Muted>{primaryPerson(r.persons)?.first_name}</Muted>, sortValue: (r) => primaryPerson(r.persons)?.first_name ?? '' },
  { key: 'last_name', label: 'Nachname', width: 130, render: (r) => <Muted>{primaryPerson(r.persons)?.last_name}</Muted>, sortValue: (r) => primaryPerson(r.persons)?.last_name ?? '' },
  { key: 'person_count', label: 'Anzahl Personen', width: 160, render: (r) => <PersonChip count={r.persons?.length ?? 0} />, sortValue: (r) => r.persons?.length ?? 0 },
  { key: 'email', label: 'E-Mail', width: 220, render: (r) => <Muted>{primaryPerson(r.persons)?.email}</Muted>, sortValue: (r) => primaryPerson(r.persons)?.email ?? '' },
  { key: 'phone', label: 'Telefon', width: 170, render: (r) => <Tel value={phoneOf(r.persons)} />, sortValue: (r) => phoneOf(r.persons) ?? '' },
  { key: 'dial', label: 'Anrufen', width: 90, render: (r) => <DialButton value={phoneOf(r.persons)} />, sortValue: (r) => (phoneOf(r.persons) ? 0 : 1) },
  { key: 'website', label: 'Website', width: 200, render: (r) => <Web value={r.website} />, sortValue: (r) => r.website ?? '' },
  { key: 'last_contacted_at', label: 'Zuletzt kontaktiert', width: 160, render: (r) => <LastContact value={r.last_contacted_at} />, sortValue: (r) => r.last_contacted_at ?? '' },
  { key: 'deals', label: 'Verknüpft', width: 110, render: (r) => (
      <span className="inline-flex items-center gap-1.5 text-muted"><ListTree size={13} /> {r.deals?.length ?? 0} Deals</span>
    ), sortValue: (r) => r.deals?.length ?? 0 },
  { key: 'stage', label: 'Phase', width: 190, render: (r) => {
      const d = hauptDeal(r.deals);
      return d ? <StageCell dealId={d.id} stageId={d.stage_id} stage={d.stage} pipelineId={d.pipeline_id} /> : <span className="text-muted">–</span>;
    }, sortValue: (r) => hauptDeal(r.deals)?.stage?.name ?? '' },
  { key: 'pipeline', label: 'Pipeline', width: 150, render: (r) => <Muted>{hauptDeal(r.deals)?.pipeline?.name}</Muted>, sortValue: (r) => hauptDeal(r.deals)?.pipeline?.name ?? '' },
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
  { key: 'company', label: 'Firmenname', width: 260, render: (r) => <Firma name={r.contact?.company} />, sortValue: (r) => r.contact?.company ?? '' },
  { key: 'custom.prio', label: 'Prio', width: 70, render: (r) => <Muted>{r.contact?.custom?.prio}</Muted>, sortValue: (r) => prioNum(r.contact?.custom?.prio) },
  { key: 'stage', label: 'Phase', width: 190, render: (r) => <StageCell dealId={r.id} stageId={r.stage_id} stage={r.stage} pipelineId={r.pipeline_id} />, sortValue: (r) => r.stage?.name ?? '' },
  { key: 'last_contacted_at', label: 'Zuletzt kontaktiert', width: 160, render: (r) => <LastContact value={r.contact?.last_contacted_at} />, sortValue: (r) => r.contact?.last_contacted_at ?? '' },
  { key: 'custom.kanal', label: 'Kanal', width: 120, render: (r) => <Kanal value={r.contact?.custom?.kanal} />, sortValue: (r) => r.contact?.custom?.kanal ?? 'Z' },
  { key: 'persons', label: 'Ansprechpartner', width: 200, render: (r) => <PrimaryPerson persons={r.contact?.persons} />, sortValue: (r) => pname(r.contact?.persons) },
  { key: 'phone', label: 'Telefon', width: 170, render: (r) => <Tel value={phoneOf(r.contact?.persons)} />, sortValue: (r) => phoneOf(r.contact?.persons) ?? '' },
  { key: 'dial', label: 'Anrufen', width: 90, render: (r) => <DialButton value={phoneOf(r.contact?.persons)} />, sortValue: (r) => (phoneOf(r.contact?.persons) ? 0 : 1) },
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
  'company', 'custom.prio', 'stage', 'last_contacted_at', 'custom.kanal', 'persons', 'phone', 'dial', 'website',
];
