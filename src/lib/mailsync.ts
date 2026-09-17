import 'server-only';
import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Postfach-Abgleich: liest Posteingang und Gesendet per IMAP und legt jede
 * Mail als Aktivitaet an, deren Absender oder Empfaenger EXAKT einer
 * E-Mail-Adresse eines Ansprechpartners entspricht. Keine Heuristik ueber
 * Domains - was im CRM keine Adresse hat, wird nicht gespeichert.
 *
 * Der Inhalt wird nur fuer Treffer geladen; von allen anderen Mails sieht
 * der Abgleich ausschliesslich die Kopfzeilen und vergisst sie sofort.
 *
 * Laeuft in der Sitzung des angemeldeten Nutzers (RLS greift), nicht als
 * Hintergrundjob - dafuer braeuchte der Server einen Generalschluessel.
 */

export type SyncResult = {
  configured: boolean;
  ran: boolean;
  imported: number;
  folders: { folder: string; imported: number; error?: string }[];
};

const ERSTER_LAUF_TAGE = 60;
const MAX_BODY = 20000;
const MIN_ABSTAND_MS = 2 * 60 * 1000;

let laeuft = false;

export function mailSyncConfigured() {
  return Boolean(host() && user() && pass());
}
const host = () => process.env.IMAP_HOST;
const port = () => Number(process.env.IMAP_PORT ?? 993);
const user = () => process.env.IMAP_USER ?? process.env.SMTP_USER;
const pass = () => process.env.IMAP_PASS ?? process.env.SMTP_PASS;

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

function addressesOf(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return [];
  const list = Array.isArray(a) ? a : [a];
  return list.flatMap((x) => x.value.map((v) => norm(v.address))).filter(Boolean);
}

/** Antwortzitate abschneiden, damit die Zeitleiste lesbar bleibt. */
function ohneZitat(text: string): string {
  const marker = /^(Am .{5,80} schrieb .*:|On .{5,80} wrote:|-{3,}\s*(Original|Urspr).*|Von: .*\n(Gesendet|Datum): .*)$/m;
  const m = text.match(marker);
  const cut = m && m.index !== undefined && m.index > 40 ? text.slice(0, m.index) : text;
  return cut.replace(/\n{3,}/g, '\n\n').trim();
}

function htmlZuText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

type PersonRef = { contact_id: string; person_id: string };

export async function syncMailbox(
  supabase: SupabaseClient, orgId: string, opts: { force?: boolean } = {},
): Promise<SyncResult> {
  const result: SyncResult = { configured: mailSyncConfigured(), ran: false, imported: 0, folders: [] };
  if (!result.configured || laeuft) return result;

  // Nicht oefter als alle zwei Minuten, ausser auf Knopfdruck
  if (!opts.force) {
    const { data: st } = await supabase
      .from('mail_sync_state').select('last_run_at').eq('org_id', orgId)
      .order('last_run_at', { ascending: false }).limit(1).maybeSingle();
    if (st?.last_run_at && Date.now() - new Date(st.last_run_at).getTime() < MIN_ABSTAND_MS) return result;
  }

  // Adressbuch: nur exakte Adressen der Ansprechpartner
  const { data: persons } = await supabase
    .from('contact_persons').select('id, contact_id, email').eq('org_id', orgId).not('email', 'is', null);
  const adressbuch = new Map<string, PersonRef>();
  for (const p of persons ?? []) {
    const e = norm(p.email);
    if (e && !adressbuch.has(e)) adressbuch.set(e, { contact_id: p.contact_id, person_id: p.id });
  }
  if (adressbuch.size === 0) return result;

  const eigene = new Set([norm(user())]);

  laeuft = true;
  result.ran = true;
  const client = new ImapFlow({
    host: host()!, port: port(), secure: port() === 993,
    auth: { user: user()!, pass: pass()! },
    logger: false,
  });

  try {
    await client.connect();

    // Posteingang + der Ordner, den der Server als "Gesendet" markiert
    const boxes = await client.list();
    const sent = boxes.find((b) => b.specialUse === '\\Sent')?.path
      ?? boxes.find((b) => /^(sent|gesendet)/i.test(b.name))?.path;
    const folders = ['INBOX', ...(sent ? [sent] : [])];

    for (const folder of folders) {
      const f: SyncResult['folders'][number] = { folder, imported: 0 };
      result.folders.push(f);
      try {
        f.imported = await syncFolder(client, supabase, orgId, folder, adressbuch, eigene);
        result.imported += f.imported;
      } catch (e) {
        f.error = e instanceof Error ? e.message : String(e);
        await supabase.from('mail_sync_state').upsert({
          org_id: orgId, folder, last_run_at: new Date().toISOString(), last_error: f.error,
        });
      }
    }
  } finally {
    laeuft = false;
    await client.logout().catch(() => undefined);
  }
  return result;
}

