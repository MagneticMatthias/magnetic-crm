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
