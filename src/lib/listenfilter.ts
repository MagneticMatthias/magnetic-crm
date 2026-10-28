/** Automatisch angelegte Listen-Filter ("Liste" oder "Liste · …") erkennen. */
type F = { name: string; definition: unknown };

export function listeVonFilter(f: F): string | null {
  const groups = (f.definition as { groups?: { field: string; value: unknown }[][] })?.groups ?? [];
  const b = groups.flat().find((x) => x.field === 'source' || x.field === 'lead_source');
  const v = typeof b?.value === 'string' ? b.value : null;
  return v && (f.name === v || f.name.startsWith(`${v} · `)) ? v : null;
}

/** Listen-Filter ausblenden, deren Liste hier keine Eintraege hat. Andere Filter bleiben. */
export function nurPassendeFilter<T extends F>(filter: T[], vorhandeneListen: Set<string>): T[] {
  return filter.filter((f) => {
    const l = listeVonFilter(f);
    return !l || vorhandeneListen.has(l);
  });
}
