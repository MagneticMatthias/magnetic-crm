-- ============================================================
-- Zugriff fuer die API-Rollen freigeben.
-- Noetig, wenn beim Anlegen des Supabase-Projekts
-- "Automatically expose new tables" ausgeschaltet war.
-- RLS bleibt aktiv und regelt weiterhin, wer welche Zeilen sieht.
-- ============================================================
grant usage on schema public to anon, authenticated;
grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- Server-Rolle (Migration, Backups, Admin-Skripte)
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
