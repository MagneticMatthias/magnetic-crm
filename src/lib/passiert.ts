/**
 * "Was ist passiert?" - ein Klick in der Tabelle legt die Aktivitaet an,
 * setzt die Phase und (falls leer) die Quelle.
 */
export const KALT_EINTRAEGE = [
  'InMail gesendet', 'Kontaktanfrage gesendet', 'E-Mail gesendet',
  'Angerufen, nicht erreicht', 'Angerufen, erreicht',
  'Antwort: Interesse', 'Antwort: nicht jetzt', 'Antwort: kein Interesse', 'Kein Kontakt möglich',
] as const;

export const FAEDEN_EINTRAEGE = [
  'Nachgefasst', 'Angebot verschickt', 'Mündliche Zusage', 'Angebot angenommen', 'Geliefert', 'Verloren',
] as const;

/** Ergebnis im Aktivitaeten-Formular, passend zum Kanal */
export const ERGEBNIS_LINKEDIN = ['InMail gesendet', 'Kontaktanfrage gesendet', 'Antwort: Interesse', 'Antwort: nicht jetzt', 'Antwort: kein Interesse', 'Kein Kontakt möglich'] as const;
export const ERGEBNIS_EMAIL = ['E-Mail gesendet', 'Antwort: Interesse', 'Antwort: nicht jetzt', 'Antwort: kein Interesse', 'Kein Kontakt möglich'] as const;
export const NICHT_JETZT = 'Antwort: nicht jetzt';
/** Vorgabe fuer die Wiedervorlage in Tagen */
export const wiedervorlageTage = (eintrag: string) => (eintrag === NICHT_JETZT ? 90 : 3);

export type PassiertRegel = {
  type: 'linkedin' | 'email' | 'call' | 'note';
  outcome?: 'erreicht' | 'nicht_erreicht' | 'kein_interesse' | 'wiedervorlage';
  /** Name der neuen Phase; null = Phase bleibt */
  phase: string | null;
  /** Quelle, falls am Deal noch leer */
  quelle?: string;
  /** Danach direkt eine Wiedervorlage abfragen */
  wiedervorlage: boolean;
};

/** Kanal einer Antwort aus der Quelle des Deals */
function kanal(quelle: string | null | undefined): PassiertRegel['type'] {
  if (quelle?.startsWith('LinkedIn')) return 'linkedin';
  if (quelle === 'E-Mail') return 'email';
  if (quelle === 'Kaltanruf') return 'call';
  return 'note';
}

export function passiertRegel(eintrag: string, quelle?: string | null): PassiertRegel | null {
  switch (eintrag) {
    case 'InMail gesendet': return { type: 'linkedin', phase: 'Angeschrieben', quelle: 'LinkedIn InMail', wiedervorlage: false };
    case 'Kontaktanfrage gesendet': return { type: 'linkedin', phase: 'Angeschrieben', quelle: 'LinkedIn Kontaktanfrage', wiedervorlage: false };
    case 'E-Mail gesendet': return { type: 'email', phase: 'Angeschrieben', quelle: 'E-Mail', wiedervorlage: false };
    case 'Angerufen, nicht erreicht': return { type: 'call', outcome: 'nicht_erreicht', phase: null, quelle: 'Kaltanruf', wiedervorlage: false };
    case 'Angerufen, erreicht': return { type: 'call', outcome: 'erreicht', phase: 'Antwort erhalten', quelle: 'Kaltanruf', wiedervorlage: false };
    case 'Antwort: Interesse': {
      const t = kanal(quelle);
      return { type: t, ...(t === 'call' ? { outcome: 'erreicht' as const } : {}), phase: 'Interesse', wiedervorlage: true };
    }
    case 'Antwort: nicht jetzt': {
      const t = kanal(quelle);
      return { type: t, ...(t === 'call' ? { outcome: 'wiedervorlage' as const } : {}), phase: 'Antwort erhalten', wiedervorlage: true };
    }
    case 'Antwort: kein Interesse': {
      const t = kanal(quelle);
      return { type: t, ...(t === 'call' ? { outcome: 'kein_interesse' as const } : {}), phase: 'Verloren', wiedervorlage: false };
    }
    case 'Kein Kontakt möglich': return { type: 'note', phase: 'Kein Kontakt möglich', wiedervorlage: false };
    // Faeden
    case 'Nachgefasst': return { type: 'note', phase: null, wiedervorlage: true };
    case 'Angebot verschickt': return { type: 'note', phase: 'Angebot verschickt', wiedervorlage: true };
    case 'Mündliche Zusage': return { type: 'note', phase: 'Mündliche Zusage', wiedervorlage: true };
    case 'Angebot angenommen': return { type: 'note', phase: 'Angebot angenommen', wiedervorlage: true };
    case 'Geliefert': return { type: 'note', phase: 'Geliefert', wiedervorlage: false };
    case 'Verloren': return { type: 'note', phase: 'Verloren', wiedervorlage: false };
    default: return null;
  }
}
