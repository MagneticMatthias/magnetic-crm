/** Karten des Deal-/Kontakt-Panels. Reihenfolge und Sichtbarkeit sind je Nutzer konfigurierbar. */
export type PanelCardKey =
  | 'persons' | 'deal_name' | 'deal_status' | 'marketing' | 'contact_master'
  | 'deal_props' | 'setter_info' | 'linked_contact' | 'tasks';

export type PanelCardDef = {
  key: PanelCardKey;
  title: string;
  description: string;
  kind: 'deal' | 'contact';
};

export const PANEL_CARDS: PanelCardDef[] = [
  { key: 'persons', title: 'Ansprechpartner', kind: 'contact',
    description: 'Hier kannst du die Eigenschaften der Ansprechpersonen verwalten.' },
  { key: 'deal_name', title: 'Deal-Name', kind: 'deal',
    description: 'Bezeichnung des Deals, wie sie in Pipeline und Berichten erscheint.' },
  { key: 'deal_status', title: 'Deal-Status', kind: 'deal',
    description: 'Pipeline und Deal-Phase.' },
  { key: 'marketing', title: 'Marketing-Informationen', kind: 'contact',
    description: 'Hier findest du alle erforderlichen UTM-Parameter, um deine Kontakte korrekt nachverfolgen zu können.' },
  { key: 'contact_master', title: 'Stammdaten des Kontakts', kind: 'contact',
    description: 'Hier befinden sich die wichtigsten Infos des Kontakts, wie Firma, Website, Adresse und weitere relevante Infos.' },
  { key: 'deal_props', title: 'Deal-Eigenschaften', kind: 'deal',
    description: 'Hier befinden sich die wichtigsten Infos des Deals, wie Abschluss-Datum, Auftrags-Volumen und weitere relevante Infos.' },
  { key: 'setter_info', title: 'Setter-Informationen', kind: 'contact',
    description: 'Informationen, die der Setter benötigt, um den Kontakt zu qualifizieren.' },
  { key: 'linked_contact', title: 'Verknüpfter Kontakt', kind: 'deal',
    description: 'Der Kontakt, zu dem dieser Deal gehört, mit allen weiteren Deals.' },
  { key: 'tasks', title: 'Aufgaben', kind: 'contact',
    description: 'Offene und erledigte Aufgaben zu diesem Datensatz.' },
];

export const DEFAULT_PANEL_LAYOUT: PanelCardKey[] = [
  'persons', 'deal_name', 'deal_status', 'contact_master', 'deal_props', 'marketing', 'setter_info', 'linked_contact', 'tasks',
];

/** Setter-Qualifizierung: freie Schluessel in deals.custom */
export const SETTER_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: 'bedarf', label: 'Bedarf / Ziel', placeholder: 'Was will der Kontakt erreichen?' },
  { key: 'budget', label: 'Budget', placeholder: 'z. B. 5.000–10.000 €' },
  { key: 'entscheider', label: 'Entscheider', placeholder: 'Wer entscheidet?' },
  { key: 'zeitrahmen', label: 'Zeitrahmen', placeholder: 'z. B. innerhalb 4 Wochen' },
  { key: 'einwaende', label: 'Einwände', placeholder: 'Was spricht aktuell dagegen?' },
];
