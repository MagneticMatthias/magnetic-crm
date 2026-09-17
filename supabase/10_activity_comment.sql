-- Eigene Anmerkung zu einer Aktivitaet, getrennt vom Inhalt.
-- Bei importierten Mails ist der Inhalt die Mail selbst - der Kommentar
-- dazu ("hat abgesagt, 2026 kein Budget") braucht ein eigenes Feld.
alter table activities add column if not exists comment text;
