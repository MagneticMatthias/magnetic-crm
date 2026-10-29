'use server';

import { revalidatePath } from 'next/cache';
import { ctx } from '@/lib/ctx';

/**
 * Schalter "Anrufe mitzaehlen": Ist er an, zaehlt jeder ausgehende Anruf
 * ueber die Fritzbox fuer die Akquise-Statistik - auch ohne passende
 * Telefonnummer im CRM. Gespeichert pro Nutzer in column_layouts.
 */
const KEY = 'akquise_anrufe';

export type AnrufeZaehlen = { an: boolean; seit: string | null };

export async function anrufeZaehlenLesen(): Promise<AnrufeZaehlen> {
  const { supabase, profile } = await ctx();
  const { data } = await supabase.from('column_layouts').select('columns')
    .eq('user_id', profile.id).eq('view_key', KEY).maybeSingle();
  const v = (data?.columns ?? {}) as Partial<AnrufeZaehlen>;
  return { an: v.an === true, seit: v.seit ?? null };
}

export async function anrufeZaehlenSetzen(an: boolean) {
  const { supabase, orgId, profile } = await ctx();
  const { error } = await supabase.from('column_layouts').upsert(
    { org_id: orgId, user_id: profile.id, view_key: KEY, columns: { an, seit: an ? new Date().toISOString() : null } },
    { onConflict: 'user_id,view_key' },
  );
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}
