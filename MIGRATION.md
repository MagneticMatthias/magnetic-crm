# Daten aus dem Projekttool übernehmen

Das Skript `scripts/migrate-projekttool.mjs` liest Kunden, Ansprechpartner,
Projekte, Akquise-Listen mit Leads (inkl. Status-Verlauf und Wiedervorlagen)
und die Kontaktliste aus PocketBase und legt sie im CRM an.

| Projekttool | Magnetic_CRM |
|---|---|
| Kunde + Ansprechpartner | Kontakt mit Personen (Leadherkunft „Bestandskunde") + Deal in **Bestandskunden / Aktiv** |
| Offener Faden | Deal in **Angebot / Closing**, Phase nach Stufe (Erstgespräch / Angebot verschickt / Mündliche Zusage), Wert, nächster Schritt, Fälligkeit; Kunde über den Titel zugeordnet |
| Faden-Verlauf | Notizen („Schritt: …") |
| Nächster Schritt + wer dran | Aufgabe (Priorität hoch, wenn du dran bist) |
| Projekt (Pipeline) | offener Deal in **Angebot / Closing** |
| Projekt (abgeschlossen) | gewonnener Deal mit Auftragswert und Datum – für das Sales-Controlling |
| Erledigte Fäden, alte Akquise-Listen, Kontaktliste | werden **nicht** übernommen |

Bereits vorhandene Firmen (gleicher Name) werden übersprungen – das Skript
kann also mehrfach laufen.

## Ausführen (auf dem Mac, im Repo-Ordner)

1. **Service-Role-Key** holen: Supabase → Project Settings → API Keys → `service_role`
   (umgeht RLS – nur lokal verwenden, nie ins Repo, nie in die App).
2. PocketBase-Adresse und Admin-Login des Projekttools bereitlegen
   (z. B. `http://magnetic-nas:8090`, im Tailscale-Netz oder zu Hause).
3. Probelauf:

   ```bash
   PB_URL=http://magnetic-nas:8090 PB_ADMIN_EMAIL=du@... PB_ADMIN_PASS='...' \
   SUPABASE_URL=https://zlzpoazsyqygszelmqwg.supabase.co SUPABASE_SERVICE_ROLE_KEY='...' \
   DRY_RUN=1 node scripts/migrate-projekttool.mjs
   ```

4. Wenn die Zahlen passen – scharf, und die Beispieldaten dabei gleich weg:

   ```bash
   PB_URL=... PB_ADMIN_EMAIL=... PB_ADMIN_PASS='...' \
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY='...' \
   CLEAR=1 node scripts/migrate-projekttool.mjs
   ```

`CLEAR=1` löscht vorher **alle** Kontakte, Deals, Aktivitäten, Notizen und
Aufgaben der Organisation. Pipelines, Team und Einstellungen bleiben.
