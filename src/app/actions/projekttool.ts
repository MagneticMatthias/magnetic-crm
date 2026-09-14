'use server';

import { ctx } from '@/lib/ctx';
import { revalidatePath } from 'next/cache';

/**
 * Übergabe eines gewonnenen Deals ans Projekttool (PocketBase).
 * Zugang liegt nur auf dem Server (.env auf dem NAS):
 *   PROJEKTTOOL_URL, PROJEKTTOOL_EMAIL, PROJEKTTOOL_PASSWORT
 * Angemeldet wird als normaler Nutzer, damit Kunde und Projekt ihm gehören.
 */

type PbRecord = { id: string; [k: string]: unknown };

function config() {
  const url = process.env.PROJEKTTOOL_URL?.replace(/\/$/, '');
  const email = process.env.PROJEKTTOOL_EMAIL;
  const password = process.env.PROJEKTTOOL_PASSWORT;
  if (!url || !email || !password) return null;
  return { url, email, password };
}

export async function projekttoolVerfuegbar(): Promise<boolean> {
  return config() !== null;
}

async function pb(base: string, token: string, path: string, init?: RequestInit) {
  const r = await fetch(`${base}/api/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: token, ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Projekttool ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function stripHtml(html: string) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

export async function dealAnProjekttool(dealId: string): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: 'Projekttool ist auf dem Server nicht eingerichtet (PROJEKTTOOL_URL/EMAIL/PASSWORT fehlen).' };

  const { supabase, orgId } = await ctx();
  const { data: deal } = await supabase.from('deals')
    .select('id, title, value, status, custom, contact:contacts(company, notes, persons:contact_persons(first_name, last_name, email, phone, role))')
    .eq('id', dealId).eq('org_id', orgId).single();
  if (!deal) return { ok: false, error: 'Deal nicht gefunden.' };
  const custom = (deal.custom as Record<string, string | null>) ?? {};
  if (custom.projekttool_id) return { ok: false, error: 'Dieser Deal wurde bereits übergeben.' };

  const contact = deal.contact as unknown as {
    company: string | null; notes: string | null;
    persons: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; role: string | null }[];
  } | null;
  const { data: notes } = await supabase.from('notes').select('body, created_at')
    .eq('deal_id', dealId).order('created_at', { ascending: true });

  try {
    // 1) Anmelden
    const auth = await fetch(`${cfg.url}/api/collections/users/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: cfg.email, password: cfg.password }), cache: 'no-store',
    });
    if (!auth.ok) return { ok: false, error: `Anmeldung am Projekttool fehlgeschlagen (${auth.status}).` };
    const { token, record } = (await auth.json()) as { token: string; record: PbRecord };
    const owner = record.id;

    // 2) Kunde suchen oder anlegen
    const company = (contact?.company ?? deal.title).trim();
    const list = (await pb(cfg.url, token, `collections/customers/records?perPage=200`)) as { items: PbRecord[] };
    let customer = list.items.find((c) => String(c.name).trim().toLowerCase() === company.toLowerCase());
    if (!customer) {
      const ansprech = (contact?.persons ?? [])
        .map((p) => [[p.first_name, p.last_name].filter(Boolean).join(' '), p.role, p.phone, p.email].filter(Boolean).join(' · '))
        .filter(Boolean).join('\n');
      const note = [contact?.notes, ansprech].filter(Boolean).join('\n\n');
      customer = (await pb(cfg.url, token, 'collections/customers/records', {
        method: 'POST', body: JSON.stringify({ name: company, note, color: '', owner }),
      })) as PbRecord;
    }

    // 3) Projekt anlegen (wie „→ Wird ein Projekt" im Projekttool)
    const project = (await pb(cfg.url, token, 'collections/projects/records', {
      method: 'POST',
      body: JSON.stringify({ name: deal.title, customer: customer.id, contact: '', kind: 'projekt', phase: 'In Vorbereitung', position: 0, owner }),
    })) as PbRecord;
    const amount = Number(deal.value ?? 0);
    if (amount > 0) {
      await pb(cfg.url, token, 'collections/project_amounts/records', {
        method: 'POST', body: JSON.stringify({ project: project.id, amount, owner }),
      });
    }

    // 4) Notizen als Verlauf mitnehmen
    for (const n of notes ?? []) {
      const body = stripHtml(n.body);
      if (!body) continue;
      await pb(cfg.url, token, 'collections/status_updates/records', {
        method: 'POST', body: JSON.stringify({ project: project.id, body, done: false, owner }),
      });
    }
    await pb(cfg.url, token, 'collections/status_updates/records', {
      method: 'POST', body: JSON.stringify({ project: project.id, body: 'Aus Magnetic_CRM übernommen', done: false, owner }),
    });

    // 5) Am Deal merken
    await supabase.from('deals').update({ custom: { ...custom, projekttool_id: project.id } }).eq('id', dealId);
    revalidatePath('/', 'layout');
    return { ok: true, projectId: project.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
