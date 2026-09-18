'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  Phone, Settings2, Mail, MoreVertical, X, User, ListChecks, NotebookPen,
  ChevronUp, ChevronDown, UserPlus, ExternalLink, Pin, Trash2, Star, Plus, UserCheck, ListTree, Paperclip,
} from 'lucide-react';
import {
  loadContactDetail, updateContactFields, addPerson, updatePerson, deletePerson,
  setPrimaryPerson, setDealStage, createDealForContact, createNote, togglePinNote,
  deleteNote, deleteContactRecord, updateDealFields, updateDealCustom, type ContactDetail,
} from '@/app/actions/records';
import { PANEL_CARDS, DEFAULT_PANEL_LAYOUT, SETTER_FIELDS, type PanelCardKey } from '@/lib/panel-cards';
import { Badge } from '@/components/Badge';
import { logActivity, createTask } from '@/app/actions/crm';
import { sendDealEmail, fillTemplate, senderOptions } from '@/app/actions/email';
import { dealAnProjekttool } from '@/app/actions/projekttool';
import EmailComposer from '@/components/EmailComposer';
import ActivityComposer from '@/components/ActivityComposer';
import Timeline from '@/components/Timeline';
import TaskList from '@/components/TaskList';
import TaskComposer from '@/components/TaskComposer';
import NoteEditor from '@/components/NoteEditor';
import CallFlowCard from '@/components/CallFlowCard';
import CopyButton from '@/components/CopyButton';
import { sanitizeHtml } from '@/lib/sanitize';
import { COUNTRIES, DIAL_CODES, LEAD_SOURCES } from '@/lib/labels';
import { dateTime, dateOnly, eur, initials, personName, primaryPerson, phoneOf } from '@/lib/format';
import type { ContactPerson } from '@/lib/types';
import { dialHref } from '@/lib/dial';

type Tab = 'info' | 'activities' | 'notes';

const CUSTOM_LABEL: Record<string, string> = {
  prio: 'Prio', kanal: 'Kanal', standtyp: 'Standtyp', halle_stand: 'Halle / Stand',
  hauptaussteller: 'Hauptaussteller', budgetklasse: 'Budgetklasse', geschaeftsfuehrung: 'Geschäftsführung',
  fundstelle: 'Fundstelle', messe: 'Messe',
};

/* ------------------------- kleine Bausteine ------------------------- */

function Section({
  title, action, children, defaultOpen = true,
}: { title: string; action?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      {/* Die ganze Kopfzeile klappt auf, nicht nur der Pfeil. Ein etwaiger
          Knopf rechts bleibt daneben stehen, damit er nicht im Knopf haengt. */}
      <div className="flex items-center gap-2 pr-4 sm:pr-5">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-3.5 pl-4 text-left transition hover:bg-surface-2/60 sm:py-4 sm:pl-5">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</h3>
          <span className="grid h-7 w-7 shrink-0 place-items-center text-muted">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>
        {action}
      </div>
      {open && <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>}
    </section>
  );
}

/** Eingabefeld, das beim Verlassen automatisch speichert. */
function Field({
  label, value, onSave, required, type = 'text', trailing, placeholder, list,
}: {
  label: string;
  value: string | null | undefined;
  onSave: (v: string) => void;
  required?: boolean;
  type?: string;
  trailing?: React.ReactNode;
  placeholder?: string;
  list?: string;
}) {
  const [v, setV] = useState(value ?? '');
  const [seen, setSeen] = useState(value ?? '');
  if ((value ?? '') !== seen) {
    setSeen(value ?? '');
    setV(value ?? '');
  }

  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-lose"> *</span>}
      </label>
      <div className="flex">
        <input
          type={type}
          className={`input ${trailing ? 'rounded-r-none' : ''}`}
          value={v}
          list={list}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => { if (v !== (value ?? '')) onSave(v); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        {trailing}
      </div>
    </div>
  );
}

