/**
 * Wiedervorlagen sind Aufgaben, die beim Protokollieren einer Aktivitaet
 * entstehen. Die Datenbank kennt keine direkte Verknuepfung; die Aufgabe
 * wird deshalb mit demselben Anlegezeitpunkt gespeichert wie die Aktivitaet.
 * Aeltere Wiedervorlagen erkennen wir an wenigen Sekunden Abstand.
 */
export type Wiedervorlage = { taskId: string; due_at: string | null; title: string; priority: number; done: boolean };

type A = { id: string; contact_id: string | null; deal_id: string | null; created_at: string };
type T = { id: string; contact_id: string | null; deal_id: string | null; created_at: string; due_at: string | null; title: string; priority: number; done: boolean };

const FENSTER_MS = 60_000;

export function wiedervorlagenZuordnen(acts: A[], tasks: T[]): Record<string, Wiedervorlage> {
  const out: Record<string, Wiedervorlage> = {};
  const vergeben = new Set<string>();
  // aelteste zuerst, damit jede Aufgabe der naechstliegenden Aktivitaet zufaellt
  const sortiert = [...acts].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const a of sortiert) {
    const t0 = new Date(a.created_at).getTime();
    let best: T | null = null;
    let bestAbstand = Infinity;
    for (const t of tasks) {
      if (vergeben.has(t.id) || !t.due_at) continue;
      if (t.contact_id !== a.contact_id) continue;
      if (a.deal_id && t.deal_id && a.deal_id !== t.deal_id) continue;
      const d = new Date(t.created_at).getTime() - t0;
      if (d < -2_000 || d > FENSTER_MS) continue;
      if (Math.abs(d) < bestAbstand) { best = t; bestAbstand = Math.abs(d); }
    }
    if (best) {
      vergeben.add(best.id);
      out[a.id] = { taskId: best.id, due_at: best.due_at, title: best.title, priority: best.priority, done: best.done };
    }
  }
  return out;
}

export const PRIO_LABEL = ['', 'Hoch', 'Mittel', 'Niedrig'];
