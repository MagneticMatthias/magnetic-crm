/**
 * Zeitzugriff gebuendelt: haelt Date.now() aus dem Render-Pfad der
 * Komponenten heraus (React-Compiler-Purity-Regel).
 */
export const nowMs = () => Date.now();
export const nowDate = () => new Date();
export const daysAgoIso = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
