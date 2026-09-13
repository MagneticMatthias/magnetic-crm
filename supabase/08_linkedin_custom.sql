-- ============================================================
-- Aktivitaetstyp "linkedin" und Zusatzfelder fuer Messelisten.
-- Nach 07_attachments.sql ausfuehren.
-- ============================================================
alter type activity_type add value if not exists 'linkedin';
-- contacts.custom (jsonb) existiert bereits und nimmt Zusatzfelder wie
-- prio, standtyp, halle_stand, hauptaussteller, budgetklasse auf.
