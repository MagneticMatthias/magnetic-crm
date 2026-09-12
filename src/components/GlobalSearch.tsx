'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { personName } from '@/lib/format';

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
      const [companies, persons, deals] = await Promise.all([
        supabase.from('contacts').select('id, company, city')
          .or(`company.ilike.${like},website.ilike.${like}`).limit(5),
        supabase.from('contact_persons').select('contact_id, first_name, last_name, email, company:contacts(company)')
          .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(5),
        supabase.from('deals').select('id, title, pipeline_id, contact_id').ilike('title', like).limit(5),
      ]);

      const seen = new Set<string>();
      const hits: Hit[] = [];
      (companies.data ?? []).forEach((c) => {
        if (seen.has(c.id)) return;
        seen.add(c.id);
        hits.push({ kind: 'contact', id: c.id, primary: c.company ?? 'Kontakt', secondary: c.city || 'Firma' });
      });
      (persons.data ?? []).forEach((p) => {
        if (seen.has(p.contact_id)) return;
        seen.add(p.contact_id);
        const company = (p.company as unknown as { company: string | null } | null)?.company;
        hits.push({
          kind: 'contact', id: p.contact_id,
          primary: personName(p) || p.email || 'Person', secondary: company || p.email || 'Ansprechpartner',
        });
      });
      (deals.data ?? []).forEach((d) => {
        hits.push({
          kind: 'deal', id: `${d.pipeline_id}|${d.contact_id ?? ''}`, primary: d.title, secondary: 'Deal',
        });
      });
      setHits(hits);
      setOpen(true);
    }, 220);

    return () => clearTimeout(timer);
  }, [q]);

  function go(hit: Hit) {
    setOpen(false);
    setQ('');
    if (hit.kind === 'contact') {
      router.push(`/kontakte?open=${hit.id}`);
    } else {
      const [pipelineId, contactId] = hit.id.split('|');
      router.push(`/pipelines?p=${pipelineId}${contactId ? `&open=${contactId}` : ''}`);
    }
  }

  return (
    <div className="relative w-full max-w-md" ref={box}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        className="input rounded-full bg-surface-2 pl-9 pr-12"
        placeholder="Suche"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        aria-label="Suche"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">⌘K</kbd>
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
