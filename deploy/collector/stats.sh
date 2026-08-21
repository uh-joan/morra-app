#!/usr/bin/env bash
# stats.sh — pull the event logs from the box and answer the first questions.
# Needs duckdb (brew install duckdb) and ssh access to the box.
#
# Usage:  deploy/collector/stats.sh            # sync + full report
#         deploy/collector/stats.sh --no-sync  # re-run report on local copy
set -euo pipefail
cd "$(dirname "$0")"

DEPLOY_HOST="${DEPLOY_HOST:-178.105.134.73}"
DEPLOY_USER="${DEPLOY_USER:-root}"
LOGS_DIR=".logs"

if [[ "${1:-}" != "--no-sync" ]]; then
  mkdir -p "$LOGS_DIR"
  echo "→ syncing /srv/morra-logs from the box…"
  rsync -az "${DEPLOY_USER}@${DEPLOY_HOST}:/srv/morra-logs/" "$LOGS_DIR/"
fi

shopt -s nullglob
files=("$LOGS_DIR"/events-*.ndjson)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "no event files in $LOGS_DIR yet"
  exit 0
fi

# Events are read as raw JSON lines and fields extracted per query — new or
# missing payload fields can never break the report.
duckdb -c "
SET enable_progress_bar = false;
CREATE VIEW e AS
  SELECT json ->> 'type'      AS type,
         json ->> 'sessionId' AS session,
         json ->> 'visitor'   AS visitor,
         json ->> 'rx'        AS rx,
         json
  FROM read_ndjson_objects('$LOGS_DIR/events-*.ndjson');

SELECT '== volume per day ==' AS section;
SELECT substr(rx,1,10) AS day, count(*) AS events,
       count(DISTINCT session) AS sessions, count(DISTINCT visitor) AS visitors
FROM e GROUP BY 1 ORDER BY 1;

SELECT '== event types ==' AS section;
SELECT type, count(*) AS n FROM e GROUP BY 1 ORDER BY n DESC LIMIT 25;

SELECT '== onboarding funnel (distinct sessions) ==' AS section;
SELECT
  count(DISTINCT CASE WHEN type='page_load' THEN session END)          AS page_load,
  count(DISTINCT CASE WHEN type='firstrun_start' THEN session END)    AS firstrun_start,
  count(DISTINCT CASE WHEN type='firstrun_done' THEN session END)     AS firstrun_done,
  count(DISTINCT CASE WHEN type='onboarding_ready' THEN session END)  AS sensors_ready,
  count(DISTINCT CASE WHEN type='calibration_saved' THEN session END) AS calibrated,
  count(DISTINCT CASE WHEN type='game_reveal' THEN session END)       AS played_a_round
FROM e;

SELECT '== voice model: cache hit rate + load time ==' AS section;
SELECT json ->> 'fromCache' AS from_cache, count(*) AS loads,
       round(avg(CAST(json ->> 'ms' AS DOUBLE))) AS avg_ms,
       max(CAST(json ->> 'ms' AS DOUBLE)) AS max_ms
FROM e WHERE type='vosk_load' GROUP BY 1;

SELECT '== throw outcomes ==' AS section;
SELECT json ->> 'outcome' AS outcome, count(*) AS n
FROM e WHERE type='throw_outcome' GROUP BY 1 ORDER BY n DESC;

SELECT '== errors ==' AS section;
SELECT count(*) AS n, any_value(rx) AS example_at FROM e WHERE type='error';
"
