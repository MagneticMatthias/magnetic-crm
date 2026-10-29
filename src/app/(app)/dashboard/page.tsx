import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { PageHeader } from '@/components/ui';
import { AnsprachenChart } from '@/components/Charts';
import TaskList from '@/components/TaskList';
import { pct } from '@/lib/format';
import { nowDate } from '@/lib/clock';
import { akquiseAuswerten, ansprachen, VERGLEICH, type Zahlen, type Zeitraum } from '@/lib/akquise';

const ZEITRAEUME: { key: Zeitraum; label: string }[] = [
  { key: 'heute', label: 'Heute' },
  { key: 'woche', label: 'Woche' },
  { key: 'monat', label: 'Monat' },
  { key: 'jahr', label: 'Jahr' },
];

/** Zahl mit Vergleich zum vorigen Zeitraum */
function Kachel({ label, wert, vor, vergleich, farbe, gross }: {
  label: string; wert: number; vor: number; vergleich: string; farbe?: string; gross?: boolean;
}) {
  const diff = wert - vor;
  return (
    <div className={`rounded-xl border border-line bg-surface p-3.5 ${gross ? 'sm:col-span-2' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {farbe && <span className="h-2.5 w-2.5 rounded-full" style={{ background: farbe }} />}
        {label}
      </div>
      <div className={`mt-1 font-semibold tabular-nums ${gross ? 'text-4xl' : 'text-2xl'}`}>{wert}</div>
      <div className="mt-0.5 text-xs text-muted">
        {vergleich}: {vor}
        {diff !== 0 && <span className={diff > 0 ? 'text-win' : 'text-lose'}> ({diff > 0 ? '+' : ''}{diff})</span>}
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: { searchParams: Promise<{ z?: string }> }) {
  const { z } = await searchParams;
  const zr: Zeitraum = (['heute', 'woche', 'monat', 'jahr'] as const).includes(z as Zeitraum) ? (z as Zeitraum) : 'woche';
  const { supabase, orgId, profile } = await ctx();

  const [auswertung, { data: tasks }] = await Promise.all([
    akquiseAuswerten(supabase, orgId, zr, nowDate()),
    supabase.from('tasks').select('*, deal:deals(id, title, contact:contacts(id, company, persons:contact_persons(first_name, last_name, is_primary))), contact:contacts(id, company, persons:contact_persons(first_name, last_name, is_primary))')
      .eq('org_id', orgId).eq('assignee_id', profile.id).eq('done', false)
      .order('due_at', { nullsFirst: false }).limit(10),
  ]);
  const { jetzt: j, vor: v, reihe, arbeitstage } = auswertung;
  const vergleich = VERGLEICH[zr];
  const nachrichten = (x: Zahlen) => x.inmail + x.anfrage + x.email;
  const schnitt = arbeitstage ? ansprachen(j) / arbeitstage : 0;

  // Aufgaben, die nur am Deal haengen, bekommen den Kontakt des Deals
  type AufgabeRoh = Parameters<typeof TaskList>[0]['tasks'][number] & {
    deal: { id: string; title: string; contact?: Parameters<typeof TaskList>[0]['tasks'][number]['contact'] } | null;
  };
  const meineAufgaben = ((tasks ?? []) as AufgabeRoh[]).map((t) => ({ ...t, contact: t.contact ?? t.deal?.contact ?? null }));

  return (
    <>
      <PageHeader
        title={`Hallo ${profile.full_name?.split(' ')[0] ?? ''}`.trim()}
        subtitle="Wie viel Akquise du gemacht hast und was dabei herauskommt"
      />

      <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Kern: die eigene Akquise */}
        <section className="card space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Deine Akquise</h2>
            <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
              {ZEITRAEUME.map((t) => (
                <Link key={t.key} href={`/dashboard?z=${t.key}`}
                      className={`rounded-lg px-3 py-1.5 text-[13px] transition ${zr === t.key ? 'bg-surface font-medium text-brand shadow-sm' : 'text-ink/80 hover:text-ink'}`}>
                  {t.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Angesprochen</h3>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kachel gross label="Ansprachen gesamt" wert={ansprachen(j)} vor={ansprachen(v)} vergleich={vergleich} />
              <Kachel label="LinkedIn InMails" wert={j.inmail} vor={v.inmail} vergleich={vergleich} farbe="var(--kanal-linkedin)" />
              <Kachel label="Kontaktanfragen" wert={j.anfrage} vor={v.anfrage} vergleich={vergleich} farbe="var(--kanal-linkedin)" />
              <Kachel label="E-Mails" wert={j.email} vor={v.email} vergleich={vergleich} farbe="var(--kanal-mail)" />
              <Kachel label="Anrufe" wert={j.anrufe} vor={v.anrufe} vergleich={vergleich} farbe="var(--kanal-anruf)" />
            </div>
            <p className="mt-2 text-xs text-muted">
              Ø {schnitt.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Ansprachen pro Arbeitstag
              {j.anrufe > 0 && <> · {j.erreicht} von {j.anrufe} Anrufen erreicht ({pct((j.erreicht / j.anrufe) * 100)})</>}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Ergebnis</h3>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kachel label="Antworten" wert={j.antworten} vor={v.antworten} vergleich={vergleich} />
              <Kachel label="Interesse" wert={j.interesse} vor={v.interesse} vergleich={vergleich} />
              <Kachel label="Nicht jetzt" wert={j.nichtJetzt} vor={v.nichtJetzt} vergleich={vergleich} />
              <Kachel label="Kein Interesse" wert={j.keinInteresse} vor={v.keinInteresse} vergleich={vergleich} />
              <Kachel label="Neue Fäden" wert={j.neueFaeden} vor={v.neueFaeden} vergleich={vergleich} />
              <Kachel label="Aufträge" wert={j.auftraege} vor={v.auftraege} vergleich={vergleich} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {nachrichten(j)
                ? <>Antwortquote: {pct((j.antworten / nachrichten(j)) * 100)} auf {nachrichten(j)} Nachrichten</>
                : 'Noch keine Nachrichten in diesem Zeitraum.'}
            </p>
          </div>

          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {zr === 'jahr' ? 'Pro Monat' : zr === 'monat' ? 'Pro Tag in diesem Monat' : 'Pro Tag, letzte 14 Tage'}
            </h3>
            <AnsprachenChart data={reihe} />
          </div>
        </section>

        <section className="card h-fit p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Deine nächsten Aufgaben</h2>
            <Link href="/aufgaben" className="text-xs text-brand hover:underline">Alle Aufgaben</Link>
          </div>
          <TaskList tasks={meineAufgaben} showContext groupBy="zeit" oeffnetKontakt />
        </section>
      </div>
    </>
  );
}
