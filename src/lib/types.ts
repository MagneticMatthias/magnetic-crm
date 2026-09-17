export type UserRole = 'admin' | 'manager' | 'closer' | 'setter';
export type PipelineKind =
  | 'setter' | 'closer' | 'upsell' | 'reaktivierung' | 'agentur' | 'training' | 'sonstige';
export type DealStatus = 'offen' | 'gewonnen' | 'verloren';
export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'whatsapp' | 'linkedin' | 'task';
export type CallKind = 'opening' | 'setting' | 'closing' | 'followup';
export type CallOutcome =
  | 'erreicht' | 'nicht_erreicht' | 'mailbox' | 'falsche_nummer'
  | 'termin_vereinbart' | 'no_show' | 'kein_interesse' | 'wiedervorlage'
  | 'abgeschlossen' | 'verloren';

export type Profile = {
  id: string;
  org_id: string | null;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  phone: string | null;
  active: boolean;
};

export type Pipeline = {
  id: string;
  org_id: string;
  name: string;
  kind: PipelineKind;
  position: number;
  archived: boolean;
};

export type Stage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  color: string;
};

export type ContactPerson = {
  id: string;
  org_id: string;
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  is_primary: boolean;
  position: number;
};

/** Ein Kontakt ist die Firma bzw. der Datensatz; Personen haengen daran. */
export type Contact = {
  id: string;
  org_id: string;
  company: string | null;
  website: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  lead_source: string | null;
  opener_kuerzel: string | null;
  notes: string | null;
  owner_id: string | null;
  last_contacted_at: string | null;
  custom?: Record<string, string | null>;
  created_at: string;
  updated_at: string;
};

export type ContactDeal = {
  id: string;
  status: DealStatus;
  stage_id: string | null;
  pipeline_id: string | null;
  stage?: { name: string; color: string } | null;
  pipeline?: { name: string } | null;
};

export type ContactWithPersons = Contact & {
  persons: ContactPerson[];
  deals?: ContactDeal[];
};

export type Note = {
  id: string;
  org_id: string;
  contact_id: string | null;
  deal_id: string | null;
  user_id: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type NoteAttachment = {
  id: string;
  note_id: string;
  path: string;
  name: string;
  size: number;
  mime: string | null;
  url?: string; // signierte URL, 1 h gueltig
};

export type NoteWithUser = Note & {
  user: { full_name: string | null; email: string | null } | null;
  attachments?: NoteAttachment[];
};

export type SavedFilter = {
  id: string;
  org_id: string;
  user_id: string | null;
  entity: 'contacts' | 'deals';
  name: string;
  definition: FilterDefinition;
};

export type FilterOperator =
  | 'contains' | 'not_contains' | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_empty' | 'not_empty'
  | 'before_days' | 'after_days';

export type FilterRule = {
  field: string;
  operator: FilterOperator;
  value: string;
};

/** Regeln innerhalb einer Gruppe sind UND-verknuepft, Gruppen untereinander ODER. */
export type FilterDefinition = { groups: FilterRule[][] };

export type Deal = {
  id: string;
  org_id: string;
  contact_id: string | null;
  pipeline_id: string;
  stage_id: string;
  title: string;
  value: number;
  currency: string;
  status: DealStatus;
  lost_reason: string | null;
  source: string | null;
  owner_id: string | null;
  setter_id: string | null;
  closer_id: string | null;
  expected_close_date: string | null;
  next_step: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  won_at: string | null;
  lost_at: string | null;
  last_activity_at?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  custom?: Record<string, string | null>;
};

export type DealWithContact = Deal & {
  contact: ContactWithPersons | null;
  stage?: { name: string; color: string } | null;
};

export type Activity = {
  id: string;
  org_id: string;
  contact_id: string | null;
  deal_id: string | null;
  user_id: string | null;
  type: ActivityType;
  direction?: 'in' | 'out' | null;
  message_id?: string | null;
  call_kind: CallKind | null;
  outcome: CallOutcome | null;
  duration_seconds: number | null;
  answered_by?: 'gatekeeper' | 'entscheider' | null;
  phone_number: string | null;
  subject: string | null;
  body: string | null;
  occurred_at: string;
};

export type Task = {
  id: string;
  org_id: string;
  contact_id: string | null;
  deal_id: string | null;
  assignee_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: number;
  done: boolean;
  done_at: string | null;
};

export type LeadForm = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  headline: string | null;
  description: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  owner_id: string | null;
  source: string | null;
  success_message: string | null;
  ask_company: boolean;
  ask_message: boolean;
  ask_email?: boolean;
  ask_phone?: boolean;
  ask_last_name?: boolean;
  deal_value: number;
  active: boolean;
};

export type EmailTemplate = {
  id: string;
  org_id: string;
  name: string;
  subject: string;
  body: string;
};

export type ActivityGoal = {
  id: string;
  org_id: string;
  user_id: string | null;
  calls_per_day: number;
  conversations_per_day: number;
  appointments_per_week: number;
};
