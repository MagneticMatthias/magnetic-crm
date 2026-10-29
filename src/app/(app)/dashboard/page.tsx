import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { PageHeader, Stat } from '@/components/ui';
import { AnsprachenChart } from '@/components/Charts';
import Timeline from '@/components/Timeline';
import TaskList from '@/components/TaskList';
import { eur, pct, dateOnly } from '@/lib/format';
import { istFaeden, istKaltakquise } from '@/lib/faeden';
import type { Activity, Deal, Stage } from '@/lib/types';
import { nowMs, nowDate } from '@/lib/clock';

/** Was die Phasen der Kaltakquise bedeuten - steht direkt neben dem Balken. */
const PHASEN_ERKLAERUNG: Record<string, string> = {
  offen: 'noch nicht angesprochen',
  angeschrieben: 'Nachricht raus, noch keine Antwort',
  'antwort erhalten': 'Rückmeldung, noch kein klares Interesse',
  interesse: 'will mehr wissen – Wiedervorlage nötig',
  faden: 'in die Fäden übergeben',
  verloren: 'abgesagt',
  'kein kontakt möglich': 'nicht erreichbar, abgehakt',
};

/** Eine Aktivitaet zaehlt als Ansprache, wenn sie keine Antwort ist. */
const istAntwort = (a: Pick<Activity, 'subject'>) => /^antwort/i.test(a.subject ?? '');

