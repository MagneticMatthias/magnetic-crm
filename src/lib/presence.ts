'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createClient } from './supabase/client';

export type PresenceUser = { id: string; name: string; color: string; viewing: string | null };

const COLORS = ['#a855f7', '#22c55e', '#f59e0b', '#0ea5e9', '#ef4444', '#ec4899'];
export const colorFor = (id: string) =>
  COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

type State = { me: { id: string; name: string } | null; viewing: string | null; others: PresenceUser[] };
let state: State = { me: null, viewing: null, others: [] };
const listeners = new Set<() => void>();
let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;

const emit = () => listeners.forEach((l) => l());
const track = () => {
  if (!channel || !state.me) return;
  channel.track({ name: state.me.name, viewing: state.viewing, color: colorFor(state.me.id) });
};

/** Einmalig im Layout: verbindet den Presence-Kanal. */
export function connectPresence(me: { id: string; name: string }) {
  if (channel) return () => {};
  state = { ...state, me };
  const supabase = createClient();
  const ch = supabase.channel('crm-presence', { config: { presence: { key: me.id } } });
  channel = ch;
  ch.on('presence', { event: 'sync' }, () => {
    const raw = ch.presenceState<{ name: string; viewing: string | null; color: string }>();
    const others: PresenceUser[] = Object.entries(raw)
      .filter(([id]) => id !== me.id)
      .map(([id, list]) => ({ id, name: list[0]?.name ?? 'Kollege', color: list[0]?.color ?? colorFor(id), viewing: list[0]?.viewing ?? null }));
    state = { ...state, others };
    emit();
  }).subscribe((status) => { if (status === 'SUBSCRIBED') track(); });
  return () => { supabase.removeChannel(ch); channel = null; };
}

/** Meldet, welchen Datensatz der Nutzer gerade offen hat. */
export function setViewing(rowId: string | null) {
  if (state.viewing === rowId) return;
  state = { ...state, viewing: rowId };
  track();
  emit();
}

export function usePresence(): PresenceUser[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state.others,
    () => [],
  );
}

export function useViewing(rowId: string | null) {
  useEffect(() => {
    setViewing(rowId);
    return () => setViewing(null);
  }, [rowId]);
}