function SelectField({
  label, value, options, onSave, required, placeholder,
}: {
  label: string;
  value: string | null | undefined;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-lose"> *</span>}</label>
      <select className="input" value={value ?? ''} onChange={(e) => onSave(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function PhoneField({
  value, onSave,
}: { value: string | null | undefined; onSave: (v: string) => void }) {
  const split = (v: string) => {
    const c = DIAL_CODES.find((d) => v.startsWith(d.code))?.code ?? '+49';
    return { c, n: v.replace(c, '').trim() };
  };
  const initial = split(value ?? '');
  const [code, setCode] = useState(initial.c);
  const [num, setNum] = useState(initial.n);
  const [seen, setSeen] = useState(value ?? '');
  if ((value ?? '') !== seen) {
    const next = split(value ?? '');
    setSeen(value ?? '');
    setCode(next.c);
    setNum(next.n);
  }

  const commit = (c: string, n: string) => {
    const full = n.trim() ? `${c} ${n.trim()}` : '';
    if (full !== (value ?? '')) onSave(full);
  };

  return (
    <div>
      <label className="label">Telefon</label>
      <div className="flex">
        <select
          className="input w-[84px] rounded-r-none border-r-0"
          value={code}
          onChange={(e) => { setCode(e.target.value); commit(e.target.value, num); }}
          aria-label="Ländervorwahl"
        >
          {DIAL_CODES.map((d) => <option key={d.code} value={d.code}>{d.flag} {d.code}</option>)}
        </select>
        <input
          className="input rounded-l-none"
          value={num}
          inputMode="tel"
          onChange={(e) => setNum(e.target.value)}
          onBlur={() => commit(code, num)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </div>
    </div>
  );
}


/** Kompakte Ansprechpartner-Zeile mit aufklappbarer Bearbeitung. */
function PersonRow({
  person, run,
}: { person: ContactPerson; run: (fn: () => Promise<unknown>) => void }) {
  const [open, setOpen] = useState(!personName(person) && !person.email);
  const [menu, setMenu] = useState(false);
  const name = personName(person) || 'Neue Person';

  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{name}</span>
            {person.is_primary && (
              <span className="chip bg-win/15 text-win"><UserCheck size={12} /> Primärer Ansprechpartner</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[13px] text-muted">
            {person.email && <span className="flex items-center gap-1.5"><Mail size={13} /> {person.email}</span>}
            {person.phone && <span className="flex items-center gap-1.5"><Phone size={13} /> {person.phone}</span>}
            {!person.email && !person.phone && <span>Noch keine Kontaktdaten</span>}
          </div>
        </div>

        <a href={dialHref(person.phone)}
           className={`grid h-9 w-9 place-items-center rounded-lg border border-line hover:bg-surface-2 ${person.phone ? '' : 'pointer-events-none opacity-40'}`}
           aria-label="Anrufen">
          <Phone size={15} />
        </a>

        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line hover:bg-surface-2" aria-label="Mehr">
            <MoreVertical size={15} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="card absolute right-0 z-20 mt-1.5 w-52 p-1.5 shadow-xl">
                {!person.is_primary && (
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2"
                          onClick={() => { setMenu(false); run(() => setPrimaryPerson(person.id)); }}>
                    <Star size={14} /> Als primär setzen
                  </button>
                )}
                {person.email && (
                  <a href={`mailto:${person.email}`} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2">
                    <Mail size={14} /> E-Mail schreiben
                  </a>
                )}
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-lose hover:bg-lose/10"
                        onClick={() => { setMenu(false); run(() => deletePerson(person.id)); }}>
                  <Trash2 size={14} /> Entfernen
                </button>
              </div>
            </>
          )}
        </div>

        <button type="button" onClick={() => setOpen((o) => !o)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-line hover:bg-surface-2"
                aria-label={open ? 'Einklappen' : 'Bearbeiten'}>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {open && (
        <div className="grid gap-4 border-t border-line px-4 py-4 sm:grid-cols-2">
          <Field label="Vorname" value={person.first_name}
                 onSave={(v) => run(() => updatePerson(person.id, { first_name: v }))} />
          <Field label="Nachname" value={person.last_name}
                 onSave={(v) => run(() => updatePerson(person.id, { last_name: v }))} />
          <Field label="E-Mail" required type="email" value={person.email}
                 onSave={(v) => run(() => updatePerson(person.id, { email: v }))}
                 trailing={
                   <a href={person.email ? `mailto:${person.email}` : undefined}
                      className={`btn-ghost rounded-l-none border-l-0 !px-3 ${person.email ? '' : 'pointer-events-none opacity-50'}`}
                      aria-label="E-Mail schreiben">
                     <Mail size={15} />
                   </a>
                 } />
          <PhoneField value={person.phone} onSave={(v) => run(() => updatePerson(person.id, { phone: v }))} />
          <Field label="Position" value={person.job_title}
                 onSave={(v) => run(() => updatePerson(person.id, { job_title: v }))} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Panel ------------------------------- */

export default function DetailPanel({
  contactId, dealId = null, onClose, onDeleted, initialTab = 'info',
}: {
  contactId: string;
  /** Deal-Fokus: Titel und Karten beziehen sich auf diesen Deal. */
  dealId?: string | null;
  onClose: () => void;
  onDeleted?: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const [callFlow, setCallFlow] = useState<null | { autoStart: boolean }>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    const d = await loadContactDetail(contactId, dealId);
    setData(d);
    setLoading(false);
  }, [contactId, dealId]);

  useEffect(() => {
    let cancelled = false;
    loadContactDetail(contactId, dealId).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [contactId, dealId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [handover, setHandover] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => { await fn(); await reload(); });

  const contact = data?.contact;
  const primary = primaryPerson(contact?.persons);
  const mainDeal =
    (dealId ? data?.deals?.find((d) => d.id === dealId) : null)
    ?? data?.deals?.find((d) => d.status === 'offen') ?? data?.deals?.[0] ?? null;
  const title = dealId && mainDeal
    ? mainDeal.title
    : contact?.company || personName(primary) || 'Kontakt';
  const layout: PanelCardKey[] = (data?.layout as PanelCardKey[] | null) ?? DEFAULT_PANEL_LAYOUT;
  const stagesFor = (pipelineId: string | null | undefined) =>
    (data?.stages ?? []).filter((s) => s.pipeline_id === pipelineId);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-bg shadow-2xl sm:max-w-[820px]">
        {/* Kopf */}
        <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-3 sm:gap-3 sm:px-5 sm:py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <h2 className="min-w-0 truncate text-base font-semibold sm:text-xl">{loading ? 'Laden …' : title}</h2>
            {!loading && title && <CopyButton text={title} label="Namen kopieren" />}
          </div>

          <div className="flex items-center overflow-hidden rounded-lg">
            <a
              href={dialHref(phoneOf(contact?.persons))}
              onClick={() => { setTab('info'); setCallFlow({ autoStart: true }); }}
              className={`btn-primary rounded-r-none ${phoneOf(contact?.persons) ? '' : 'pointer-events-none opacity-50'}`}
            >
              <Phone size={15} /> <span className="hidden sm:inline">Anrufen</span>
            </a>
            <button type="button" className="btn-primary rounded-l-none border-l border-white/25 !px-2.5"
                    onClick={() => { setTab('info'); setCallFlow((c) => (c ? null : { autoStart: false })); }}
                    aria-label="Call-Flow öffnen">
              <Settings2 size={15} />
            </button>
          </div>

          <EmailComposer
            sendAction={async (fd) => { await sendDealEmail(fd); await reload(); }}
            fillAction={fillTemplate}
            senderAction={senderOptions}
            contact={primary ? {
              id: contactId, email: primary.email, first_name: primary.first_name,
              last_name: primary.last_name, company: contact?.company,
            } : null}
            dealId={mainDeal?.id}
            templates={data?.templates ?? []}
            smtpReady={data?.smtpReady ?? false}
          />

          <div className="relative">
            <button type="button" className="btn-ghost !px-2.5" onClick={() => setMenu((m) => !m)} aria-label="Mehr">
              <MoreVertical size={16} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="card absolute right-0 z-20 mt-1.5 w-52 p-1.5 shadow-xl">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-lose hover:bg-lose/10"
                    onClick={async () => {
                      if (!window.confirm('Kontakt mit allen Deals und Notizen löschen?')) return;
                      await deleteContactRecord(contactId);
                      onDeleted?.();
                      onClose();
                    }}
                  >
                    <Trash2 size={14} /> Kontakt löschen
                  </button>
                </div>
              </>
            )}
          </div>

          <button type="button" onClick={onClose}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line text-lose hover:bg-lose/10"
                  aria-label="Schließen">
            <X size={18} />
          </button>
        </header>

        {/* Tabs */}
        <div className="border-b border-line bg-surface px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
            {([
              { key: 'info', label: 'Kontakt-Info', icon: User },
              { key: 'activities', label: 'Aktivitäten', icon: ListChecks },
              { key: 'notes', label: `Notizen (${data?.notes.length ?? 0})`, icon: NotebookPen },
            ] as { key: Tab; label: string; icon: typeof User }[]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs transition sm:gap-2 sm:text-sm ${
                  tab === key ? 'bg-surface font-medium text-brand shadow-sm' : 'text-ink/80 hover:text-ink'
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Inhalt */}
        <div className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
          {loading || !contact ? (
            <p className="py-10 text-center text-sm text-muted">Laden …</p>
          ) : tab === 'info' ? (
            <>
              {callFlow && (
                <CallFlowCard
                  name={personName(primary) || title}
                  phone={phoneOf(contact?.persons)}
                  contactId={contactId}
                  dealId={mainDeal?.id}
                  stages={mainDeal ? stagesFor(mainDeal.pipeline_id) : undefined}
                  autoStart={callFlow.autoStart}
                  onSave={async (fd) => { await logActivity(fd); await reload(); }}
                  onClose={() => setCallFlow(null)}
                />
              )}
              {/* Angeheftete Notizen zuerst: das Anpinnen sortierte sie bisher
                  nur im Reiter Notizen nach oben, wo man sie nicht sieht. */}
              {(data?.notes ?? []).filter((n) => n.pinned).map((n) => (
                <div key={n.id} className="card border-brand/40 bg-brand-soft/30 p-4">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand">
                    <Pin size={12} /> Angeheftet
                  </p>
                  <div className="prose-sm text-sm [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc"
                       dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.body) }} />
                </div>
              ))}

              {layout.map((key) => {
                const def = PANEL_CARDS.find((c) => c.key === key);
                if (!def) return null;

                if (key === 'persons') return (
                  <Section key={key} title="Ansprechpartner"
                    action={
                      <button type="button" className="btn-ghost !py-1.5 text-[13px]"
                              onClick={() => run(() => addPerson(contactId))}>
                        <UserPlus size={14} /> Neu hinzufügen
                      </button>
                    }
                  >
                    <div className="space-y-2.5">
                      {contact.persons.length === 0 && (
                        <p className="text-sm text-muted">Noch kein Ansprechpartner hinterlegt.</p>
                      )}
                      {contact.persons.map((p: ContactPerson) => (
                        <PersonRow key={p.id} person={p} run={run} />
                      ))}
                    </div>
                  </Section>
                );

                if (key === 'deal_name') return mainDeal ? (
                  <Section key={key} title="Deal-Name">
                    <Field label="Name" required value={mainDeal.title}
                           onSave={(v) => run(() => updateDealFields(mainDeal.id, { title: v }))} />
                  </Section>
                ) : null;

                if (key === 'deal_status') return (
                  <Section key={key} title="Deal-Status"
                    action={mainDeal ? null : (
                      data?.stages.length ? (
                        <select className="input !w-auto !py-1.5 text-[13px]" defaultValue=""
                                onChange={(e) => e.target.value && run(() => createDealForContact(contactId, e.target.value))}>
                          <option value="">+ Deal anlegen in …</option>
                          {data.pipelines.map((p) => (
                            <optgroup key={p.id} label={p.name}>
                              {stagesFor(p.id).filter((s) => !s.is_won && !s.is_lost).map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      ) : null
                    )}
                  >
                    {mainDeal ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SelectField label="Pipeline" required value={mainDeal.pipeline_id}
                          options={(data?.pipelines ?? []).map((p) => ({ value: p.id, label: p.name }))}
                          onSave={(pipelineId) => {
                            const first = stagesFor(pipelineId)[0];
                            if (first) run(() => setDealStage(mainDeal.id, first.id));
                          }} />
                        <SelectField label="Deal-Phase" required value={mainDeal.stage_id}
                          options={stagesFor(mainDeal.pipeline_id).map((s) => ({ value: s.id, label: s.name }))}
                          onSave={(stageId) => run(() => setDealStage(mainDeal.id, stageId))} />
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Noch kein Deal – oben rechts eine Phase wählen.</p>
                    )}
                  </Section>
                );

                if (key === 'marketing') return mainDeal ? (
                  <Section key={key} title="Marketing-Informationen" defaultOpen={false}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const).map((k) => (
                        <Field key={k} label={k} value={mainDeal[k] ?? null}
                               onSave={(v) => run(() => updateDealFields(mainDeal.id, { [k]: v }))} />
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted">Werden von Lead-Formularen automatisch aus der URL übernommen.</p>
                  </Section>
                ) : null;

                if (key === 'contact_master') return (
                  <Section key={key} title="Stammdaten des Kontakts">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Firmenname" value={contact.company}
                             onSave={(v) => run(() => updateContactFields(contactId, { company: v }))} />
                      <Field label="Website" value={contact.website}
                        onSave={(v) => run(() => updateContactFields(contactId, { website: v }))}
                        trailing={
                          <a href={contact.website ? (contact.website.startsWith('http') ? contact.website : `https://${contact.website}`) : undefined}
                             target="_blank" rel="noreferrer noopener"
                             className={`btn-ghost rounded-l-none border-l-0 !px-3 ${contact.website ? '' : 'pointer-events-none opacity-50'}`}
                             aria-label="Website öffnen">
                            <ExternalLink size={15} />
                          </a>
                        } />
                      <Field label="Postleitzahl" value={contact.postal_code}
                             onSave={(v) => run(() => updateContactFields(contactId, { postal_code: v }))} />
                      <Field label="Stadt" value={contact.city}
                             onSave={(v) => run(() => updateContactFields(contactId, { city: v }))} />
                      <SelectField label="Land" value={contact.country}
                                   options={COUNTRIES.map((c) => ({ value: c, label: c }))} placeholder="–"
                                   onSave={(v) => run(() => updateContactFields(contactId, { country: v }))} />
                      <Field label="Leadherkunft" value={contact.lead_source} list="lead-sources-panel"
                             onSave={(v) => run(() => updateContactFields(contactId, { lead_source: v }))} />
                      <datalist id="lead-sources-panel">
                        {LEAD_SOURCES.map((s) => <option key={s} value={s} />)}
                      </datalist>
                      <Field label="Opener-Kürzel" value={contact.opener_kuerzel} placeholder="z. B. MM"
                             onSave={(v) => run(() => updateContactFields(contactId, { opener_kuerzel: v }))} />
                    </div>
                    {contact.custom && Object.values(contact.custom).some(Boolean) && (
                      <dl className="mt-4 grid gap-x-4 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
                        {Object.entries(contact.custom).filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <dt className="text-xs text-muted">{CUSTOM_LABEL[k] ?? k}</dt>
                            <dd className="break-words">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </Section>
                );

                if (key === 'deal_props') return mainDeal ? (
                  <Section key={key} title="Deal-Eigenschaften">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Auftrags-Volumen (€)" value={String(mainDeal.value ?? 0)}
                             onSave={(v) => run(() => updateDealFields(mainDeal.id, { value: v }))} />
                      <Field label="Abschluss-Datum" type="date" value={mainDeal.expected_close_date}
                             onSave={(v) => run(() => updateDealFields(mainDeal.id, { expected_close_date: v }))} />
                      <SelectField label="Setter" value={mainDeal.setter_id} placeholder="–"
                                   options={(data?.team ?? []).map((t) => ({ value: t.id, label: t.full_name || t.email || '–' }))}
                                   onSave={(v) => run(() => updateDealFields(mainDeal.id, { setter_id: v }))} />
                      <SelectField label="Closer" value={mainDeal.closer_id} placeholder="–"
                                   options={(data?.team ?? []).map((t) => ({ value: t.id, label: t.full_name || t.email || '–' }))}
                                   onSave={(v) => run(() => updateDealFields(mainDeal.id, { closer_id: v }))} />
                      <Field label="Leadherkunft" value={mainDeal.source} list="lead-sources-panel"
                             onSave={(v) => run(() => updateDealFields(mainDeal.id, { source: v }))} />
                      <Field label="Nächster Schritt" value={mainDeal.next_step}
                             onSave={(v) => run(() => updateDealFields(mainDeal.id, { next_step: v }))} />
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      Angelegt {dateOnly(mainDeal.created_at)} · Status {mainDeal.status}
                      {mainDeal.won_at ? ` · gewonnen ${dateOnly(mainDeal.won_at)}` : ''}
                    </p>
                    {mainDeal.status === 'gewonnen' && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/60 p-3 text-sm">
                        {mainDeal.custom?.projekttool_id ? (
                          <span className="flex items-center gap-1.5 text-win"><UserCheck size={14} /> Im Projekttool angelegt</span>
                        ) : (
                          <>
                            <span className="text-muted">Auftrag gewonnen:</span>
                            <button type="button" className="btn-primary !py-1.5 text-[13px]" disabled={pending}
                                    onClick={() => startTransition(async () => {
                                      const r = await dealAnProjekttool(mainDeal.id);
                                      setHandover(r.ok ? null : r.error);
                                      if (r.ok) await reload();
                                    })}>
                              <ExternalLink size={14} /> Projekt im Projekttool anlegen
                            </button>
                          </>
                        )}
                        {handover && <span className="w-full text-xs text-lose">{handover}</span>}
                      </div>
                    )}
                  </Section>
                ) : null;

                if (key === 'setter_info') return mainDeal ? (
                  <Section key={key} title="Setter-Informationen" defaultOpen={false}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {SETTER_FIELDS.map((f) => (
                        <Field key={f.key} label={f.label} placeholder={f.placeholder}
                               value={mainDeal.custom?.[f.key] ?? null}
                               onSave={(v) => run(() => updateDealCustom(mainDeal.id, f.key, v))} />
                      ))}
                    </div>
                  </Section>
                ) : null;

                if (key === 'linked_contact') return (
                  <Section key={key} title="Verknüpfter Kontakt" defaultOpen={false}>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{contact.company || personName(primary) || 'Kontakt'}</p>
                        <p className="text-xs text-muted">
                          {contact.persons.length} Ansprechpartner · {data?.deals.length ?? 0} Deals
                        </p>
                      </div>
                      <a href={`/kontakte?open=${contactId}`} className="btn-ghost !py-1.5 text-[13px]">
                        <ListTree size={14} /> Öffnen
                      </a>
                    </div>
                    {data && data.deals.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {data.deals.map((d) => (
                          <li key={d.id} className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm ${
                            d.id === mainDeal?.id ? 'bg-brand-soft' : 'bg-surface-2/60'
                          }`}>
                            <span className="min-w-0 truncate">{d.title}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              {d.stage && <Badge color={d.stage.color}>{d.stage.name}</Badge>}
                              <span className="tabular-nums text-muted">{eur(d.value)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                );

                if (key === 'tasks') return (
                  <Section key={key} title="Aufgaben" defaultOpen={false}>
                    <TaskComposer action={async (fd) => { await createTask(fd); await reload(); }}
                                  contactId={contactId} dealId={mainDeal?.id} />
                    <div className="mt-3"><TaskList tasks={data?.tasks ?? []} /></div>
                  </Section>
                );

                return null;
              })}
            </>
          ) : tab === 'activities' ? (
            <>
              <ActivityComposer
                action={async (fd) => { await logActivity(fd); await reload(); }}
                contactId={contactId}
                dealId={mainDeal?.id}
                stages={mainDeal ? stagesFor(mainDeal.pipeline_id) : undefined}
                phone={primary?.phone}
              />
              <Timeline activities={data?.activities ?? []} editable onChanged={reload}
                        stages={mainDeal ? stagesFor(mainDeal.pipeline_id) : undefined} />
            </>
          ) : (
            <>
              <NoteEditor orgId={contact.org_id} onSubmit={async (html, attachments) => {
                await createNote({ contactId, dealId: mainDeal?.id, body: html, attachments });
                await reload();
              }} />

              <h3 className="pt-2 text-[15px] font-semibold">Notizen</h3>
              {data?.notes.length === 0 && (
                <p className="text-sm text-muted">Noch keine Notizen.</p>
              )}
              <ul className="space-y-3">
                {data?.notes.map((n) => {
                  const author = n.user?.full_name || n.user?.email || 'System';
                  return (
                    <li key={n.id} className="card p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                          {initials(author)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{author}</span>
                            <span className="text-xs text-muted">{dateTime(n.created_at)}</span>
                            {n.pinned && <Pin size={12} className="text-brand" />}
                          </div>
                          {n.body && (
                            <div
                              className="prose-sm mt-1.5 text-sm [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc [&_img]:max-h-56 [&_img]:rounded-md [&_a]:text-brand"
                              dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.body) }}
                            />
                          )}
                          {n.attachments && n.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {n.attachments.map((a) => a.mime?.startsWith('image/') && a.url ? (
                                <a key={a.id} href={a.url} target="_blank" rel="noreferrer noopener" title={a.name}
                                   className="block overflow-hidden rounded-lg border border-line">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={a.url} alt={a.name} className="h-28 w-28 object-cover transition hover:scale-105" />
                                </a>
                              ) : (
                                <a key={a.id} href={a.url} target="_blank" rel="noreferrer noopener"
                                   className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs hover:border-brand">
                                  <Paperclip size={13} className="text-muted" />
                                  <span className="max-w-[160px] truncate">{a.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <button type="button" className={`grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2 ${n.pinned ? 'text-brand' : 'text-muted'}`}
                                  onClick={() => run(() => togglePinNote(n.id, !n.pinned))} aria-label="Anheften">
                            <Pin size={14} />
                          </button>
                          <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-lose"
                                  onClick={() => run(() => deleteNote(n.id))} aria-label="Notiz löschen">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export function NewContactButton({ onCreate }: { onCreate: (fd: FormData) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Kontakt hinzufügen
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form
            className="card w-full max-w-lg space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
            action={async (fd) => { await onCreate(fd); setOpen(false); }}
          >
            <h2 className="text-lg font-semibold">Neuer Kontakt</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Firmenname</label><input name="company" className="input" /></div>
              <div><label className="label">Website</label><input name="website" className="input" /></div>
              <div><label className="label">Vorname</label><input name="first_name" className="input" /></div>
              <div><label className="label">Nachname</label><input name="last_name" className="input" /></div>
              <div><label className="label">E-Mail</label><input name="email" type="email" className="input" /></div>
              <div><label className="label">Telefon</label><input name="phone" className="input" /></div>
              <div className="sm:col-span-2">
                <label className="label">Leadherkunft</label>
                <input name="lead_source" className="input" list="lead-sources-new" />
                <datalist id="lead-sources-new">{LEAD_SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
              <button className="btn-primary">Anlegen</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
