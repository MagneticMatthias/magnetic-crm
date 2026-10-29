/** Hilfen fuer die Pipeline Faeden. */
export const istFaeden = (name: string | null | undefined) => /^f(ä|ae)den$/i.test((name ?? '').trim());
export const istKaltakquise = (name: string | null | undefined) => (name ?? '').trim().toLowerCase() === 'kaltakquise';
/** Diese Phasen blendet die Standardansicht der Faeden aus. */
export const ERLEDIGT_PHASEN = ['geliefert', 'verloren'];
