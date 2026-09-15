'use client';

import { useState } from 'react';
import { Phone, StickyNote, Mail, CalendarDays, Share2 } from 'lucide-react';
import { CALL_KIND_LABEL, CALL_OUTCOME_LABEL } from '@/lib/labels';
import FollowUpPicker from '@/components/FollowUpPicker';
import type { ActivityType, CallKind, CallOutcome, Stage } from '@/lib/types';
import { dialHref } from '@/lib/dial';

const TABS: { type: ActivityType; label: string; icon: typeof Phone }[] = [
  { type: 'call', label: 'Anruf', icon: Phone },
  { type: 'note', label: 'Notiz', icon: StickyNote },
  { type: 'email', label: 'E-Mail', icon: Mail },
  { type: 'meeting', label: 'Termin', icon: CalendarDays },
  { type: 'linkedin', label: 'LinkedIn', icon: Share2 },
];

export default function ActivityComposer({
  action, dealId, contactId, stages, phone,
}: {
  action: (fd: FormData) => Promise<void>;
  dealId?: string;
  contactId?: string;
  stages?: Stage[];
  phone?: string | null;
}) {
  const [type, setType] = useState<ActivityType>('call');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);

  return (
    <div className="card p-4">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(({ type: t, label, icon: Icon }) => (
          <button
            key={t}
            onClick={() => setType(t)}
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
        action={async (fd) => {
          setBusy(true);
          try { await action(fd); setKey((k) => k + 1); } finally { setBusy(false); }
        }}
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
                <select id="outcome" name="outcome" className="input" defaultValue="erreicht">
                  {(Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[]).map((o) => (
                    <option key={o} value={o}>{CALL_OUTCOME_LABEL[o]}</option>
                  ))}
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

            {stages && stages.length > 0 && (
              <div>
                <label className="label" htmlFor="next_stage_id">Deal danach verschieben nach</label>
                <select id="next_stage_id" name="next_stage_id" className="input" defaultValue="">
                  <option value="">– automatisch aus dem Ergebnis –</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </>
        ) : (
          <div>
            <label className="label" htmlFor="subject">Betreff</label>
            <input id="subject" name="subject" className="input" placeholder="Kurzer Betreff" />
          </div>
        )}

        <FollowUpPicker />

        <div>
          <label className="label" htmlFor="body">Notiz</label>
          <textarea id="body" name="body" className="input min-h-20"
                    placeholder="Was wurde besprochen? Einwände, nächste Schritte …" />
        </div>

        <button className="btn-primary" disabled={busy}>
          {busy ? 'Speichern …' : 'Aktivität festhalten'}
        </button>
      </form>
    </div>
  );
}
