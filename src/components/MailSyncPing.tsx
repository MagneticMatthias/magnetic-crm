'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { pingMailSync } from '@/app/actions/mail';

const INTERVALL_MS = 5 * 60 * 1000;

/**
 * Stoesst den Postfach-Abgleich an, solange das CRM offen ist: beim Laden
 * und dann alle fuenf Minuten. Unsichtbar; bei neuen Mails wird die
 * aktuelle Seite neu geladen, damit sie im Verlauf auftauchen.
 */
export default function MailSyncPing({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let aktiv = true;
    const lauf = async () => {
      try {
        const r = await pingMailSync();
        if (aktiv && r.imported > 0) router.refresh();
      } catch { /* still */ }
    };
    void lauf();
    const t = setInterval(lauf, INTERVALL_MS);
    return () => { aktiv = false; clearInterval(t); };
  }, [enabled, router]);
  return null;
}
