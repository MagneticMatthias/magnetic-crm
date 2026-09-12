import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';
import { ensureProfile } from './profile';

/** Liefert eingeloggten Nutzer + Profil. Leitet zu /login bzw. /onboarding um. */
export async function requireProfile(): Promise<{ profile: Profile; userId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await ensureProfile(supabase, user);
  if (!profile?.org_id) redirect('/onboarding');

  return { profile: profile as Profile, userId: user.id };
}

export async function getProfileOrNull(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return ensureProfile(supabase, user);
}

export const canManage = (p: Profile) => p.role === 'admin' || p.role === 'manager';
