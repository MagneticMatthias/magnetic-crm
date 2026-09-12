-- ============================================================
-- Angleichung an die Original-Oberflaeche:
-- Kontakt = Firma mit mehreren Ansprechpartnern, Notizen als
-- eigene Entitaet, gespeicherte Filter, Spalten-Layouts.
-- Nach 02_features.sql ausfuehren.
-- ============================================================

-- ---------- Kontakt-Stammdaten erweitern ----------
alter table contacts add column if not exists website text;
alter table contacts add column if not exists postal_code text;
alter table contacts add column if not exists city text;
alter table contacts add column if not exists country text default 'Deutschland';
alter table contacts add column if not exists opener_kuerzel text;
alter table contacts add column if not exists last_contacted_at timestamptz;

-- ---------- Ansprechpartner ----------
create table if not exists contact_persons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  job_title text,
  is_primary boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_persons_contact on contact_persons(contact_id, position);

-- Bestehende Kontaktdaten einmalig als Ansprechpartner uebernehmen
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'contacts' and column_name = 'first_name'
  ) then
    insert into contact_persons (org_id, contact_id, first_name, last_name, email, phone, job_title, is_primary)
    select c.org_id, c.id, c.first_name, c.last_name, c.email, c.phone, c.job_title, true
    from contacts c
    where not exists (select 1 from contact_persons p where p.contact_id = c.id)
      and coalesce(c.first_name, c.last_name, c.email, c.phone) is not null;
  end if;
end $$;

-- Die Personendaten leben ab jetzt ausschliesslich in contact_persons
alter table contacts drop column if exists first_name;
alter table contacts drop column if exists last_name;
alter table contacts drop column if exists email;
alter table contacts drop column if exists phone;
alter table contacts drop column if exists job_title;

-- ---------- Notizen ----------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notes_contact on notes(contact_id, pinned desc, created_at desc);
create index if not exists idx_notes_deal on notes(deal_id, pinned desc, created_at desc);

-- ---------- Gespeicherte Filter ----------
create table if not exists saved_filters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  entity text not null check (entity in ('contacts','deals')),
  name text not null,
  definition jsonb not null default '{"groups":[]}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_filters on saved_filters(org_id, entity);

-- ---------- Spalten-Layouts je Nutzer und Ansicht ----------
create table if not exists column_layouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  view_key text not null,
  columns jsonb not null default '[]'::jsonb,
  unique (user_id, view_key)
);

-- ---------- Deal-Anlagedatum sichtbar halten ----------
alter table deals add column if not exists last_activity_at timestamptz;

-- ============================================================
-- Ansprechpartner am Kontakt spiegeln, damit Listen und Suche
-- ohne teure Joins auskommen.
-- ============================================================
create or replace function sync_primary_person() returns trigger
language plpgsql as $$
declare
  cid uuid := coalesce(new.contact_id, old.contact_id);
begin
  -- genau ein Hauptansprechpartner je Kontakt
  if tg_op in ('INSERT','UPDATE') and new.is_primary then
    update contact_persons set is_primary = false
    where contact_id = cid and id <> new.id;
  end if;

  if not exists (select 1 from contact_persons where contact_id = cid and is_primary) then
    update contact_persons set is_primary = true
    where id = (
      select id from contact_persons where contact_id = cid
      order by position, created_at limit 1
    );
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_person_primary on contact_persons;
create trigger trg_person_primary after insert or update or delete on contact_persons
  for each row execute function sync_primary_person();

-- Letzter Kontakt aus Aktivitaeten ableiten
create or replace function touch_last_contacted() returns trigger
language plpgsql as $$
begin
  if new.contact_id is not null then
    update contacts set last_contacted_at = greatest(coalesce(last_contacted_at, new.occurred_at), new.occurred_at)
    where id = new.contact_id;
  end if;
  if new.deal_id is not null then
    update deals set last_activity_at = new.occurred_at where id = new.deal_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_activity_touch on activities;
create trigger trg_activity_touch after insert on activities
  for each row execute function touch_last_contacted();

-- ============================================================
-- RLS
-- ============================================================
alter table contact_persons enable row level security;
alter table notes           enable row level security;
alter table saved_filters   enable row level security;
alter table column_layouts  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['contact_persons','notes','saved_filters','column_layouts']
  loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format($f$create policy %I_all on %I for all
      using (org_id = current_org()) with check (org_id = current_org())$f$, t, t);
  end loop;
end $$;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table contact_persons';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table notes';
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- Lead-Formular an das neue Kontaktmodell anpassen:
-- Kontakt = Firma, Person landet in contact_persons.
-- ============================================================
create or replace function submit_lead_form(
  p_slug text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_company text,
  p_message text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  f record;
  v_stage uuid;
  v_pipeline uuid;
  v_contact uuid;
  v_deal uuid;
  v_label text;
begin
  select * into f from lead_forms where slug = p_slug and active;
  if not found then
    raise exception 'Formular nicht gefunden';
  end if;

  if coalesce(trim(p_email), '') = '' and coalesce(trim(p_phone), '') = '' then
    raise exception 'E-Mail oder Telefonnummer erforderlich';
  end if;

  v_label := coalesce(
    nullif(trim(p_company), ''),
    nullif(trim(concat_ws(' ', p_first_name, p_last_name)), ''),
    'Neuer Lead'
  );

  insert into contacts (org_id, company, lead_source, owner_id, notes)
  values (f.org_id, v_label, f.source, f.owner_id, nullif(trim(p_message), ''))
  returning id into v_contact;

  insert into contact_persons (org_id, contact_id, first_name, last_name, email, phone, is_primary)
  values (f.org_id, v_contact, nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''),
          nullif(trim(p_email), ''), nullif(trim(p_phone), ''), true);

  v_stage := f.stage_id;
  if v_stage is null then
    select s.id, s.pipeline_id into v_stage, v_pipeline
    from pipeline_stages s
    join pipelines p on p.id = s.pipeline_id
    where p.org_id = f.org_id and not s.is_won and not s.is_lost
    order by p.position, s.position
    limit 1;
  else
    select pipeline_id into v_pipeline from pipeline_stages where id = v_stage;
  end if;

  if v_stage is null then
    return;
  end if;

  insert into deals (org_id, contact_id, pipeline_id, stage_id, title, value,
                     source, owner_id, setter_id)
  values (f.org_id, v_contact, v_pipeline, v_stage, v_label,
          f.deal_value, f.source, f.owner_id, f.owner_id)
  returning id into v_deal;

  insert into notes (org_id, contact_id, deal_id, body)
  values (f.org_id, v_contact, v_deal,
          'Lead über Formular <strong>' || f.name || '</strong>' ||
          coalesce('<p>' || nullif(trim(p_message), '') || '</p>', ''));
end $$;

revoke all on function submit_lead_form(text, text, text, text, text, text, text) from public;
grant execute on function submit_lead_form(text, text, text, text, text, text, text) to anon, authenticated;
