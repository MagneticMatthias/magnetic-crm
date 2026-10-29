import 'server-only';
import { redirect } from 'next/navigation';
import type { Profile } from './types';
import { sitzung } from './sitzung';

/** Supabase-Client + Profil des eingeloggten Nutzers. Fuer Server Actions und Loader. */
export async function ctx() {
  const { supabase, user, profile } = await sitzung();
  if (!user) redirect('/login');
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
