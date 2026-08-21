# morra event collector

The app already ships events: `apps/play/src/telemetry.ts` batches NDJSON to
`POST /log` every 2 s, plus a `sendBeacon` flush when the tab hides. In dev,
`spikes/serve.py` catches them; in production nothing did (404, dropped
silently). This directory is the production sink.

- `collector.mjs` — zero-dependency Node server on :9310. POST /log only,
  1 MB body cap, 60 req/min per IP, every line must parse as JSON (≤8 KB)
  and is re-serialized with a server timestamp (`rx`) and a day-rotating
  `visitor` hash (sha256 of ip+day, truncated — no addresses stored).
  Appends to `/data/events-<utc-day>.ndjson`.
- `compose.yml` — runs it on the buzz stack's docker network
  (`buzz-prod_buzz-net`) so the shared Caddy reaches `morra-collector:9310`.
  Host data dir: `/srv/morra-logs`.
- `stats.sh` — rsyncs the logs down and runs the first-questions report with
  DuckDB (volume/day, funnel, vosk cache hit rate, throw outcomes, errors).

## Box-side install (one time)

```bash
# from the repo root on your laptop
rsync -avz deploy/collector/ root@178.105.134.73:/opt/morra-collector/
ssh root@178.105.134.73 "cd /opt/morra-collector && docker compose up -d --build"
```

Then add the `/log` route to the morra vhost (already in
`deploy/morra.Caddyfile` — same swap procedure as the Cache-Control change:
replace the morra block in `/opt/buzz/deploy/compose/Caddyfile` with the repo
file, `caddy validate`, `caddy reload`).

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
