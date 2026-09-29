# Magnetic_CRM

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
- UI-Texte auf Deutsch, Produktname "Magnetic_CRM"

## Messelisten
- `scripts/import-messeliste.mjs <datei.csv|json> "<Messe>"` importiert eine Liste
  (Kopfzeilen siehe HEADER_MAP), laeuft lokal mit `migrate.env`.
- `scripts/electronica-abgleich.mjs` gleicht die Liste "electronica 2026"
  (Kontakte mit lead_source 'electronica 2026', stammt aus dem 2024er
  Verzeichnis) mit https://exhibitors.electronica.de/ausstellerportal/2026/ ab:
  setzt custom.aussteller_2026 = ja/nein und halle_stand, schreibt
  electronica-2026-abgleich.csv (Bericht) und electronica-2026-neu-bayern.csv
  (neue bayerische Aussteller, importierbar mit import-messeliste.mjs) und
  ergaenzt die gespeicherten Filter "electronica Telefon"/"electronica LinkedIn"
  um Aussteller 2026 = ja. Ohne FIX=1 nur Bericht. Zwischenspeicher
  electronica-2026-verzeichnis.json (loeschen erzwingt Neuladen).
- Zusatzfeld custom.aussteller_2026 ist Spalte + Filter (columns.tsx,
  filters.ts, CUSTOM_LABEL in DetailPanel).
