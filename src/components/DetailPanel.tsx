'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  Phone, Settings2, Mail, MoreVertical, X, User, ListChecks, NotebookPen,
  ChevronUp, ChevronDown, UserPlus, ExternalLink, Pin, Trash2, Star, Plus,
} from 'lucide-react';
import {
  loadContactDetail, updateContactFields, addPerson, updatePerson, deletePerson,
  setPrimaryPerson, setDealStage, createDealForContact, createNote, togglePinNote,
  deleteNote, deleteContactRecord, type ContactDetail,
} from '@/app/actions/records';
import { logActivity, createTask } from '@/app/actions/crm';
import { sendDealEmail, fillTemplate } from '@/app/actions/email';
import EmailComposer from '@/components/EmailComposer';
import ActivityComposer from '@/components/ActivityComposer';
import Timeline from '@/components/Timeline';
import TaskList from '@/components/TaskList';
import TaskComposer from '@/components/TaskComposer';
import NoteEditor from '@/components/NoteEditor';
import { sanitizeHtml } from '@/lib/sanitize';
import { COUNTRIES, DIAL_CODES, LEAD_SOURCES } from '@/lib/labels';
import { dateTime, initials, primaryPerson } from '@/lib/format';
import type { ContactPerson } from '@/lib/types';

type Tab = 'info' | 'activities' | 'notes';

/* ------------------------- kleine Bausteine ------------------------- */

