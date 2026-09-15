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
