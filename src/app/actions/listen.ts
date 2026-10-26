'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ctx } from '@/lib/ctx';

type Bedingung = { field: string; operator: string; value: unknown };
type Definition = { groups?: Bedingung[][] };

const LISTEN_FELDER = new Set(['source', 'lead_source', 'custom.messe']);

/**
 * Benennt eine Akquise-Liste um: Leadherkunft der Deals und Kontakte,
 * das Zusatzfeld "Messe" und die gespeicherten Filter der Liste.
 * Gibt es den neuen Namen schon, werden beide Listen zusammengefuehrt.
 */
export async function renameList(formData: FormData) {
  const alt = String(formData.get('alt') ?? '').trim();
  const neu = String(formData.get('neu') ?? '').trim();
  const pipeline = String(formData.get('p') ?? '');
  const zurueck = (liste: string) => `/listen?${new URLSearchParams({ ...(pipeline ? { p: pipeline } : {}), liste }).toString()}`;
  if (!alt || !neu || alt === neu || alt === 'Ohne Liste') redirect(zurueck(alt));

  const { supabase, orgId } = await ctx();

  const { error: dErr } = await supabase.from('deals').update({ source: neu }).eq('org_id', orgId).eq('source', alt);
  if (dErr) throw new Error(dErr.message);
  const { error: cErr } = await supabase.from('contacts').update({ lead_source: neu }).eq('org_id', orgId).eq('lead_source', alt);
  if (cErr) throw new Error(cErr.message);

  const { data: mitMesse } = await supabase.from('contacts').select('id, custom')
    .eq('org_id', orgId).eq('custom->>messe', alt);
  for (const c of mitMesse ?? []) {
    await supabase.from('contacts').update({ custom: { ...(c.custom ?? {}), messe: neu } }).eq('id', c.id);
  }

  // Gespeicherte Filter: Name ("electronica 2026 · Prio 1") und Bedingungen anpassen
  const { data: filter } = await supabase.from('saved_filters').select('id, name, entity, definition').eq('org_id', orgId);
  const alle = filter ?? [];
  for (const f of alle) {
    const def = (f.definition ?? {}) as Definition;
    let geaendert = false;
    const groups = (def.groups ?? []).map((g) => g.map((b) => {
      if (LISTEN_FELDER.has(b.field) && b.value === alt) { geaendert = true; return { ...b, value: neu }; }
      return b;
    }));
    const name = f.name === alt || f.name.startsWith(`${alt} · `) ? neu + f.name.slice(alt.length) : f.name;
    if (!geaendert && name === f.name) continue;
    const doppelt = alle.some((x) => x.id !== f.id && x.entity === f.entity && x.name === name);
    if (doppelt) await supabase.from('saved_filters').delete().eq('id', f.id);
    else await supabase.from('saved_filters').update({ name, definition: { ...def, groups } }).eq('id', f.id);
  }

  revalidatePath('/', 'layout');
  redirect(zurueck(neu));
}
