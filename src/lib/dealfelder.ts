/** Auswahllisten fuer die Deal-Felder Quelle, Produkt und Anlass (gespeichert in deals.custom). */
export const QUELLEN = [
  'LinkedIn InMail', 'LinkedIn Kontaktanfrage', 'Kaltanruf', 'E-Mail', 'Empfehlung',
  'Inbound Website', 'Messe vor Ort', 'Bestandskunde', 'Ausschreibung', 'Sonstiges',
] as const;

export const PRODUKTE = [
  'Messefilm', 'Videotestimonial', 'Recruiting-Video', 'Statement/Expertenvideo',
  'Eventfilm', 'Kurs + Tool', 'Retainer Schnitt', 'Produktion sonstiges',
] as const;

/** Vorschlaege; der Anlass darf frei ergaenzt werden. */
export const ANLAESSE = [
  'electronica 2026', 'BAU 2027', 'ISH 2027', 'Expo Real 2026', 'Expo Real 2027',
  'Natuvion CONNECT 2026', 'kein Anlass',
] as const;
