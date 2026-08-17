# L'Espill v2 — a brainstorm: everything worth measuring about a morra player, and how it becomes a coach

*2026-08-17. Companion to `docs/rival-intelligence-research.md`. The rival now
reads you (v2 engine, §7–9); this is the other half of the same idea — the
mirror reads you too, tells you what it sees in words, and turns it into a
drill. Nothing here is built; it is the map before the road.*

## 0. The frame

Three sentences carry the whole design.

1. **A weakness is anything a rival could predict.** Not "you throw 5 a lot" —
   *"a rival that guesses 5 after your 3 gains 4 points per 100 rounds on you."*
   Every statistic below is worth showing only in proportion to how much a
   rival earns from it. We can compute that exactly: replay the v2 engine
   with and without the predictor and count the rounds. That number — **exploit
   value**, points per 100 rounds — is the ranking key for everything.
2. **A strength is anything you can predict about the rival.** The mirror
   must score you as a *reader*, not only as a *thrower*. Against Nino we know
   the ceiling (his tells are ours), so a "reading gap" is computable.
3. **The loop is detect → explain → drill → verify.** A statistic that ends at
   a number is decoration. Each named tell needs the sentence, the evidence,
   what the rival does with it, a mission in Entrenament that targets it, and a
   before/after that proves it faded. The literature is on our side: people
   *can* learn to generate random-like sequences with feedback (Neuringer 1986;
   the human-random-generation studies) — L'Espill is that feedback.

