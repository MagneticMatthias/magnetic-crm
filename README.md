# Magnetic_CRM

Ein schlankes CRM für Vertriebsteams nach dem **Setter-Closer-Prinzip**.
Next.js (App Router) + Supabase (Auth, Postgres, Row Level Security, Realtime).

Funktional an gängige Setter-Closer-CRMs angelehnt, aber eigenständig gebaut: eigenes
Datenmodell, eigene Oberfläche, eigene Texte.

## Funktionsumfang

| Bereich | Was drin ist |
|---|---|
| **Pipelines** | Beliebig viele Pipelines (Setting, Closing, Upsell, Reaktivierung, Agenturen, Trainings) mit frei konfigurierbaren Phasen, Wahrscheinlichkeit, Farbe, Gewonnen-/Verloren-Kennzeichnung |
| **Pipeline-Ansicht** | Phasen als Tabs mit Zählern, darunter die Deal-Tabelle; Phase direkt im Panel wechseln |
| **Kontakte** | Kontakt = Firma mit beliebig vielen Ansprechpartnern (Hauptansprechpartner markiert), Website, Adresse, Leadherkunft, Opener-Kürzel; Tabelle mit Spaltenwahl und Mehrfachauswahl |
| **Filter** | Filter-Builder mit Feld / Bedingung / Wert, ODER-Gruppen, Datumsbedingungen („Zuletzt kontaktiert ist vor X Tagen"), speicherbare Filter |
| **Detail-Panel** | Slide-over mit Tabs Kontakt-Info, Aktivitäten und Notizen (Rich-Text, Bilder und Dateianhänge, anheften). Karten: Ansprechpartner (kompakte Zeilen, primärer Ansprechpartner, aufklappbare Bearbeitung), Deal-Name, Deal-Status, Stammdaten, Deal-Eigenschaften, Marketing-Informationen (UTM), Setter-Informationen, verknüpfter Kontakt, Aufgaben – Felder speichern beim Verlassen |
| **Deal-Ansicht** | Konfigurator je Nutzer: Karten per Drag & Drop sortieren, ein- und ausblenden |
| **Deals** | Wert, Phase, Setter, Closer, Leadquelle, erwarteter Abschluss, nächster Schritt, Phasen-Historie |
| **Call-Flow Tracking** | Karte im Panel: Anruf-Typ, „Wer hat abgenommen?" (Gatekeeper / Entscheider), Datum, Uhrzeit mit „Jetzt", mitlaufender Timer, Rich-Text-Notizen, Ergebnis schiebt den Deal weiter |
| **Lead Management** | Strukturiertes Call-Logging (Opening / Setting / Closing / Follow-up) mit Ergebnis, Dauer, Notiz – kein Freitext-Chaos |
| **Power Dialer** | Arbeitet eine Phase Deal für Deal ab: anrufen, Timer, Ergebnis per Klick, Deal automatisch weiterschieben, Wiedervorlage anlegen, automatisch zum nächsten |
| **Schlagzahl-Tracking** | Tages- und Wochenziele je Mitarbeiter, Zielerreichung, 14-Tage-Verlauf, Team-Tabelle |
| **E-Mail** | „E-Mail verfassen" mit Absenderwahl, Empfänger-Chips, Cc/Bcc, Vorlagen mit Platzhaltern; Versand über SMTP (Gmail, Microsoft 365, eigener Server), jede Mail landet im Verlauf |
| **Lead-Formulare** | Öffentliche Formularseiten unter `/f/<slug>` („Lass uns in Kontakt treten!", Vorwahl-Auswahl, konfigurierbare Felder); ein Absenden legt Kontakt + Deal in der gewählten Phase an und übernimmt UTM-Parameter |
| **Echtzeit-Zusammenarbeit** | Supabase Realtime: Änderungen erscheinen sofort bei allen; Presence zeigt, wer online ist und welche Zeile ein Kollege gerade offen hat (farbige Markierung mit Avatar) |
| **Aufgaben** | Fristen, Prioritäten, Zuweisung, Überfällig-Warnung, eigene und Team-Sicht |
| **Sales-Controlling** | Funnel je Pipeline, Umsatz je Monat, Umsatz nach Leadquelle (Kanal-ROI), Call-Quoten je Gesprächstyp, Team-Leaderboard |
| **Rechte** | Rollen Administrator / Manager / Closer / Setter, Mandantentrennung über RLS |

## Einrichtung

1. **Supabase-Projekt anlegen** (kostenloser Plan reicht zum Start).
2. Im SQL-Editor nacheinander ausführen:
   - `supabase/schema.sql`
   - `supabase/02_features.sql`
   - `supabase/03_ui_rework.sql`
   - `supabase/04_deal_panel.sql`
   - `supabase/05_callflow_forms.sql`
   - `supabase/07_attachments.sql` (Anhänge in Notizen, Storage-Bucket)
   - `supabase/06_grants.sql` (Zugriff der API-Rollen; noetig, wenn beim Projekt "Automatically expose new tables" aus ist)
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

### Kostenlos betreiben (Free-Plan)

Der Free-Plan pausiert Projekte nach 7 Tagen ohne Anfrage und hat keine
automatischen Backups. Beides deckt das Repo mit zwei GitHub-Actions ab:

| Workflow | Was er tut | Secrets |
|---|---|---|
| `keepalive.yml` | alle 2 Tage eine Mini-Abfrage → Projekt pausiert nie | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `backup.yml` | täglich `pg_dump`, 30 Tage als Artefakt, optional per SCP auf deinen Server | `SUPABASE_DB_URL` (Session-Pooler-URL), optional `BACKUP_SSH_*` |

Secrets anlegen unter *GitHub → Settings → Secrets and variables → Actions*.
Beide Workflows lassen sich über „Run workflow" sofort testen.
Wiederherstellen: siehe [`BACKUP.md`](./BACKUP.md).

Beim Anlegen des Supabase-Projekts **Region Frankfurt (eu-central-1)** wählen
und unter *Organization → Legal* den AV-Vertrag (DPA) abschließen.

### Team einladen

Kolleginnen und Kollegen registrieren sich selbst. Ein Administrator ordnet sie
unter **Einstellungen → Team** der passenden Rolle zu.

## Architektur

```
src/
  app/
    (app)/            Geschützter Bereich mit Sidebar-Shell
      dashboard/ kontakte/ pipelines/ dialer/ aufgaben/
      aktivitaeten/ schlagzahl/ formulare/ sales-controlling/ einstellungen/
    f/[slug]/         Öffentliche Lead-Formulare (ohne Login)
    login/ onboarding/
    actions/          Server Actions (crm, dialer, email, forms, goals, org, auth)
  components/         DetailPanel, FilterBuilder, RecordTable, Dialer, Charts, Composer
  lib/                Supabase-Clients, Typen, Labels, Formatierung, Mailer
supabase/
  schema.sql          Kerntabellen, Trigger, RLS
  02_features.sql     Dialer, E-Mail, Formulare, Ziele, Realtime
  03_ui_rework.sql    Ansprechpartner, Notizen, gespeicherte Filter
  04_deal_panel.sql   UTM-Felder, Lead-Formular mit UTM, Panel-Karten
  05_callflow_forms.sql  Wer hat abgenommen, Formularfelder
```

**Sicherheit:** Jede Tabelle hat Row Level Security auf `org_id`. Anonyme Besucher
kommen nur über zwei `security definer`-Funktionen an die Lead-Formulare heran und
können weder lesen noch beliebig schreiben.

## Noch offen

- OAuth-Anbindung von Gmail/Outlook-Postfächern (aktuell SMTP)
- Kalender-Sync (Google/Outlook) und Zoom-Termine
- Zapier/n8n-Konnektor auf Basis einer öffentlichen REST-API
- Import von Kontakten per CSV
