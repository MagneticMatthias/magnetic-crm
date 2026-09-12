'use client';

import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
import { initials } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/labels';
import type { UserRole } from '@/lib/types';

export default function UserMenu({
  name, role, signOutAction,
}: { name: string; role: UserRole; signOutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost !px-2" onClick={() => setOpen(!open)}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">
          {initials(name)}
        </span>
        <span className="hidden sm:inline max-w-[12ch] truncate">{name}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="card absolute right-0 mt-2 w-56 p-1.5 shadow-lg z-50">
          <div className="px-2.5 py-2">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="text-xs text-muted">{ROLE_LABEL[role]}</div>
          </div>
          <form action={signOutAction}>
            <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink hover:bg-surface-2">
              <LogOut size={15} /> Abmelden
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
