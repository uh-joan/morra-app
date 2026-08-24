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
  # --exclude .profile-salt: the server-side salt must never leave the box
  rsync -az --exclude ".profile-salt" "${DEPLOY_USER}@${DEPLOY_HOST}:/srv/morra-logs/" "$LOGS_DIR/"
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

-- ================= retention (Rang de bord phase 0, 2026-08-22) =========
-- The retention key is profileHash (stable, pseudonymous — PR #40): the
-- day-rotating visitor hash deliberately can't follow a player across days.
-- A day counts as PLAYED only when a real round resolved (game_reveal) in
-- one of that profile's sessions — opening the app is presence, not play.
-- Materialized slim table: joining VIEWS over read_ndjson_objects trips a
-- DuckDB pushdown bug (a bogus cast-to-numerical of the raw json column);
-- a typed table sidesteps it and single-scans the files. NOTE: this whole
-- SQL block lives in a shell double-quoted string - no double quotes here.

CREATE TABLE evt AS
  SELECT json ->> 'type' AS type,
         json ->> 'sessionId' AS session,
         json ->> 'rx' AS rx,
         substr(json ->> 'rx', 1, 10) AS day,
         json ->> 'profileHash' AS profileHash
  FROM read_ndjson_objects('$LOGS_DIR/events-*.ndjson');

CREATE VIEW session_profile AS
  SELECT session, any_value(profileHash) AS profile
  FROM evt WHERE type='profile_active' AND profileHash IS NOT NULL
  GROUP BY session;

CREATE VIEW profile_open_days AS
  SELECT DISTINCT sp.profile, evt.day
  FROM evt JOIN session_profile sp ON sp.session = evt.session;

CREATE VIEW profile_played_days AS
  SELECT DISTINCT sp.profile, evt.day
  FROM evt JOIN session_profile sp ON sp.session = evt.session
  WHERE evt.type='game_reveal';

SELECT '== players per day (opened vs played) ==' AS section;
SELECT o.day,
       count(DISTINCT o.profile) AS opened,
       count(DISTINCT p.profile) AS played
FROM profile_open_days o
LEFT JOIN profile_played_days p ON p.profile = o.profile AND p.day = o.day
GROUP BY 1 ORDER BY 1;

SELECT '== retention cohorts (by first PLAYED day) ==' AS section;
WITH firsts AS (
  SELECT profile, min(day) AS d0 FROM profile_played_days GROUP BY 1
)
SELECT f.d0 AS cohort_day,
       count(DISTINCT f.profile) AS cohort,
       count(DISTINCT CASE WHEN pd.day = CAST(CAST(f.d0 AS DATE) + 1 AS VARCHAR) THEN f.profile END) AS d1,
       count(DISTINCT CASE WHEN pd.day >  f.d0 AND CAST(pd.day AS DATE) <= CAST(f.d0 AS DATE) + 7  THEN f.profile END) AS within_d7,
       count(DISTINCT CASE WHEN pd.day >  f.d0 AND CAST(pd.day AS DATE) <= CAST(f.d0 AS DATE) + 30 THEN f.profile END) AS within_d30
FROM firsts f
LEFT JOIN profile_played_days pd ON pd.profile = f.profile
GROUP BY 1 ORDER BY 1;

SELECT '== play streaks (consecutive played days, per profile) ==' AS section;
WITH runs AS (
  SELECT profile, day,
         CAST(day AS DATE) - CAST(row_number() OVER (PARTITION BY profile ORDER BY day) AS INTEGER) AS grp
  FROM profile_played_days
), streaks AS (
  SELECT profile, count(*) AS len, max(day) AS last_day
  FROM runs GROUP BY profile, grp
)
SELECT profile,
       max(len) AS best_streak,
       max(CASE WHEN last_day = (SELECT max(day) FROM profile_played_days) THEN len ELSE 0 END) AS current_streak,
       count(*) AS separate_runs
FROM streaks GROUP BY 1 ORDER BY best_streak DESC LIMIT 20;

SELECT '== per-profile summary (who is coming back) ==' AS section;
SELECT sp.profile,
       min(evt.day) AS first_seen,
       max(evt.day) AS last_seen,
       count(DISTINCT evt.day) AS days_seen,
       count(DISTINCT CASE WHEN evt.type='game_reveal' THEN evt.day END) AS days_played,
       count(CASE WHEN evt.type='game_reveal' THEN 1 END) AS rounds,
       count(DISTINCT evt.session) AS sessions
FROM evt JOIN session_profile sp ON sp.session = evt.session
GROUP BY 1 ORDER BY last_seen DESC, days_played DESC LIMIT 20;

SELECT '== last thing lapsed profiles did (churn signal) ==' AS section;
WITH last_ev AS (
  SELECT sp.profile, evt.type, evt.rx, evt.day,
         row_number() OVER (PARTITION BY sp.profile ORDER BY evt.rx DESC) AS rn
  FROM evt JOIN session_profile sp ON sp.session = evt.session
  WHERE evt.type NOT IN ('route','route_apply','screen_change','framing','ready_pill')
)
SELECT l.profile, l.day AS last_day, l.type AS last_meaningful_event
FROM last_ev l
WHERE l.rn = 1
  AND CAST(l.day AS DATE) < (SELECT max(CAST(day AS DATE)) FROM evt) - 2
ORDER BY l.rx DESC LIMIT 15;
"
