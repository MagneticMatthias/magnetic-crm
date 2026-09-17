'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, Inbox, RotateCcw } from 'lucide-react';
import { syncMailNow, resyncMail } from '@/app/actions/mail';
import { dateTime } from '@/lib/format';

type State = { folder: string; last_run_at: string | null; last_error: string | null; imported: number };

export default function MailSyncCard({ configured, users, states }: { configured: boolean; users: string[]; states: State[] }) {
  const [pending, start] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-semibold">Postfach-Abgleich</h2>
      <p className="mb-4 text-xs text-muted">
        {configured
          ? <>Liest alle Ordner von <b>{users.join(', ')}</b>. Gespeichert wird nur, was exakt zu einer hinterlegten E-Mail-Adresse eines Ansprechpartners passt. Läuft automatisch, solange das CRM offen ist.</>
          : 'Nicht eingerichtet. Setze IMAP_HOST (z. B. imap.ionos.de) sowie SMTP_USER und SMTP_PASS in der Server-Umgebung.'}
      </p>

      {states.length > 0 && (
        <ul className="mb-4 space-y-1.5 text-sm">
          {states.map((s) => (
            <li key={s.folder} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 font-medium"><Inbox size={13} /> {s.folder}</span>
              <span className="text-muted">{s.imported} übernommen</span>
              <span className="text-muted">{s.last_run_at ? `zuletzt ${dateTime(s.last_run_at)}` : 'noch nie gelaufen'}</span>
              {s.last_error && <span className="w-full text-xs text-lose">{s.last_error}</span>}
            </li>
          ))}
        </ul>
      )}

      {configured && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost" disabled={pending}
                  onClick={() => start(async () => {
                    setMeldung(null);
                    const r = await syncMailNow();
                    setMeldung(r.error ? `Fehler: ${r.error}` : `${r.imported} neue Mail(s) übernommen.`);
                  })}>
            <RefreshCw size={14} className={pending ? 'animate-spin' : ''} /> {pending ? 'Gleiche ab …' : 'Jetzt abgleichen'}
          </button>
          <button type="button" className="btn-ghost" disabled={pending}
                  title="Fortschrittsmarke zurücksetzen und die letzten 60 Tage neu einlesen. Gelöschte Mails kommen zurück, vorhandene werden nicht doppelt."
                  onClick={() => start(async () => {
                    setMeldung(null);
                    const r = await resyncMail();
                    setMeldung(r.error ? `Fehler: ${r.error}` : `Neu eingelesen, ${r.imported} Mail(s) übernommen.`);
                  })}>
            <RotateCcw size={14} /> Letzte 60 Tage neu einlesen
          </button>
          {meldung && <span className={`text-sm ${meldung.startsWith('Fehler') ? 'text-lose' : 'text-muted'}`}>{meldung}</span>}
        </div>
      )}
    </section>
  );
}
