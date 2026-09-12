'use client';

import { useState } from 'react';
import { LEAD_SOURCES } from '@/lib/labels';
import type { Contact, Profile } from '@/lib/types';

export default function ContactForm({
  action, team, values, submitLabel = 'Speichern', onDone, redirectToDetail,
}: {
  action: (fd: FormData) => Promise<void>;
  team: Profile[];
  values?: Partial<Contact>;
  submitLabel?: string;
  onDone?: () => void;
  redirectToDetail?: boolean;
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
      {redirectToDetail && <input type="hidden" name="redirect" value="detail" />}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="first_name">Vorname</label>
          <input id="first_name" name="first_name" className="input" defaultValue={values?.first_name ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="last_name">Nachname</label>
          <input id="last_name" name="last_name" className="input" defaultValue={values?.last_name ?? ''} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="email">E-Mail</label>
          <input id="email" name="email" type="email" className="input" defaultValue={values?.email ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="phone">Telefon</label>
          <input id="phone" name="phone" className="input" defaultValue={values?.phone ?? ''} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="company">Firma</label>
          <input id="company" name="company" className="input" defaultValue={values?.company ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="job_title">Position</label>
          <input id="job_title" name="job_title" className="input" defaultValue={values?.job_title ?? ''} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="lead_source">Leadquelle</label>
          <input id="lead_source" name="lead_source" className="input" list="lead-sources-c"
                 defaultValue={values?.lead_source ?? ''} />
          <datalist id="lead-sources-c">
            {LEAD_SOURCES.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="owner_id">Verantwortlich</label>
          <select id="owner_id" name="owner_id" className="input" defaultValue={values?.owner_id ?? ''}>
            <option value="">–</option>
            {team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">Notizen</label>
        <textarea id="notes" name="notes" className="input min-h-24" defaultValue={values?.notes ?? ''} />
      </div>

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Speichern …' : submitLabel}
      </button>
    </form>
  );
}
