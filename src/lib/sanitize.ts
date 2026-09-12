/**
 * Minimaler HTML-Sanitizer fuer Notizen aus dem Rich-Text-Editor.
 * Erlaubt nur einfache Formatierung, entfernt Skripte, Event-Handler
 * und gefaehrliche URLs.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'ul', 'ol', 'li',
  'a', 'img', 'div', 'span', 'blockquote',
]);

export function sanitizeHtml(input: string): string {
  if (!input) return '';

  return input
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, tag: string, attrs: string) => {
      const name = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return '';
      if (match.startsWith('</')) return `</${name}>`;

      let keep = '';
      if (name === 'a') {
        const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
        if (/^https?:\/\//i.test(href)) keep = ` href="${href}" target="_blank" rel="noreferrer noopener"`;
      }
      if (name === 'img') {
        const src = /src\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
        if (/^https?:\/\//i.test(src)) keep = ` src="${src}" alt=""`;
        else return '';
      }
      return `<${name}${keep}>`;
    });
}

/** Sichtbarer Text ohne Tags, z. B. fuer Vorschauen. */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
