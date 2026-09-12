'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { contactName } from '@/lib/format';

type Hit = { kind: 'contact' | 'deal'; id: string; primary: string; secondary: string };

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        box.current?.querySelector('input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const term = q.trim();

    const timer = setTimeout(async () => {
      if (term.length < 2) {
        setHits([]);
        setOpen(false);
        return;
      }
      const supabase = createClient();
      const like = `%${term}%`;
      const [contacts, deals] = await Promise.all([
        supabase.from('contacts')
          .select('id, first_name, last_name, company, email')
          .or(`first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like},email.ilike.${like}`)
          .limit(5),
        supabase.from('deals').select('id, title, value').ilike('title', like).limit(5),
      ]);

      setHits([
        ...(contacts.data ?? []).map((c) => ({
          kind: 'contact' as const, id: c.id, primary: contactName(c), secondary: c.company || c.email || 'Kontakt',
        })),
        ...(deals.data ?? []).map((d) => ({
          kind: 'deal' as const, id: d.id, primary: d.title, secondary: 'Deal',
        })),
      ]);
      setOpen(true);
    }, 220);

    return () => clearTimeout(timer);
  }, [q]);

  function go(hit: Hit) {
    setOpen(false);
    setQ('');
    router.push(hit.kind === 'contact' ? `/kontakte/${hit.id}` : `/deals/${hit.id}`);
  }

  return (
    <div className="relative w-full max-w-md" ref={box}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        className="input pl-9"
        placeholder="Kontakte und Deals suchen …"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        aria-label="Suche"
      />
      {open && hits.length > 0 && (
        <div className="card absolute left-0 right-0 top-full mt-1.5 p-1.5 shadow-lg z-50">
          {hits.map((h) => (
            <button key={`${h.kind}-${h.id}`} onClick={() => go(h)}
                    className="flex w-full flex-col items-start rounded-md px-2.5 py-2 text-left hover:bg-surface-2">
              <span className="text-sm">{h.primary}</span>
              <span className="text-xs text-muted">{h.secondary}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
