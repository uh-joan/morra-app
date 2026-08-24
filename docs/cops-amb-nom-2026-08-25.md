# Cops amb nom — One Piece-style verdict choreography

*Design note + implementation report, 2026-08-25. Field request: "better
animations when winning or losing or for nobody… something cool, piratish,
inspired by One Piece style on kicks and actions that even have names."*

## 1 · Research: what makes One Piece action read as One Piece

Four devices, all portable to the web:

1. **Impact frames.** At the exact hit moment the image is replaced for 2–3
   frames by a scratchy black/white inversion — the Vincent Chansard /
   Sôta Shigetsugu style from the Wano arc that went viral in 2023. The
   deliberate *break in visual coherence* is what the eye reads as force.
   ([Know Your Meme](https://knowyourmeme.com/memes/cultures/impact-frames),
   [BAKASHOP](https://bakashop.com/en/blogs/articles-guides-conseils/impact-frames-one-piece-animation-art))
2. **Named attacks, shouted.** The «Gomu Gomu no ___» convention — a
   personal prefix plus a weapon word. The naming *pattern itself* is so
   iconic that in-story characters (Bentham, Bartolomeo) imitate the pattern
   alone. The name isn't decoration; it **is** the celebration.
   ([One Piece Wiki](https://onepiece.fandom.com/wiki/Gomu_Gomu_no_Mi/Techniques))
3. **«DON!!»** — Oda's signature onomatopoeia slammed across dramatic
   panels (VIZ renders it "Boom"). One giant angled serif word = instant
   One Piece. Reserved here for match-end (phase 2).
4. **Fighting-game grammar** (SF3, Skullgirls, Persona 4 Arena): hit-stop,
   radial speed lines, smears, and the super-move **cut-in** — portrait
   slash-in with a name banner.
   ([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/SuperMovePortraitAttack),
   [smear frames](https://garagefarm.net/blog/smear-frames-enhancing-motion-in-animation))

## 2 · The design: every verdict is a named move

| Outcome | Move name (v1 drafts — user is ground truth on Catalan) | Choreography |
|---|---|---|
| You win a round | **«PUNT!»** (first draft «BORDADA!» retired same day — field verdict: reads "super super weird") | double impact flash → name slam + radial speed lines (gold) → small screen shake → the earned coin flies to its slot |
| Rival wins | per corsari — Nino **«GANXO!»**, Bru **«COP DE TIMÓ!»**, Mercè **«TALL DE MAREA!»**, El Rei **«L'ONADA NEGRA»** | the same grammar mirrored in red/bone; his figure keeps its existing celebrate react |
| Tie, both guessed | **«EMPAT!»** | one short flash, steel-foam slam, no shake — a clash, not a hit |
| Tie, nobody | **«PER A NINGÚ»** | no flash: the name sinks and fades — comic deflation, the sea keeps the coin |

Ships now (option B, chosen 2026-08-25). Phase 2 (later): match-end
**cut-ins** — corsair portrait slash-in + «DON!!» stamp + doblons rain,
and match-point warning frame.

## 3 · Architecture

- **`pirate/cops.ts`** — the move names (pure, unit-tested) + the DOM
  choreography (`performCop`, `flyCoin`).
- **Wiring**: `pirate/render.ts`'s existing verdict MutationObserver —
  the same "game.ts writes the card text; we act it out" doctrine. Zero
  contact with game logic or the timing layer; if the module did nothing,
  the game would play identically.
- **The stage**: one `#moveStage` layer inside `.video-wrap`
  (`pointer-events: none`), so the slam plays over the camera in both the
  desktop card and the phone STAGE layout.
- **Impact frames** cost nothing: a white overlay with
  `mix-blend-mode: difference`, stepped opacity — the camera feed inverts
  itself. No assets.
- **Hit-stop** is *faked*, not real: the flash covers the stage for the
  first ~150 ms, which reads as a freeze. Actually pausing CSS animations
  risks pausing the slam itself and anything else mid-flight — rejected.
- **Coin flight**: Web Animations API, a fixed-position doblo flying from
  stage center to the strip slot; self-cleaning on finish.

## 4 · Doctrine kept

- The **verdict banner stays the semantic source of truth** — headline,
  reason, seal, all unchanged. Choreography is additive sugar on top.
- **`prefers-reduced-motion`**: `performCop`/`flyCoin` return before
  touching the DOM (on top of the global animation kill in style.css).
- **Harness safety**: the sr-only scoreboard format and card text keys are
  untouched; the observer keys (`TU GUANYES!`, `RIVAL GUANYA`,
  `EMPAT!`, `PER A NINGÚ`, `CAP PUNT`) gain a `cop` field only.
  `RONDA ANUL·LADA` deliberately gets **no** cop — a void round is an
  interruption, not a move.

## 5 · Decisions log

- Names ship as drafts; the user renames after feeling them in-game
  (their call, 2026-08-25: "ship with your draft names").
- «parata» audit rerun before this work: zero user-visible occurrences
  remain (identifiers only — `verdictWinner`, taunt keys, CSS classes).
- Tie treatment is asymmetric on purpose: EMPAT is a *clash* (energy,
  no winner), PER A NINGÚ is a *deflation* (the sea laughs). One Piece
  grades its beats; so do we.
