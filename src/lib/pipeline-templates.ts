import type { PipelineKind } from './types';

type StageSeed = { name: string; probability: number; color: string; is_won?: boolean; is_lost?: boolean };

/**
 * Standard-Pipelines nach dem Setter-Closer-Prinzip.
 * Werden beim Anlegen einer Organisation erzeugt und sind danach frei editierbar.
 */
export const PIPELINE_TEMPLATES: { name: string; kind: PipelineKind; stages: StageSeed[] }[] = [
  {
    name: 'Setting',
    kind: 'setter',
    stages: [
      { name: 'Neuer Lead', probability: 5, color: '#64748b' },
      { name: 'Kontaktversuch', probability: 10, color: '#0ea5e9' },
      { name: 'Erreicht', probability: 25, color: '#6366f1' },
      { name: 'Termin vereinbart', probability: 50, color: '#8b5cf6' },
      { name: 'An Closer übergeben', probability: 60, color: '#22c55e', is_won: true },
      { name: 'Disqualifiziert', probability: 0, color: '#ef4444', is_lost: true },
    ],
  },
  {
    name: 'Closing',
    kind: 'closer',
    stages: [
      { name: 'Termin steht', probability: 30, color: '#0ea5e9' },
      { name: 'Erstgespräch geführt', probability: 45, color: '#6366f1' },
      { name: 'Angebot raus', probability: 65, color: '#8b5cf6' },
      { name: 'Verhandlung', probability: 80, color: '#f59e0b' },
      { name: 'Gewonnen', probability: 100, color: '#22c55e', is_won: true },
      { name: 'Verloren', probability: 0, color: '#ef4444', is_lost: true },
    ],
  },
  {
    name: 'Upsell',
    kind: 'upsell',
    stages: [
      { name: 'Potenzial erkannt', probability: 20, color: '#0ea5e9' },
      { name: 'Gespräch geplant', probability: 40, color: '#6366f1' },
      { name: 'Angebot raus', probability: 70, color: '#8b5cf6' },
      { name: 'Gewonnen', probability: 100, color: '#22c55e', is_won: true },
      { name: 'Verloren', probability: 0, color: '#ef4444', is_lost: true },
    ],
  },
  {
    name: 'Reaktivierung',
    kind: 'reaktivierung',
    stages: [
      { name: 'Wiedervorlage', probability: 10, color: '#64748b' },
      { name: 'Reaktivierungs-Call', probability: 30, color: '#0ea5e9' },
      { name: 'Neues Interesse', probability: 55, color: '#8b5cf6' },
      { name: 'Zurückgewonnen', probability: 100, color: '#22c55e', is_won: true },
      { name: 'Endgültig verloren', probability: 0, color: '#ef4444', is_lost: true },
    ],
  },
];
