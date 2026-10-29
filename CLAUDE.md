# Magnetic CRM

Next.js 16 (App Router) + Supabase. Deutschsprachiges Vertriebs-CRM nach dem Setter-Closer-Prinzip.

## Befehle
- `npm run dev` – Entwicklung auf http://localhost:3000
- `npm run build && npm start` – Produktionsmodus
- `npx tsc --noEmit && npx eslint .` – vor jedem Commit
- `./deploy.sh` – auf dem Server: pull, Image bauen, Container neu starten

## Struktur
- `src/app/(app)/` geschuetzte Seiten, `src/app/f/[slug]` oeffentliche Lead-Formulare
- `src/app/actions/` Server Actions, `src/components/` UI, `src/lib/` Supabase-Clients/Typen/Filter
- `supabase/*.sql` in Reihenfolge ausfuehren (schema, 02…06)
- `scripts/migrate-projekttool.mjs` Uebernahme aus dem PocketBase-Projekttool

## Regeln
- Alle Tabellen mit RLS auf `org_id`; neue Tabellen brauchen Policy + Grants (siehe 06_grants.sql)
- Keine Secrets im Repo: `.env.local`, `migrate.env` sind ignoriert
- UI-Texte auf Deutsch, Produktname "Magnetic CRM"

## Offene Aufgabe: electronica 2026 abgleichen (Stand 29.09.2026)

Die importierte Liste "electronica 2026" (275 Kontakte, lead_source =
'electronica 2026', custom.messe = 'electronica 2026') stammt aus dem
Ausstellerverzeichnis **2024** (Bayern). Das 2026er Verzeichnis liegt auf
https://exhibitors.electronica.de/ausstellerportal/2026/start/ (Netzwerk
dafuer freigegeben).

Zu tun:
1. 2026er Verzeichnis lesen (alle Aussteller, Land/Ort/PLZ).
2. Jede der 275 Firmen abgleichen -> custom.aussteller_2026 = 'ja' / 'nein'
   (Namensabgleich tolerant: Rechtsform, Gross/Klein, Umlaute).
3. Neue bayerische Aussteller 2026, die nicht in der Liste sind, als
   CSV im Format der Bayern-Liste ausgeben (scripts/import-messeliste.mjs
   versteht die Kopfzeilen), Prio/Groesse leer lassen.
4. Skript dafuer: scripts/electronica-abgleich.mjs (neu), laeuft beim
   Nutzer mit migrate.env wie der Import. Ohne FIX=1 nur berichten.
5. Feld "Aussteller 2026" als Spalte + Filter (columns.tsx, filters.ts,
   CUSTOM_LABEL in DetailPanel).
Danach: gespeicherte Filter "electronica Telefon"/"electronica LinkedIn"
um "Aussteller 2026 = ja" ergaenzen (der Nutzer hat sie von Hand angelegt).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
