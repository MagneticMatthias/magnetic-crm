/** Regeln fuer die Umstellung der Pipelines Kaltakquise und Faeden (Oktober 2026). */

export const norm = (s: string) => s.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');

export const KALT_PHASEN = [
  { name: 'Offen', color: '#64748b', prob: 5 },
  { name: 'Angeschrieben', color: '#0a66c2', prob: 15 },
  { name: 'Antwort erhalten', color: '#0ea5e9', prob: 30 },
  { name: 'Interesse', color: '#6366f1', prob: 50 },
  // Deal ist in die Pipeline Faeden gewandert
  { name: 'Faden', color: '#e5006d', prob: 70 },
  { name: 'Verloren', color: '#ef4444', prob: 0, lost: true },
  { name: 'Kein Kontakt möglich', color: '#a1a1aa', prob: 0, lost: true },
] as const;

export const FAEDEN_PHASEN = [
  { name: 'Erstgespräch', color: '#0ea5e9', prob: 20 },
  { name: 'Angebot verschickt', color: '#6366f1', prob: 50 },
  { name: 'Mündliche Zusage', color: '#f59e0b', prob: 80 },
  { name: 'Angebot angenommen', color: '#22c55e', prob: 100, won: true },
  { name: 'Geliefert', color: '#15803d', prob: 100, won: true },
  { name: 'Verloren', color: '#ef4444', prob: 0, lost: true },
] as const;

export type KaltZiel = (typeof KALT_PHASEN)[number]['name'];

export type Regel = {
  ziel: KaltZiel;
  quelle?: string;
  produkt?: string;
  notiz?: string;
};

/** Feste Regeln aus der Vorgabe. Unbekannte Phasen liefern null und muessen zugeordnet werden. */
export function regelFuerPhase(name: string): Regel | null {
  const n = norm(name);
  // Bereits neue Phasen bleiben, wo sie sind
  const neu = KALT_PHASEN.find((k) => norm(k.name) === n);
  if (neu) return { ziel: neu.name };

  if (n === 'linkedin angeschrieben') return { ziel: 'Angeschrieben', quelle: 'LinkedIn InMail' };
  if (n === 'linkedin2 angeschrieben') return { ziel: 'Angeschrieben', quelle: 'LinkedIn InMail', notiz: 'zweite Nachricht gesendet' };
  if (n.startsWith('linkedin - kostenlos') || n.startsWith('linkedin kostenlos')) {
    return { ziel: 'Angeschrieben', quelle: 'LinkedIn InMail', produkt: 'Messefilm', notiz: 'Referenzstand-Angebot' };
  }
  if (n === 'e-mail geschrieben') return { ziel: 'Angeschrieben', quelle: 'E-Mail' };
  if (n === 'kein linkedin') return { ziel: 'Offen', notiz: 'kein LinkedIn-Profil gefunden' };
  if (n.includes('rangegangen')) return { ziel: 'Kein Kontakt möglich', quelle: 'Kaltanruf' };
  // Spaetere Phasen gibt es in der Kaltakquise nicht mehr: ab in die Faeden
  if (['angebot gesendet', 'termin/dreh vereinbart', 'auftrag', 'geliefert'].includes(n)) return { ziel: 'Faden' };
  return null;
}
