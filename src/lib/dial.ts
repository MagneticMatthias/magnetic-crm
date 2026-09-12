'use client';

import { useSyncExternalStore } from 'react';

/**
 * Welche App beim Klick auf eine Telefonnummer aufgeht, entscheidet das
 * Betriebssystem anhand des Link-Schemas. Manche Softphones reagieren nur
 * auf callto: oder sip: - deshalb ist das Schema je Browser einstellbar.
 */
export type DialScheme = 'tel' | 'callto' | 'sip';

export const DIAL_SCHEMES: { value: DialScheme; label: string; hint: string }[] = [
  { value: 'tel', label: 'tel: (Standard)', hint: 'FaceTime, iPhone-Kopplung, die meisten Apps' },
  { value: 'callto', label: 'callto:', hint: 'z. B. Microsoft Teams, Skype, einige Softphones' },
  { value: 'sip', label: 'sip:', hint: 'SIP-Softphones wie Zoiper, Linphone, Bria' },
];

const KEY = 'magnetic-crm:dial-scheme';
const listeners = new Set<() => void>();

export function getDialScheme(): DialScheme {
  if (typeof window === 'undefined') return 'tel';
  try {
    const v = localStorage.getItem(KEY);
    return v === 'callto' || v === 'sip' ? v : 'tel';
  } catch { return 'tel'; }
}

export function setDialScheme(scheme: DialScheme) {
  try { localStorage.setItem(KEY, scheme); } catch { /* kein localStorage */ }
  listeners.forEach((l) => l());
}

export function useDialScheme(): DialScheme {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getDialScheme,
    () => 'tel',
  );
}

/** Link fuer eine Telefonnummer im aktuell gewaehlten Schema. */
export function dialHref(phone: string | null | undefined, scheme: DialScheme = getDialScheme()): string | undefined {
  if (!phone) return undefined;
  const clean = phone.replace(/[^\d+]/g, '');
  if (scheme === 'sip') return `sip:${clean}`;
  return `${scheme}:${clean}`;
}
