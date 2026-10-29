'use server';

import { revalidatePath } from 'next/cache';
import { ctx } from '@/lib/ctx';
import { LISTEN_TRENNER } from '@/lib/listen';
import {
  KALT_PHASEN, FAEDEN_PHASEN, regelFuerPhase, norm, type Regel,
} from '@/lib/umstellung';

type Db = Awaited<ReturnType<typeof ctx>>['supabase'];

/** Alle Zeilen einer Tabelle holen, auch ueber die 1000-Zeilen-Grenze hinaus. */
async function alle<T>(q: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }) {
  const out: T[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await q().range(von, von + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/* ------------------------------- Backup ------------------------------- */

const BACKUP_TABELLEN = [
  'pipelines', 'contacts', 'contact_persons', 'deals', 'activities', 'tasks', 'notes',
  'saved_filters', 'deal_stage_history', 'lead_forms', 'activity_goals',
] as const;

/** Komplette Sicherung der eigenen Organisation als JSON (wird im Browser heruntergeladen). */
export async function backupErstellen(): Promise<string> {
  const { supabase, orgId } = await ctx();
  const daten: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABELLEN) {
    try {
      daten[t] = await alle(() => supabase.from(t).select('*').eq('org_id', orgId));
    } catch (e) {
      daten[t] = [];
      daten[`${t}__fehler`] = [String(e instanceof Error ? e.message : e)];
    }
  }
  const pipeIds = (daten.pipelines as { id: string }[]).map((p) => p.id);
  daten.pipeline_stages = pipeIds.length
    ? await alle(() => supabase.from('pipeline_stages').select('*').in('pipeline_id', pipeIds))
    : [];
  return JSON.stringify({ erstellt: new Date().toISOString(), org_id: orgId, daten });
}

/* ----------------------------- Vorschau ------------------------------ */

type Stage = { id: string; name: string; position: number; pipeline_id: string; is_won: boolean; is_lost: boolean };

async function pipelinesLaden(supabase: Db, orgId: string) {
  const { data: pipes } = await supabase.from('pipelines').select('id, name').eq('org_id', orgId);
  const kalt = (pipes ?? []).find((p) => norm(p.name) === 'kaltakquise') ?? null;
  const faeden = (pipes ?? []).find((p) => norm(p.name) === 'fäden' || norm(p.name) === 'faeden') ?? null;
  return { kalt, faeden };
}

export type VorschauZeile = { stageId: string; name: string; anzahl: number; regel: Regel | null };

export async function umstellungVorschau() {
  const { supabase, orgId } = await ctx();
  const { kalt, faeden } = await pipelinesLaden(supabase, orgId);
  if (!kalt) return { fehler: 'Pipeline „Kaltakquise“ nicht gefunden.' as const };
  const [{ data: stages }, deals] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('pipeline_id', kalt.id).order('position'),
    alle<{ stage_id: string }>(() => supabase.from('deals').select('stage_id').eq('pipeline_id', kalt.id)),
  ]);
  const zeilen: VorschauZeile[] = ((stages ?? []) as Stage[]).map((s) => ({
    stageId: s.id, name: s.name,
    anzahl: deals.filter((d) => d.stage_id === s.id).length,
    regel: regelFuerPhase(s.name),
  }));
  const fertig = zeilen.every((z) => KALT_PHASEN.some((k) => norm(k.name) === norm(z.name)))
    && zeilen.length === KALT_PHASEN.length;
  return { kaltId: kalt.id, faedenId: faeden?.id ?? null, zeilen, fertig };
}

/* ----------------------------- Ausfuehren ---------------------------- */

/** Phasen einer Pipeline auf die Soll-Liste bringen (anlegen, Reihenfolge). Gibt Name -> id zurueck. */
async function phasenSicherstellen(
  supabase: Db, pipelineId: string, soll: readonly { name: string; won?: boolean; lost?: boolean; color: string; prob: number }[],
) {
  const { data } = await supabase.from('pipeline_stages').select('*').eq('pipeline_id', pipelineId);
  const ist = (data ?? []) as Stage[];
  const ids: Record<string, string> = {};
  for (const [i, p] of soll.entries()) {
    let st = ist.find((x) => norm(x.name) === norm(p.name));
    if (!st) {
      const { data: neu, error } = await supabase.from('pipeline_stages').insert({
        pipeline_id: pipelineId, name: p.name, position: i, probability: p.prob, color: p.color,
        is_won: !!p.won, is_lost: !!p.lost,
      }).select('*').single();
      if (error) throw new Error(`Phase ${p.name}: ${error.message}`);
      st = neu as Stage;
    }
    ids[p.name] = st.id;
  }
  // Soll-Phasen vorne in der richtigen Reihenfolge, alles andere dahinter
  for (const [i, p] of soll.entries()) {
    await supabase.from('pipeline_stages').update({ position: i }).eq('id', ids[p.name]);
  }
  return { ids, alte: ist.filter((x) => !Object.values(ids).includes(x.id)) };
}

