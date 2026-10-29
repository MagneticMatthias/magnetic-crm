import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { istFaeden, istKaltakquise } from '@/lib/faeden';

/**
 * Nach jedem Phasenwechsel eines Deals:
 *  - Phase "Angeschrieben": Datum "angeschrieben am" setzen, falls noch leer
 *  - Kaltakquise -> Phase "Faden": der Deal wandert in die Pipeline Faeden,
 *    Phase Erstgespraech. Kein Duplikat, Felder und Aktivitaeten bleiben.
 */
export async function nachPhasenwechsel(supabase: SupabaseClient, dealId: string, stageId: string) {
  const { data: st } = await supabase.from('pipeline_stages')
    .select('name, pipeline:pipelines(id, name, org_id)').eq('id', stageId).single();
  const stage = st as unknown as { name: string; pipeline: { id: string; name: string; org_id: string } | null } | null;
  if (!stage?.pipeline) return;

  // "Angeschrieben am" einmalig festhalten
  if (stage.name.trim().toLowerCase() === 'angeschrieben') {
    const { data: d } = await supabase.from('deals').select('custom').eq('id', dealId).single();
    const custom = (d?.custom ?? {}) as Record<string, unknown>;
    if (!custom.angeschrieben_am) {
      await supabase.from('deals').update({ custom: { ...custom, angeschrieben_am: new Date().toISOString() } }).eq('id', dealId);
    }
  }

  if (istKaltakquise(stage.pipeline.name) && stage.name.trim().toLowerCase() === 'faden') {
    await zuFaden(supabase, dealId, stage.pipeline.org_id);
  }
}

/** Deal in die Pipeline Faeden verschieben (Phase Erstgespraech). */
export async function zuFaden(supabase: SupabaseClient, dealId: string, orgId: string, betrag?: number) {
  const { data: pipes } = await supabase.from('pipelines').select('id, name').eq('org_id', orgId);
  const faeden = (pipes ?? []).find((p) => istFaeden(p.name));
  if (!faeden) throw new Error('Pipeline „Fäden“ nicht gefunden.');
  const { data: stages } = await supabase.from('pipeline_stages')
    .select('id, name, position').eq('pipeline_id', faeden.id).order('position');
  const ziel = (stages ?? []).find((s) => s.name.trim().toLowerCase() === 'erstgespräch') ?? stages?.[0];
  if (!ziel) throw new Error('Die Pipeline „Fäden“ hat keine Phase.');
  const { error } = await supabase.from('deals').update({
    pipeline_id: faeden.id, stage_id: ziel.id, ...(betrag !== undefined ? { value: betrag } : {}),
  }).eq('id', dealId);
  if (error) throw new Error(error.message);
}
