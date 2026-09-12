'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, KanbanSquare, Users, CheckSquare, PhoneCall,
  BarChart3, Settings, Menu, X, PhoneForwarded, Gauge, FileInput,
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/kontakte', label: 'Kontakte', icon: Users },
  { href: '/aufgaben', label: 'Aufgaben', icon: CheckSquare },
  { href: '/dialer', label: 'Power Dialer', icon: PhoneForwarded },
  { href: '/aktivitaeten', label: 'Aktivitäten', icon: PhoneCall },
  { href: '/schlagzahl', label: 'Schlagzahl', icon: Gauge },
  { href: '/formulare', label: 'Lead-Formulare', icon: FileInput },
  { href: '/berichte', label: 'Berichte', icon: BarChart3 },
  { href: '/einstellungen', label: 'Einstellungen', icon: Settings },
];

export default function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <nav className="flex flex-col gap-0.5 p-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              active ? 'bg-brand-soft text-brand font-medium' : 'text-muted hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <Icon size={17} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <button
        className="btn-ghost fixed left-3 top-3 z-50 md:hidden"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r border-line bg-surface
                    transition-transform md:translate-x-0 md:static
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-4 md:py-[18px] pl-14 md:pl-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
            VS
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{orgName}</div>
            <div className="text-[11px] text-muted">Vertriebssuite</div>
          </div>
        </div>
        {links}
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}
    </>
  );
}
