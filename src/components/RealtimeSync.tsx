'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Users } from 'lucide-react';

/**
 * Echtzeit-Zusammenarbeit: horcht auf Aenderungen an Deals, Aktivitaeten,
 * Aufgaben und Kontakten und laedt die Server Components neu. Zusaetzlich
 * zeigt ein Presence-Channel, wer gerade mit im CRM arbeitet.
 */
export default function RealtimeSync({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [online, setOnline] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const data = supabase
      .channel('crm-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, refresh)
      .subscribe();

    const presence = supabase.channel('crm-presence', { config: { presence: { key: userId } } });
    presence
      .on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState<{ name: string }>();
        const names = Object.values(state)
          .flat()
          .map((p) => p.name)
          .filter((n, i, arr) => n && arr.indexOf(n) === i);
        setOnline(names);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') presence.track({ name });
      });

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(data);
      supabase.removeChannel(presence);
    };
  }, [router, userId, name]);

  const others = online.filter((n) => n !== name);
  if (others.length === 0) return null;

  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex"
          title={`Gerade online: ${online.join(', ')}`}>
      <Users size={14} />
      {others.length === 1 ? `${others[0]} ist online` : `${others.length} Kollegen online`}
    </span>
  );
}
