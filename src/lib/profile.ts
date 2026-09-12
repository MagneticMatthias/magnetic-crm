import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Profile } from './types';

/**
 * Profil des Nutzers laden - und anlegen, falls es fehlt.
 * Der DB-Trigger auf auth.users darf in manchen Supabase-Projekten nicht
 * erstellt werden; dann sorgt die App selbst fuer die Profilzeile.
 */
export async function ensureProfile(supabase: SupabaseClient, user: User): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (data) return data as Profile;

  const { data: created, error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email ?? null,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? null,
    }, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    console.error('Profil konnte nicht angelegt werden:', error.message);
    return null;
  }
  return created as Profile;
}
