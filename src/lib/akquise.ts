import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { istFaeden } from '@/lib/faeden';
import { REACHED_OUTCOMES } from '@/lib/labels';

export type Zeitraum = 'heute' | 'woche' | 'monat' | 'jahr';

export type Zahlen = {
  inmail: number; anfrage: number; email: number; anrufe: number; erreicht: number;
  interesse: number; nichtJetzt: number; keinInteresse: number; antworten: number;
  neueFaeden: number; auftraege: number;
};
const leer = (): Zahlen => ({
  inmail: 0, anfrage: 0, email: 0, anrufe: 0, erreicht: 0,
  interesse: 0, nichtJetzt: 0, keinInteresse: 0, antworten: 0, neueFaeden: 0, auftraege: 0,
});
export const ansprachen = (z: Zahlen) => z.inmail + z.anfrage + z.email + z.anrufe;

type A = { deal_id?: string | null; type: string; subject: string | null; outcome: string | null; direction: string | null; duration_seconds: number | null; occurred_at: string };

/** Was eine Aktivitaet fuer die Akquise bedeutet. */
function zaehle(z: Zahlen, a: A) {
  const s = (a.subject ?? '').trim().toLowerCase();
  if (s.startsWith('antwort')) {
    z.antworten++;
    if (s.includes('kein interesse')) z.keinInteresse++;
    else if (s.includes('nicht jetzt')) z.nichtJetzt++;
    else if (s.includes('interesse') || s.includes('positiv') || s.includes('termin')) z.interesse++;
    return;
  }
  if (a.direction === 'in') return; // eingehende Mails und Anrufe sind keine Ansprache
  if (a.type === 'linkedin') { if (s.includes('kontaktanfrage')) z.anfrage++; else z.inmail++; return; }
  if (a.type === 'email') { z.email++; return; }
  if (a.type === 'call') {
    z.anrufe++;
    const erreicht = (a.outcome && (REACHED_OUTCOMES as string[]).includes(a.outcome))
      || (!a.outcome && (a.duration_seconds ?? 0) > 0) || s === 'angerufen, erreicht';
    if (erreicht) z.erreicht++;
  }
}

function grenzen(zr: Zeitraum, jetzt: Date) {
  const start = new Date(jetzt); start.setHours(0, 0, 0, 0);
  if (zr === 'woche') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (zr === 'monat') start.setDate(1);
  if (zr === 'jahr') { start.setMonth(0, 1); }
  const ende = new Date(start);
  if (zr === 'heute') ende.setDate(ende.getDate() + 1);
  if (zr === 'woche') ende.setDate(ende.getDate() + 7);
  if (zr === 'monat') ende.setMonth(ende.getMonth() + 1);
  if (zr === 'jahr') ende.setFullYear(ende.getFullYear() + 1);
  const vorStart = new Date(start);
  if (zr === 'heute') vorStart.setDate(vorStart.getDate() - 1);
  if (zr === 'woche') vorStart.setDate(vorStart.getDate() - 7);
  if (zr === 'monat') vorStart.setMonth(vorStart.getMonth() - 1);
  if (zr === 'jahr') vorStart.setFullYear(vorStart.getFullYear() - 1);
  return { start, ende, vorStart };
}

export const VERGLEICH: Record<Zeitraum, string> = { heute: 'gestern', woche: 'Vorwoche', monat: 'Vormonat', jahr: 'Vorjahr' };

