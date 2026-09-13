export const eur = (n: number | null | undefined) =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n ?? 0);

export const num = (n: number | null | undefined) =>
  new Intl.NumberFormat('de-DE').format(n ?? 0);

export const pct = (n: number) =>
  `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n)} %`;

export const dateTime = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)) : '–';

export const dateOnly = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(v)) : '–';

export const duration = (seconds: number | null | undefined) => {
  if (!seconds) return '–';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}:${String(s).padStart(2, '0')} min` : `${s} s`;
};

type PersonLike = { first_name?: string | null; last_name?: string | null };

export const personName = (p?: PersonLike | null) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();

/** Hauptansprechpartner eines Kontakts (oder der erste in der Liste). */
export const primaryPerson = <T extends { is_primary?: boolean }>(persons?: T[] | null): T | null =>
  persons?.find((p) => p.is_primary) ?? persons?.[0] ?? null;

/** Anzeigename einer Kontaktzeile: Firma, sonst Hauptansprechpartner. */
export const contactName = (c?: {
  company?: string | null;
  persons?: PersonLike[] | null;
} | null) => {
  if (!c) return 'Ohne Kontakt';
  const person = personName(c.persons?.[0]);
  return c.company || person || 'Unbenannt';
};

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

/** Telefonnummer fuer den Anruf: Hauptansprechpartner, sonst erste Person mit Nummer (z. B. Zentrale). */
export const phoneOf = <T extends { phone?: string | null; is_primary?: boolean }>(persons?: T[] | null): string | null =>
  primaryPerson(persons)?.phone || persons?.find((p) => p.phone)?.phone || null;
