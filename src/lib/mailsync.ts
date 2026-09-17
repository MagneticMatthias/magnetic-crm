import 'server-only';
import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ohneZitat, htmlZuText } from '@/lib/mailtext';

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

type Account = { host: string; port: number; user: string; pass: string };

/**
 * Mehrere Postfaecher: das erste aus IMAP_HOST + SMTP_USER/SMTP_PASS
 * (oder IMAP_USER/IMAP_PASS), weitere als IMAP_USER_2/IMAP_PASS_2,
 * IMAP_USER_3/... mit optional eigenem IMAP_HOST_2.
 */
export function mailAccounts(): Account[] {
  const out: Account[] = [];
  const host = process.env.IMAP_HOST;
  const port = Number(process.env.IMAP_PORT ?? 993);
  const u1 = process.env.IMAP_USER ?? process.env.SMTP_USER;
  const p1 = process.env.IMAP_PASS ?? process.env.SMTP_PASS;
  if (host && u1 && p1) out.push({ host, port, user: u1, pass: p1 });
  for (let i = 2; i <= 5; i++) {
    const u = process.env[`IMAP_USER_${i}`];
    const p = process.env[`IMAP_PASS_${i}`];
    const h = process.env[`IMAP_HOST_${i}`] ?? host;
    if (u && p && h) out.push({ host: h, port: Number(process.env[`IMAP_PORT_${i}`] ?? port), user: u, pass: p });
  }
  return out;
}

export function mailSyncConfigured() {
  return mailAccounts().length > 0;
}

/** Nur die Adressen, fuer die Anzeige. */
export function mailAccountNames(): string[] {
  return mailAccounts().map((a) => a.user);
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

function addressesOf(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return [];
  const list = Array.isArray(a) ? a : [a];
  return list.flatMap((x) => x.value.map((v) => norm(v.address))).filter(Boolean);
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

  const accounts = mailAccounts();
  // Eigene Adressen aller Konten: entscheidet ueber Eingang/Ausgang und
  // sorgt dafuer, dass Post zwischen den eigenen Postfaechern ignoriert wird.
  const eigene = new Set(accounts.map((a) => norm(a.user)));

  laeuft = true;
  result.ran = true;
  try {
    for (const acc of accounts) {
      const client = new ImapFlow({
        host: acc.host, port: acc.port, secure: acc.port === 993,
        auth: { user: acc.user, pass: acc.pass },
        logger: false,
      });
      try {
        await client.connect();

        // Alle Ordner, denn wer Mails wegsortiert, hat sie nicht mehr im
        // Posteingang. Ausgenommen: Spam, Papierkorb, Entwuerfe.
        const boxes = await client.list();
        const ausgeschlossen = new Set(['\\Junk', '\\Trash', '\\Drafts']);
        const folders = boxes
          .filter((b) => !b.flags?.has('\\Noselect'))
          .filter((b) => !(b.specialUse && ausgeschlossen.has(b.specialUse)))
          .filter((b) => !/^(junk|spam|trash|papierkorb|gel[oö]scht|deleted|drafts?|entw[uü]rfe)/i.test(b.name))
          .map((b) => b.path);

        for (const folder of folders) {
          // Fortschritt je Konto UND Ordner - zwei Konten haben beide eine INBOX
          const key = `${acc.user} · ${folder}`;
          const f: SyncResult['folders'][number] = { folder: key, imported: 0 };
          result.folders.push(f);
          try {
            f.imported = await syncFolder(client, supabase, orgId, folder, key, adressbuch, eigene);
            result.imported += f.imported;
          } catch (e) {
            f.error = e instanceof Error ? e.message : String(e);
            await supabase.from('mail_sync_state').upsert({
              org_id: orgId, folder: key, last_run_at: new Date().toISOString(), last_error: f.error,
            });
          }
        }
      } catch (e) {
        // Login-Fehler eines Kontos sichtbar machen, die anderen weiter abgleichen
        const msg = e instanceof Error ? e.message : String(e);
        result.folders.push({ folder: `${acc.user}`, imported: 0, error: msg });
        await supabase.from('mail_sync_state').upsert({
          org_id: orgId, folder: acc.user, last_run_at: new Date().toISOString(), last_error: msg,
        });
      } finally {
        await client.logout().catch(() => undefined);
      }
    }
  } finally {
    laeuft = false;
  }
  return result;
}

async function syncFolder(
  client: ImapFlow, supabase: SupabaseClient, orgId: string, folder: string, key: string,
  adressbuch: Map<string, PersonRef>, eigene: Set<string>,
): Promise<number> {
  const { data: state } = await supabase
    .from('mail_sync_state').select('*').eq('org_id', orgId).eq('folder', key).maybeSingle();

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
      org_id: orgId, folder: key, uidvalidity, last_uid: lastUid,
      last_run_at: new Date().toISOString(), last_error: null,
      imported: Number(state?.imported ?? 0) + imported,
    });
  } finally {
    lock.release();
  }
  return imported;
}
