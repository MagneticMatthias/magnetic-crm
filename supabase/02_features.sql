-- ============================================================
-- Erweiterungen: Power Dialer, E-Mail, Lead-Formulare,
-- Echtzeit-Zusammenarbeit, Schlagzahl-Ziele
-- Nach schema.sql ausfuehren.
-- ============================================================

-- ---------- E-Mail-Vorlagen und Absenderidentitaet ----------
-- SMTP-Zugangsdaten liegen bewusst NICHT in der Datenbank, sondern in
-- Server-Umgebungsvariablen (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
create table if not exists email_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  from_name text,
  from_email text,
  signature text,
  updated_at timestamptz not null default now()
);

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- Lead-Formulare ----------
create table if not exists lead_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  slug text not null unique,
  name text not null,
  headline text,
  description text,
  pipeline_id uuid references pipelines(id) on delete set null,
  stage_id uuid references pipeline_stages(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  source text default 'Formular',
  success_message text default 'Danke! Wir melden uns in Kürze.',
  ask_company boolean not null default true,
  ask_message boolean not null default true,
  deal_value numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_forms_slug on lead_forms(slug);

-- ---------- Schlagzahl-Ziele ----------
create table if not exists activity_goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  calls_per_day int not null default 60,
  conversations_per_day int not null default 15,
  appointments_per_week int not null default 10,
  unique (org_id, user_id)
);

-- ---------- Dialer-Sitzungen (Schlagzahl-Auswertung) ----------
create table if not exists dialer_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  stage_id uuid references pipeline_stages(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  calls_made int not null default 0
);

-- ============================================================
-- RLS
-- ============================================================
alter table email_settings   enable row level security;
alter table email_templates  enable row level security;
alter table lead_forms       enable row level security;
alter table activity_goals   enable row level security;
alter table dialer_sessions  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['email_settings','email_templates','lead_forms','activity_goals','dialer_sessions']
  loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format($f$create policy %I_all on %I for all
      using (org_id = current_org()) with check (org_id = current_org())$f$, t, t);
  end loop;
end $$;

-- ============================================================
-- Oeffentliche Lead-Erfassung
-- Anonyme Besucher duerfen weder lesen noch schreiben - nur diese
-- Funktion legt kontrolliert Kontakt und Deal an.
-- ============================================================
create or replace function public_lead_form(p_slug text)
returns table (
  slug text, name text, headline text, description text,
  ask_company boolean, ask_message boolean, success_message text
)
language sql stable security definer set search_path = public as $$
  select f.slug, f.name, f.headline, f.description,
         f.ask_company, f.ask_message, f.success_message
  from lead_forms f
  where f.slug = p_slug and f.active
$$;

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
begin
  select * into f from lead_forms where slug = p_slug and active;
  if not found then
    raise exception 'Formular nicht gefunden';
  end if;

  if coalesce(trim(p_email), '') = '' and coalesce(trim(p_phone), '') = '' then
    raise exception 'E-Mail oder Telefonnummer erforderlich';
  end if;

  insert into contacts (org_id, first_name, last_name, email, phone, company,
                        lead_source, owner_id, notes)
  values (f.org_id, nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''),
          nullif(trim(p_email), ''), nullif(trim(p_phone), ''), nullif(trim(p_company), ''),
          f.source, f.owner_id, nullif(trim(p_message), ''))
  returning id into v_contact;

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
    return; -- keine Pipeline konfiguriert: Kontakt reicht
  end if;

  insert into deals (org_id, contact_id, pipeline_id, stage_id, title, value,
                     source, owner_id, setter_id)
  values (f.org_id, v_contact, v_pipeline, v_stage,
          coalesce(nullif(trim(p_company), ''),
                   nullif(trim(concat_ws(' ', p_first_name, p_last_name)), ''),
                   'Neuer Lead'),
          f.deal_value, f.source, f.owner_id, f.owner_id)
  returning id into v_deal;

  insert into activities (org_id, contact_id, deal_id, type, subject, body)
  values (f.org_id, v_contact, v_deal, 'note', 'Lead über Formular: ' || f.name,
          nullif(trim(p_message), ''));
end $$;

revoke all on function submit_lead_form(text, text, text, text, text, text, text) from public;
grant execute on function submit_lead_form(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public_lead_form(text) to anon, authenticated;

-- ============================================================
-- Echtzeit-Zusammenarbeit: Aenderungen an alle Clients streamen
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['deals','activities','tasks','contacts']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