export type Uebersicht = {
  phase: Record<string, number>;
  quelle: Record<string, number>;
  produkt: Record<string, number>;
  anlass: Record<string, number>;
  nachFaeden: number;
  angenommen: { id: string; title: string; firma: string | null; betrag: number }[];
};

/**
 * Stellt die Kaltakquise auf die neuen Phasen um und verschiebt die Deals.
 * zuordnung: fuer Phasen ohne feste Regel die gewaehlte neue Phase (Name).
 */
export async function umstellungAusfuehren(zuordnung: Record<string, string>): Promise<Uebersicht> {
  const { supabase, orgId, profile } = await ctx();
  const { kalt, faeden } = await pipelinesLaden(supabase, orgId);
  if (!kalt || !faeden) throw new Error('Pipelines „Kaltakquise“ und „Fäden“ müssen vorhanden sein.');

  const { data: altStages } = await supabase.from('pipeline_stages').select('*').eq('pipeline_id', kalt.id);
  const nameVon = new Map(((altStages ?? []) as Stage[]).map((s) => [s.id, s.name]));

  // Regeln pruefen, bevor irgendetwas geaendert wird
  for (const s of (altStages ?? []) as Stage[]) {
    if (regelFuerPhase(s.name)) continue;
    const ziel = zuordnung[s.id];
    if (ziel && KALT_PHASEN.some((k) => k.name === ziel)) continue;
    const { count } = await supabase.from('deals').select('id', { count: 'exact', head: true }).eq('stage_id', s.id);
    if ((count ?? 0) > 0) throw new Error(`Für die Phase „${s.name}“ fehlt die Zuordnung.`);
  }

  const kaltPh = await phasenSicherstellen(supabase, kalt.id, KALT_PHASEN);
  const faedenPh = await phasenSicherstellen(supabase, faeden.id, FAEDEN_PHASEN);

  const deals = await alle<{
    id: string; stage_id: string; contact_id: string | null; source: string | null;
    custom: Record<string, string | null> | null;
    contact: { custom: Record<string, string | null> | null } | null;
  }>(() => supabase.from('deals').select('id, stage_id, contact_id, source, custom, contact:contacts(custom)').eq('pipeline_id', kalt.id));

  // Erste LinkedIn-/E-Mail-Aktivitaet je Deal = "angeschrieben am"
  const acts = await alle<{ deal_id: string; occurred_at: string; type: string }>(() =>
    supabase.from('activities').select('deal_id, occurred_at, type').eq('org_id', orgId)
      .in('type', ['linkedin', 'email']).not('deal_id', 'is', null).order('occurred_at'));
  const ersteAnsprache = new Map<string, string>();
  for (const a of acts) if (!ersteAnsprache.has(a.deal_id)) ersteAnsprache.set(a.deal_id, a.occurred_at);

  const protokoll: Record<string, unknown>[] = [];
  const notizen: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];

  for (const d of deals) {
    const alt = nameVon.get(d.stage_id);
    if (!alt) continue;
    // Deal steht schon in einer neuen Phase: nur Anlass/Produkt-Ergaenzung, keine Phasenaenderung
    const regel = regelFuerPhase(alt)
      ?? (zuordnung[d.stage_id] ? { ziel: zuordnung[d.stage_id] } as Regel : null);
    if (!regel) continue;
    const istNeu = KALT_PHASEN.some((k) => norm(k.name) === norm(alt));

    const custom: Record<string, string | null> = { ...(d.custom ?? {}) };
    if (regel.quelle) custom.quelle = regel.quelle;
    if (regel.produkt) custom.produkt = regel.produkt;
    const signal = String(d.contact?.custom?.signal ?? '');
    const bezug = `${d.source ?? ''} ${d.contact?.custom?.messe ?? ''}`;
    if (/electronica/i.test(signal)) { custom.produkt = 'Messefilm'; custom.anlass = 'electronica 2026'; }
    if (/expo\s*real/i.test(bezug) || /expo\s*real/i.test(signal)) custom.anlass = 'Expo Real 2026';

    const zielName = regel.ziel;
    const patch: Record<string, unknown> = { custom };
    if (zielName === 'Faden') {
      patch.pipeline_id = faeden.id;
      patch.stage_id = faedenPh.ids['Erstgespräch'];
    } else if (!istNeu || norm(alt) !== norm(zielName)) {
      patch.stage_id = kaltPh.ids[zielName];
    }
    if (zielName === 'Angeschrieben' && !custom.angeschrieben_am && ersteAnsprache.has(d.id)) {
      custom.angeschrieben_am = ersteAnsprache.get(d.id)!;
    }
    updates.push({ id: d.id, patch });

    if (!istNeu) {
      protokoll.push({
        org_id: orgId, deal_id: d.id, contact_id: d.contact_id, user_id: profile.id, type: 'note',
        subject: `Migriert aus Phase: ${alt}`,
      });
    }
    if (regel.notiz) {
      notizen.push({ org_id: orgId, deal_id: d.id, contact_id: d.contact_id, user_id: profile.id, body: regel.notiz });
    }
  }

  // Deals in Paketen aktualisieren
  for (let i = 0; i < updates.length; i += 20) {
    const res = await Promise.all(updates.slice(i, i + 20).map((u) => supabase.from('deals').update(u.patch).eq('id', u.id)));
    const err = res.find((r) => r.error);
    if (err?.error) throw new Error(`Deal: ${err.error.message}`);
  }
  for (let i = 0; i < protokoll.length; i += 500) {
    const { error } = await supabase.from('activities').insert(protokoll.slice(i, i + 500));
    if (error) throw new Error(`Protokoll: ${error.message}`);
  }
  for (let i = 0; i < notizen.length; i += 500) {
    const { error } = await supabase.from('notes').insert(notizen.slice(i, i + 500));
    if (error) throw new Error(`Notiz: ${error.message}`);
  }

  // Alte, jetzt leere Phasen entfernen (nur wenn wirklich kein Deal mehr drin steht)
  for (const st of [...kaltPh.alte, ...faedenPh.alte]) {
    const { count } = await supabase.from('deals').select('id', { count: 'exact', head: true }).eq('stage_id', st.id);
    if (!count) await supabase.from('pipeline_stages').delete().eq('id', st.id);
  }

  await listenZurueckholen(supabase, orgId);

  revalidatePath('/', 'layout');
  return uebersichtBerechnen(supabase, kalt.id, faeden.id, updates.filter((u) => u.patch.pipeline_id === faeden.id).length);
}

