# Backup wiederherstellen

Die GitHub-Action `CRM – Tägliches Datenbank-Backup` legt jede Nacht einen
komprimierten `pg_dump` als Artefakt ab (30 Tage) und optional auf deinem Server.

## Wiederherstellen

1. Artefakt herunterladen (GitHub → Actions → Lauf auswählen → Artifacts)
   oder die Datei vom Server holen.
2. Zieldatenbank vorbereiten – bei einem **neuen** Supabase-Projekt zuerst
   die fünf Schema-Dateien aus `supabase/` ausführen, damit Rollen und
   Erweiterungen existieren.
3. Einspielen:

   ```bash
   gunzip -c crm-backup-2026-09-12_0243.sql.gz \
     | psql "postgresql://postgres.<projekt>:<passwort>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
   ```

   Die Verbindungs-URL findest du unter *Project Settings → Database →
   Connection string (Session pooler)*.

4. Prüfen: einloggen, Kontakte öffnen.

## Test-Restore

Einmal im Quartal auf ein leeres Test-Projekt einspielen. Ein Backup, das
nie zurückgespielt wurde, ist kein Backup.
