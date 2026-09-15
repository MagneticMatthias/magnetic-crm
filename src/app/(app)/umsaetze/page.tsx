import Link from 'next/link';
import { ctx } from '@/lib/ctx';

import { ShareDonut, YearBars, seriesColor } from '@/components/Charts';
import { eur, pct, dateOnly } from '@/lib/format';
import type { Deal } from '@/lib/types';

type Row = Deal & { contact: { id: string; company: string | null } | null };

export default async function UmsaetzePage({
  searchParams,
}: { searchParams: Promise<{ jahr?: string; kunde?: string }> }) {
  const { jahr, kunde } = await searchParams;
  const { supabase, orgId } = await ctx();

  const { data } = await supabase
    .from('deals')
    .select('*, contact:contacts(id, company)')
    .eq('org_id', orgId)
    .eq('status', 'gewonnen')
    .order('won_at', { ascending: false })
    .limit(5000);

  const all = ((data ?? []) as Row[]).map((d) => ({
    ...d,
    date: d.won_at ?? d.created_at,
    year: new Date(d.won_at ?? d.created_at).getFullYear(),
    customer: d.contact?.company ?? 'Ohne Kunde',
    customerId: d.contact?.id ?? '',
  }));

  const years = [...new Set(all.map((d) => d.year))].sort((a, b) => b - a);
  const customers = [...new Map(all.map((d) => [d.customerId || d.customer, d.customer])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'de'));

  const rows = all.filter((d) =>
    (!jahr || String(d.year) === jahr) && (!kunde || (d.customerId || d.customer) === kunde));

  const total = rows.reduce((a, d) => a + Number(d.value || 0), 0);
  const allTimeTotal = all.reduce((a, d) => a + Number(d.value || 0), 0);

  const byCustomer = [...rows.reduce((m, d) => m.set(d.customer, (m.get(d.customer) ?? 0) + Number(d.value || 0)), new Map<string, number>())]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const byYear = [...all.filter((d) => !kunde || (d.customerId || d.customer) === kunde)
    .reduce((m, d) => m.set(d.year, (m.get(d.year) ?? 0) + Number(d.value || 0)), new Map<number, number>())]
    .map(([y, umsatz]) => ({ jahr: String(y), umsatz }))
    .sort((a, b) => a.jahr.localeCompare(b.jahr));

  const link = (j?: string, k?: string) => {
    const p = new URLSearchParams();
    if (j) p.set('jahr', j);
    if (k) p.set('kunde', k);
    const q = p.toString();
    return `/umsaetze${q ? `?${q}` : ''}`;
  };

  return (
    <div className="space-y-5 p-3 sm:p-7">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold sm:text-2xl">Umsätze</h1>
        <span className="text-sm text-muted">{rows.length} Einträge</span>
      </div>

      {/* Filter */}
      <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <select name="jahr" className="input" defaultValue={jahr ?? ''}>
          <option value="">Jahr – alle</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select name="kunde" className="input" defaultValue={kunde ?? ''}>
          <option value="">Kunde – alle</option>
          {customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <div className="flex gap-2">
          <button className="btn-primary">Anwenden</button>
          {(jahr || kunde) && <Link href="/umsaetze" className="btn-ghost">Zurücksetzen</Link>}
        </div>
      </form>

      {/* Gesamt */}
      <div className="rounded-xl border border-win/30 bg-win/10 p-5">
        <div className="text-xs font-medium text-win">
          Gesamtumsatz{jahr ? ` ${jahr}` : ' (alle Jahre)'}{kunde ? ` · ${customers.find(([id]) => id === kunde)?.[1] ?? ''}` : ''}
        </div>
        <div className="mt-1 text-3xl font-bold tabular-nums text-win">{eur(total)}</div>
        {(jahr || kunde) && <div className="mt-1 text-xs text-muted">Alle Jahre, alle Kunden: {eur(allTimeTotal)}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
            <ShareDonut data={byCustomer.slice(0, 8)} />
            <div>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Anteil pro Kunde</h2>
              <ul className="space-y-2">
                {byCustomer.slice(0, 8).map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: seriesColor(i) }} />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="tabular-nums text-muted">{total ? pct((c.value / total) * 100) : '–'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Umsatz pro Kunde</h2>
          <ul className="space-y-3">
            {byCustomer.map((c, i) => (
              <li key={c.name}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 tabular-nums">{eur(c.value)} <span className="text-muted">· {total ? pct((c.value / total) * 100) : '–'}</span></span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${total ? (c.value / total) * 100 : 0}%`, background: seriesColor(i) }} />
                </div>
              </li>
            ))}
            {byCustomer.length === 0 && <li className="text-sm text-muted">Keine Umsätze im Zeitraum.</li>}
          </ul>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Umsatz pro Jahr</h2>
        <YearBars data={byYear} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {byYear.map((y) => (
            <Link key={y.jahr} href={link(y.jahr === jahr ? undefined : y.jahr, kunde)}
                  className={`chip ${jahr === y.jahr ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted hover:text-ink'}`}>
              {y.jahr} · {eur(y.umsatz)}
            </Link>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="border-b border-line px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Einträge ({rows.length})
        </h2>
        <table className="w-full min-w-[640px]">
          <thead className="bg-surface-2/50">
            <tr>
              <th className="th">Datum</th>
              <th className="th">Kunde</th>
              <th className="th">Auftrag</th>
              <th className="th text-right">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-line hover:bg-surface-2/40">
                <td className="td whitespace-nowrap text-muted">{dateOnly(d.date)}</td>
                <td className="td">
                  {d.contact ? <Link href={`/kontakte?open=${d.contact.id}`} className="hover:text-brand">{d.customer}</Link> : d.customer}
                </td>
                <td className="td">
                  <Link href={`/pipelines?p=${d.pipeline_id}&open=${d.contact_id ?? ''}`} className="hover:text-brand">{d.title}</Link>
                </td>
                <td className="td text-right tabular-nums font-medium">{eur(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
