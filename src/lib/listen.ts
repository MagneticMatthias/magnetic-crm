/**
 * Eine Firma kann in mehreren Akquise-Listen stehen. Gespeichert wird:
 *  - contacts.lead_source: die erste Liste (wie bisher)
 *  - contacts.custom.listen: alle Listen, getrennt mit " | "
 *  - deals.source: die Liste, aus der der Deal entstand
 */
export const LISTEN_TRENNER = ' | ';

type K = { lead_source?: string | null; custom?: Record<string, string | null> | null } | null | undefined;

export function listenVonKontakt(c: K): string[] {
  const out = new Set<string>();
  if (c?.lead_source) out.add(c.lead_source);
  for (const l of String(c?.custom?.listen ?? '').split('|')) if (l.trim()) out.add(l.trim());
  return [...out];
}

export function listenVonDeal(d: { source?: string | null; contact?: K }): string[] {
  const out = new Set(listenVonKontakt(d.contact));
  if (d.source) out.add(d.source);
  return [...out];
}

/** Liste zur Mitgliedschaft hinzufuegen; gibt den neuen Wert fuer custom.listen zurueck. */
export function listeHinzu(c: K, liste: string): string {
  const alle = new Set(listenVonKontakt(c));
  alle.add(liste);
  return [...alle].join(LISTEN_TRENNER);
}
