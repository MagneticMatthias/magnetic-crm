import { ctx } from '@/lib/ctx';
import { PageHeader, Stat } from '@/components/ui';
import { saveGoals } from '@/app/actions/goals';
import { CallsChart } from '@/components/Charts';
import { REACHED_OUTCOMES } from '@/lib/labels';
import { pct, num, duration } from '@/lib/format';
import { nowMs, nowDate } from '@/lib/clock';
import type { Activity, ActivityGoal, Profile } from '@/lib/types';

function GoalBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const share = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const color = share >= 100 ? 'var(--win)' : share >= 60 ? 'var(--brand)' : 'var(--warn)';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{num(value)} / {num(goal)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: color }} />
      </div>
    </div>
  );
}

export default async function SchlagzahlPage() {
  const { supabase, orgId, profile } = await ctx();

  const start = nowDate();
  start.setHours(0, 0, 0, 0);
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Montag
  const chartStart = new Date(nowMs() - 13 * 86400000);
  chartStart.setHours(0, 0, 0, 0);

  const [{ data: activities }, { data: team }, { data: goals }] = await Promise.all([
    supabase.from('activities').select('*')
      .eq('org_id', orgId).eq('type', 'call')
      .gte('occurred_at', chartStart.toISOString()).limit(5000),
    supabase.from('profiles').select('*').eq('org_id', orgId).eq('active', true),
    supabase.from('activity_goals').select('*').eq('org_id', orgId),
  ]);

  const calls = (activities ?? []) as Activity[];
  const teamList = (team ?? []) as Profile[];
  const goalList = (goals ?? []) as ActivityGoal[];

  const myGoal = goalList.find((g) => g.user_id === profile.id)
    ?? { calls_per_day: 60, conversations_per_day: 15, appointments_per_week: 10 };

  const isToday = (a: Activity) => new Date(a.occurred_at) >= start;
  const isThisWeek = (a: Activity) => new Date(a.occurred_at) >= weekStart;
  const reached = (a: Activity) => a.outcome && REACHED_OUTCOMES.includes(a.outcome);

  const mine = calls.filter((a) => a.user_id === profile.id);
  const myToday = mine.filter(isToday);
  const myWeek = mine.filter(isThisWeek);

  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(chartStart.getTime() + i * 86400000);
    const dayCalls = mine.filter((a) => new Date(a.occurred_at).toDateString() === d.toDateString());
    return {
      tag: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      calls: dayCalls.length,
      erreicht: dayCalls.filter(reached).length,
    };
  });

  const board = teamList.map((p) => {
    const userCalls = calls.filter((a) => a.user_id === p.id);
    const today = userCalls.filter(isToday);
    const week = userCalls.filter(isThisWeek);
    const goal = goalList.find((g) => g.user_id === p.id);
    return {
      id: p.id,
      name: p.full_name || p.email || '–',
      heute: today.length,
      ziel: goal?.calls_per_day ?? 60,
      gespraeche: today.filter(reached).length,
      termineWoche: week.filter((a) => a.outcome === 'termin_vereinbart').length,
      zeit: week.reduce((a, c) => a + (c.duration_seconds ?? 0), 0),
    };
  }).sort((a, b) => b.heute - a.heute);

  return (
    <>
      <PageHeader title="Schlagzahl"
                  subtitle="Aktivität gegen Tages- und Wochenziele – für dich und das Team" />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Calls heute" value={String(myToday.length)} hint={`Ziel ${myGoal.calls_per_day}`} />
          <Stat label="Gespräche heute" value={String(myToday.filter(reached).length)}
                hint={`Ziel ${myGoal.conversations_per_day}`} tone="win" />
          <Stat label="Termine diese Woche"
                value={String(myWeek.filter((a) => a.outcome === 'termin_vereinbart').length)}
                hint={`Ziel ${myGoal.appointments_per_week}`} tone="warn" />
          <Stat label="Kontaktquote heute"
                value={myToday.length ? pct((myToday.filter(reached).length / myToday.length) * 100) : '–'} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold">Deine Zielerreichung</h2>
            <GoalBar label="Calls heute" value={myToday.length} goal={myGoal.calls_per_day} />
            <GoalBar label="Gespräche heute" value={myToday.filter(reached).length}
                     goal={myGoal.conversations_per_day} />
            <GoalBar label="Termine diese Woche"
                     value={myWeek.filter((a) => a.outcome === 'termin_vereinbart').length}
                     goal={myGoal.appointments_per_week} />

            <form action={saveGoals} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
              <div>
                <label className="label" htmlFor="calls_per_day">Calls/Tag</label>
                <input id="calls_per_day" name="calls_per_day" className="input" inputMode="numeric"
                       defaultValue={myGoal.calls_per_day} />
              </div>
              <div>
                <label className="label" htmlFor="conversations_per_day">Gespräche/Tag</label>
                <input id="conversations_per_day" name="conversations_per_day" className="input"
                       inputMode="numeric" defaultValue={myGoal.conversations_per_day} />
              </div>
              <div>
                <label className="label" htmlFor="appointments_per_week">Termine/Woche</label>
                <input id="appointments_per_week" name="appointments_per_week" className="input"
                       inputMode="numeric" defaultValue={myGoal.appointments_per_week} />
              </div>
              <div className="flex items-end">
                <button className="btn-ghost w-full">Ziele speichern</button>
              </div>
            </form>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Deine Schlagzahl, 14 Tage</h2>
            <CallsChart data={daily} />
          </div>
        </div>

        <div className="card overflow-x-auto">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Team heute</h2>
          <table className="w-full min-w-[620px]">
            <thead className="border-b border-line bg-surface-2/50">
              <tr>
                <th className="th">Mitarbeiter</th>
                <th className="th">Calls heute</th>
                <th className="th">Zielerreichung</th>
                <th className="th">Gespräche</th>
                <th className="th">Termine (Woche)</th>
                <th className="th">Gesprächszeit (Woche)</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="td font-medium">{r.name}</td>
                  <td className="td tabular-nums">{num(r.heute)}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full"
                             style={{
                               width: `${Math.min(100, r.ziel ? (r.heute / r.ziel) * 100 : 0)}%`,
                               background: r.heute >= r.ziel ? 'var(--win)' : 'var(--brand)',
                             }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted">
                        {r.ziel ? pct((r.heute / r.ziel) * 100) : '–'}
                      </span>
                    </div>
                  </td>
                  <td className="td tabular-nums">{num(r.gespraeche)}</td>
                  <td className="td tabular-nums">{num(r.termineWoche)}</td>
                  <td className="td tabular-nums text-muted">{duration(r.zeit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
