-- ============================================================
-- Call-Flow Tracking, Formularfelder, E-Mail Cc/Bcc.
-- Nach 04_deal_panel.sql ausfuehren.
-- ============================================================

-- Wer hat abgenommen? (Gatekeeper / Entscheider)
alter table activities add column if not exists answered_by text
  check (answered_by is null or answered_by in ('gatekeeper','entscheider'));

-- Formulare: welche Felder abgefragt werden
alter table lead_forms add column if not exists ask_email boolean not null default true;
alter table lead_forms add column if not exists ask_phone boolean not null default true;
alter table lead_forms add column if not exists ask_last_name boolean not null default true;
alter table lead_forms alter column headline set default 'Lass uns in Kontakt treten!';
alter table lead_forms alter column description set default
  'Damit wir dich für ein kostenloses Erstgespräch kontaktieren können, benötigen wir zuerst deine Kontaktdaten.';

drop function if exists public_lead_form(text);
create or replace function public_lead_form(p_slug text)
returns table (
  slug text, name text, headline text, description text,
  ask_company boolean, ask_message boolean, ask_email boolean, ask_phone boolean,
  ask_last_name boolean, success_message text
)
language sql stable security definer set search_path = public as $$
  select f.slug, f.name, f.headline, f.description,
         f.ask_company, f.ask_message, f.ask_email, f.ask_phone, f.ask_last_name, f.success_message
  from lead_forms f
  where f.slug = p_slug and f.active
$$;
grant execute on function public_lead_form(text) to anon, authenticated;
