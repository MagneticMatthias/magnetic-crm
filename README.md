# Vertriebssuite – CRM

Ein schlankes CRM für Vertriebsteams nach dem **Setter-Closer-Prinzip**.
Next.js (App Router) + Supabase (Auth, Postgres, Row Level Security, Realtime).

Funktional an SalesSuite angelehnt, aber eigenständig gebaut: eigenes Datenmodell,
eigene Oberfläche, eigene Texte. Kein Code und keine Inhalte von dort übernommen.

## Funktionsumfang

| Bereich | Was drin ist |
|---|---|
| **Pipelines** | Beliebig viele Pipelines (Setting, Closing, Upsell, Reaktivierung, Agenturen, Trainings) mit frei konfigurierbaren Phasen, Wahrscheinlichkeit, Farbe, Gewonnen-/Verloren-Kennzeichnung |
| **Board** | Kanban mit Drag & Drop, Summen je Phase, Schnellanlage direkt in der Spalte |
| **Kontakte** | Stammdaten, Leadquelle, Verantwortlicher, Notizen, Volltext-Filter, verknüpfte Deals |
| **Deals** | Wert, Phase, Setter, Closer, Leadquelle, erwarteter Abschluss, nächster Schritt, Phasen-Historie |
| **Lead Management** | Strukturiertes Call-Logging (Opening / Setting / Closing / Follow-up) mit Ergebnis, Dauer, Notiz – kein Freitext-Chaos |
| **Power Dialer** | Arbeitet eine Phase Deal für Deal ab: anrufen, Timer, Ergebnis per Klick, Deal automatisch weiterschieben, Wiedervorlage anlegen, automatisch zum nächsten |
| **Schlagzahl-Tracking** | Tages- und Wochenziele je Mitarbeiter, Zielerreichung, 14-Tage-Verlauf, Team-Tabelle |
| **E-Mail** | Versand direkt aus Kontakt und Deal über SMTP (Gmail, Microsoft 365, eigener Server), Vorlagen mit Platzhaltern, jede Mail landet im Verlauf |
| **Lead-Formulare** | Öffentliche Formularseiten unter `/f/<slug>`; ein Absenden legt Kontakt + Deal in der gewählten Phase an |
| **Echtzeit-Zusammenarbeit** | Supabase Realtime: Änderungen an Deals, Calls, Aufgaben und Kontakten erscheinen sofort bei allen; Presence zeigt, wer online ist |
| **Aufgaben** | Fristen, Prioritäten, Zuweisung, Überfällig-Warnung, eigene und Team-Sicht |
| **Sales-Controlling** | Funnel je Pipeline, Umsatz je Monat, Umsatz nach Leadquelle (Kanal-ROI), Call-Quoten je Gesprächstyp, Team-Leaderboard |
| **Rechte** | Rollen Administrator / Manager / Closer / Setter, Mandantentrennung über RLS |

## Einrichtung

1. **Supabase-Projekt anlegen** (kostenloser Plan reicht zum Start).
2. Im SQL-Editor nacheinander ausführen:
   - `supabase/schema.sql`
   - `supabase/02_features.sql`
3. `.env.example` nach `.env.local` kopieren und die Supabase-Werte eintragen.
4. Installieren und starten:

   ```bash
   npm install
   npm run dev
   ```

5. Unter `http://localhost:3000` registrieren. Beim ersten Login legst du die
   Organisation an – die Standard-Pipelines entstehen automatisch, Beispieldaten
   sind optional.

### E-Mail-Versand aktivieren

SMTP-Zugangsdaten kommen aus der Umgebung, **nicht** aus der Datenbank:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=du@deine-domain.de
SMTP_PASS=<App-Passwort>
```

Absendername, Absenderadresse und Signatur stellst du dann in der App unter
**Einstellungen → E-Mail-Versand** ein.

### Team einladen

Kolleginnen und Kollegen registrieren sich selbst. Ein Administrator ordnet sie
unter **Einstellungen → Team** der passenden Rolle zu.

## Architektur

```
src/
  app/
    (app)/            Geschützter Bereich mit Sidebar-Shell
      dashboard/ pipeline/ kontakte/ deals/ dialer/
      aufgaben/ aktivitaeten/ schlagzahl/ formulare/ berichte/ einstellungen/
    f/[slug]/         Öffentliche Lead-Formulare (ohne Login)
    login/ onboarding/
    actions/          Server Actions (crm, dialer, email, forms, goals, org, auth)
  components/         UI-Bausteine, Board, Dialer, Charts, Composer
  lib/                Supabase-Clients, Typen, Labels, Formatierung, Mailer
supabase/
  schema.sql          Kerntabellen, Trigger, RLS
  02_features.sql     Dialer, E-Mail, Formulare, Ziele, Realtime
```

**Sicherheit:** Jede Tabelle hat Row Level Security auf `org_id`. Anonyme Besucher
kommen nur über zwei `security definer`-Funktionen an die Lead-Formulare heran und
können weder lesen noch beliebig schreiben.

## Noch offen

- OAuth-Anbindung von Gmail/Outlook-Postfächern (aktuell SMTP)
- Kalender-Sync (Google/Outlook) und Zoom-Termine
- Zapier/n8n-Konnektor auf Basis einer öffentlichen REST-API
- Import von Kontakten per CSV
