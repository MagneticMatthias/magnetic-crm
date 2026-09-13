'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, Users, ListTree, BarChart3, FileInput, Settings,
  Menu, X, PhoneForwarded, CheckSquare, Gauge, PhoneCall, Upload, Euro,
} from 'lucide-react';
import { initials } from '@/lib/format';
import type { Pipeline } from '@/lib/types';

type Item = { href: string; label: string; icon: typeof Users };

const SECTIONS: { title: string; items: Item[] }[] = [
  { title: 'Home', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Vertrieb',
    items: [
      { href: '/kontakte', label: 'Kontakte', icon: Users },
      { href: '/pipelines', label: 'Pipelines', icon: ListTree },
      { href: '/dialer', label: 'Power Dialer', icon: PhoneForwarded },
      { href: '/aufgaben', label: 'Aufgaben', icon: CheckSquare },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { href: '/umsaetze', label: 'Umsätze', icon: Euro },
      { href: '/sales-controlling', label: 'Sales-Controlling', icon: BarChart3 },
      { href: '/aktivitaeten', label: 'Aktivitäten', icon: PhoneCall },
      { href: '/schlagzahl', label: 'Schlagzahl', icon: Gauge },
    ],
  },
  { title: 'Inhalte', items: [
    { href: '/formulare', label: 'Formulare', icon: FileInput },
    { href: '/import', label: 'CSV-Import', icon: Upload },
  ] },
  { title: 'System', items: [{ href: '/einstellungen', label: 'Einstellungen', icon: Settings }] },
];

export default function Sidebar({
  orgName, userName, pipelines,
}: { orgName: string; userName: string; pipelines: Pipeline[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const activePipeline = params.get('p');
  const onPipelines = pathname.startsWith('/pipelines');

  return (
    <>
      <button
        className="fixed left-3 top-3 z-50 grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface md:hidden"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col border-r border-line bg-surface
                    transition-transform md:static md:translate-x-0
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-2 px-5 pb-3 pt-5 pl-14 md:pl-5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand to-indigo-500 text-[13px] font-bold text-white">
            M
          </span>
          <span className="text-[15px] font-bold tracking-tight">Magnetic_CRM</span>
        </div>

        <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
            {initials(userName)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight">{userName}</span>
            <span className="block truncate text-[11px] text-muted">{orgName}</span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mt-4 first:mt-1">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {section.title}
              </p>

              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/');
                return (
                  <div key={href}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] transition ${
                        active ? 'bg-brand-soft font-medium text-brand' : 'text-ink/80 hover:bg-surface-2'
                      }`}
                    >
                      <Icon size={16} aria-hidden />
                      {label}
                    </Link>

                    {href === '/pipelines' && onPipelines && pipelines.length > 0 && (
                      <div className="ml-[15px] mt-0.5 border-l border-line pl-3">
                        {pipelines.map((pl, i) => {
                          const current = activePipeline ? pl.id === activePipeline : i === 0;
                          return (
                            <Link
                              key={pl.id}
                              href={`/pipelines?p=${pl.id}`}
                              onClick={() => setOpen(false)}
                              className={`block truncate rounded-md px-2 py-1.5 text-[13px] transition ${
                                current ? 'font-medium text-brand' : 'text-muted hover:text-ink'
                              }`}
                            >
                              {pl.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
