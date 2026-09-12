-- ============================================================
-- Deal-Panel: Marketing-Informationen (UTM), Setter-Informationen,
-- konfigurierbare Karten. Nach 03_ui_rework.sql ausfuehren.
-- ============================================================

alter table deals add column if not exists utm_source   text;
alter table deals add column if not exists utm_medium   text;
alter table deals add column if not exists utm_campaign text;
alter table deals add column if not exists utm_content  text;
alter table deals add column if not exists utm_term     text;
-- Setter-Qualifizierung liegt in deals.custom (jsonb): budget, entscheider,
-- zeitrahmen, bedarf, einwaende

-- Lead-Formular nimmt UTM-Parameter mit
create or replace function submit_lead_form(
  p_slug text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_company text,
  p_message text,
  p_utm jsonb default '{}'::jsonb
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
                     source, owner_id, setter_id,
                     utm_source, utm_medium, utm_campaign, utm_content, utm_term)
  values (f.org_id, v_contact, v_pipeline, v_stage, v_label,
          f.deal_value, f.source, f.owner_id, f.owner_id,
          left(p_utm->>'utm_source', 200), left(p_utm->>'utm_medium', 200),
          left(p_utm->>'utm_campaign', 200), left(p_utm->>'utm_content', 200),
          left(p_utm->>'utm_term', 200))
  returning id into v_deal;

  insert into notes (org_id, contact_id, deal_id, body)
  values (f.org_id, v_contact, v_deal,
          'Lead über Formular <strong>' || f.name || '</strong>' ||
          coalesce('<p>' || nullif(trim(p_message), '') || '</p>', ''));
end $$;

drop function if exists submit_lead_form(text, text, text, text, text, text, text);
revoke all on function submit_lead_form(text, text, text, text, text, text, text, jsonb) from public;
grant execute on function submit_lead_form(text, text, text, text, text, text, text, jsonb) to anon, authenticated;
