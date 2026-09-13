'use client';

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { eur, num } from '@/lib/format';

const AXIS = { fontSize: 11, fill: 'var(--muted)' };

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--text)',
};

export function RevenueChart({ data }: { data: { monat: string; umsatz: number; deals: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="monat" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false}
               tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
        <Tooltip contentStyle={tooltipStyle}
                 formatter={(v, name) => (name === 'umsatz' ? eur(Number(v)) : num(Number(v)))} />
        <Bar dataKey="umsatz" fill="var(--brand)" radius={[6, 6, 0, 0]} name="umsatz" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CallsChart({ data }: { data: { tag: string; calls: number; erreicht: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="tag" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="calls" stroke="var(--brand)" strokeWidth={2} dot={false} name="Calls" />
        <Line type="monotone" dataKey="erreicht" stroke="var(--win)" strokeWidth={2} dot={false} name="Erreicht" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function FunnelBars({
  data,
}: { data: { name: string; anzahl: number; wert: number; color: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.anzahl));
  return (
    <div className="space-y-2.5">
      {data.map((s) => (
        <div key={s.name}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate">{s.name}</span>
            <span className="shrink-0 text-muted">
              {num(s.anzahl)} · {eur(s.wert)}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full transition-all"
                 style={{ width: `${(s.anzahl / max) * 100}%`, background: s.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SourceChart({ data }: { data: { quelle: string; umsatz: number; deals: number }[] }) {
  const palette = ['#2f6df6', '#6366f1', '#8b5cf6', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444'];
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false}
               tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
        <YAxis type="category" dataKey="quelle" tick={AXIS} axisLine={false} tickLine={false} width={110} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => eur(Number(v))} />
        <Bar dataKey="umsatz" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const PALETTE = ['#22c55e', '#6366f1', '#eab308', '#ef4444', '#0ea5e9', '#f97316', '#a855f7', '#14b8a6', '#64748b'];
export const seriesColor = (i: number) => PALETTE[i % PALETTE.length];

export function ShareDonut({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2} stroke="none">
          {data.map((_, i) => <Cell key={i} fill={seriesColor(i)} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => eur(Number(v))} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function YearBars({ data }: { data: { jahr: string; umsatz: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="jahr" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => eur(Number(v))} />
        <Bar dataKey="umsatz" fill="var(--brand)" radius={[6, 6, 0, 0]} name="Umsatz"
             label={{ position: 'top', fontSize: 11, fill: 'var(--muted)', formatter: (v: unknown) => (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(1).replace('.0', '')}k` : String(v)) }} />
      </BarChart>
    </ResponsiveContainer>
  );
}
