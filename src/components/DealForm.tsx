'use client';

import { useState } from 'react';
import { LEAD_SOURCES } from '@/lib/labels';
import type { Contact, Profile, Stage } from '@/lib/types';
import { contactName } from '@/lib/format';

export type DealFormValues = {
  id?: string;
  title?: string;
  value?: number;
  stage_id?: string;
  contact_id?: string | null;
  source?: string | null;
  owner_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;
  expected_close_date?: string | null;
  next_step?: string | null;
};

export default function DealForm({
  action, stages, contacts, team, values, submitLabel = 'Speichern', onDone,
}: {
  action: (fd: FormData) => Promise<void>;
  stages: Stage[];
  contacts: Contact[];
  team: Profile[];
  values?: DealFormValues;
  submitLabel?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={async (fd) => {
        setBusy(true);
        try { await action(fd); onDone?.(); } finally { setBusy(false); }
      }}
      className="space-y-4"
    >
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <div>
        <label className="label" htmlFor="title">Titel</label>
        <input id="title" name="title" className="input" required
               defaultValue={values?.title ?? ''} placeholder="z. B. Nordlicht GmbH – Coaching" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="value">Wert (€)</label>
          <input id="value" name="value" className="input" inputMode="decimal"
                 defaultValue={values?.value ?? ''} placeholder="5000" />
        </div>
        <div>
          <label className="label" htmlFor="stage_id">Phase</label>
          <select id="stage_id" name="stage_id" className="input" defaultValue={values?.stage_id ?? stages[0]?.id}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="contact_id">Kontakt</label>
        <select id="contact_id" name="contact_id" className="input" defaultValue={values?.contact_id ?? ''}>
          <option value="">– kein Kontakt –</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {contactName(c)}{c.company ? ` · ${c.company}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="setter_id">Setter</label>
          <select id="setter_id" name="setter_id" className="input" defaultValue={values?.setter_id ?? ''}>
            <option value="">–</option>
            {team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="closer_id">Closer</label>
          <select id="closer_id" name="closer_id" className="input" defaultValue={values?.closer_id ?? ''}>
            <option value="">–</option>
            {team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="source">Leadquelle</label>
          <input id="source" name="source" className="input" list="lead-sources"
                 defaultValue={values?.source ?? ''} />
          <datalist id="lead-sources">
            {LEAD_SOURCES.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="expected_close_date">Erwarteter Abschluss</label>
          <input id="expected_close_date" name="expected_close_date" type="date" className="input"
                 defaultValue={values?.expected_close_date ?? ''} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="next_step">Nächster Schritt</label>
        <input id="next_step" name="next_step" className="input"
               defaultValue={values?.next_step ?? ''} placeholder="z. B. Angebot nachfassen" />
      </div>

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Speichern …' : submitLabel}
      </button>
    </form>
  );
}
