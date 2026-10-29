'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { LISTEN_TRENNER, listenVonKontakt } from '@/lib/listen';

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

  // Zusatzfelder "Messe" und "Listen" (eine Firma kann in mehreren Listen stehen)
  const { data: betroffen } = await supabase.from('contacts').select('id, custom')
    .eq('org_id', orgId).or(`custom->>messe.eq.${JSON.stringify(alt)},custom->>listen.ilike.${JSON.stringify(`%${alt}%`)}`);
  for (const c of betroffen ?? []) {
    const cu = { ...((c.custom ?? {}) as Record<string, string | null>) };
    if (cu.messe === alt) cu.messe = neu;
    if (cu.listen) {
      cu.listen = [...new Set(cu.listen.split('|').map((x) => x.trim()).filter(Boolean).map((x) => (x === alt ? neu : x)))].join(LISTEN_TRENNER);
    }
    await supabase.from('contacts').update({ custom: cu }).eq('id', c.id);
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

/**
 * Legt fuer alle Firmen einer Liste, die in der Pipeline noch keinen Deal
 * haben, einen Deal in der ersten offenen Phase an. Hat die Firma einen
 * offenen Deal dieser Liste in einer anderen Pipeline, wird dieser
 * verschoben statt verdoppelt.
 */
export async function dealsFuerListeAnlegen(formData: FormData) {
  const liste = String(formData.get('liste') ?? '').trim();
  const pipelineId = String(formData.get('p') ?? '');
  if (!liste || !pipelineId) return;
  const { supabase, orgId, profile } = await ctx();

  const [{ data: stages }, { data: kontakte }, { data: deals }] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name, position, is_won, is_lost').eq('pipeline_id', pipelineId).order('position'),
    supabase.from('contacts').select('id, company, custom, lead_source').eq('org_id', orgId)
      .or(`lead_source.eq.${JSON.stringify(liste)},custom->>listen.ilike.${JSON.stringify(`%${liste}%`)}`),
    supabase.from('deals').select('id, contact_id, pipeline_id, source, status').eq('org_id', orgId),
  ]);
  const offen = (stages ?? []).filter((s) => !s.is_won && !s.is_lost);
  const start = offen.find((s) => s.name.trim().toLowerCase() === 'offen') ?? offen[0];
  if (!start) throw new Error('Die Pipeline hat keine offene Phase.');

  const alle = deals ?? [];
  for (const k of (kontakte ?? []).filter((x) => listenVonKontakt(x).includes(liste))) {
    if (alle.some((d) => d.contact_id === k.id && d.pipeline_id === pipelineId)) continue;
    const woanders = alle.find((d) => d.contact_id === k.id && d.status === 'offen' && d.source === liste);
    if (woanders) {
      await supabase.from('deals').update({ pipeline_id: pipelineId, stage_id: start.id }).eq('id', woanders.id);
      continue;
    }
    const c = (k.custom ?? {}) as Record<string, string | null>;
    const { error } = await supabase.from('deals').insert({
      org_id: orgId, contact_id: k.id, pipeline_id: pipelineId, stage_id: start.id,
      title: k.company ?? 'Import', source: liste, owner_id: profile.id, setter_id: profile.id,
      custom: { ...(c.prio ? { prio: c.prio } : {}), ...(c.kanal ? { kanal: c.kanal } : {}) },
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath('/', 'layout');
  redirect(`/listen?${new URLSearchParams({ p: pipelineId, liste }).toString()}`);
}