function Section({
  title, action, children, defaultOpen = true,
}: { title: string; action?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          {action}
          <button type="button" onClick={() => setOpen((o) => !o)}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2"
                  aria-label={open ? 'Einklappen' : 'Ausklappen'}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {open && <div className="px-5 pb-5">{children}</div>}
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

/* ------------------------------ Panel ------------------------------- */

export default function DetailPanel({
  contactId, onClose, onDeleted, initialTab = 'info',
}: {
  contactId: string;
  onClose: () => void;
  onDeleted?: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const [, startTransition] = useTransition();

  const reload = useCallback(async () => {
    const d = await loadContactDetail(contactId);
    setData(d);
    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    let cancelled = false;
    loadContactDetail(contactId).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [contactId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => { await fn(); await reload(); });

  const contact = data?.contact;
  const primary = primaryPerson(contact?.persons);
  const title = contact?.company || [primary?.first_name, primary?.last_name].filter(Boolean).join(' ') || 'Kontakt';
  const mainDeal = data?.deals?.find((d) => d.status === 'offen') ?? data?.deals?.[0] ?? null;
  const stagesFor = (pipelineId: string | null | undefined) =>
    (data?.stages ?? []).filter((s) => s.pipeline_id === pipelineId);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[820px] flex-col bg-bg shadow-2xl">
        {/* Kopf */}
        <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3.5">
          <h2 className="min-w-0 flex-1 truncate text-xl font-semibold">{loading ? 'Laden …' : title}</h2>

          <div className="flex items-center overflow-hidden rounded-lg">
            <a
              href={primary?.phone ? `tel:${primary.phone}` : undefined}
              className={`btn-primary rounded-r-none ${primary?.phone ? '' : 'pointer-events-none opacity-50'}`}
            >
              <Phone size={15} /> Anrufen
            </a>
            <button type="button" className="btn-primary rounded-l-none border-l border-white/25 !px-2.5"
                    onClick={() => setTab('activities')} aria-label="Anruf protokollieren">
              <Settings2 size={15} />
            </button>
          </div>

          <EmailComposer
            sendAction={async (fd) => { await sendDealEmail(fd); await reload(); }}
            fillAction={fillTemplate}
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
        <div className="border-b border-line bg-surface px-5 py-3">
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
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm transition ${
                  tab === key ? 'bg-surface font-medium text-brand shadow-sm' : 'text-ink/80 hover:text-ink'
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Inhalt */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {loading || !contact ? (
            <p className="py-10 text-center text-sm text-muted">Laden …</p>
          ) : tab === 'info' ? (
            <>
              <Section
                title="Deal-Status"
                action={mainDeal ? null : (
                  data?.stages.length ? (
                    <select
                      className="input !w-auto !py-1.5 text-[13px]"
                      defaultValue=""
                      onChange={(e) => e.target.value && run(() => createDealForContact(contactId, e.target.value))}
                    >
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
                    <SelectField
                      label="Pipeline" required
                      value={mainDeal.pipeline_id}
                      options={(data?.pipelines ?? []).map((p) => ({ value: p.id, label: p.name }))}
                      onSave={(pipelineId) => {
                        const first = stagesFor(pipelineId)[0];
                        if (first) run(() => setDealStage(mainDeal.id, first.id));
                      }}
                    />
                    <SelectField
                      label="Deal-Phase" required
                      value={mainDeal.stage_id}
                      options={stagesFor(mainDeal.pipeline_id).map((s) => ({ value: s.id, label: s.name }))}
                      onSave={(stageId) => run(() => setDealStage(mainDeal.id, stageId))}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted">Noch kein Deal – oben rechts eine Phase wählen.</p>
                )}

                {data && data.deals.length > 1 && (
                  <p className="mt-3 text-xs text-muted">
                    {data.deals.length} Deals insgesamt · {data.deals.filter((d) => d.status === 'gewonnen').length} gewonnen
                  </p>
                )}
              </Section>

              <Section
                title="Ansprechpartner"
                action={
                  <button type="button" className="btn-ghost !py-1.5 text-[13px]"
                          onClick={() => run(() => addPerson(contactId))}>
                    <UserPlus size={14} /> Neu hinzufügen
                  </button>
                }
              >
                <div className="space-y-5">
                  {contact.persons.length === 0 && (
                    <p className="text-sm text-muted">Noch kein Ansprechpartner hinterlegt.</p>
                  )}
                  {contact.persons.map((p: ContactPerson, i) => (
                    <div key={p.id} className={i > 0 ? 'border-t border-line pt-5' : ''}>
                      {contact.persons.length > 1 && (
                        <div className="mb-3 flex items-center justify-between">
                          <span className="chip bg-surface-2 text-muted">
                            {p.is_primary ? <><Star size={11} className="text-warn" /> Hauptansprechpartner</> : `Person ${i + 1}`}
                          </span>
                          <div className="flex gap-1">
                            {!p.is_primary && (
                              <button type="button" className="btn-ghost !border-0 !py-1 text-xs"
                                      onClick={() => run(() => setPrimaryPerson(p.id))}>
                                Als Haupt setzen
                              </button>
                            )}
                            <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-lose"
                                    onClick={() => run(() => deletePerson(p.id))} aria-label="Person entfernen">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Vorname" value={p.first_name}
                               onSave={(v) => run(() => updatePerson(p.id, { first_name: v }))} />
                        <Field label="Nachname" value={p.last_name}
                               onSave={(v) => run(() => updatePerson(p.id, { last_name: v }))} />
                        <Field
                          label="E-Mail" required type="email" value={p.email}
                          onSave={(v) => run(() => updatePerson(p.id, { email: v }))}
                          trailing={
                            <a href={p.email ? `mailto:${p.email}` : undefined}
                               className={`btn-ghost rounded-l-none border-l-0 !px-3 ${p.email ? '' : 'pointer-events-none opacity-50'}`}
                               aria-label="E-Mail schreiben">
                              <Mail size={15} />
                            </a>
                          }
                        />
                        <PhoneField value={p.phone} onSave={(v) => run(() => updatePerson(p.id, { phone: v }))} />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Stammdaten des Kontakts">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Firmenname" value={contact.company}
                         onSave={(v) => run(() => updateContactFields(contactId, { company: v }))} />
                  <Field
                    label="Website" value={contact.website}
                    onSave={(v) => run(() => updateContactFields(contactId, { website: v }))}
                    trailing={
                      <a href={contact.website ? (contact.website.startsWith('http') ? contact.website : `https://${contact.website}`) : undefined}
                         target="_blank" rel="noreferrer noopener"
                         className={`btn-ghost rounded-l-none border-l-0 !px-3 ${contact.website ? '' : 'pointer-events-none opacity-50'}`}
                         aria-label="Website öffnen">
                        <ExternalLink size={15} />
                      </a>
                    }
                  />
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
              </Section>

              <Section title="Aufgaben" defaultOpen={false}>
                <TaskComposer action={createTask} contactId={contactId} />
                <div className="mt-3"><TaskList tasks={data?.tasks ?? []} /></div>
              </Section>
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
              <Timeline activities={data?.activities ?? []} />
            </>
          ) : (
            <>
              <NoteEditor onSubmit={async (html) => {
                await createNote({ contactId, dealId: mainDeal?.id, body: html });
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
                          <div
                            className="prose-sm mt-1.5 text-sm [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc [&_img]:max-h-56 [&_img]:rounded-md [&_a]:text-brand"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.body) }}
                          />
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
