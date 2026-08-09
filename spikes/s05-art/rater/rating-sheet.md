# S0.5 Blind-Rater Protocol

This is the gate for the art capability spike (plan Step 0, row S0.5) and,
scaled up, for the Step 7 content acceptance row. Read `../README.md` first
if you haven't — this sheet assumes the pipeline has already produced
splice-validated final clips (`tools/validate_splice.sh` passed).

## Who

**3 raters minimum.** Should not be the person who authored the character
rig/poses (they already know the answer and can't judge legibility blind).
Coworkers, friends, anyone who hasn't seen the pipeline work — the whole
point is a fresh, unbiased read.

## What they're shown, and in what order

Run the three tests **in this order**, and do not let raters see later
tests before earlier ones (in particular: don't let them see the full clip
before the windup-only test — that would bias the "no leak" measurement).

### Test 1 — Informative-frame finger-count identification (the main gate)

Show each rater the **single informative frame** (the frame at beat+300ms
or beat+150ms, per README.md §7 — for the S0.5 spike this is the one clip
produced; at Step 7 this repeats across all 20 rated renders per D12/R8).

Ask: **"How many fingers is the character showing?"** Free-response number,
no multiple choice hinting.

**Gate: 3/3 raters must answer correctly** (S0.5, one clip). At Step 7 this
becomes ≥95% correct over 20 rated renders × ≥3 raters (D12/R8) — not this
spike's job, but keep the sheet format identical so it drops in unchanged.

### Test 2 — Windup-only leak check (R1 proof, rater side)

Show each rater **only the windup segment** (extracted via the same method
`validate_splice.sh` uses, or simply the standalone `windup.webm`) — no
throw body, no reveal.

Ask: **"Guess how many fingers you think the throw will show (1-5)."** Make
clear this is a guess, not something they should expect to know — this
tests whether the windup accidentally leaks information, not whether
raters are good guessers.

**Gate: accuracy ≈ chance (20%, i.e. 1-in-5) across all guesses.**
Practically: with only 3 raters and 1 clip this is a very small sample —
treat any single correct guess as inconclusive, but treat **all 3 raters
independently guessing the same number, or all 3 being correct**, as a red
flag worth investigating even before Step 7's larger sample (5 fingers × 2
variants × ≥3 raters) makes the statistic meaningful. Log every guess in
the results table below regardless of sample size — Step 7 will want the
history.

### Test 3 — "Looks like a game character" rating

Show each rater the **full spliced clip** (windup + reveal, either reveal
variant).

Ask: **"On a scale of 1-5, how much does this look like a game character,
as opposed to a placeholder or test asset?"**

- 1 = obviously a placeholder / broken / unfinished
- 2 = rough, clearly early-stage
- 3 = acceptable but noticeably unpolished
- 4 = reads as an intentional character
- 5 = fully convincing, ship-ready

**Gate: median rating ≥ 4/5** (median across the 3 raters, this spike; at
scale, median across the full rater pool per clip).

## Results table template

Copy this per rating session. One row per rater; fill in per-clip if
running multiple clips (Step 7).

### Test 1 — Finger count from informative frame

| Rater | Clip (throwN_wXXX) | Actual fingers | Rater's answer | Correct? |
|---|---|---|---|---|
| R1 | | | | |
| R2 | | | | |
| R3 | | | | |

**Result: ___ / 3 correct.** Gate (S0.5): must be 3/3. PASS / FAIL: ___

### Test 2 — Windup-only guess

| Rater | Clip (windup only) | Actual fingers (not shown to rater) | Rater's guess | Correct? |
|---|---|---|---|---|
| R1 | | | | |
| R2 | | | | |
| R3 | | | | |

**Result: ___ / 3 correct** (chance ≈ 0.6/3 at 20%; small-N, log for
trend, don't gate hard on 3 samples alone — see Test 2 notes above).
Any concerning pattern (e.g. all raters guess the same number)? ___

### Test 3 — Game-character rating

| Rater | Clip | Rating (1-5) | Notes |
|---|---|---|---|
| R1 | | | |
| R2 | | | |
| R3 | | | |

**Median rating: ___** Gate: must be ≥ 4. PASS / FAIL: ___

## Overall gate

| Gate | Requirement | Result | Pass? |
|---|---|---|---|
| Finger-count ID | 3/3 correct | | |
| Windup-only no-leak | ≈ chance (qualitative at n=3) | | |
| Game-character rating | median ≥ 4/5 | | |

**Overall: PASS / FAIL.**

If FAIL on either the finger-count or rating gate → drop to the next
pre-authorized fallback tier (stylized → hands-only, README.md §9) and
re-run this whole sheet against the new pipeline output. Do not ship a
result that failed the gate with a note saying "close enough."
