'use server';

import { revalidatePath } from 'next/cache';
import { ctx } from '@/lib/ctx';
import { syncMailbox, mailSyncConfigured, type SyncResult } from '@/lib/mailsync';
import { phaseNachziehen } from '@/app/actions/crm';

/**
 * Vom Browser alle paar Minuten angestossen, solange das CRM offen ist.
 * Fehler werden gespeichert, nie an den Client geworfen - ein kaputtes
 * Postfach darf die Oberflaeche nicht stoeren.
 */
export async function pingMailSync(): Promise<{ imported: number }> {
  if (!mailSyncConfigured()) return { imported: 0 };
  const { supabase, orgId } = await ctx();
  try {
    const r = await syncMailbox(supabase, orgId);
    if (r.imported > 0) await nachziehen(supabase, orgId);
    if (r.imported > 0) { revalidatePath('/kontakte'); revalidatePath('/pipelines'); revalidatePath('/aktivitaeten'); }
    return { imported: r.imported };
  } catch {
    return { imported: 0 };
  }
}

/** Knopf in den Einstellungen: sofort und ohne Mindestabstand. */
export async function syncMailNow(): Promise<SyncResult & { error?: string }> {
  const { supabase, orgId } = await ctx();
  try {
    const r = await syncMailbox(supabase, orgId, { force: true });
    if (r.imported > 0) await nachziehen(supabase, orgId);
    revalidatePath('/einstellungen'); revalidatePath('/kontakte'); revalidatePath('/pipelines'); revalidatePath('/aktivitaeten');
    return r;
  } catch (e) {
    return { configured: mailSyncConfigured(), ran: false, imported: 0, folders: [],
             error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Selbst geschriebene Mails ziehen die Phase nach ("E-Mail geschrieben").
 * Nur fuer die gerade importierten Ausgaenge, die einen Deal haben.
 */
async function nachziehen(supabase: Awaited<ReturnType<typeof ctx>>['supabase'], orgId: string) {
  const { data } = await supabase
    .from('activities').select('deal_id').eq('org_id', orgId)
    .eq('type', 'email').eq('direction', 'out').not('deal_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());
  const dealIds = [...new Set((data ?? []).map((a) => a.deal_id as string))];
  for (const id of dealIds) await phaseNachziehen(supabase, id, ['E-Mail geschrieben']);
}
