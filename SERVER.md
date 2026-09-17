# Magnetic_CRM auf dem eigenen Server

## So funktioniert das Deployment

```
Aenderung  ->  git push (main)  ->  GitHub baut Docker-Image  ->  NAS zieht es alle 15 Min
```

Du musst nach einer Aenderung nichts auf dem NAS tun. Ein Push auf `main`
reicht - von jedem Rechner aus.

## Einmalige Einrichtung

### 1. GitHub-Secrets (Repo -> Settings -> Secrets and variables -> Actions)

| Secret | Wert |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable Key (`sb_publishable_…`) |
| `SUPABASE_URL` | dieselbe Project URL (fuer Keep-alive) |
| `SUPABASE_ANON_KEY` | derselbe Publishable Key (fuer Keep-alive) |
| `SUPABASE_DB_URL` | Session-Pooler-URL (fuer das Backup) |

### 2. Image oeffentlich machen (dann braucht das NAS keinen Token)

GitHub -> Profil -> **Packages** -> `magnetic-crm` -> **Package settings** ->
Danger Zone -> **Change visibility** -> Public. Das Image enthaelt nur den
oeffentlichen Publishable Key, keine Geheimnisse.

(Alternative: Token mit `read:packages` als Datei `ghcr.token` neben
`nas-update.sh` ablegen.)

### 3. Aufgabenplaner im DSM

Systemsteuerung -> Aufgabenplaner -> Erstellen -> Geplante Aufgabe -> **Benutzerdefiniertes Skript**

- Aufgabe: `Magnetic_CRM aktualisieren`, Benutzer: **root**
- Zeitplan: taeglich, wiederholen **alle 15 Minuten**
- Skript:
  ```bash
  bash /volume1/01_Büro_Matthias/18_Magnetic_CRM/nas-update.sh
  ```
  (Pfad ggf. anpassen - `/volume1/` ist der Standard fuer die erste Freigabe)

Einmal "Ausfuehren" anklicken, danach laeuft es von selbst.

### 4. Erster Start

Im Container Manager beim Projekt `magnetic-crm`: Aktion -> **Bereinigen**, dann
Aktion -> **Erstellen** (er zieht jetzt das Image statt zu bauen).

## Erreichbarkeit

- LAN: http://magnetic-nas:3010
- Unterwegs: Tailscale an, gleiche Adresse (oder Tailscale-IP des NAS + `:3010`)

## Optional: oeffentliche Domain mit Reverse Proxy

Nur noetig, wenn das CRM ohne Tailscale aus dem Internet erreichbar sein soll
(z. B. fuer oeffentliche Lead-Formulare).


### A) Docker mit Traefik / nginx-proxy / Caddy-Docker-Proxy

In `docker-compose.yml` beim Service `crm` die Labels ergänzen (Beispiel Traefik,
Netzwerkname und Certresolver an dein Setup anpassen):

```yaml
    networks: [proxy]
    labels:
      - traefik.enable=true
      - traefik.http.routers.crm.rule=Host(`crm.magnetic-medien.de`)
      - traefik.http.routers.crm.entrypoints=websecure
      - traefik.http.routers.crm.tls.certresolver=letsencrypt
      - traefik.http.services.crm.loadbalancer.server.port=3000
networks:
  proxy:
    external: true
```

Bei nginx-proxy stattdessen `VIRTUAL_HOST`, `LETSENCRYPT_HOST` als Environment.

### B) nginx direkt auf dem Server

`/etc/nginx/sites-available/crm`:

```nginx
server {
    server_name crm.magnetic-medien.de;
    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d crm.magnetic-medien.de
```

### C) Caddy direkt auf dem Server

In `/etc/caddy/Caddyfile` anhängen, HTTPS macht Caddy automatisch:

```
crm.magnetic-medien.de {
    reverse_proxy 127.0.0.1:3010
}
```

```bash
systemctl reload caddy
```

## 3. DNS

Beim Domain-Anbieter einen A-Record `crm` → Server-IP anlegen (bei IPv6 zusätzlich AAAA).

## 4. Supabase

