import { redirect } from 'next/navigation';
import type { Profile } from './types';
import { sitzung } from './sitzung';

/** Liefert eingeloggten Nutzer + Profil. Leitet zu /login bzw. /onboarding um. */
export async function requireProfile(): Promise<{ profile: Profile; userId: string }> {
  const { user, profile } = await sitzung();
  if (!user) redirect('/login');
  if (!profile?.org_id) redirect('/onboarding');

  return { profile: profile as Profile, userId: user.id };
}

export async function getProfileOrNull(): Promise<Profile | null> {
  return (await sitzung()).profile;
}

export const canManage = (p: Profile) => p.role === 'admin' || p.role === 'manager';
