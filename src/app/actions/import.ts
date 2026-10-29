'use server';

import { revalidatePath } from 'next/cache';
import { ctx } from '@/lib/ctx';
import type { ImportFieldKey } from '@/lib/csv';
import { firmKey, firmenName, landName, ortUndRegion, prioAusSignal } from '@/lib/import-helpers';
import { listeVonFilter } from '@/lib/listenfilter';
import { listeHinzu } from '@/lib/listen';

export type ImportRow = Partial<Record<ImportFieldKey, string>>;

export type ImportResult = {
  created: number;
  deals: number;
  skipped: number;
  merged: number;
  moved: number;
  enriched: string[];
  errors: string[];
};

const signalNotiz = (staerke: string | null, signal: string, quelle: string | null, liste: string) =>
  `Signal ${staerke ?? ''} (${liste}): ${signal}${quelle ? `\nQuelle: ${quelle}` : ''}`;

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
const normDomain = (s?: string | null) =>
  norm(s).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

/**
 * Importiert Zeilen als Kontakt + Ansprechpartner + Deal.
 * Dubletten werden ueber E-Mail, Website-Domain oder Firmenname (auch ohne
 * Rechtsform) erkannt:
 *  - "skip": Zeile ueberspringen
 *  - "merge": bestehende Firma ergaenzen (neue Person, leere Zusatzfelder,
 *    Signal mit Notiz), keinen neuen Deal
 *  - "replace": bestehende Firma wandert in diese Liste. Die Daten der Datei
 *    gewinnen, Deal und Leadherkunft bekommen den neuen Listennamen. Anrufe,
 *    Notizen und Aufgaben bleiben erhalten (deshalb kein Loeschen).
 */
