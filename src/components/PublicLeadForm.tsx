'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PublicLeadForm({
  slug, askCompany, askMessage, successMessage,
}: { slug: string; askCompany: boolean; askMessage: boolean; successMessage: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-medium text-win">{successMessage}</p>
      </div>
    );
  }

  return (
    <form
      className="card space-y-4 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        const supabase = createClient();

        const utm: Record<string, string> = {};
        new URLSearchParams(window.location.search).forEach((v, k) => {
          if (k.startsWith('utm_')) utm[k] = v.slice(0, 200);
        });

        const { error } = await supabase.rpc('submit_lead_form', {
          p_slug: slug,
          p_first_name: String(fd.get('first_name') ?? ''),
          p_last_name: String(fd.get('last_name') ?? ''),
          p_email: String(fd.get('email') ?? ''),
          p_phone: String(fd.get('phone') ?? ''),
          p_company: String(fd.get('company') ?? ''),
          p_message: String(fd.get('message') ?? ''),
          p_utm: utm,
        });

        if (error) {
          setError('Das hat nicht geklappt. Bitte prüfe deine Angaben und versuch es erneut.');
          setBusy(false);
          return;
        }
        setDone(true);
        setBusy(false);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pf-first">Vorname</label>
          <input id="pf-first" name="first_name" className="input" autoComplete="given-name" required />
        </div>
        <div>
          <label className="label" htmlFor="pf-last">Nachname</label>
          <input id="pf-last" name="last_name" className="input" autoComplete="family-name" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="pf-email">E-Mail</label>
        <input id="pf-email" name="email" type="email" className="input" autoComplete="email" required />
      </div>

      <div>
        <label className="label" htmlFor="pf-phone">Telefon</label>
        <input id="pf-phone" name="phone" className="input" autoComplete="tel" />
      </div>

      {askCompany && (
        <div>
          <label className="label" htmlFor="pf-company">Firma</label>
          <input id="pf-company" name="company" className="input" autoComplete="organization" />
        </div>
      )}

      {askMessage && (
        <div>
          <label className="label" htmlFor="pf-message">Nachricht</label>
          <textarea id="pf-message" name="message" className="input min-h-24" />
        </div>
      )}

      {error && <p className="text-sm text-lose">{error}</p>}

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Wird gesendet …' : 'Absenden'}
      </button>
    </form>
  );
}
