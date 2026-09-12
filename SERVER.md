# Magnetic_CRM auf dem eigenen Server

Die App läuft als Docker-Container auf Port 3010 (nur lokal). Davor sitzt der
Reverse Proxy, der auf dem Server ohnehin schon die anderen Apps bedient.

## 0. Was läuft auf dem Server? (30 Sekunden)

```bash
docker ps --format '{{.Names}}  {{.Image}}  {{.Ports}}' 2>/dev/null || echo "kein Docker"
ls /etc/nginx/sites-enabled /etc/caddy 2>/dev/null
which pm2 && pm2 ls
```

Zeigt `traefik`, `caddy` oder `nginx-proxy` in der Docker-Liste → Abschnitt A.
Zeigt `/etc/nginx/sites-enabled` Dateien → Abschnitt B.
Zeigt `/etc/caddy/Caddyfile` → Abschnitt C.

## 1. Einmalig: Code holen und konfigurieren

```bash
cd /opt          # oder wo deine anderen Apps liegen
git clone https://github.com/MagneticMatthias/magnetic-crm.git
cd magnetic-crm
cp .env.example .env
nano .env        # NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY eintragen, SMTP optional
./deploy.sh
```

Danach antwortet `curl -I http://127.0.0.1:3010/login` mit `HTTP/1.1 200`.

## 2. Reverse Proxy – nur EINEN Abschnitt anwenden

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