export async function importRows(input: {
  rows: ImportRow[];
  leadSource: string;
  stageId: string | null;
  duplicates: 'skip' | 'merge' | 'replace';
}): Promise<ImportResult> {
  const { supabase, orgId, profile } = await ctx();
  const result: ImportResult = { created: 0, deals: 0, skipped: 0, merged: 0, moved: 0, enriched: [], errors: [] };

  let pipelineId: string | null = null;
  if (input.stageId) {
    const { data } = await supabase.from('pipeline_stages').select('pipeline_id').eq('id', input.stageId).maybeSingle();
    pipelineId = data?.pipeline_id ?? null;
  }

  // Bestehende Kontakte fuer die Dublettenpruefung laden
  const [{ data: existing }, { data: persons }] = await Promise.all([
    supabase.from('contacts').select('id, company, website, custom, lead_source').eq('org_id', orgId),
    supabase.from('contact_persons').select('contact_id, email').eq('org_id', orgId),
  ]);
  const byCompany = new Map<string, string>();
  const byDomain = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byKey = new Map<string, string>();
  const customOf = new Map<string, Record<string, string | null>>();
  const leadOf = new Map<string, string | null>();
  (existing ?? []).forEach((c) => {
    leadOf.set(c.id, c.lead_source ?? null);
    customOf.set(c.id, (c.custom ?? {}) as Record<string, string | null>);
    if (c.company) { byCompany.set(norm(c.company), c.id); byKey.set(firmKey(c.company), c.id); }
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
      const company = firmenName(row.company);
      const t = (v?: string) => v?.trim() || null;
      const ortInfo = ortUndRegion(row.city);
      const signalstaerke = t(row.signalstaerke)?.toUpperCase() ?? null;
      const signal = t(row.signal);
      const custom: Record<string, string> = {};
      const setze = (k: string, v: string | null) => { if (v) custom[k] = v; };
      setze('messe', input.leadSource);
      setze('listen', input.leadSource);
      setze('prio', t(row.prio) ?? prioAusSignal(signalstaerke));
      setze('kanal', t(row.kanal)?.toUpperCase() ?? null);
      setze('halle_stand', t(row.halle_stand));
      setze('region', t(row.region) ?? ortInfo.region);
      setze('konzern', ortInfo.konzern);
      setze('produkt', t(row.produkt));
      setze('signal', signal);
      setze('signalstaerke', signalstaerke);
      setze('signal_quelle', t(row.signal_quelle));
      const website = row.website?.trim() || null;
      const label = company || [first, last].filter(Boolean).join(' ') || null;
      if (!label && !email && !row.phone) { result.skipped++; continue; }

      const dupId =
        (email && byEmail.get(norm(email))) ||
        (website && byDomain.get(normDomain(website))) ||
        (company && (byCompany.get(norm(company)) || byKey.get(firmKey(company)))) || null;

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
        // Zusatzfelder: leere Felder fuellen, Signal immer aktualisieren
        const alt = customOf.get(dupId) ?? {};
        const neu: Record<string, string | null> = { ...alt };
        const ersetzen = input.duplicates === 'replace';
        for (const [k, v] of Object.entries(custom)) {
          if (k === 'messe' || k === 'listen') continue; // die urspruengliche Liste bleibt erhalten
          if (ersetzen || k.startsWith('signal') || !neu[k]) neu[k] = v;
        }
        if (ersetzen) {
          // Die Firma steht danach in beiden Listen
          neu.listen = listeHinzu({ lead_source: leadOf.get(dupId) ?? null, custom: alt }, input.leadSource);
          await supabase.from('contacts').update({
            custom: neu,
            ...(ortInfo.ort ? { city: ortInfo.ort } : {}),
            ...(landName(row.country) ? { country: landName(row.country) } : {}),
            ...(website ? { website } : {}),
          }).eq('id', dupId);
          customOf.set(dupId, neu);
          // Deals der Firma: Prio/Kanal aktualisieren, die Herkunft des Deals bleibt
          let q = supabase.from('deals').select('id, custom').eq('contact_id', dupId);
          q = pipelineId ? q.eq('pipeline_id', pipelineId) : q.eq('status', 'offen');
          const { data: deals } = await q;
          const dealCustom = { ...(custom.prio ? { prio: custom.prio } : {}), ...(custom.kanal ? { kanal: custom.kanal } : {}) };
          for (const d of deals ?? []) {
            await supabase.from('deals').update({ custom: { ...(d.custom ?? {}), ...dealCustom } }).eq('id', d.id);
          }
          if (!deals?.length && input.stageId && pipelineId) {
            const { error: dErr } = await supabase.from('deals').insert({
              org_id: orgId, contact_id: dupId, pipeline_id: pipelineId, stage_id: input.stageId,
              title: company ?? label ?? 'Import', source: input.leadSource, owner_id: profile.id, setter_id: profile.id, custom: dealCustom,
            });
            if (dErr) throw new Error(`Deal: ${dErr.message}`);
            result.deals++;
          }
          result.moved++;
        } else if (JSON.stringify(neu) !== JSON.stringify(alt)) {
          await supabase.from('contacts').update({ custom: neu }).eq('id', dupId);
          customOf.set(dupId, neu);
        }
        if (signal && (alt.signal !== signal || alt.signalstaerke !== signalstaerke)) {
          await supabase.from('notes').insert({ org_id: orgId, contact_id: dupId, user_id: profile.id,
            body: signalNotiz(signalstaerke, signal, custom.signal_quelle ?? null, input.leadSource) });
          result.enriched.push(`${company ?? label} (${signalstaerke ?? '–'})`);
        }
        if (!ersetzen) result.merged++;
        continue;
      }

      const contactId = crypto.randomUUID();
      const { error: cErr } = await supabase.from('contacts').insert({
        id: contactId,
        org_id: orgId,
        company: label,
        website,
        postal_code: row.postal_code?.trim() || null,
        city: ortInfo.ort,
        country: landName(row.country) || 'Deutschland',
        lead_source: input.leadSource,
        notes: row.notes?.trim() || null,
        custom,
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
        const { error: dErr } = await supabase.from('deals').insert({
          org_id: orgId, contact_id: contactId, pipeline_id: pipelineId, stage_id: input.stageId,
          title: label ?? 'Import', value, source: input.leadSource, owner_id: profile.id, setter_id: profile.id,
          custom: { ...(custom.prio ? { prio: custom.prio } : {}), ...(custom.kanal ? { kanal: custom.kanal } : {}) },
        });
        if (dErr) throw new Error(`Deal: ${dErr.message}`);
        result.deals++;
      }
      if (signal) {
        await supabase.from('notes').insert({ org_id: orgId, contact_id: contactId, user_id: profile.id,
          body: signalNotiz(signalstaerke, signal, custom.signal_quelle ?? null, input.leadSource) });
      }
      customOf.set(contactId, custom);

      if (company) { byCompany.set(norm(company), contactId); byKey.set(firmKey(company), contactId); }
      if (website) byDomain.set(normDomain(website), contactId);
      if (email) byEmail.set(norm(email), contactId);
      result.created++;
    } catch (e) {
      result.errors.push(`Zeile ${i + 2}: ${e instanceof Error ? e.message : 'Fehler'}`);
    }
  }

  // Ein gespeicherter Filter je Liste (Kontakte und Deals), mehr nicht
  const liste = input.leadSource;
  const filter = [
    { entity: 'contacts', name: liste, definition: { groups: [[{ field: 'lead_source', operator: 'eq', value: liste }]] } },
    { entity: 'deals', name: liste, definition: { groups: [[{ field: 'source', operator: 'eq', value: liste }]] } },
  ];
  const { data: have } = await supabase.from('saved_filters').select('id, name, entity, definition').eq('org_id', orgId);
  const neue = filter.filter((f) => !(have ?? []).some((h) => h.name === f.name && h.entity === f.entity));
  if (neue.length) await supabase.from('saved_filters').insert(neue.map((f) => ({ org_id: orgId, user_id: profile.id, ...f })));
  await verwaisteListenFilterLoeschen(supabase, orgId, have ?? []);

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

type FilterZeile = { id: string; name: string; entity: string; definition: unknown };

/**
 * Loescht automatisch angelegte Listen-Filter ("Liste", "Liste · …"), deren
 * Liste es nicht mehr gibt - z. B. weil alle Firmen beim Import in eine
 * neue Liste uebernommen wurden. Selbst gebaute Filter mit anderem Namen
 * bleiben unangetastet.
 */
async function verwaisteListenFilterLoeschen(
  supabase: Awaited<ReturnType<typeof ctx>>['supabase'], orgId: string, filter: FilterZeile[],
) {
  const listeVon = (f: FilterZeile) => listeVonFilter(f);
  const kandidaten = [...new Set(filter.map(listeVon).filter((v): v is string => !!v))];
  for (const liste of kandidaten) {
    const [{ count: d }, { count: k }, { count: m }] = await Promise.all([
      supabase.from('deals').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('source', liste),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('lead_source', liste),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', orgId).ilike('custom->>listen', `%${liste}%`),
    ]);
    if ((d ?? 0) === 0 && (k ?? 0) === 0 && (m ?? 0) === 0) {
      const ids = filter.filter((f) => listeVon(f) === liste).map((f) => f.id);
      if (ids.length) await supabase.from('saved_filters').delete().in('id', ids);
    }
  }
}
