
## 6. Status (2026-08-17, night) — step 1 built

`packages/core/src/mirror2.ts` (pure, 14 tests on planted structure) +
`scripts/mirror2-report.mjs` (the library over a logged session). Built:
order-2 triples and H1/H2; steps Δ, staircase persistence; low/mid/high
regimes with dwell and leave-hazards; return times, "owed" digits, the deck
tell; bounce/loops/autocorrelation/runs; the weld p(g|f) with mutual
information, never-called totals, tot-avoidance; guess stats (repeat, chase,
chase-2, echo, stubborn, near-miss adjust); outcome-conditioned shifts
(f and g), shift-after-read, chase-own-success, tilt entropy; reactivity
(f = its last guess, mirroring, f | its previous fingers); reader stats (hit
rate, by level, feeding, its hit on you, fixed-guess ceiling); timing
(interval | f, sync delta | f, misses per word); predictability by family;
`rankExploitValue` — each of the rival's predictors priced **standalone**
(that habit alone, in points per 100 rounds vs a uniform aim; the ranking
key) and **marginal** (full read minus without it; small when other contexts
cover the same habit); `splitWindows` for last-30 vs previous-30.

On Jani's 120-round session it reads: `3,4→2` 71%, `2,3→4` 78%; a 2 calls 4
(38%), a 4 calls 7 (40%); chases El Rei's last fingers 42%; 5s take 4.3 s vs
3.2 s (a timing tell); hits its fingers 20% while "always 4" would hit 29%.
Exploit value: the whole read is worth 9.9 pts/100 on him; order-1 alone
9.7, order-2 9.1, prev-total 8.0, outcome+last-fingers 6.4, its-last-fingers
3.3; the marginals are all under 0.8 — the habits are one habit seen through
five contexts, which is itself the sentence L'Espill should say.

Next: L'Espill v2 layout (ranked tells with evidence + counter-move), then
the shadow-rival meter.

## 7. Status — step 2–3 built: the ranked tells and the layout

`packages/core/src/tells2.ts`: `computeTells2(history, ranking?)` turns the
mirror2 statistics into named tells — order-1, order-2, steps, staircase,
leave-high/low, dwell, owed digits, bounce, the weld, the chase, stubborn
re-guess, win-shift/win-stay, tilt, avoid-what-it-called, mirroring, the
reader gap, the timing tell — each with the sentence, the evidence (k of n),
the rival's counter-move (a clause after "El Rei: "), and the exploit value
of the family it feeds. Prices only when the whole read is worth ≥ 2
pts/100 (a standalone family can look valuable by small-sample luck on a
player El Rei cannot read); non-positive prices are not shown. Ranked
priced-first, then by evidence strength. `summarizeTrend(history, 30)`
scores El Rei's FULL read inside the last 30 rows vs the 30 before (a cold
read on 30 rows is noise), plus H1, reader hit and chase per window.
`computeExploitabilityV2` — the read's sequential argmax hit — feeds the
Explotabilitat tile (was the spike's read: 17% where v2 reads 34%).

L'Espill: "Els teus defectes — ordenats pel que li valen al rival" (top 6:
sentence, price, k of n, counter-move), the trends strip under the scope
row (Previsibilitat, Aleatorietat, Lectura, Persecució; green when moving
the right way), the read section unchanged. The ranking is memoized per
scope and refreshed every 5 rows so per-throw rerenders in Entrenament
stay cheap. On the 120-round session: read 30% in the last 30 vs 50% in
the 30 before.

Next: the shadow-rival meter in Entrenament, then missions.
