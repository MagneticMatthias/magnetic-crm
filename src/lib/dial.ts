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

export type PhoneEntry = { label: string | null; number: string };

const SEP = /\s*(?:\/|,|;|\||\r?\n|\boder\b)\s*/i;
const LABEL = /^([A-Za-zÄÖÜäöüß.\-\s]{2,20}?)\s*:\s*(.*)$/;
const ziffern = (s: string) => (s.match(/\d/g) ?? []).length;

/**
 * Ein Feld, mehrere Nummern: "Zentrale: +49 89 1234, Mobil: +49 171 5678".
 * Ohne Aufteilen wuerde alles zu einer unbrauchbaren Nummer verschmelzen.
 *
 * Heikel ist der Schraegstrich, weil er im Deutschen auch Vorwahl und
 * Anschluss trennt ("089 / 123456"). Ein Teilstueck gilt deshalb nur dann
 * als eigene Nummer, wenn es selbst mit + oder 0 beginnt und die vorherige
 * Nummer bereits lang genug ist.
 */
export function splitPhones(raw: string | null | undefined): PhoneEntry[] {
  if (!raw) return [];
  const out: PhoneEntry[] = [];

  for (const rohteil of String(raw).split(SEP)) {
    const teil = rohteil.trim();
    if (!teil) continue;
    const m = teil.match(LABEL);
    const label = m ? m[1].trim() : null;
    const wert = (m ? m[2] : teil).trim();
    if (!wert || !/\d/.test(wert)) continue;

    const letzte = out[out.length - 1];
    const eigenstaendig = /^[+0]/.test(wert.replace(/[^\d+]/g, ''));
    if (letzte && !label && (!eigenstaendig || ziffern(letzte.number) < 6)) {
      letzte.number = `${letzte.number} ${wert}`;
    } else {
      out.push({ label, number: wert });
    }
  }

  return out.filter((e) => ziffern(e.number) >= 5);
}

/** Die erste verwertbare Nummer aus einem Feld mit mehreren. */
export function firstPhone(raw: string | null | undefined): string | null {
  return splitPhones(raw)[0]?.number ?? null;
}

/**
 * Link fuer eine Telefonnummer im aktuell gewaehlten Schema. Enthaelt der
 * Text mehrere Nummern, wird nur die erste gewaehlt - nie alle zusammen.
 */
export function dialHref(phone: string | null | undefined, scheme: DialScheme = getDialScheme()): string | undefined {
  const einzeln = firstPhone(phone);
  if (!einzeln) return undefined;
  const clean = einzeln.replace(/[^\d+]/g, '');
  if (!clean) return undefined;
  if (scheme === 'sip') return `sip:${clean}`;
  return `${scheme}:${clean}`;
}
