-- ============================================================
-- SalesSuite-Nachbau - Datenbankschema (Supabase / PostgreSQL)
-- Ausfuehren im Supabase SQL Editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type user_role as enum ('admin','manager','closer','setter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pipeline_kind as enum ('setter','closer','upsell','reaktivierung','agentur','training','sonstige');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_status as enum ('offen','gewonnen','verloren');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_type as enum ('call','email','meeting','note','whatsapp','task');
exception when duplicate_object then null; end $$;

do $$ begin
  create type call_kind as enum ('opening','setting','closing','followup');
exception when duplicate_object then null; end $$;

do $$ begin
  create type call_outcome as enum (
    'erreicht','nicht_erreicht','mailbox','falsche_nummer',
    'termin_vereinbart','no_show','kein_interesse','wiedervorlage',
    'abgeschlossen','verloren'
  );
exception when duplicate_object then null; end $$;

-- ---------- Organisationen & Profile ----------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete set null,
  full_name text,
  email text,
  role user_role not null default 'setter',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Pipelines & Phasen ----------
create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind pipeline_kind not null default 'sonstige',
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  position int not null default 0,
  probability int not null default 0 check (probability between 0 and 100),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  color text not null default '#64748b'
);
create index if not exists idx_stages_pipeline on pipeline_stages(pipeline_id, position);

-- ---------- Kontakte ----------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  job_title text,
  lead_source text,
  notes text,
  owner_id uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_contacts_org on contacts(org_id);
create index if not exists idx_contacts_search on contacts
  using gin (to_tsvector('simple',
    coalesce(first_name,'')||' '||coalesce(last_name,'')||' '||
    coalesce(company,'')||' '||coalesce(email,'')||' '||coalesce(phone,'')));

-- ---------- Deals ----------
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  stage_id uuid not null references pipeline_stages(id) on delete restrict,
  title text not null,
  value numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  status deal_status not null default 'offen',
  lost_reason text,
  source text,
  owner_id uuid references profiles(id) on delete set null,
  setter_id uuid references profiles(id) on delete set null,
  closer_id uuid references profiles(id) on delete set null,
  expected_close_date date,
  next_step text,
  position int not null default 0,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  won_at timestamptz,
  lost_at timestamptz
);
create index if not exists idx_deals_org on deals(org_id);
create index if not exists idx_deals_stage on deals(stage_id, position);
create index if not exists idx_deals_pipeline on deals(pipeline_id);

-- ---------- Aktivitaeten (inkl. Call-Logging) ----------
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  type activity_type not null default 'note',
  call_kind call_kind,
  outcome call_outcome,
  duration_seconds int,
  phone_number text,
  subject text,
  body text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_deal on activities(deal_id, occurred_at desc);
create index if not exists idx_activities_contact on activities(contact_id, occurred_at desc);
create index if not exists idx_activities_org_time on activities(org_id, occurred_at desc);

-- ---------- Aufgaben ----------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  assignee_id uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz,
  priority int not null default 2,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_assignee on tasks(assignee_id, done, due_at);

-- ---------- Phasen-Historie (Funnel-Auswertung) ----------
create table if not exists deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  from_stage_id uuid references pipeline_stages(id) on delete set null,
  to_stage_id uuid references pipeline_stages(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists idx_history_deal on deal_stage_history(deal_id, changed_at);

-- ============================================================
-- Trigger
-- ============================================================
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_contacts_touch on contacts;
create trigger trg_contacts_touch before update on contacts
  for each row execute function touch_updated_at();

drop trigger if exists trg_deals_touch on deals;
create trigger trg_deals_touch before update on deals
  for each row execute function touch_updated_at();

-- Phasenwechsel protokollieren + Status/Zeitstempel aus Phase ableiten
create or replace function deals_on_stage_change() returns trigger
language plpgsql as $$
declare
  s record;
begin
  if tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id then
    insert into deal_stage_history(org_id, deal_id, from_stage_id, to_stage_id, user_id)
    values (new.org_id, new.id, old.stage_id, new.stage_id, auth.uid());
  end if;

  select is_won, is_lost into s from pipeline_stages where id = new.stage_id;
  if s.is_won then
    new.status := 'gewonnen';
    new.won_at := coalesce(new.won_at, now());
    new.lost_at := null;
  elsif s.is_lost then
    new.status := 'verloren';
    new.lost_at := coalesce(new.lost_at, now());
    new.won_at := null;
  else
    new.status := 'offen';
    new.won_at := null;
    new.lost_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_deals_stage on deals;
create trigger trg_deals_stage before insert or update on deals
  for each row execute function deals_on_stage_change();

-- Neue Auth-User bekommen automatisch ein Profil
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
create or replace function current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','manager') from profiles where id = auth.uid()), false)
$$;

alter table organizations      enable row level security;
alter table profiles           enable row level security;
alter table pipelines          enable row level security;
alter table pipeline_stages    enable row level security;
alter table contacts           enable row level security;
alter table deals              enable row level security;
alter table activities         enable row level security;
alter table tasks              enable row level security;
alter table deal_stage_history enable row level security;

-- Organisation
drop policy if exists org_read on organizations;
create policy org_read on organizations for select using (id = current_org());
drop policy if exists org_write on organizations;
create policy org_write on organizations for update using (id = current_org() and is_manager());
drop policy if exists org_insert on organizations;
create policy org_insert on organizations for insert with check (auth.uid() is not null);

-- Profile: eigenes Profil immer, Team lesen, Rollen nur Manager
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select
  using (id = auth.uid() or org_id = current_org());
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid() or (org_id = current_org() and is_manager()));
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert with check (id = auth.uid());

-- Generische Org-Policies
do $$
declare t text;
begin
  foreach t in array array['pipelines','contacts','deals','activities','tasks','deal_stage_history']
  loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format($f$create policy %I_all on %I for all
      using (org_id = current_org()) with check (org_id = current_org())$f$, t, t);
  end loop;
end $$;

-- Phasen haengen an der Pipeline
drop policy if exists stages_all on pipeline_stages;
create policy stages_all on pipeline_stages for all
  using (exists (select 1 from pipelines p where p.id = pipeline_id and p.org_id = current_org()))
  with check (exists (select 1 from pipelines p where p.id = pipeline_id and p.org_id = current_org()));
