'use server';

import { revalidatePath } from 'next/cache';
import { ctx, str } from '@/lib/ctx';

export async function saveGoals(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();
  const userId = str(formData, 'user_id') ?? profile.id;

  await supabase.from('activity_goals').upsert({
    org_id: orgId,
    user_id: userId,
    calls_per_day: Number(str(formData, 'calls_per_day') ?? 60),
    conversations_per_day: Number(str(formData, 'conversations_per_day') ?? 15),
    appointments_per_week: Number(str(formData, 'appointments_per_week') ?? 10),
  }, { onConflict: 'org_id,user_id' });

  revalidatePath('/schlagzahl');
}
