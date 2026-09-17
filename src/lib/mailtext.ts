/**
 * Mail-Text fuer die Zeitleiste aufraeumen. Ohne 'server-only', damit die
 * Anzeige dieselbe Bereinigung auf bereits gespeicherte Mails anwenden kann.
 */

/** Echtes HTML, nicht nur eine Adresse in spitzen Klammern wie <x@y.de>. */
export const istHtml = (s: string) =>
  /<\/?(p|div|br|h[1-6]|ul|ol|li|b|strong|i|em|u|s|strike|a|span|blockquote|img|table|tr|td)\b[^>]*>/i.test(s);

// Zitat-Kopfzeilen, wahlweise mit vorangestellten ">"-Zeichen (Apple Mail
// setzt sie davor). Outlook-Stil: "Von: ..." gefolgt von "Gesendet: ...".
const ATTRIBUTION = /^(?:>\s?)*(Am .{5,90} schrieb .*:?\s*$|On .{5,90} wrote:\s*$|-{2,}\s*(Original|Urspr|Weitergeleitete).*$|Von: .*\n(?:>\s?)*(Gesendet|Datum): .*$)/m;

/** Antwortzitate abschneiden und uebrig gebliebene ">"-Zeilen entfernen. */
export function ohneZitat(text: string): string {
  let t = text.replace(/\r\n/g, '\n');
  const m = t.match(ATTRIBUTION);
  if (m && m.index !== undefined && m.index > 20) t = t.slice(0, m.index);
  t = t.split('\n').filter((z) => !/^\s*>/.test(z)).join('\n');
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function htmlZuText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