export async function akquiseAuswerten(supabase: SupabaseClient, orgId: string, zr: Zeitraum, jetzt: Date) {
  const { start, ende, vorStart } = grenzen(zr, jetzt);
  // Fuer das Diagramm: Woche/Heute zeigen die letzten 14 Tage
  const chartStart = zr === 'heute' || zr === 'woche'
    ? new Date(new Date(jetzt).setHours(0, 0, 0, 0) - 13 * 86400000) : start;
  const ladeAb = new Date(Math.min(vorStart.getTime(), chartStart.getTime()));

  const acts: A[] = [];
  for (let von = 0; ; von += 1000) {
    const { data } = await supabase.from('activities')
      .select('deal_id, type, subject, outcome, direction, duration_seconds, occurred_at')
      .eq('org_id', orgId).in('type', ['linkedin', 'email', 'call', 'note'])
      .gte('occurred_at', ladeAb.toISOString()).lt('occurred_at', ende.toISOString())
      .order('occurred_at').range(von, von + 999);
    acts.push(...((data ?? []) as A[]));
    if (!data || data.length < 1000) break;
  }

  // Auf "Angeschrieben" gesetzt, aber ohne Aktivitaet (z. B. ueber die Phase
  // statt ueber "Was ist passiert?"): zaehlt trotzdem, Kanal aus der Quelle.
  const { data: ohneAkt } = await supabase.from('deals').select('id, custom')
    .eq('org_id', orgId).gte('custom->>angeschrieben_am', vorStart.toISOString())
    .lt('custom->>angeschrieben_am', ende.toISOString()).limit(5000);
  const mitNachricht = new Set(acts
    .filter((a) => a.deal_id && (a.type === 'linkedin' || a.type === 'email') && !/^antwort/i.test(a.subject ?? ''))
    .map((a) => a.deal_id as string));
  for (const d of ohneAkt ?? []) {
    if (mitNachricht.has(d.id)) continue;
    const c = (d.custom ?? {}) as Record<string, string | null>;
    const quelle = c.quelle ?? '';
    acts.push({
      deal_id: d.id, direction: null, outcome: null, duration_seconds: null, occurred_at: c.angeschrieben_am!,
      type: quelle === 'E-Mail' ? 'email' : 'linkedin',
      subject: quelle === 'LinkedIn Kontaktanfrage' ? 'Kontaktanfrage gesendet' : 'InMail gesendet',
    });
  }

  const jetztZ = leer();
  const vorZ = leer();
  for (const a of acts) {
    const t = new Date(a.occurred_at);
    if (t >= start) zaehle(jetztZ, a);
    else if (t >= vorStart) zaehle(vorZ, a);
  }

  // Neue Faeden und Auftraege aus der Phasen-Historie
  const { data: pipes } = await supabase.from('pipelines').select('id, name').eq('org_id', orgId);
  const faeden = (pipes ?? []).find((p) => istFaeden(p.name));
  if (faeden) {
    const { data: stages } = await supabase.from('pipeline_stages').select('id, name').eq('pipeline_id', faeden.id);
    const faedenIds = new Set((stages ?? []).map((s) => s.id));
    const angenommen = (stages ?? []).find((s) => s.name.trim().toLowerCase() === 'angebot angenommen')?.id;
    const { data: hist } = await supabase.from('deal_stage_history').select('from_stage_id, to_stage_id, changed_at')
      .eq('org_id', orgId).gte('changed_at', vorStart.toISOString()).lt('changed_at', ende.toISOString()).limit(5000);
    for (const h of hist ?? []) {
      const z = new Date(h.changed_at) >= start ? jetztZ : vorZ;
      if (faedenIds.has(h.to_stage_id) && !faedenIds.has(h.from_stage_id)) z.neueFaeden++;
      if (angenommen && h.to_stage_id === angenommen) z.auftraege++;
    }
    // Direkt in den Faeden angelegte Deals
    const { data: neu } = await supabase.from('deals').select('created_at')
      .eq('pipeline_id', faeden.id).gte('created_at', vorStart.toISOString()).lt('created_at', ende.toISOString());
    for (const d of neu ?? []) (new Date(d.created_at) >= start ? jetztZ : vorZ).neueFaeden++;
  }

  // Diagramm: Tage (Heute/Woche: 14 Tage, Monat: Tage des Monats) oder Monate (Jahr)
  const reihe: { tag: string; linkedin: number; anruf: number; mail: number }[] = [];
  const schluessel = (d: Date) => zr === 'jahr' ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString();
  const idx = new Map<string, number>();
  for (let d = new Date(chartStart); d < (zr === 'heute' || zr === 'woche' ? new Date(chartStart.getTime() + 14 * 86400000) : ende);) {
    idx.set(schluessel(d), reihe.length);
    reihe.push({
      tag: zr === 'jahr' ? d.toLocaleDateString('de-DE', { month: 'short' }) : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      linkedin: 0, anruf: 0, mail: 0,
    });
    if (zr === 'jahr') d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + 1);
  }
  for (const a of acts) {
    const t = new Date(a.occurred_at);
    if (t < chartStart) continue;
    const i = idx.get(schluessel(t));
    if (i === undefined) continue;
    const z = leer(); zaehle(z, a);
    reihe[i].linkedin += z.inmail + z.anfrage;
    reihe[i].anruf += z.anrufe;
    reihe[i].mail += z.email;
  }

  // Schnitt pro Arbeitstag im Zeitraum (bis heute)
  let arbeitstage = 0;
  for (let d = new Date(start); d <= jetzt && d < ende; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) arbeitstage++;
  }

  return { jetzt: jetztZ, vor: vorZ, reihe, arbeitstage, start, ende };
}
