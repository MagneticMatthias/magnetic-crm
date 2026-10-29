'use client';

import { createContext, useContext } from 'react';
import type { Stage } from '@/lib/types';

/**
 * Die Phasen der aktuell angezeigten Pipeline. Die Spaltendefinitionen
 * bekommen nur die Zeile, nicht die Pipeline - ueber diesen Kontext kann
 * die Phasen-Spalte trotzdem eine Auswahlliste anbieten. Ohne Provider
 * (z. B. in der Kontaktliste) bleibt die Phase reine Anzeige.
 */
const StagesContext = createContext<Stage[] | null>(null);

export const StagesProvider = StagesContext.Provider;
export const useStages = () => useContext(StagesContext);

/** Welche Pipeline die Tabelle zeigt: steuert "Was ist passiert?" und ob die Phase nur Anzeige ist. */
export type PipelineArt = 'kalt' | 'faeden' | null;
const PipelineArtContext = createContext<PipelineArt>(null);
export const PipelineArtProvider = PipelineArtContext.Provider;
export const usePipelineArt = () => useContext(PipelineArtContext);

/** Sofort sichtbare Aenderung einer Tabellenzeile, bevor der Server fertig ist. */
export type ZeilenPatch = {
  stage_id?: string; stage?: { name: string; color: string } | null; custom?: Record<string, string | null>;
  naechste_wv?: { due_at: string; title: string } | null; ohne_datum?: boolean;
};
const ZeilenPatchContext = createContext<((dealId: string, patch: ZeilenPatch | null) => void) | null>(null);
export const ZeilenPatchProvider = ZeilenPatchContext.Provider;
export const useZeilenPatch = () => useContext(ZeilenPatchContext);