*Authentication → URL Configuration*:
- Site URL: `https://crm.magnetic-medien.de`
- Redirect URLs: `https://crm.magnetic-medien.de/**`

## Updates einspielen

```bash
cd /opt/magnetic-crm && ./deploy.sh
```

## Ohne Docker (Node + PM2)

```bash
cd /opt/magnetic-crm
cp .env.example .env.local && nano .env.local
npm ci && npm run build
pm2 start npm --name magnetic-crm -- start -- -p 3010
pm2 save
```

Reverse Proxy wie oben, Port 3010.

## Übergabe ans Projekttool

Gewonnene Deals bekommen im Deal-Panel den Knopf „Projekt im Projekttool anlegen".
Der CRM-Server meldet sich dafür als normaler Nutzer an der PocketBase an und legt
Kunde (falls neu), Projekt, Betrag und die Notizen als Verlauf an.

In der `.env` auf dem NAS (neben den Supabase-Werten) ergänzen:

```
PROJEKTTOOL_URL=http://magnetic-nas:8090
PROJEKTTOOL_EMAIL=deine@login-mail.de
PROJEKTTOOL_PASSWORT=dein-projekttool-passwort
```

Danach den Container neu starten. Ohne diese drei Werte zeigt der Knopf einen Hinweis.


## Zugangsdaten auf dem NAS: Datei statt Skript

Werte im Aufgabenplaner-Skript sind im DSM fuer jeden Admin im Klartext
sichtbar. Besser: eine Datei, die nur root lesen kann, und das Skript
verweist nur darauf.

1. Im File Station einen Ordner anlegen, z. B. `docker/magnetic-crm`.
2. Darin eine Datei `crm.env` mit TextEdit (reiner Text) anlegen:

```
NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
PROJEKTTOOL_URL=http://magnetic-nas:8090
PROJEKTTOOL_EMAIL=...
PROJEKTTOOL_PASSWORT=...
SMTP_HOST=smtp.ionos.de
SMTP_PORT=587
SMTP_USER=deine@magnetic-medien.de
SMTP_PASS=...
IMAP_HOST=imap.ionos.de
IMAP_PORT=993
IMAP_USER_2=info@magnetic-medien.de
IMAP_PASS_2=...
```

Weitere Postfaecher als IMAP_USER_3/IMAP_PASS_3 usw. (bis 5), bei anderem
Anbieter mit IMAP_HOST_3.

3. Aufgabenplaner-Skript (Benutzer root) ersetzen durch:

```bash
#!/bin/bash
ENV=/volume1/docker/magnetic-crm/crm.env
chmod 600 "$ENV"
IMG=ghcr.io/magneticmatthias/magnetic-crm:latest
docker pull -q $IMG
NEU=$(docker image inspect --format '{{.Id}}' $IMG)
ALT=$(docker inspect --format '{{.Image}}' magnetic-crm 2>/dev/null)
if [ "$NEU" != "$ALT" ]; then
  docker rm -f magnetic-crm 2>/dev/null
  docker run -d --name magnetic-crm --restart unless-stopped -p 3010:3000 --env-file "$ENV" $IMG
  docker image prune -f
fi
```

Nach einer Aenderung an `crm.env`: Container einmal neu erstellen
(Aufgabe ausfuehren reicht nicht, weil sich das Image nicht geaendert hat):
im Container Manager den Container `magnetic-crm` stoppen und loeschen,
dann die Aufgabe ausfuehren.

## Postfach-Abgleich (IMAP)

Mit `IMAP_HOST` (plus `SMTP_USER`/`SMTP_PASS`, optional `IMAP_USER`/`IMAP_PASS`)
liest das CRM Posteingang und Gesendet und legt Mails als Aktivitaet an,
deren Absender oder Empfaenger exakt einer E-Mail-Adresse eines
Ansprechpartners entspricht. Alles andere wird nicht gespeichert.
Laeuft, solange das CRM in einem Browser offen ist (alle 5 Minuten),
oder per Knopf unter Einstellungen -> Postfach-Abgleich.

Einmalig `supabase/09_mail_sync.sql` im SQL-Editor ausfuehren.