What we already have (core `mirror.ts`): exploitability (best simple
predictor's hit rate), a randomness score (redundancy), f/g/call histograms,
the order-1 bigram heatmap, sync stats, four named tells (repeat rate,
win-stay/lose-shift, finger–call correlation, sequence habit), and — since
today — the rival's read (`explainReadV2`). Everything below extends that.

## 1. Statistics — the long list

Grouped by what they are *about*. Each entry: what to compute → the sentence
it becomes → why a rival cares. `f` = your fingers, `g` = your guess (call − f),
`af/ag` = rival's, `w` = verdict.

### 1.1 Sequence structure of your fingers (f)

- **Order-2 (three-number sequences).** P(f_t | f_{t−2}, f_{t−1}); the top
  triples; conditional entropy H(f | last two) vs H(f | last one). → *"Després
  d'un 2 i un 4, tires un 5 el 58% de les vegades."* The order-2 context is
  already the best single predictor on several players (§8: 26% weight on
  yours). Show the top 3 triples with counts, and hide anything under 4
  samples.
- **Steps Δ = f_t − f_{t−1}.** Distribution over −4..+4. Humans over-use ±1 and
  under-use 0 (negative recency) and rarely jump 1↔5. → *"Puges o baixes d'un
  en un el 46% de les vegades — un rival que aposta a f±1 té dues opcions en
  lloc de cinc."* Also **direction persistence**: P(rise | just rose) — the
  staircase 1-2-3 / 5-4-3.
- **Low/high regime.** Low {1,2}, mid {3}, high {4,5}. Dwell-time distribution
  in each (how many consecutive throws you stay); the 3×3 regime transition
  matrix; mean run length; "dive" and "climb" rates. → *"Quan ets als alts, t'hi
  quedes 3,4 tirs de mitjana i després caus a l'1."* This is the "time in low
  vs high" you asked for — and it's a real predictor: after k throws high, the
  hazard of dropping rises.
- **Parity and extremes.** Odd/even runs; P(1 or 5) after a mid; do you avoid
  extremes when trailing?
- **Return time / gap filling.** For each digit, rounds since last thrown; P(throw
  d | gap ≥ k). The gambler's-fallacy tell: after not throwing 3 for eight
  rounds, do you "owe" it? → *"Quan portes 6 tirs sense un 3, el 3 arriba el 41%."*
  Conversely **coverage streaks**: do you cycle through all five before repeating
  (a "deck" pattern) — very human, very readable.
- **Bounce a-b-a and loops.** P(f_t = f_{t−2}); autocorrelation at lags 1..6;
  a tiny periodicity detector (does a 3- or 4-cycle explain more than chance?).
  → *"Fas 2-4-2 sovint: després de sortir d'un número, hi tornes."*
- **Run lengths.** Distribution of repeat streaks; longest; P(repeat | already
  repeated once). Repeat rate exists; the *shape* doesn't.
- **Block entropies and the entropy rate.** H1, H2, H3 (per-symbol) and an LZ
  complexity ratio, in bits, next to the uniform 2.32. Show as one line
  ("aleatorietat 1.9 / 2.32 bits") — but rank by exploit value, not by bits.
- **Predictability by predictor family** — the exploitability panel, itemized:
  hit rate of marginal / order-1 / order-2 / prev-outcome / prev-rival-fingers
  / prev-total / step-model, each vs 20%. → *"El que més et delata: la
  seqüència (28%). El que menys: els teus preferits (21%)."* This is the
  BMA's weight vector, said in words — the same list the rival uses.

### 1.2 The call channel (g) and the f–g coupling

- **The weld, per finger** (T3): p(g | f), your favourite call for each f, and
  the strength of the coupling as mutual information I(f;g). → *"Quan mostres
  2, cantes 4 la meitat de les vegades — el rival ho sap: si veu un 2, s'amaga
  del 2."*
- **Call preferences.** Distribution of the total; the never-called totals
  ("mai cantes 3 ni 10"); "tot" avoidance (T3: 5→g5 only 12%); call parity.
- **g sequences.** Repeat rate of g; p(g | prev g); the "second-chance" tell —
  after guessing wrong, do you re-guess the same (stubborn) or move (shift)?
- **The chase** (T2): p(g = rival's previous fingers) — exists at population
  level (26%); show yours, and the reverse: p(g = rival's fingers two rounds
  ago).
- **The echo.** p(g = rival's previous *guess*), p(g = previous total − your f)
  — do you re-use last round's arithmetic?
- **Near-miss reaction.** After your call was off by one, what do you do next
  (adjust by one in the same direction? that's predictable).

### 1.3 Outcome-conditioned behaviour (win/lose/parata)

- **Win-shift / lose-stay** for f and for g separately (T1 exists for f).
  → *"Quan guanyes, canvies el 90% de les vegades — un rival sap que després
  del teu punt no repetiràs."*
- **After being read.** After the rival guessed your fingers (whether or not it
  scored), do you shift more, jump further, go to an extreme?
- **After reading it.** After you hit its fingers, do you re-guess the same
  (chase your own success)?
- **Tilt.** After 2–3 losses in a row: entropy of your next throws, step size,
  incomplete/retraction rate, throw interval. → *"Després de dues derrotes
  seguides, et tornes un 30% més previsible."*
- **Pressure.** Behaviour at match point (yours / theirs), when leading by 3,
  when trailing: distribution shifts, sync rate, hesitation.

### 1.4 Rival-conditioned behaviour (reactivity)

- **f | rival's previous fingers**; **f | rival's previous guess about you**
  (do you avoid the number it just called on you? that is one of the most
  exploitable human reflexes: "it said 4, so not 4"); **f | previous total**.
- **Mirroring.** p(f_t = af_{t−1}) — copying its hand.
- **Cross-correlation** between your f series and its f series at lags 1–2;
  between your g and its f.
- **Level-specific habits.** The same tells split by rival (do you play Nino
  differently from El Rei? you should).

### 1.5 You as a reader (the other half)

- **Hit rate on the rival's fingers**, per level, over time, vs 20%.
- **Reading gap vs the ceiling.** For Nino the generative model is known: the
  best fixed strategy against his tells hits ~28% on fingers (prefers 3/5,
  repeats 15%). Your rate vs that ceiling = how much of a *readable* opponent
  you are leaving on the table. → *"Nino tira 3 o 5 el 55% del temps; tu els
  has endevinat el 31%. Hi ha punts al plat."*
- **Tell exploitation.** For each of Nino's tells, whether your guesses align
  with it: after Nino scores, do you guess "not the same" (he shifts 90%)?
  When you just threw 4, do you expect his guess to chase it (39%) — and hide?
- **Reaction time of the read.** After the rival repeats twice, how many rounds
  until your guesses follow?
- **Anti-aim awareness.** Are you throwing where it looks? p(f = its guess) —
  if above 20% you are feeding it; if far below you are readable in the other
  direction (it can predict what you *avoid*).

### 1.6 Timing, rhythm, mechanics (all already logged: tPerf, onset, syncDeltaMs, words)

- **Throw interval** distribution and its trend across a session (rushing,
  fatiguing).
- **The timing tell.** Interval | f, voice latency | g, sync delta | f. If you
  take longer before a 5, or your call comes late when the call is big, that is
  a tell a *human* opponent hears — worth naming even though our rival is blind
  to it by design. → *"Els teus 1 surten 120 ms més ràpid que els 5."*
- **Mechanics weaknesses (actionable, not strategic):** hand-only rate per
  call word (which words the recognizer misses on *you*: "el teu «vuit» es
  perd el 30%"), retraction rate, voice-early/late split, and the sync-rate
  trend. These cost real rounds (19 of 120 today were burned).
- **Fatigue curve.** Predictability and sync rate by session quartile.

### 1.7 Learning over time

- **Per-session series** for the headline numbers: exploit value (points/100),
  entropy rate, top-tell strength, reading hit rate, sync rate; sparklines;
  "last 30 rounds vs the 30 before".
- **The truest weakness number: El Rei's actual edge on you** (`fEdge`,
  `argmax hit` from `explainReadV2`) as a series. If that falls, you are
  improving in the only sense that matters.
- **Badges / milestones** when a tell disappears: *"El teu «després d'un 3, un
  4» ha baixat del 61% al 28% en dues sessions."* And the reverse: new tells
  appearing (people trade one habit for another — the literature's "trying to
  be random makes you predictable in a new way").
- **Rival-adjusted difficulty**: rounds to first El Rei point, longest streak
  without being read.

## 2. Ranking: exploit value, not percentages

A 61% sequence tell on a context that occurs once in 15 rounds is worth less
than a 30% marginal bias present every round. So every tell gets:

```
exploit value (pts/100 rounds) =
  rival wins with predictor P active − rival wins with P disabled,
  replayed over your last N rounds with the v2 engine (scripts/eval-rival.mjs
  already does the mechanics; per-profile it needs the profile's history).
```

L'Espill shows the top three by exploit value, each with: the sentence, the
evidence (counts, not just %), *what the rival does with it* ("El Rei aposta
al 4 després del teu 3"), and the mission that targets it. Percentages stay
in the detail view.

## 3. The coach loop

**Detect** — the statistics above, ranked as in §2, computed on session and
all-time scopes and (new) on *the last 30 rounds*, so improvement is visible
within a session.

**Explain** — one sentence per tell in words a player understands, plus the
rival's counter-move. Same voice as today's tells list, more of them, and
each with a "per què importa" line.

**Drill (Entrenament missions)** — Entrenament already records every throw
into the model with no rival. Add missions:
- *Trenca el patró*: 20 throws where the target tell must stay under a
  threshold (P(4|3) < 30%); live counter; per-throw feedback ("aquest 4
  després d'un 3 — el rival l'esperava").
- *Cobreix el tauler*: keep all five digits within ±5 pts of 20% over 25
  throws (a marginal-bias drill).
- *Sense escala*: no three monotone steps in a row.
- *Deslliga la crida*: 20 throws where the call is not your favourite for
  that finger (drills the weld).
- *Aleatorietat amb feedback*: the classic — a live "El Rei t'hauria
  endevinat X dels últims 20" meter (a **shadow rival** that predicts but does
  not score) — this is the Neuringer feedback loop verbatim.
- *Llegeix Nino*: guess-only mode — Nino throws, you only call; scored on
  hits vs the known ceiling; his tells shown as hints first, then hidden.
- Each mission has a pass condition, a streak, and writes a `training_mission`
  event so the field can see which drills people finish.

**Verify** — after a mission, the tell is re-measured on the next N Partida
rounds; the badge fires only from Partida data (drills prove nothing on their
own). El Rei's edge series is the final judge.

## 4. What to build first (a proposal, not a decision)

1. **`mirror2.ts` in core** — the pure statistics library: order-2, steps,
   regimes/dwell, return-time, bounce/loops, block entropies, the weld/MI, the
   outcome- and rival-conditioned tables, timing tells, per-family
   predictability. Tested against `spikes/logs` like everything else. (No UI.)
2. **Exploit-value ranking** — a per-tell replay using the v2 engine on the
   profile's own history; a `Tell` gains `pointsPer100` and `counterMove`.
3. **L'Espill v2 layout** — "Els teus defectes" becomes the ranked list with
   evidence + counter-move + mission button; "El que veu El Rei" stays; a
   trends strip (last-30 vs previous-30, per-session sparklines).
4. **Missions** — the shadow-rival meter first (cheapest, most powerful), then
   *Trenca el patró* and *Cobreix el tauler*, then *Llegeix Nino*.
5. **Post-match card** — the three-line verdict from the rival's side: what it
   read, what it earned from it, one thing to try next match.

## 5. Open questions worth a decision before building

- **How much to show during Partida?** A live danger meter is a strong learning
  signal and a strong distraction. Proposal: nothing live in Partida; the read
  in L'Espill and on the post-match card; live only in Entrenament.
- **Per-rival tells** or pooled? You should play Nino and El Rei differently;
  the tells that matter against El Rei are the ones the model weights. Proposal:
  pooled by default with a per-level filter.
- **Minimum evidence.** Sentences under ~6 supporting rounds are noise and
  erode trust. The current tells use thresholds; exploit value needs ~30
  rounds to be meaningful. Show "encara no" honestly.
- **Timing tells and fairness.** Our rival is blind to timing by design
  (§4 of rival-ai-design.md); the mirror can *show* the timing tell without the
  rival ever using it. Keep that line.


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

## 8. The layout, second pass — L'Espill is its own screen (coach card)

The first layout was right in numbers and wrong in shape: a wall of
same-weight tan boxes in the fight screen's side column, no hierarchy, no
"so what". Second pass (decided with Jani: coach card, own screen):

- **`#screenEspill`**, full width, a parchment sheet on the night sea.
  Opens from the title's "L'Espill" directly — reading your game needs no
  sensors. Throwing at the mirror (Entrenament) is the step after, through
  the sensor onboarding ("Practica-ho", "Entrenament — tira al mirall").
- **The coach card** is the hero: "EL TEU PUNT FEBLE" — the #1 tell as a
  24px serif sentence, the price ("+9,7 punts cada 100 rondes per al
  rival"), the evidence ("14 de 24 vegades"), El Rei's counter-move as a
  quoted line, "Practica-ho" and "Els altres defectes ▾" (collapsed list of
  the next six, each with price · evidence · counter-move).
- **One slim trend line** (last 30 vs the 30 before) under the card.
- **Tabs** for the detail: El que veu El Rei · Els teus números (tiles,
  histograms) · Seqüència (heatmap). Calibratge is NOT here — it fits the
  sensors, so it lives in the Entrenament strip next to the camera it
  calibrates; export/reset live under ⚙ next to the Tripulant selector.
- **Entrenament** keeps a compact **live strip** in the fight screen: the
  #1 tell as one line, "El Rei et llegeix el 34% — 20% és una moneda",
  "Obre L'Espill". The top-bar mode button now says "Entrenament" (the
  mirror is no longer a mode).
Same renderer, same ids — the numbers did not move. Verified headless.

## 9. The shadow rival (Entrenament) — built

"L'ombra d'El Rei": in Entrenament, before every throw El Rei's bet is
frozen (the argmax of `predictPlayerFV2` on the cross-match history —
exactly what L4 would aim at); after the throw the strip says whether it
saw you coming ("Aquest 3 — l'esperava (26%)." / "Aquest 2 — no l'ha vist
venir (apostava al 4)."), and the last 20 make the meter ("t'hauria
endevinat 5 de 12", red = read, green = not). Under 8 rows it says it
doesn't know you yet. Every bet is logged (`shadow_read`: predicted,
actual, hit, p, rows). The Neuringer loop, verbatim: the mirror is the
feedback. Nothing reaches the rival in Partida — same pure read, same
history, only shown.

Found on the way: `recordTrainingThrow` had no once-per-throw guard (the
game round has `gameHandled`); a throw finalized twice fed the model twice.
Guarded (`trainingRecorded`).

Next: missions behind "Practica-ho".
