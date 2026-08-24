# morra event collector

The app already ships events: `apps/play/src/telemetry.ts` batches NDJSON to
`POST /log` every 2 s, plus a `sendBeacon` flush when the tab hides. In dev,
`spikes/serve.py` catches them; in production nothing did (404, dropped
silently). This directory is the production sink.

- `collector.mjs` — zero-dependency Node server on :9310. POST /log,
  1 MB body cap, 60 req/min per IP, every line must parse as JSON (≤8 KB)
  and is re-serialized with a server timestamp (`rx`) and a day-rotating
  `visitor` hash (sha256 of ip+day, truncated — no addresses stored).
  Appends to `/data/events-<utc-day>.ndjson`. Any `profileHash` field is
  **re-hashed with a server-side secret salt** before storage
  (`/data/.profile-salt`, auto-generated on first boot, excluded from
  stats.sh's rsync): the client hash is computable from the public repo +
  a name off the public Classificació, the stored one is not.

  Since 2026-08-22 it also serves **la Classificació global** — the one
  arcade table for every vessel:
  - `GET /classificacio` → `{ entries }` (top 10, no-store)
  - `POST /classificacio` with `{ name, levelId, score, you, rival }` →
    `{ entries, placement|null }`. Validation is the anti-cheat: name
    sanitized + capped at 12 chars; `you` must be 10; the score must fit the
    formula's range for (levelId, you, rival) — base × margin × style with
    style ∈ [1.0, 1.5], the same numbers apps/play's pinned-score tests
    define (retuning the formula changes both in one PR). The server stamps
    `at`; ties keep the earlier entry. Persists to `/data/classificacio.json`
    (same bind mount; reset = edit/delete that file, container restart picks
    it up).
  - `node test.mjs` runs the endpoint suite against a temp instance.
- `compose.yml` — runs it on the buzz stack's docker network
  (`buzz-prod_buzz-net`) so the shared Caddy reaches `morra-collector:9310`.
  Host data dir: `/srv/morra-logs`.
- `stats.sh` — rsyncs the logs down and runs the first-questions report with
  DuckDB (volume/day, funnel, vosk cache hit rate, throw outcomes, errors).

## Box-side install (one time)

```bash
# from the repo root on your laptop
rsync -avz deploy/collector/ root@178.105.134.73:/opt/morra-collector/
# the container runs as uid 1000 (node), so the bind-mount dir must be
# writable by it — without this the writes hit EACCES and the collector
# crash-loops while clients still get 204s (silent data loss).
ssh root@178.105.134.73 "mkdir -p /srv/morra-logs && chown 1000:1000 /srv/morra-logs"
ssh root@178.105.134.73 "cd /opt/morra-collector && docker compose up -d --build"
```

Then add the `/log` route to the morra vhost (already in
`deploy/morra.Caddyfile` — same swap procedure as the Cache-Control change:
replace the morra block in `/opt/buzz/deploy/compose/Caddyfile` with the repo
file, `caddy validate`, `caddy reload`).

⚠️ That Caddyfile is a SINGLE-FILE bind mount into the caddy container —
never edit it with `sed -i` (it swaps the inode; the container keeps reading
the old file while validate/reload "succeed" against it — seen live
2026-08-22). Edit via `cat > file` / `tee`, or simply
`docker restart buzz-prod-caddy-1` after the edit to re-resolve the mount
(a few seconds of downtime for buzz+morra).

## Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/x-ndjson' \
  --data '{"sessionId":"smoke","seq":0,"tPerf":0,"type":"smoke_test"}' \
  https://morra.joans.cat/log        # expect 204
ssh root@178.105.134.73 "tail -1 /srv/morra-logs/events-$(date -u +%F).ndjson"
```

## Notes

- Gameplay never depends on this: if the container is down, Caddy 502s and
  the app console-warns and moves on.
- Player names never leave the device: the `profile_active` /
  `firstrun_named` / `profile_change` events carry a `profileHash` (sha256
  of the case/space-folded name, truncated — `profile.ts:profileNameHash`),
  not the raw name. The logs can still group a player's events across
  sessions; they just can't recover who it is.
- Rotation: one file per UTC day; at hobby volume this needs no cleanup for
  years. `du -sh /srv/morra-logs` if curious.
