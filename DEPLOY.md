# Magnetic_CRM online stellen (Vercel, kostenlos)

Der Dev-Server auf dem MacBook ist nur im eigenen WLAN erreichbar. Für Handy,
Team und unterwegs braucht die App einen Server, der immer läuft – Vercel
(Hersteller von Next.js) macht das im Hobby-Plan kostenlos.

## Einmalig einrichten (ca. 5 Minuten)

1. https://vercel.com → mit GitHub anmelden
2. **Add New… → Project** → Repo `zeit-app` auswählen → **Import**
3. **Root Directory** → „Edit" → `crm` auswählen (wichtig – sonst baut Vercel die Kalender-App)
4. **Environment Variables** – zwei Einträge:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://zlzpoazsyqygszelmqwg.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = dein Publishable Key (`sb_publishable_…`)
   Optional für E-Mail-Versand: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`
5. **Production Branch**: unter *Settings → Git* auf `claude/salessuite-analysis-rebuild-lugf8p`
   stellen, solange das CRM noch nicht in `main` gemergt ist
6. **Deploy** → nach 1–2 Minuten gibt es eine Adresse wie `zeit-app-crm.vercel.app`

## Danach in Supabase

*Authentication → URL Configuration*:
- **Site URL**: die Vercel-Adresse (z. B. `https://zeit-app-crm.vercel.app`)
- **Redirect URLs**: dieselbe Adresse mit `/**` dahinter

Sonst verlinken Bestätigungs-Mails auf `localhost` und laufen ins Leere.

## Ab dann

Jeder Push auf den Branch baut automatisch neu. Eigene Domain (z. B.
`crm.magnetic-medien.de`) unter *Settings → Domains* – ebenfalls kostenlos.
