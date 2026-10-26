import 'server-only';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Anrufmonitor der Fritzbox (TCP-Port 1012, einmalig mit #96*5* einschalten).
 * Die Fritzbox meldet jede Zeile so:
 *   26.10.26 15:30:12;CALL;0;10;0891234;0711987654;SIP0;     ausgehend
 *   26.10.26 15:30:12;RING;0;0711987654;0891234;SIP0;          eingehend
 *   26.10.26 15:30:20;CONNECT;0;10;0711987654;                 abgenommen
 *   26.10.26 15:33:02;DISCONNECT;0;162;                        aufgelegt, Dauer in Sekunden
 *
 * Fertige Gespraeche landen in einer Warteschlange. Der Browser holt sie
 * regelmaessig ab (siehe syncAnrufe), weil nur dort eine Anmeldung fuer die
 * Datenbank vorliegt. Die Warteschlange liegt zusaetzlich in einer Datei,
 * damit ein Neustart des Servers nichts verliert.
 */

export type Anruf = {
  id: string;
  richtung: 'out' | 'in';
  nummer: string;
  beginn: string; // ISO
  verbunden: boolean;
  sekunden: number;
};

type Offen = { richtung: 'out' | 'in'; nummer: string; beginn: string; verbunden: boolean };

type Zustand = {
  gestartet: boolean;
  verbunden: boolean;
  letzterFehler: string | null;
  offen: Map<string, Offen>;
  queue: Anruf[];
};

const DATEI = path.join(os.tmpdir(), 'crm-anrufe.json');
const g = globalThis as unknown as { __fritz?: Zustand };

function zustand(): Zustand {
  if (!g.__fritz) {
    let queue: Anruf[] = [];
    try { queue = JSON.parse(readFileSync(DATEI, 'utf8')); } catch { /* noch keine Datei */ }
    g.__fritz = { gestartet: false, verbunden: false, letzterFehler: null, offen: new Map(), queue };
  }
  return g.__fritz;
}

function speichern() {
  try { writeFileSync(DATEI, JSON.stringify(zustand().queue)); } catch { /* egal */ }
}

export function verarbeiteZeile(zeile: string) {
  const z = zustand();
  const t = zeile.trim().split(';');
  if (t.length < 4) return;
  const [, art, conn] = t;
  // Zeit vom Server statt aus der Zeile: die Fritzbox meldet Ortszeit ohne Zeitzone
  const jetzt = new Date().toISOString();
  if (art === 'CALL') {
    z.offen.set(conn, { richtung: 'out', nummer: t[5] ?? '', beginn: jetzt, verbunden: false });
  } else if (art === 'RING') {
    z.offen.set(conn, { richtung: 'in', nummer: t[3] ?? '', beginn: jetzt, verbunden: false });
  } else if (art === 'CONNECT') {
    const o = z.offen.get(conn);
    if (o) o.verbunden = true;
  } else if (art === 'DISCONNECT') {
    const o = z.offen.get(conn);
    z.offen.delete(conn);
    if (!o || !o.nummer) return; // unterdrueckte Nummer: nicht zuordenbar
    z.queue.push({
      id: `${o.beginn}-${o.nummer}`, richtung: o.richtung, nummer: o.nummer,
      beginn: o.beginn, verbunden: o.verbunden, sekunden: o.verbunden ? Number(t[3]) || 0 : 0,
    });
    if (z.queue.length > 500) z.queue.splice(0, z.queue.length - 500);
    speichern();
  }
}

export function fritzHost() {
  return process.env.FRITZBOX_HOST || '192.168.178.1';
}

export function anrufmonitorAktiv() {
  return process.env.FRITZBOX_ANRUFMONITOR !== '0';
}

/** Verbindung zur Fritzbox halten; bei Abbruch nach 60 Sekunden neu versuchen. */
export function startAnrufmonitor() {
  const z = zustand();
  if (z.gestartet || !anrufmonitorAktiv()) return;
  z.gestartet = true;

  const verbinde = () => {
    const sock = net.connect({ host: fritzHost(), port: 1012 });
    let puffer = '';
    sock.setKeepAlive(true, 60_000);
    sock.setEncoding('utf8');
    sock.on('connect', () => { z.verbunden = true; z.letzterFehler = null; });
    sock.on('data', (chunk: string) => {
      puffer += chunk;
      let i;
      while ((i = puffer.indexOf('\n')) >= 0) {
        verarbeiteZeile(puffer.slice(0, i));
        puffer = puffer.slice(i + 1);
      }
    });
    sock.on('error', (e) => { z.letzterFehler = e.message; });
    sock.on('close', () => {
      z.verbunden = false;
      setTimeout(verbinde, 60_000);
    });
  };
  verbinde();
}

export function anrufmonitorStatus() {
  const z = zustand();
  return { aktiv: anrufmonitorAktiv(), verbunden: z.verbunden, fehler: z.letzterFehler, host: fritzHost(), wartend: z.queue.length };
}

/** Wartende Anrufe ansehen, ohne sie zu entfernen. */
export function wartendeAnrufe(): Anruf[] {
  return [...zustand().queue];
}

/** Verarbeitete Anrufe aus der Warteschlange nehmen. */
export function anrufeErledigt(ids: string[]) {
  const z = zustand();
  const weg = new Set(ids);
  z.queue = z.queue.filter((a) => !weg.has(a.id));
  speichern();
}

/** Telefonnummer vergleichbar machen: nur Ziffern, +49/0049 -> 0, sonst Ausland -> 00 */
export function normNummer(raw: string): string {
  let s = raw.replace(/[^\d+]/g, '');
  if (s.startsWith('+49')) s = '0' + s.slice(3);
  else if (s.startsWith('0049')) s = '0' + s.slice(4);
  else if (s.startsWith('+')) s = '00' + s.slice(1);
  return s.replace(/\D/g, '');
}

/** Alle Nummern aus einem Telefonfeld ("Zentrale: 089 123, Mobil: 0171 456") */
export function nummernAusFeld(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(/\s*(?:,|;|\||\r?\n|\boder\b)\s*/i)
    .flatMap((teil) => teil.replace(/^[A-Za-zÄÖÜäöüß.\-\s]{2,20}:\s*/, '').split(/\s*\/\s*(?=[+0])/))
    .map(normNummer)
    .filter((n) => n.length >= 6);
}

/** Gleiche Nummer? Exakt, oder eine endet auf die andere (Ortsgespraech ohne Vorwahl). */
export function gleicheNummer(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [kurz, lang] = a.length < b.length ? [a, b] : [b, a];
  return kurz.length >= 6 && !kurz.startsWith('0') && lang.endsWith(kurz);
}
