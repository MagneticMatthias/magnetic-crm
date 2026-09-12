'use server';

import { revalidatePath } from 'next/cache';
import { ctx } from '@/lib/ctx';
import type { ImportFieldKey } from '@/lib/csv';

export type ImportRow = Partial<Record<ImportFieldKey, string>>;

export type ImportResult = {
  created: number;
  skipped: number;
  merged: number;
  errors: string[];
};

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
const normDomain = (s?: string | null) =>
  norm(s).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

/**
 * Importiert Zeilen als Kontakt + Ansprechpartner + Deal.
 * Dubletten werden ueber E-Mail, Website-Domain oder Firmenname erkannt:
 *  - "skip": Zeile ueberspringen
 *  - "merge": Person an den bestehenden Kontakt haengen, keinen neuen Deal
 */
export async function importRows(input: {
  rows: ImportRow[];
  leadSource: string;
  stageId: string | null;
  duplicates: 'skip' | 'merge';
}): Promise<ImportResult> {
  const { supabase, orgId, profile } = await ctx();
  const result: ImportResult = { created: 0, skipped: 0, merged: 0, errors: [] };

  let pipelineId: string | null = null;
  if (input.stageId) {
    const { data } = await supabase.from('pipeline_stages').select('pipeline_id').eq('id', input.stageId).maybeSingle();
    pipelineId = data?.pipeline_id ?? null;
  }

  // Bestehende Kontakte fuer die Dublettenpruefung laden
  const [{ data: existing }, { data: persons }] = await Promise.all([
    supabase.from('contacts').select('id, company, website').eq('org_id', orgId),
    supabase.from('contact_persons').select('contact_id, email').eq('org_id', orgId),
  ]);
  const byCompany = new Map<string, string>();
  const byDomain = new Map<string, string>();
  const byEmail = new Map<string, string>();
  (existing ?? []).forEach((c) => {
    if (c.company) byCompany.set(norm(c.company), c.id);
    if (c.website) byDomain.set(normDomain(c.website), c.id);
  });
  (persons ?? []).forEach((p) => { if (p.email) byEmail.set(norm(p.email), p.contact_id); });

  for (const [i, row] of input.rows.entries()) {
    try {
      let first = row.first_name?.trim() || '';
      let last = row.last_name?.trim() || '';
      if (!first && !last && row.full_name) {
        const parts = row.full_name.trim().split(/\s+/);
        last = parts.pop() ?? '';
        first = parts.join(' ');
      }
      const email = row.email?.trim() || null;
      const company = row.company?.trim() || null;
      const website = row.website?.trim() || null;
      const label = company || [first, last].filter(Boolean).join(' ') || null;
      if (!label && !email && !row.phone) { result.skipped++; continue; }

      const dupId =
        (email && byEmail.get(norm(email))) ||
        (website && byDomain.get(normDomain(website))) ||
        (company && byCompany.get(norm(company))) || null;

      if (dupId) {
        if (input.duplicates === 'skip') { result.skipped++; continue; }
        // merge: Person ergaenzen, falls E-Mail neu
        if (email && !byEmail.has(norm(email))) {
          await supabase.from('contact_persons').insert({
            org_id: orgId, contact_id: dupId, first_name: first || null, last_name: last || null,
            email, phone: row.phone?.trim() || null, job_title: row.job_title?.trim() || null,
          });
          byEmail.set(norm(email), dupId);
        }
        result.merged++;
        continue;
      }

      const contactId = crypto.randomUUID();
      const { error: cErr } = await supabase.from('contacts').insert({
        id: contactId,
        org_id: orgId,
        company: label,
        website,
        postal_code: row.postal_code?.trim() || null,
        city: row.city?.trim() || null,
        country: row.country?.trim() || 'Deutschland',
        lead_source: input.leadSource,
        notes: row.notes?.trim() || null,
        owner_id: profile.id,
        created_by: profile.id,
      });
      if (cErr) throw new Error(cErr.message);

      if (first || last || email || row.phone) {
        await supabase.from('contact_persons').insert({
          org_id: orgId, contact_id: contactId, first_name: first || null, last_name: last || null,
          email, phone: row.phone?.trim() || null, job_title: row.job_title?.trim() || null, is_primary: true,
        });
      }

      if (input.stageId && pipelineId) {
        const value = Number(String(row.value ?? '0').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
        await supabase.from('deals').insert({
          org_id: orgId, contact_id: contactId, pipeline_id: pipelineId, stage_id: input.stageId,
          title: label ?? 'Import', value, source: input.leadSource, owner_id: profile.id, setter_id: profile.id,
        });
      }

      if (company) byCompany.set(norm(company), contactId);
      if (website) byDomain.set(normDomain(website), contactId);
      if (email) byEmail.set(norm(email), contactId);
      result.created++;
    } catch (e) {
      result.errors.push(`Zeile ${i + 2}: ${e instanceof Error ? e.message : 'Fehler'}`);
    }
  }

  revalidatePath('/kontakte');
  revalidatePath('/pipelines');
  revalidatePath('/dashboard');
  return result;
}

/** Entfernt alle Kontakte, Deals, Aktivitaeten, Notizen und Aufgaben der Organisation. */
export async function deleteAllData(confirmation: string): Promise<{ ok: boolean; message: string }> {
  const { supabase, orgId, profile } = await ctx();
  if (profile.role !== 'admin') return { ok: false, message: 'Nur Administratoren dürfen alle Daten löschen.' };
  if (confirmation !== 'ALLES LÖSCHEN') return { ok: false, message: 'Bestätigung stimmt nicht.' };

  // contacts-Loeschung kaskadiert auf Personen, Deals, Aktivitaeten, Notizen, Aufgaben
  const { error } = await supabase.from('contacts').delete().eq('org_id', orgId);
  if (error) return { ok: false, message: error.message };
  // Deals/Aktivitaeten ohne Kontakt ebenfalls entfernen
  await supabase.from('deals').delete().eq('org_id', orgId);
  await supabase.from('activities').delete().eq('org_id', orgId);
  await supabase.from('tasks').delete().eq('org_id', orgId);
  await supabase.from('notes').delete().eq('org_id', orgId);

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Alle Kontakte, Deals, Aktivitäten, Notizen und Aufgaben wurden gelöscht.' };
}
