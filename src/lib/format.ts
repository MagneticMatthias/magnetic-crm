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

export const contactName = (c?: { first_name?: string | null; last_name?: string | null; company?: string | null } | null) => {
  if (!c) return 'Ohne Kontakt';
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return name || c.company || 'Unbenannt';
};

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
