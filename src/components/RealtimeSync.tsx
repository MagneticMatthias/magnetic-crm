'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { connectPresence, usePresence } from '@/lib/presence';
import { initials } from '@/lib/format';

/**
 * Echtzeit-Zusammenarbeit: Datenaenderungen laden die Server Components neu,
 * Presence zeigt Kollegen und den Datensatz, den sie gerade offen haben.
 */
export default function RealtimeSync({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const others = usePresence();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => router.refresh(), 400); };

    const data = supabase.channel('crm-changes');
    ['deals', 'activities', 'tasks', 'contacts', 'contact_persons', 'notes'].forEach((table) =>
      data.on('postgres_changes', { event: '*', schema: 'public', table }, refresh));
    data.subscribe();

    const disconnect = connectPresence({ id: userId, name });
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(data); disconnect(); };
  }, [router, userId, name]);

  if (others.length === 0) return null;

  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex" title={`Online: ${others.map((o) => o.name).join(', ')}`}>
      <span className="flex -space-x-1.5">
        {others.slice(0, 4).map((o) => (
          <span key={o.id} className="grid h-6 w-6 place-items-center rounded-full border-2 border-surface text-[10px] font-semibold text-white"
                style={{ background: o.color }}>{initials(o.name)}</span>
        ))}
      </span>
      <Users size={13} /> {others.length === 1 ? `${others[0].name} ist online` : `${others.length} online`}
    </span>
  );
}