async function uebersichtBerechnen(supabase: Db, kaltId: string, faedenId: string, nachFaeden: number): Promise<Uebersicht> {
  const [{ data: stages }, deals, fDeals] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name').in('pipeline_id', [kaltId, faedenId]),
    alle<{ stage_id: string; custom: Record<string, string | null> | null }>(() =>
      supabase.from('deals').select('stage_id, custom').eq('pipeline_id', kaltId)),
    alle<{ id: string; title: string; value: number; stage_id: string; contact: { company: string | null } | null }>(() =>
      supabase.from('deals').select('id, title, value, stage_id, contact:contacts(company)').eq('pipeline_id', faedenId)),
  ]);
  const name = new Map((stages ?? []).map((s) => [s.id, s.name]));
  const zaehle = (f: (d: { stage_id: string; custom: Record<string, string | null> | null }) => string) =>
    deals.reduce<Record<string, number>>((m, d) => { const k = f(d); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const angenommenId = [...name.entries()].find(([, n]) => n === 'Angebot angenommen')?.[0];
  return {
    phase: zaehle((d) => name.get(d.stage_id) ?? '?'),
    quelle: zaehle((d) => d.custom?.quelle || '(leer)'),
    produkt: zaehle((d) => d.custom?.produkt || '(leer)'),
    anlass: zaehle((d) => d.custom?.anlass || '(leer)'),
    nachFaeden,
    angenommen: fDeals.filter((d) => d.stage_id === angenommenId)
      .map((d) => ({ id: d.id, title: d.title, firma: d.contact?.company ?? null, betrag: Number(d.value || 0) })),
  };
}

/**
 * Einmalige Reparatur: Der Import vom 28.10.26 hat Firmen aus "electronica 2026"
 * in die neue Signal-Liste verschoben. Firmen und Deals, die vor dem 28.10.
 * angelegt wurden, stehen danach wieder in "electronica 2026" - und zusaetzlich
 * in der Signal-Liste.
 */
async function listenZurueckholen(supabase: Db, orgId: string) {
  const ALT = 'electronica 2026';
  const STICHTAG = '2026-10-28T00:00:00Z';
  const kontakte = await alle<{ id: string; lead_source: string | null; custom: Record<string, string | null> | null }>(() =>
    supabase.from('contacts').select('id, lead_source, custom').eq('org_id', orgId)
      .ilike('lead_source', '%28.10.26%').lt('created_at', STICHTAG));
  for (const k of kontakte) {
    const neu = k.lead_source!;
    const listen = [...new Set([ALT, neu, ...String(k.custom?.listen ?? '').split('|').map((x) => x.trim()).filter(Boolean)])];
    await supabase.from('contacts').update({
      lead_source: ALT, custom: { ...(k.custom ?? {}), messe: ALT, listen: listen.join(LISTEN_TRENNER) },
    }).eq('id', k.id);
  }
  await supabase.from('deals').update({ source: ALT }).eq('org_id', orgId)
    .ilike('source', '%28.10.26%').lt('created_at', STICHTAG);
}
