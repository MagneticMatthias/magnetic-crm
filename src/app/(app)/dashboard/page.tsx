import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { PageHeader } from '@/components/ui';
import { AnsprachenChart } from '@/components/Charts';
import TaskList from '@/components/TaskList';
import AkquiseKacheln from '@/components/dashboard/AkquiseKacheln';
import { nowDate } from '@/lib/clock';
import { akquiseAuswerten, ansprachen, VERGLEICH, type Zeitraum } from '@/lib/akquise';

const ZEITRAEUME: { key: Zeitraum; label: string }[] = [
  { key: 'heute', label: 'Heute' },
  { key: 'woche', label: 'Woche' },
  { key: 'monat', label: 'Monat' },
  { key: 'jahr', label: 'Jahr' },
];

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
      .order('due_at', { nullsFirst: false }).limit(6),
  ]);
  const { jetzt: j, vor: v, reihe, arbeitstage } = auswertung;
  const vergleich = VERGLEICH[zr];
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

      {/* Handy: Zahlen, dann Aufgaben, dann Diagramm. Breiter Bildschirm: Zahlen
          und Diagramm links, Aufgaben rechts daneben. */}
      <div className="grid gap-4 p-3 sm:gap-6 sm:p-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card p-3 sm:p-5 xl:col-start-1 xl:row-start-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
            <h2 className="text-base font-semibold">Deine Akquise</h2>
            <div className="grid w-full grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1 sm:w-auto">
              {ZEITRAEUME.map((t) => (
                <Link key={t.key} href={`/dashboard?z=${t.key}`}
                      className={`rounded-lg px-3 py-1.5 text-center text-[13px] transition ${zr === t.key ? 'bg-surface font-medium text-brand shadow-sm' : 'text-ink/80 hover:text-ink'}`}>
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
          <AkquiseKacheln j={j} v={v} vergleich={vergleich} schnitt={schnitt} />
        </section>

        <section className="card h-fit p-3 sm:p-4 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Deine nächsten Aufgaben</h2>
            <Link href="/aufgaben" className="text-xs text-brand hover:underline">Alle Aufgaben</Link>
          </div>
          <TaskList tasks={meineAufgaben} showContext groupBy="zeit" oeffnetKontakt />
        </section>

        <section className="card p-3 sm:p-5 xl:col-start-1 xl:row-start-2">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {zr === 'jahr' ? 'Pro Monat' : zr === 'monat' ? 'Pro Tag in diesem Monat' : 'Pro Tag, letzte 14 Tage'}
          </h3>
          <AnsprachenChart data={reihe} />
        </section>
      </div>
    </>
  );
}