async function syncFolder(
  client: ImapFlow, supabase: SupabaseClient, orgId: string, folder: string,
  adressbuch: Map<string, PersonRef>, eigene: Set<string>,
): Promise<number> {
  const { data: state } = await supabase
    .from('mail_sync_state').select('*').eq('org_id', orgId).eq('folder', folder).maybeSingle();

  const lock = await client.getMailboxLock(folder);
  let imported = 0;
  let lastUid = Number(state?.last_uid ?? 0);
  try {
    const mailbox = client.mailbox;
    if (!mailbox) return 0;
    const uidvalidity = Number(mailbox.uidValidity);
    if (state?.uidvalidity && state.uidvalidity !== uidvalidity) lastUid = 0;

    // Erster Lauf: nur die letzten Wochen, nicht die ganze Historie
    const since = new Date(Date.now() - ERSTER_LAUF_TAGE * 86400000);
    const range = lastUid > 0 ? `${lastUid + 1}:*` : undefined;
    const query = range ? { uid: range } : { since };

    // 1) Nur Kopfzeilen: passt eine Adresse?
    const treffer: { uid: number; ref: PersonRef; direction: 'in' | 'out' }[] = [];
    for await (const msg of client.fetch(query, { uid: true, envelope: true }, { uid: true })) {
      if (msg.uid <= lastUid) continue;
      lastUid = Math.max(lastUid, msg.uid);
      const env = msg.envelope;
      if (!env) continue;

      const from = (env.from ?? []).map((a) => norm(a.address));
      const to = [...(env.to ?? []), ...(env.cc ?? [])].map((a) => norm(a.address));
      const direction: 'in' | 'out' = from.some((a) => eigene.has(a)) ? 'out' : 'in';
      const kandidaten = direction === 'out' ? to : from;
      const hit = kandidaten.map((a) => adressbuch.get(a)).find(Boolean);
      if (hit) treffer.push({ uid: msg.uid, ref: hit, direction });
    }

    // 2) Inhalt nur fuer Treffer
    for (const t of treffer) {
      const dl = await client.download(String(t.uid), undefined, { uid: true });
      const parsed = await simpleParser(dl.content);
      const messageId = parsed.messageId ?? `uid-${uidvalidity}-${t.uid}@${folder}`;

      const text = parsed.text?.trim() || (parsed.html ? htmlZuText(String(parsed.html)) : '');
      const body = ohneZitat(text).slice(0, MAX_BODY);
      const gegenseite = t.direction === 'out'
        ? addressesOf(parsed.to).concat(addressesOf(parsed.cc)).join(', ')
        : addressesOf(parsed.from).join(', ');

      // Offener Deal des Kontakts, falls eindeutig
      const { data: deals } = await supabase
        .from('deals').select('id').eq('contact_id', t.ref.contact_id).eq('status', 'offen').limit(2);
      const dealId = deals?.length === 1 ? deals[0].id : null;

      const { error } = await supabase.from('activities').insert({
        org_id: orgId, contact_id: t.ref.contact_id, deal_id: dealId, user_id: null,
        type: 'email', direction: t.direction, message_id: messageId,
        subject: parsed.subject ?? '(kein Betreff)',
        body: `${t.direction === 'out' ? 'An' : 'Von'}: ${gegenseite}\n\n${body}`,
        occurred_at: (parsed.date ?? new Date()).toISOString(),
      });
      // Doppelte (Unique-Index) sind kein Fehler
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
      if (!error) imported++;
    }

    await supabase.from('mail_sync_state').upsert({
      org_id: orgId, folder, uidvalidity, last_uid: lastUid,
      last_run_at: new Date().toISOString(), last_error: null,
      imported: Number(state?.imported ?? 0) + imported,
    });
  } finally {
    lock.release();
  }
  return imported;
}