export default async function DashboardPage() {
  const { supabase, orgId, profile } = await ctx();

  const heute = nowDate();
  heute.setHours(0, 0, 0, 0);
  const wochenStart = new Date(heute);
  wochenStart.setDate(heute.getDate() - ((heute.getDay() + 6) % 7)); // Montag
  const tag30 = new Date(nowMs() - 30 * 86400000);
  const tag14 = new Date(heute.getTime() - 13 * 86400000);

  const [
    { data: deals }, { data: pipelines }, { data: activities }, { data: tasks }, { data: offeneWv }, { data: letzte },
  ] = await Promise.all([
    supabase.from('deals').select('id, title, value, status, stage_id, pipeline_id, contact_id')
      .eq('org_id', orgId).range(0, 9999),
    supabase.from('pipelines').select('*').eq('org_id', orgId).eq('archived', false).order('position'),
    supabase.from('activities').select('type, subject, occurred_at, outcome')
      .eq('org_id', orgId).gte('occurred_at', tag30.toISOString()).limit(5000),
    supabase.from('tasks').select('*, deal:deals(id, title, contact:contacts(id, company, persons:contact_persons(first_name, last_name, is_primary))), contact:contacts(id, company, persons:contact_persons(first_name, last_name, is_primary))')
      .eq('org_id', orgId).eq('assignee_id', profile.id).eq('done', false)
      .order('due_at', { nullsFirst: false }).limit(8),
    supabase.from('tasks').select('deal_id, contact_id, due_at, title')
      .eq('org_id', orgId).eq('done', false).not('due_at', 'is', null).order('due_at').limit(5000),
    supabase.from('activities').select('*, user:profiles(full_name, email)')
      .eq('org_id', orgId).order('occurred_at', { ascending: false }).limit(8),
  ]);

  type DealZeile = Pick<Deal, 'id' | 'title' | 'value' | 'status' | 'stage_id' | 'pipeline_id' | 'contact_id'>;
  const alleDeals = (deals ?? []) as DealZeile[];
  const acts = (activities ?? []) as Pick<Activity, 'type' | 'subject' | 'occurred_at' | 'outcome'>[];

  // --- Kennzahlen -------------------------------------------------------
  const seit = (a: { occurred_at: string }, d: Date) => new Date(a.occurred_at) >= d;
  const linkedinWoche = acts.filter((a) => a.type === 'linkedin' && !istAntwort(a) && seit(a, wochenStart));
  const linkedinHeute = linkedinWoche.filter((a) => seit(a, heute)).length;
  const anrufeWoche = acts.filter((a) => a.type === 'call' && seit(a, wochenStart));
  const erreichtWoche = anrufeWoche.filter((a) => a.outcome && a.outcome !== 'nicht_erreicht' && a.outcome !== 'mailbox').length;
  const gesendet30 = acts.filter((a) => ['linkedin', 'email'].includes(a.type) && !istAntwort(a)).length;
  const antworten30 = acts.filter((a) => istAntwort(a)).length;

  const faedenPipe = (pipelines ?? []).find((p) => istFaeden(p.name));
  const kaltPipe = (pipelines ?? []).find((p) => istKaltakquise(p.name));
  const offeneFaeden = alleDeals.filter((d) => d.pipeline_id === faedenPipe?.id && d.status === 'offen');
  const faedenSumme = offeneFaeden.reduce((s, d) => s + Number(d.value || 0), 0);

  // Naechste Wiedervorlage je Deal (oder am Kontakt)
  const wvDeal = new Map<string, { due_at: string; title: string }>();
  const wvKontakt = new Map<string, { due_at: string; title: string }>();
  for (const t of offeneWv ?? []) {
    const w = { due_at: t.due_at as string, title: t.title as string };
    if (t.deal_id) { if (!wvDeal.has(t.deal_id)) wvDeal.set(t.deal_id, w); }
    else if (t.contact_id && !wvKontakt.has(t.contact_id)) wvKontakt.set(t.contact_id, w);
  }
  const wvVon = (d: DealZeile) => wvDeal.get(d.id) ?? (d.contact_id ? wvKontakt.get(d.contact_id) : undefined) ?? null;
  const faedenListe = offeneFaeden
    .map((d) => ({ ...d, wv: wvVon(d) }))
    .sort((a, b) => (a.wv?.due_at ?? '0').localeCompare(b.wv?.due_at ?? '0'));
  const ohneDatum = faedenListe.filter((d) => !d.wv).length;

  // --- Ansprachen der letzten 14 Tage -----------------------------------
  const ansprachen = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(tag14.getTime() + i * 86400000);
    const amTag = acts.filter((a) => new Date(a.occurred_at).toDateString() === d.toDateString() && !istAntwort(a));
    return {
      tag: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      linkedin: amTag.filter((a) => a.type === 'linkedin').length,
      anruf: amTag.filter((a) => a.type === 'call').length,
      mail: amTag.filter((a) => a.type === 'email').length,
    };
  });

  // Eigene Schlagzahl: heute, gestern, diese Woche, Schnitt pro Arbeitstag (14 Tage)
  const summe = (t: { linkedin: number; anruf: number; mail: number }) => t.linkedin + t.anruf + t.mail;
  const proTag = ansprachen.map(summe);
  const heuteAnz = proTag[13] ?? 0;
  const gesternAnz = proTag[12] ?? 0;
  const wocheAnz = acts.filter((a) => seit(a, wochenStart) && !istAntwort(a) && ['linkedin', 'call', 'email'].includes(a.type)).length;
  const arbeitstage = Array.from({ length: 14 }, (_, i) => new Date(tag14.getTime() + i * 86400000))
    .filter((d) => d.getDay() !== 0 && d.getDay() !== 6).length;
  const schnitt = arbeitstage ? proTag.reduce((x, y) => x + y, 0) / arbeitstage : 0;

  // --- Kaltakquise je Phase ----------------------------------------------
  const { data: kaltStages } = kaltPipe
    ? await supabase.from('pipeline_stages').select('*').eq('pipeline_id', kaltPipe.id).order('position')
    : { data: [] };
  const kaltDeals = alleDeals.filter((d) => d.pipeline_id === kaltPipe?.id);
  const phasen = ((kaltStages ?? []) as Stage[]).map((s) => ({
    id: s.id, name: s.name, color: s.color,
    anzahl: kaltDeals.filter((d) => d.stage_id === s.id).length,
    erklaerung: PHASEN_ERKLAERUNG[s.name.trim().toLowerCase()] ?? '',
  }));
  const maxPhase = Math.max(1, ...phasen.map((p) => p.anzahl));

  // Aufgaben, die nur am Deal haengen, bekommen den Kontakt des Deals
  type AufgabeRoh = Parameters<typeof TaskList>[0]['tasks'][number] & {
    deal: { id: string; title: string; contact?: Parameters<typeof TaskList>[0]['tasks'][number]['contact'] } | null;
  };
  const meineAufgaben = ((tasks ?? []) as AufgabeRoh[]).map((t) => ({ ...t, contact: t.contact ?? t.deal?.contact ?? null }));

  return (
    <>
      <PageHeader
        title={`Hallo ${profile.full_name?.split(' ')[0] ?? ''}`.trim()}
        subtitle="Was diese Woche passiert ist und was ansteht"
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="LinkedIn diese Woche" value={String(linkedinWoche.length)} hint={`${linkedinHeute} heute`} />
          <Stat label="Anrufe diese Woche" value={String(anrufeWoche.length)} hint={`${erreichtWoche} erreicht`} />
          <Stat label="Antworten (30 Tage)" value={String(antworten30)}
                hint={gesendet30 ? `${pct((antworten30 / gesendet30) * 100)} von ${gesendet30} Nachrichten` : 'noch keine Nachrichten'} tone="win" />
          <Stat label="Offene Fäden" value={eur(faedenSumme)}
                hint={`${offeneFaeden.length} Fäden${ohneDatum ? ` · ${ohneDatum} ohne Datum` : ''}`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Deine nächsten Aufgaben</h2>
              <Link href="/aufgaben" className="text-xs text-brand hover:underline">Alle Aufgaben</Link>
            </div>
            <TaskList tasks={meineAufgaben} showContext groupBy="zeit" oeffnetKontakt />
          </div>

          <div className="card p-4">
            <h2 className="mb-1 text-sm font-semibold">Deine Akquise pro Tag</h2>
            <p className="mb-3 text-xs text-muted">Gesendete Nachrichten und Anrufe der letzten 14 Tage, ohne Antworten</p>
            <dl className="mb-3 grid grid-cols-4 gap-2 text-center">
              {[
                ['Heute', String(heuteAnz)],
                ['Gestern', String(gesternAnz)],
                ['Diese Woche', String(wocheAnz)],
                ['Ø Arbeitstag', schnitt.toLocaleString('de-DE', { maximumFractionDigits: 1 })],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 px-2 py-1.5">
                  <dt className="text-[11px] text-muted">{k}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <AnsprachenChart data={ansprachen} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Kaltakquise – wo stehen die Firmen?</h2>
              {kaltPipe && <Link href={`/pipelines?p=${kaltPipe.id}`} className="text-xs text-brand hover:underline">Zur Kaltakquise</Link>}
            </div>
            <ul className="space-y-2.5">
              {phasen.map((p) => (
                <li key={p.id}>
                  <Link href={`/pipelines?p=${kaltPipe!.id}&s=${p.id}`} className="block rounded-md hover:bg-surface-2/60">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span><span className="font-medium">{p.name}</span>
                        {p.erklaerung && <span className="text-xs text-muted"> · {p.erklaerung}</span>}</span>
                      <span className="tabular-nums">{p.anzahl}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${(p.anzahl / maxPhase) * 100}%`, background: p.color }} />
                    </div>
                  </Link>
                </li>
              ))}
              {phasen.length === 0 && <li className="text-sm text-muted">Keine Pipeline „Kaltakquise“ gefunden.</li>}
            </ul>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Offene Fäden</h2>
              {faedenPipe && <Link href={`/pipelines?p=${faedenPipe.id}`} className="text-xs text-brand hover:underline">Zu den Fäden</Link>}
            </div>
            {faedenListe.length ? (
              <ul className="divide-y divide-line">
                {faedenListe.map((d) => (
                  <li key={d.id}>
                    <Link href={`/pipelines?p=${d.pipeline_id}&open=${d.contact_id ?? ''}`}
                          className="flex items-center justify-between gap-3 rounded-md px-1 py-2 hover:bg-surface-2/60">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {d.wv ? <>Nächste Wiedervorlage {dateOnly(d.wv.due_at)} · {d.wv.title}</> : <span className="text-lose">ohne Datum</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">{eur(d.value)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">Keine offenen Fäden.</p>}
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Letzte Aktivitäten</h2>
          <Timeline activities={(letzte ?? []) as Parameters<typeof Timeline>[0]['activities']} />
        </section>
      </div>
    </>
  );
}
