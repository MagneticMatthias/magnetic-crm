'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DIAL_CODES } from '@/lib/labels';

export default function PublicLeadForm({
  slug, headline, description, askCompany, askMessage, askEmail, askPhone, askLastName, successMessage,
}: {
  slug: string; headline: string; description: string | null;
  askCompany: boolean; askMessage: boolean; askEmail: boolean; askPhone: boolean; askLastName: boolean;
  successMessage: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('+49');

  return (
    <div className="card overflow-hidden shadow-lg">
      <div className="px-6 pt-6 pb-2">
        <h1 className="text-xl font-bold">{headline}</h1>
        {description && <p className="mt-1.5 text-sm text-ink/80">{description}</p>}
      </div>

      {done ? (
        <div className="px-6 pb-8 pt-4"><p className="text-sm font-medium text-win">{successMessage}</p></div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setError(null);
            const fd = new FormData(e.currentTarget);
            const rawPhone = String(fd.get('phone') ?? '').trim();
            const utm: Record<string, string> = {};
            new URLSearchParams(window.location.search).forEach((v, k) => { if (k.startsWith('utm_')) utm[k] = v.slice(0, 200); });

            const { error } = await createClient().rpc('submit_lead_form', {
              p_slug: slug,
              p_first_name: String(fd.get('first_name') ?? ''),
              p_last_name: String(fd.get('last_name') ?? ''),
              p_email: String(fd.get('email') ?? ''),
              p_phone: rawPhone ? `${code} ${rawPhone}` : '',
              p_company: String(fd.get('company') ?? ''),
              p_message: String(fd.get('message') ?? ''),
              p_utm: utm,
            });
            if (error) { setError('Das hat nicht geklappt. Bitte prüfe deine Angaben und versuch es erneut.'); setBusy(false); return; }
            setDone(true); setBusy(false);
          }}
        >
          <div className="space-y-4 px-6 pb-5 pt-3">
            <div className={`grid gap-4 ${askLastName ? 'sm:grid-cols-2' : ''}`}>
              <div>
                <label className="label" htmlFor="pf-first">Vorname</label>
                <input id="pf-first" name="first_name" className="input" autoComplete="given-name" required placeholder="Gib hier deinen Vornamen ein" />
              </div>
              {askLastName && (
                <div>
                  <label className="label" htmlFor="pf-last">Nachname</label>
                  <input id="pf-last" name="last_name" className="input" autoComplete="family-name" placeholder="Gib hier deinen Nachnamen ein" />
                </div>
              )}
            </div>

            {askEmail && (
              <div>
                <label className="label" htmlFor="pf-email">E-Mail</label>
                <input id="pf-email" name="email" type="email" className="input" autoComplete="email" required={!askPhone} placeholder="Gib hier deine E-Mail-Adresse ein" />
              </div>
            )}

            {askPhone && (
              <div>
                <label className="label" htmlFor="pf-phone">Telefon</label>
                <div className="flex">
                  <label className="input flex w-[76px] items-center gap-1 rounded-r-none border-r-0 !px-2.5">
                    <Globe size={14} className="text-muted" />
                    <select className="w-full bg-transparent text-xs outline-none" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Vorwahl">
                      {DIAL_CODES.map((d) => <option key={d.code} value={d.code}>{d.flag} {d.code}</option>)}
                    </select>
                  </label>
                  <input id="pf-phone" name="phone" className="input rounded-l-none" autoComplete="tel" inputMode="tel" required={!askEmail} placeholder="Gib hier deine Telefonnummer ein" />
                </div>
              </div>
            )}

            {askCompany && (
              <div>
                <label className="label" htmlFor="pf-company">Firma</label>
                <input id="pf-company" name="company" className="input" autoComplete="organization" placeholder="Gib hier deine Firma ein" />
              </div>
            )}
            {askMessage && (
              <div>
                <label className="label" htmlFor="pf-message">Nachricht</label>
                <textarea id="pf-message" name="message" className="input min-h-24" placeholder="Worum geht es?" />
              </div>
            )}
            {error && <p className="text-sm text-lose">{error}</p>}
          </div>

          <div className="flex justify-end border-t border-line bg-surface-2/40 px-6 py-4">
            <button className="btn-primary !px-6" disabled={busy}>{busy ? 'Wird gesendet …' : 'Absenden'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
