# Deploying Morra → morra.joans.cat

Morra is a **pure static site** (~76 MB: the app + the 42 MB Catalan vosk
model + 33 MB MediaPipe WASM). No backend runs. It just needs static hosting
over **HTTPS** (camera + mic require a secure context).

The plan reuses the **Hetzner box that already serves `buzz.joans.cat`**
(Caddy + Docker Compose, automatic Let's Encrypt). Morra becomes a second
vhost on the *same* Caddy — only one process can own :443.

## One-time setup

**1 · DNS** — done: `A morra → 178.105.134.73` at iwantmyname (same IP as buzz).

**2 · Mount the static dir into the Caddy container.** In the box's
`buzz/deploy/compose/compose.caddy.yml`, add one volume to the `caddy` service:

```yaml
  caddy:
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - /srv/morra:/srv/morra:ro          # ← add this line
      - buzz-caddy-data:/data
      - buzz-caddy-config:/config
```

**3 · Add the vhost.** Append the block in [`deploy/morra.Caddyfile`](morra.Caddyfile)
to the box's `buzz/deploy/compose/Caddyfile`.

**4 · First deploy + reload.** From this repo on a machine with SSH access to
the box:

```bash
deploy/deploy.sh                      # builds, fetches the model, rsyncs → /srv/morra
```

Then on the box, reload Caddy so it picks up the new vhost + volume:

```bash
cd buzz/deploy/compose && BUZZ_COMPOSE_TLS=true ./run.sh up -d caddy
```

Caddy issues the cert on the first request to `https://morra.joans.cat`.

## Routine deploys

Once set up, a deploy is just:

```bash
deploy/deploy.sh
```

rsync only ships changed files, so repeat deploys move ~1 MB (the app JS), not
the 75 MB of models/wasm.

## Automated deploys (optional)

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) does the same
from CI. It's `workflow_dispatch` (manual) until you verify the first run;
uncomment the `push` trigger to deploy on every merge to `main`. Add three repo
secrets: `DEPLOY_SSH_KEY` (a deploy key in the box's `authorized_keys`),
`DEPLOY_HOST` (`178.105.134.73`), `DEPLOY_USER`.

## Notes

- **The vosk model** (42 MB, from alphacephei) is gitignored; `deploy.sh` and
  the CI both fetch it once via `spikes/models/fetch-ca-model.sh`. Consider
  mirroring a copy somewhere you control in case that URL moves.
- **Telemetry** (`POST /log`) has no collector in production — it 404s and the
  app no-ops gracefully. To capture real-player field data you'd add a small
  `/log` service behind Caddy plus the audit's H3 hardening
  ([docs/security-audit-2026-08-20.md](../docs/security-audit-2026-08-20.md)).
- **Security headers** — the full CSP ships as a `<meta>` in `index.html`
  (works on any host); the header-only extras are in the Caddy block above
  (Caddy doesn't read the Netlify-style `public/_headers`).
- **Verify after deploy**: `dig +short morra.joans.cat` = `178.105.134.73`,
  then open `https://morra.joans.cat` on a phone, grant camera + mic, play a
  round — this also confirms voice recognition under the CSP.
