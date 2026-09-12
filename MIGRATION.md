# Daten aus dem Projekttool übernehmen

Das Skript `scripts/migrate-projekttool.mjs` liest Kunden, Ansprechpartner,
Projekte, Akquise-Listen mit Leads (inkl. Status-Verlauf und Wiedervorlagen)
und die Kontaktliste aus PocketBase und legt sie im CRM an.

| Projekttool | Magnetic_CRM |
|---|---|
| Kunde | Kontakt (Leadherkunft „Bestandskunde") + Deal in Pipeline **Bestandskunden / Aktiv** |
| Ansprechpartner des Kunden | Ansprechpartner am Kontakt |
| Projekt (kind = pipeline) | Deal in **Angebot / Closing**, Phase nach Projektphase |
| Projekt (abgeschlossen) | gewonnener Deal mit Auftragswert und Datum – für das Sales-Controlling |
| Akquise-Liste → Lead | Kontakt (Leadherkunft = Listenname) + Deal in **Kaltakquise**, Phase nach Lead-Status |
| Lead-Historie | Aktivitäten (Status-Wechsel als Call, Notizen als Notiz) |
| Stand-Einträge | Notizen |
| Wiedervorlage | Aufgabe „Wiedervorlage anrufen" |
| Kontaktliste | Ansprechpartner am passenden Kontakt (nach Firma) oder neuer Kontakt |

Bereits vorhandene Firmen (gleicher Name) werden übersprungen – das Skript
kann also mehrfach laufen.

## Ausführen (auf dem Mac, im Ordner `crm/`)

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
