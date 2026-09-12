import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';
import { ensureProfile } from './profile';

/** Supabase-Client + Profil des eingeloggten Nutzers. Fuer Server Actions und Loader. */
export async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await ensureProfile(supabase, user);
  if (!profile?.org_id) redirect('/onboarding');

  return { supabase, profile: profile as Profile, orgId: profile.org_id as string };
}

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

export const numOrZero = (fd: FormData, key: string) => {
  const s = str(fd, key);
  if (!s) return 0;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
