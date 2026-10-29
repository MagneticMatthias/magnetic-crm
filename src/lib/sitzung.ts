import 'server-only';
import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from './supabase/server';
import { ensureProfile } from './profile';
import type { Profile } from './types';

/**
 * Angemeldeter Nutzer und Profil - einmal pro Seitenaufruf bzw. Aktion.
 * getClaims prueft das Anmelde-Token lokal (ohne Umweg ueber den
 * Supabase-Anmeldeserver, wo moeglich); cache() verhindert, dass Layout,
 * Seite und Loader die Pruefung mehrfach ausfuehren.
 */
export const sitzung = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return { supabase, user: null as User | null, profile: null as Profile | null };
  const user = { id: c.sub, email: c.email, user_metadata: c.user_metadata ?? {} } as unknown as User;
  const profile = await ensureProfile(supabase, user);
  return { supabase, user, profile };
});
