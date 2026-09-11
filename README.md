<p align="center">
  <img src="public/brand/pinvites-square.png" alt="Pinvites" width="128" />
</p>

# Pinvites

Pinvites is a self-hosted invitation and RSVP application for multiple events. It keeps households, RSVP submissions, and actual attendees separate so the primary dashboard number answers the useful question: how many people are coming?

The production stack is Next.js, strict TypeScript, PostgreSQL, Prisma, Tailwind CSS, Zod, generic SMTP, and Docker Compose. Guest invitation and management links use separate high-entropy tokens; an email address is never authority to change an RSVP.

## Production quick start

You need a Linux host with Docker Engine and Docker Compose v2, a DNS name, and an HTTPS reverse proxy or Cloudflare Tunnel.

1. Copy the environment template and fill every blank required value:

   ```sh
   cp .env.example .env
   openssl rand -hex 32
   ```

   Put the generated value in `APP_SECRET`. Generate a separate long random `POSTGRES_PASSWORD`, then set `DATABASE_URL` to a PostgreSQL URL using the Compose service name `db`, for example:

   ```text
   postgresql://pinvites:URL_ENCODED_PASSWORD@db:5432/pinvites?schema=public
   ```

   If the password contains URL-reserved characters, percent-encode it in `DATABASE_URL`. The unencoded value remains in `POSTGRES_PASSWORD` for PostgreSQL itself. Do not commit `.env` or reuse either secret.

2. Set `BASE_URL` to the final public HTTPS origin, with no path—for example `https://invites.example.com`. Absolute invitation, RSVP-management, artwork, QR, and calendar links derive from this value.

3. Build and start the application and private database:

   ```sh
   docker compose up -d --build
   docker compose ps
   ```

   The app waits for PostgreSQL, applies committed Prisma migrations, and then starts. The database has no host port. The web service publishes `${APP_PORT:-3000}` on the Docker host; restrict that port with the host firewall when Cloudflare Tunnel or another reverse proxy is the only intended entry point.

4. Create the first administrator over an interactive terminal:

   ```sh
   docker compose run --rm app pnpm admin:create
   ```

   The first administrator becomes the owner. There are no default credentials and no public registration. After signing in, the owner can invite additional administrators from the **Accounts** section of the main dashboard. To intentionally rotate an existing administrator’s password and revoke their sessions:

   ```sh
   docker compose run --rm app pnpm admin:create -- --update
   ```

   For unattended bootstrap, pass `PINVITES_ADMIN_EMAIL`, `PINVITES_ADMIN_NAME`, and `PINVITES_ADMIN_PASSWORD` with explicit `docker compose run -e ...` flags, then remove those values from the shell environment and history. Interactive setup is safer.

5. Visit `/api/health` through the local port or proxy. A healthy response confirms the process and database connection without exposing secrets or record counts.

## Administrator accounts and event ownership

Pinvites is invite-only. The first account created by `pnpm admin:create` is the owner. Only the owner sees account administration on the main dashboard and can create, resend, or revoke a seven-day account invitation; deactivate or reactivate an administrator; and sign that administrator out on every device.

An invitation is emailed through the configured SMTP transport. Whether delivery succeeds or fails, its one-time setup URL is also shown to the owner immediately so it can be copied and delivered through another trusted channel. Only a hash of the bearer token is stored. Accepting the invitation creates the account, consumes the token atomically, and starts a normal secure administrator session.

Invited administrators can create and manage only their own events, guests, RSVPs, artwork, email sends, exports, and QR codes. Direct URLs and server mutations enforce the same ownership boundary. The owner can view and manage every event. Deactivating an account immediately revokes its active sessions but preserves its events and audit history.

## Reverse proxies and HTTPS

TLS must terminate at Cloudflare Tunnel, Nginx/Nginx Proxy Manager, Caddy, or Traefik. The proxy should preserve the original host and send `X-Forwarded-Proto` and `X-Forwarded-For`. Set `TRUST_PROXY_HEADERS=true` only when clients cannot bypass that trusted proxy. When the published app port is reachable beyond the host, use the host firewall to restrict it to trusted proxy sources.

