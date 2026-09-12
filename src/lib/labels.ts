import type {
  ActivityType, CallKind, CallOutcome, DealStatus, PipelineKind, UserRole,
} from './types';

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  closer: 'Closer',
  setter: 'Setter',
};

export const PIPELINE_KIND_LABEL: Record<PipelineKind, string> = {
  setter: 'Setting',
  closer: 'Closing',
  upsell: 'Upsell',
  reaktivierung: 'Reaktivierung',
  agentur: 'Agenturen',
  training: 'Trainings',
  sonstige: 'Sonstige',
};

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  offen: 'Offen',
  gewonnen: 'Gewonnen',
  verloren: 'Verloren',
};

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  call: 'Anruf',
  email: 'E-Mail',
  meeting: 'Termin',
  note: 'Notiz',
  whatsapp: 'WhatsApp',
  task: 'Aufgabe',
};

export const CALL_KIND_LABEL: Record<CallKind, string> = {
  opening: 'Opening Call',
  setting: 'Setting Call',
  closing: 'Closing Call',
  followup: 'Follow-up Call',
};

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  erreicht: 'Erreicht',
  nicht_erreicht: 'Nicht erreicht',
  mailbox: 'Mailbox',
  falsche_nummer: 'Falsche Nummer',
  termin_vereinbart: 'Termin vereinbart',
  no_show: 'No-Show',
  kein_interesse: 'Kein Interesse',
  wiedervorlage: 'Wiedervorlage',
  abgeschlossen: 'Abgeschlossen',
  verloren: 'Verloren',
};

/** Ergebnisse, die als erfolgreiches Gespraech zaehlen (Kontaktquote). */
export const REACHED_OUTCOMES: CallOutcome[] = [
  'erreicht', 'termin_vereinbart', 'kein_interesse', 'wiedervorlage', 'abgeschlossen', 'verloren',
];

export const LEAD_SOURCES = [
  'Meta Ads', 'Google Ads', 'YouTube', 'TikTok', 'LinkedIn', 'Empfehlung',
  'Kaltakquise', 'Webinar', 'Website', 'Messe', 'Sonstige',
];
