'use client';

import { useEffect, useState } from 'react';
import { Mail, Send, ChevronLeft, ChevronDown, X } from 'lucide-react';
import type { ContactPerson, EmailTemplate } from '@/lib/types';

function Chips({
  name, values, onChange, placeholder,
}: { name: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim().replace(/,$/, '');
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className="input flex min-h-[42px] flex-wrap items-center gap-1.5 !py-1.5">
      <input type="hidden" name={name} value={values.join(', ')} />
      {values.map((v) => (
        <span key={v} className="chip bg-brand-soft text-brand">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label="Entfernen">
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        className="min-w-[140px] flex-1 bg-transparent text-sm outline-none"
        value={draft}
        placeholder={values.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') { if (draft.trim()) { e.preventDefault(); commit(); } } }}
        onBlur={commit}
      />
    </div>
  );
}

export default function EmailComposer({
  sendAction, fillAction, senderAction, contact, dealId, templates, smtpReady,
}: {
  sendAction: (fd: FormData) => Promise<void>;
  fillAction: (id: string, c: Partial<ContactPerson> & { company?: string | null }) => Promise<{ subject: string; body: string } | null>;
  senderAction?: () => Promise<string[]>;
  contact: { id: string; email: string | null; first_name?: string | null; last_name?: string | null; company?: string | null } | null;
  dealId?: string;
  templates: EmailTemplate[];
  smtpReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string[]>(contact?.email ? [contact.email] : []);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [senders, setSenders] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open || !senderAction) return;
    let cancelled = false;
    senderAction().then((list) => {
      if (cancelled) return;
      setSenders(list);
      setFrom((f) => f || list[0] || '');
    });
    return () => { cancelled = true; };
  }, [open, senderAction]);

  async function applyTemplate(id: string) {
    if (!id) return;
    const filled = await fillAction(id, contact ?? {});
    if (filled) { setSubject(filled.subject); setBody(filled.body); }
  }

  const disabled = !contact?.email;

  return (
    <>
      <button className="btn-ghost" onClick={() => { setOpen(true); setSent(false); setError(null); }} disabled={disabled}
              title={disabled ? 'Kontakt hat keine E-Mail-Adresse' : undefined}>
        <Mail size={15} /> E-Mail
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <button type="button" onClick={() => setOpen(false)}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-surface-2" aria-label="Zurück">
                <ChevronLeft size={16} />
              </button>
              <h2 className="flex-1 text-[15px] font-semibold">E-Mail verfassen</h2>
              <label className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-[13px]">
                <Mail size={13} className="text-muted" />
                <select className="bg-transparent outline-none" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Absender">
                  {senders.length === 0 && <option value="">Absender …</option>}
                  {senders.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={13} className="text-muted" />
              </label>
            </div>

            {!smtpReady && (
              <p className="mx-4 mt-4 rounded-lg bg-warn/10 p-3 text-sm text-warn">
                SMTP ist nicht konfiguriert. Setze SMTP_HOST, SMTP_USER und SMTP_PASS in der Server-Umgebung.
              </p>
            )}

            <form
              className="space-y-4 p-4"
              action={async (fd) => {
                setBusy(true); setError(null);
                try {
                  await sendAction(fd);
                  setSent(true); setSubject(''); setBody('');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Versand fehlgeschlagen.');
                } finally { setBusy(false); }
              }}
            >
              {dealId && <input type="hidden" name="deal_id" value={dealId} />}
              {contact && <input type="hidden" name="contact_id" value={contact.id} />}
              <input type="hidden" name="from" value={from} />

              <div>
                <div className="flex items-center justify-between">
                  <label className="label">An</label>
                  <div className="mb-1.5 flex gap-2 text-xs font-medium">
                    {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-ink hover:text-brand">Cc</button>}
                    {!showBcc && <button type="button" onClick={() => setShowBcc(true)} className="text-ink hover:text-brand">Bcc</button>}
                  </div>
                </div>
                <Chips name="to" values={to} onChange={setTo} placeholder="empfaenger@firma.de" />
              </div>
              {showCc && <div><label className="label">Cc</label><Chips name="cc" values={cc} onChange={setCc} /></div>}
              {showBcc && <div><label className="label">Bcc</label><Chips name="bcc" values={bcc} onChange={setBcc} /></div>}

              {templates.length > 0 && (
                <div>
                  <label className="label" htmlFor="mail-template">Vorlage</label>
                  <select id="mail-template" className="input" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
                    <option value="">– keine –</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="label" htmlFor="mail-subject">Betreff</label>
                <input id="mail-subject" name="subject" className="input" required value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="mail-body">Nachricht</label>
                <textarea id="mail-body" name="body" className="input min-h-52" required value={body} onChange={(e) => setBody(e.target.value)} />
              </div>

              {error && <p className="text-sm text-lose">{error}</p>}
              {sent && <p className="text-sm text-win">E-Mail gesendet und im Verlauf protokolliert.</p>}

              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost !border-0" onClick={() => setOpen(false)}>Abbrechen</button>
                <button className="btn-primary" disabled={busy || !smtpReady || to.length === 0}>
                  <Send size={15} /> {busy ? 'Senden …' : 'Senden'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
