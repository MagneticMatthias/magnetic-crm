'use client';

import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { Modal } from '@/components/ui';
import type { ContactPerson, EmailTemplate } from '@/lib/types';

export default function EmailComposer({
  sendAction, fillAction, contact, dealId, templates, smtpReady, variant = 'button',
}: {
  sendAction: (fd: FormData) => Promise<void>;
  fillAction: (id: string, c: Partial<ContactPerson> & { company?: string | null }) => Promise<{ subject: string; body: string } | null>;
  /** Empfaenger: Hauptansprechpartner plus Firmenname fuer Platzhalter. */
  contact: { id: string; email: string | null; first_name?: string | null; last_name?: string | null; company?: string | null } | null;
  dealId?: string;
  templates: EmailTemplate[];
  smtpReady: boolean;
  variant?: 'button' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function applyTemplate(id: string) {
    if (!id) return;
    const filled = await fillAction(id, contact ?? {});
    if (filled) { setSubject(filled.subject); setBody(filled.body); }
  }

  const disabled = !contact?.email;

  return (
    <>
      <button className={variant === 'ghost' ? 'btn-ghost' : 'btn-ghost'} onClick={() => setOpen(true)} disabled={disabled}
              title={disabled ? 'Kontakt hat keine E-Mail-Adresse' : undefined}>
        <Mail size={15} /> E-Mail
      </button>

      <Modal open={open} onClose={() => { setOpen(false); setSent(false); setError(null); }}
             title="E-Mail senden" wide>
        {!smtpReady && (
          <p className="mb-4 rounded-lg bg-warn/10 p-3 text-sm text-warn">
            SMTP ist nicht konfiguriert. Setze SMTP_HOST, SMTP_USER und SMTP_PASS in der
            Server-Umgebung, dann kannst du direkt aus dem CRM senden.
          </p>
        )}

        <form
          action={async (fd) => {
            setBusy(true); setError(null);
            try {
              await sendAction(fd);
              setSent(true); setSubject(''); setBody('');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Versand fehlgeschlagen.');
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-4"
        >
          {dealId && <input type="hidden" name="deal_id" value={dealId} />}
          {contact && <input type="hidden" name="contact_id" value={contact.id} />}

          <div>
            <label className="label" htmlFor="mail-to">An</label>
            <input id="mail-to" name="to" className="input" defaultValue={contact?.email ?? ''} required />
          </div>

          {templates.length > 0 && (
            <div>
              <label className="label" htmlFor="mail-template">Vorlage</label>
              <select id="mail-template" className="input" defaultValue=""
                      onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">– keine –</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="mail-subject">Betreff</label>
            <input id="mail-subject" name="subject" className="input" required
                   value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div>
            <label className="label" htmlFor="mail-body">Nachricht</label>
            <textarea id="mail-body" name="body" className="input min-h-48" required
                      value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          {error && <p className="text-sm text-lose">{error}</p>}
          {sent && <p className="text-sm text-win">E-Mail gesendet und im Verlauf protokolliert.</p>}

          <button className="btn-primary w-full" disabled={busy || !smtpReady}>
            <Send size={15} /> {busy ? 'Senden …' : 'Senden'}
          </button>
        </form>
      </Modal>
    </>
  );
}
