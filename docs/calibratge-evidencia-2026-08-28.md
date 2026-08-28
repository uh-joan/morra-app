# Calibratge per evidència — option C design (not built)

Status: **designed, deliberately not built** (2026-08-28). Option B shipped
first (PR #60): the play detour is gone, the tripulants carry a passive
invitation pill while a profile+camera has no fit. This doc is the agreed
next step for when the passive pill proves insufficient — invite calibration
only after the game itself shows evidence of misreads.

## The principle

Nobody is ever interposed (that decision is settled — see PR #60). Option C
sharpens *when* the invitation appears and *what it says*: an invite backed
by "the table just misread you N times" converts honestly; a passive pill is
easy to ignore. Evidence must be recent and dense — a couple of misses across
a good session is noise.

## What counts as evidence (and what must NOT)

Every throw resolves to a `SyncOutcomeAll` (`analysis.ts`). The families:

| Outcome | Copy today | Counts? | Why |
| --- | --- | --- | --- |
| `hand-only` | «cap crit sentit» | **yes** | shout missed → mic/vadMult territory |
| `voice-only` | «cap tirada de mà vista» | **yes** | throw missed → highV/lowV territory |
| `voice-late` / `voice-early` | «massa tard» / «massa aviat» | **no** | rhythm — practice fixes it, thresholds don't |
| `synced` | — | resets nothing, fills the window | good rounds dilute the signal |
| `reset` | — | excluded | not a read at all |

Caveat carried from the field: some `hand-only` misses are voice energy under
the constant 0.015 live-VAD floor (`entorn.ts`), which calibration cannot
lower. The invite therefore says «pot ajudar», never «ho arreglarà» — and see
"the massa-fluix coach" below for the honest counterpart.

## The trigger

- Sliding window over the last **10** completed throws, per profile+camera
  site (`calibrationSiteKey()`), fed by `addThrowObserver` — the same hook
  calibration.ts already uses.
- Fires when **≥4 fixable misreads in the window**, or **3 consecutive**.
- Session-scoped, in memory. A genuinely bad setup re-earns the trigger next
  sitting in under a minute; nothing persists.
- The evidence invite fires at most **once per session**, and only while
  `!hasCalibrationForCurrentSite()`.
- A saved fit clears the window.

## Where it surfaces

Never mid-fight (frustration peak, kids mid-flow). Two surfaces, both cheap:

1. **The match-end card** — the natural pause, evidence fresh. One line and a
   button: «La taula no t'ha llegit bé unes quantes rondes — un minut de
   calibratge pot ajudar.» → **Calibra** (copy is a draft — Jani is the
   Catalan ground truth). Exit from calibration returns wherever the end
   card's own buttons would go.
2. **The tripulants pill (from option B) revives on evidence** — a session
   dismiss (✕) normally silences it until reload; a fresh trigger brings it
   back once, with the evidence copy above instead of the passive one.

Attribution rule (children play this): the copy always blames the table,
never the player. The void-round copy already gets this right for the
fixable cases; keep that register.

## The massa-fluix coach (companion, separate change)

Since sub-floor voice energy is the dominant miss and calibration can't fix
it: on a `hand-only` miss, check the shout-window RMS. Energy *near but
under* the floor → the right response is not the calibration invite but a
coaching line — «Crida una mica més fort!» — the quiet cousin of the existing
`clipWarn` («Massa fort!»). Ships separately (it touches mic internals, not
screens); the evidence counter should NOT count a miss that the coach line
already explained.

## Telemetry

- New: `calibration_evidence_trigger { site, window: [outcomes], counts }`.
- Extend: `calibration_invite_go` / `calibration_invite_dismiss` gain
  `source: "passive" | "evidence"` — the measure of whether option C earns
  its keep is evidence-invites converting better than the passive pill.
- Before building, check the collector for how often `firstrun_done
  {outcome:"direct"}` players later reach calibration at all.

## Out of scope (decided)

- No interposition, ever — the detour stays dead.
- No mid-fight toasts or banners.
- No persistence of the evidence window across sessions.
- Targeted calibration (pre-focusing the session on mic vs hand based on
  which outcome dominated) is v2 polish at most.
