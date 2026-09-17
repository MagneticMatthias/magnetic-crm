-- ============================================================
-- Postfach-Abgleich: Mails, die zu einer hinterlegten
-- Ansprechpartner-Adresse passen, landen als Aktivitaet.
-- Einmal im SQL-Editor ausfuehren.
-- ============================================================

-- Message-ID zum Erkennen von Doppelten, Richtung fuer die Anzeige
alter table activities add column if not exists message_id text;
alter table activities add column if not exists direction text
  check (direction in ('in', 'out'));
create unique index if not exists idx_activities_message
  on activities(org_id, message_id) where message_id is not null;

-- Fortschritt je Ordner, damit nicht jedes Mal alles gelesen wird
create table if not exists mail_sync_state (
  org_id uuid not null references organizations(id) on delete cascade,
  folder text not null,
  uidvalidity bigint,
  last_uid bigint not null default 0,
  last_run_at timestamptz,
  last_error text,
  imported int not null default 0,
  primary key (org_id, folder)
);
alter table mail_sync_state enable row level security;
drop policy if exists mail_sync_state_all on mail_sync_state;
create policy mail_sync_state_all on mail_sync_state for all
  using (org_id = current_org()) with check (org_id = current_org());
grant all on mail_sync_state to authenticated;
