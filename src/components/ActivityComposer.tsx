'use client';

import { useState } from 'react';
import { Phone, StickyNote, Mail, CalendarDays, Share2 } from 'lucide-react';
import { CALL_KIND_LABEL, CALL_OUTCOME_LABEL } from '@/lib/labels';
import { ERGEBNIS_LINKEDIN, ERGEBNIS_EMAIL, NICHT_JETZT } from '@/lib/passiert';
import FollowUpPicker from '@/components/FollowUpPicker';
import type { ActivityType, CallKind, CallOutcome } from '@/lib/types';
import { dialHref } from '@/lib/dial';

const TABS: { type: ActivityType; label: string; icon: typeof Phone }[] = [
  { type: 'call', label: 'Anruf', icon: Phone },
  { type: 'note', label: 'Notiz', icon: StickyNote },
  { type: 'email', label: 'E-Mail', icon: Mail },
  { type: 'meeting', label: 'Termin', icon: CalendarDays },
  { type: 'linkedin', label: 'LinkedIn', icon: Share2 },
];

export default function ActivityComposer({
  action, dealId, contactId, phone, quelle,
}: {
  action: (fd: FormData) => Promise<void>;
  dealId?: string;
  contactId?: string;
  phone?: string | null;
  /** Quelle des Deals bestimmt den voreingestellten Reiter */
  quelle?: string | null;
}) {
  const start: ActivityType = quelle === 'LinkedIn InMail' || quelle === 'LinkedIn Kontaktanfrage'
    ? 'linkedin' : quelle === 'E-Mail' ? 'email' : 'call';
  const [type, setType] = useState<ActivityType>(start);
  const nachricht = type === 'linkedin' || type === 'email';
  const startErgebnis = (t: ActivityType) =>
    t === 'linkedin' ? (quelle === 'LinkedIn Kontaktanfrage' ? 'Kontaktanfrage gesendet' : 'InMail gesendet') : 'E-Mail gesendet';
  const [nachrichtErgebnis, setNachrichtErgebnis] = useState(startErgebnis(start));
  const [anrufErgebnis, setAnrufErgebnis] = useState('erreicht');
  const nichtJetzt = (nachricht && nachrichtErgebnis === NICHT_JETZT) || (type === 'call' && anrufErgebnis === NICHT_JETZT);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string; fd?: FormData } | null>(null);
  // Sofort leeren und im Hintergrund speichern - das Formular wartet nicht auf den Server
  const speichern = (fd: FormData) => {
    setKey((k) => k + 1);
    setBusy(true);
    setStatus({ ok: true, text: 'Wird gespeichert …' });
    action(fd)
      .then(() => setStatus({ ok: true, text: 'Gespeichert' }))
      .catch((e) => setStatus({ ok: false, text: e instanceof Error ? e.message : 'Speichern fehlgeschlagen', fd }))
      .finally(() => setBusy(false));
  };
  const [key, setKey] = useState(0);

  return (
    <div className="card p-4">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(({ type: t, label, icon: Icon }) => (
          <button
            key={t}
            onClick={() => { setType(t); setNachrichtErgebnis(startErgebnis(t)); }}
            className={`chip ${t === type ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted hover:text-ink'}`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
        {type === 'call' && phone && (
          <a href={dialHref(phone)} className="btn-primary ml-auto !py-1 !px-3 text-xs">
            <Phone size={13} /> {phone} anrufen
          </a>
        )}
      </div>

      <form
        key={key}
        action={(fd) => speichern(fd)}
        className="space-y-3"
      >
        <input type="hidden" name="type" value={type} />
        {dealId && <input type="hidden" name="deal_id" value={dealId} />}
        {contactId && <input type="hidden" name="contact_id" value={contactId} />}
        {phone && type === 'call' && <input type="hidden" name="phone_number" value={phone} />}

        {type === 'call' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label" htmlFor="call_kind">Gesprächstyp</label>
                <select id="call_kind" name="call_kind" className="input" defaultValue="setting">
                  {(Object.keys(CALL_KIND_LABEL) as CallKind[]).map((k) => (
                    <option key={k} value={k}>{CALL_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="outcome">Ergebnis</label>
                <select id="outcome" name="outcome" className="input" value={anrufErgebnis}
                        onChange={(e) => setAnrufErgebnis(e.target.value)}>
                  {(Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[]).map((o) => (
                    <option key={o} value={o}>{CALL_OUTCOME_LABEL[o]}</option>
                  ))}
                  <option value={NICHT_JETZT}>{NICHT_JETZT}</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="answered_by">Wer hat abgenommen?</label>
                <select id="answered_by" name="answered_by" className="input" defaultValue="">
                  <option value="">–</option>
                  <option value="gatekeeper">Gatekeeper</option>
                  <option value="entscheider">Entscheider</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="duration_minutes">Dauer (Min.)</label>
                <input id="duration_minutes" name="duration_minutes" className="input"
                       inputMode="numeric" placeholder="z. B. 12" />
              </div>
            </div>

          </>
        ) : nachricht ? (
          <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
            <div>
              <label className="label" htmlFor="ergebnis">Ergebnis</label>
              <select id="ergebnis" name="ergebnis" className="input" value={nachrichtErgebnis}
                      onChange={(e) => setNachrichtErgebnis(e.target.value)}>
                {(type === 'linkedin' ? ERGEBNIS_LINKEDIN : ERGEBNIS_EMAIL).map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="subject">Betreff</label>
              <input id="subject" name="subject" className="input" placeholder="Kurzer Betreff" />
            </div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="subject">Betreff</label>
            <input id="subject" name="subject" className="input" placeholder="Kurzer Betreff" />
          </div>
        )}

        {/* "Antwort: nicht jetzt" braucht eine Wiedervorlage, Vorgabe in 3 Monaten */}
        <FollowUpPicker key={nichtJetzt ? 'nicht-jetzt' : 'normal'} vorgabeTage={nichtJetzt ? 90 : undefined} pflicht={nichtJetzt} />

        <div>
          <label className="label" htmlFor="body">Was ist passiert?</label>
          <textarea id="body" name="body" className="input min-h-20"
                    placeholder="Was wurde besprochen? Einwände, nächste Schritte …" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary">Aktivität festhalten</button>
          {status && (
            <span className={`text-sm ${status.ok ? 'text-muted' : 'text-lose'}`}>
              {status.ok && !busy ? '✓ ' : ''}{status.text}
              {!status.ok && status.fd && (
                <button type="button" className="ml-2 underline" onClick={() => speichern(status.fd!)}>Nochmal versuchen</button>
              )}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