Public RSVP throttling always starts with a connection-level database bucket before it reads any client-supplied event or token value. If trusted client-IP headers are disabled or absent, Pinvites intentionally falls back to one shared, fail-safe bucket; that prevents spoofing but can throttle unrelated guests together. A production proxy should therefore overwrite the client-IP headers exactly as shown below and enable `TRUST_PROXY_HEADERS`.

An Nginx location looks like this:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    # Overwrite rather than append so clients cannot spoof the rate-limit IP.
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 16m;
}
```

Bearer invitation and management credentials appear in `/i/...` paths. Disable or redact request-target logging for `/i/` at every proxy/tunnel layer. With Nginx, add a more specific location using the same proxy headers:

```nginx
location ^~ /i/ {
    access_log off;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Pinvites also sends `Referrer-Policy: no-referrer` so same-origin asset and navigation requests do not repeat private URLs in Referer headers. Confirm that CDN, WAF, tunnel, APM, and error-reporting products do not retain full `/i/` request targets before sending invitations.

Match `client_max_body_size` to `MAX_UPLOAD_MB` with a little allowance for multipart overhead. In Nginx Proxy Manager, enable WebSocket support, preserve these forwarding headers, and request a certificate with “Force SSL.” In Caddy, `reverse_proxy 127.0.0.1:3000` supplies the standard forwarding headers automatically. A Cloudflare Tunnel installed on the host can target `http://localhost:3000`; keep `BASE_URL` set to the public `https://` hostname, not the tunnel target.

For a proxy or Cloudflare Tunnel running in another container, attach that container to `pinvites_edge` after this stack starts (`docker network connect pinvites_edge PROXY_CONTAINER`) and use `http://app:3000` as the upstream. Do not publish the database network or attach the proxy to it.

Secure cookies are derived from the HTTPS `BASE_URL`. Changing the public hostname requires updating `BASE_URL`, `TRUSTED_ORIGINS` when used, proxy routing, and any already-sent links that embed the old origin.

HTML responses use a fresh Content Security Policy nonce on every request. The
application therefore renders pages dynamically instead of caching HTML with a
reusable script authorization value.

## SMTP

Pinvites uses direct, generic SMTP—there is no vendor-specific API or simulated transport. Configure `SMTP_HOST`, `SMTP_FROM`, and the matching port/TLS/authentication settings in `.env`, then restart the app. Common combinations are port 587 with `SMTP_SECURE=false` and required STARTTLS, or port 465 with `SMTP_SECURE=true`.

If SMTP is absent, incomplete, unreachable, rejects authentication, or rejects a recipient, Pinvites reports that condition and records the real failed attempt. It never claims success. Successful status means the SMTP server accepted the message; it does not promise inbox delivery. Delivery logs retain the provider message ID and rejection response where available.

The application does not add tracking pixels and does not claim email-open or provider-delivery analytics. “Invitation opened” means the recipient’s personalized Pinvites link was opened. Each logical message has a unique idempotency key, and the database reserves it before SMTP so bulk actions cannot accidentally resend it. An ambiguous in-progress send is not automatically retried because SMTP may already have accepted it. If a process stops mid-send, the Email screen exposes the stale record after ten minutes; an administrator must check the SMTP provider, acknowledge the duplicate risk, and approve exactly one retry. Exhausted deliveries are removed from bulk selection until that explicit approval, so they cannot starve later recipients.

Management-link rotation keeps the working predecessor valid until SMTP accepts the replacement, then revokes older management tokens. This deliberately permits a brief overlap and ensures an unavailable mail server never destroys the guest’s existing edit access.

Invitation, confirmation, update, private management-link, and reminder messages each include responsive HTML and plain text. Never put guest tokens into logs, metadata, error-monitoring context, or third-party click rewriting.

## Persistent data

Compose creates two named volumes:

- `pinvites_postgres_data` contains PostgreSQL. PostgreSQL 18 stores its
  versioned data directory beneath `/var/lib/postgresql`, which is the mounted
  path used by this Compose file.
- `pinvites_media_data` contains uploaded event artwork under `/app/data/media`.

The database network is internal and the media volume is not served as an unguarded static directory. Media requests are resolved against stored keys and checked by the application. The container runs as UID/GID 1001 and drops Linux capabilities; if you replace the named media volume with a bind mount, grant that identity read/write access.

## Backup

Back up `APP_SECRET` in an encrypted secret manager or offline recovery store separately from the data files. A restore must use the same value: losing or changing it invalidates administrator password verification and every already-issued invitation, RSVP-management, and session token. Treat it as a credential, never include it in an unencrypted backup directory, and plan an explicit administrator/password and invitation-link recovery if intentional rotation is ever required.

Back up the database and media together so database storage keys always correspond to files. Quiesce the app for the short duration of both snapshots; otherwise an artwork change between `pg_dump` and `tar` can create an inconsistent pair. The following commands stream backups to the host without placing database dumps in a container:

```sh
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose stop app
docker compose exec -T db sh -c 'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "backups/postgres-${stamp}.dump"
docker compose run --rm --no-deps --entrypoint tar app -C /app/data -czf - media > "backups/media-${stamp}.tar.gz"
docker compose up -d app
docker compose ps
```

Create checksums, copy both files off-host, encrypt them according to your data policy, and test restores regularly. PostgreSQL dumps and artwork contain personal guest/event data; protect retention and access accordingly.

On macOS:

```sh
shasum -a 256 backups/*
```

On Linux:

```sh
sha256sum backups/*
```

## Restore

Restore is destructive to current application data. First stop the web service and take a safety backup. Then restore the matching database and media pair:

```sh
docker compose stop app
docker compose exec -T db sh -c 'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' < backups/postgres-YYYYMMDDTHHMMSSZ.dump
docker compose run --rm --no-deps --entrypoint tar app -C /app/data -xzf - < backups/media-YYYYMMDDTHHMMSSZ.tar.gz
docker compose up -d app
docker compose ps
```

The media extraction overwrites matching paths but does not remove unrelated newer files. For an exact point-in-time restore, restore into a new empty media volume and switch only after verification. Restore the original `APP_SECRET` before starting the app. Do not run `docker compose down -v` unless you explicitly intend to delete both persistent volumes.

## Upgrades and migrations

Before every upgrade, read release notes and take a database/media backup. Then pull the intended revision and rebuild:

```sh
docker compose pull db
docker compose build --pull app
docker compose up -d
docker compose ps
```

`prisma migrate deploy` runs before the server starts and applies only committed production migrations. Never use `prisma db push` or `prisma migrate dev` against production. A code rollback does not reverse a database migration; restore the pre-upgrade backup if a release requires database rollback.

For a one-off migration check without starting the web server:

```sh
docker compose run --rm app pnpm db:migrate
```

## Operations

Useful, non-destructive checks:

```sh
docker compose ps
docker compose logs --tail=200 app
docker compose logs --tail=200 db
docker compose exec db pg_isready --username=pinvites --dbname=pinvites
```

Compose rotates local container logs. Monitor disk space for both Docker volumes, alert on unhealthy containers and repeated login/email failures, and keep host Docker/PostgreSQL security updates current. PostgreSQL restarts and host shutdowns receive grace periods to reduce the chance of interrupted writes.

## Local development and quality checks

Use the Node and pnpm versions declared in `package.json`, provide a development `DATABASE_URL`, then run:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate:dev
pnpm dev
```

Before release:

```sh
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
docker compose build app
```

Never use production guest data in local development, and never commit `.env`, database dumps, uploaded artwork, invitation tokens, or RSVP-management links.
