# Deep Interview Spec: Morra Micatio — "Street Fighter" Morra vs the Machine

## Metadata
- Interview ID: di-morra-micatio-001
- Rounds: 6
- Final Ambiguity Score: 18.3%
- Type: greenfield
- Generated: 2026-08-08
- Threshold: 0.2
- Initial Context Summarized: no (research doc referenced externally: `docs/morra-italian-finger-game-research.pplx.md`)
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.88 | 0.40 | 0.352 |
| Constraint Clarity | 0.75 | 0.30 | 0.225 |
| Success Criteria | 0.80 | 0.30 | 0.240 |
| **Total Clarity** | | | **0.817** |
| **Ambiguity** | | | **0.183** |

## Goal
Build a web (desktop-first) game of **morra, micatio variant** (1–5 fingers, fist = 1, calls 2–10) played **physically**: the player throws real fingers at the webcam and shouts the call into the microphone; on-device recognition determines the move. The opponent is a **real-time 3D character** with a stage and personality, Street Fighter-style, who visibly throws fingers and audibly shouts calls. The v1 deliverable is a **vertical slice**: ONE opponent, ONE stage, the full magic loop end-to-end at IRL tempo, with the recognition + tempo core perfected.

## Constraints
- **Input**: camera + mic are the primary input; full button/tap fallback must always be available (accessibility + recognition-failure safety net).
- **Rules**: micatio preset — each hand throws 1–5 (closed fist counts as 1, never 0), calls 2–10. Rules engine should still be preset-driven so other regional variants can be added later (per research doc).
- **Match format**: default **first to 10 points, best of 3 rounds**. Health-bar presentation is a settings toggle — the engine always scores in points; health bars are a pure presentation skin (points = damage, target = health).
- **Platform**: web, desktop-first, to move quickly. Architecture must keep mobile-native / cross-platform ports open: game core (rules engine, round FSM, AI, recognition interfaces) must be platform-agnostic TypeScript with no DOM/browser coupling; browser-specific code (camera, mic, WebGL, UI) lives at the edges.
- **Opponent rendering**: `CharacterRenderer` interface driven by a shared event timeline (idle → beat → throw N fingers → shout call → react win/lose). v1 implementation: real-time 3D. A filmed-actor video-clip implementation must be addable per-character at any time without touching the game core.
- **v1 scope**: exactly one opponent + one stage; no campaign/roster UI yet (structure anticipated for v1.1+).
- **Multiplayer**: none in v1. P2P is a later stage — but the round-resolution design should be server-authoritative-ready (internal commit-reveal: AI move locked/committed before player reveal, auditable), per the research doc's simultaneity findings.

## Non-Goals (v1)
- P2P / online multiplayer, matchmaking, lobbies.
- Multiple opponents, character select, campaign progression.
- Mobile builds (native or PWA-polished).
- Money wagering or anything gambling-adjacent (legal risk flagged in research).
- Filmed-actor content production (interface only).
- Team play / "holding the hand" mechanic (research-documented, later stage).

## Acceptance Criteria
- [ ] A full match (best of 3 rounds, first to 10 points each) is playable end-to-end against the AI opponent using only body input: real fingers at the camera + shouted call.
- [ ] **IRL tempo**: throws resolve on a shared audible/visual beat; throw-to-verdict latency feels imperceptible (< ~300 ms target); next throw begins within ~1–2 s; zero menus/dead time between throws.
- [ ] **Recognition "just works"**: ≥95% correct finger-count reads and ≥95% correct call recognition in normal desk lighting; misreads never silently score — uncertain reads trigger a visible re-throw or fallback prompt.
- [ ] **Living opponent**: the 3D character visibly throws its fingers and audibly shouts its call simultaneously with the player, with idle/win/lose reactions on its stage.
- [ ] Button/tap fallback can replace either or both recognition channels at any time via settings, mid-match.
- [ ] Fairness: the AI's move is committed (hashed/logged) before the player's throw is read; a post-match audit view can prove the machine never reacted to the player's move.
- [ ] Rules engine correctly enforces micatio: fist = 1, calls outside 2–10 rejected, exactly-one-correct-guesser scores, both/neither correct = no point and immediate next throw.
- [ ] Health-bar presentation toggle works and is purely cosmetic over point scoring.
- [ ] Game core package builds and its tests pass with no browser APIs imported (portability gate for future mobile).

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "Video streaming" is a v1 requirement | Contrarian round: v1 has no remote human — is streaming real, or is this about character rendering? | v1 needs zero streaming infra. Webcam is processed locally; "opponent on video" became the CharacterRenderer decision |
| Recognition could be the only input | What happens when recognition fails? | Full physical play, but full fallback always in place |
| "Out of this world" = atmosphere | Which qualities are the actual bar? | IRL tempo + living opponent + invisible recognition are non-negotiable; atmosphere delivered via SF-style stages per opponent |
| Filmed actors are needed for realism | No actors available — blocker? | 3D characters now, renderer abstraction so filmed actors slot in later |
| Traditional scoring (16 pts) is the default | SF drama vs tradition | First to 10, best of 3; health bars optional skin |
| v1 needs a roster to feel like SF | Simplifier round: smallest version with the magic? | Vertical slice: 1 opponent, 1 stage, perfect loop |

## Technical Context (greenfield — architect recommendations from research doc)
- **Finger CV**: MediaPipe Hands (tasks-vision, WASM/WebGL) in-browser; count fingers from raw hand landmarks — the canned gesture set cannot distinguish 3 vs 4 fingers (research: Google AI Edge docs). Runs ~17–21 ms/frame class hardware budget.
- **Voice**: the call is a single number word (2–10, "morra"/"tutta" for 10) — a small on-device keyword-spotting model (e.g., Vosk-WASM, or a tiny custom classifier) beats general cloud ASR on latency and privacy; Web Speech API acceptable only as a fallback. Support Italian + English word sets first; dialect voice packs later (research flags them as a differentiator).
- **Simultaneity/fairness**: internal commit-reveal — AI move + salt hashed and logged before player reveal window opens (research: Morra vs AI precedent; Cyfrin pitfalls: fresh random salt per throw, strict reveal window).
- **AI opponent**: difficulty ladder from research — floor: uniform random over the mixed-strategy space (unbeatable in expectation); mid: n-gram/frequency exploitation of player patterns (beginners are measurably non-random: 15.5% redundancy vs 3.3% for experts); v1 ships one opponent with a tunable blend. Post-match "how random were you" stats screen is an evidence-backed stretch feature.
- **Suggested stack**: TypeScript monorepo — `packages/core` (rules engine, round FSM e.g. XState, AI, commit-reveal protocol; zero browser imports), `packages/recognition` (FingerRecognizer/VoiceRecognizer interfaces + MediaPipe/KWS impls), `packages/web` (Vite app, Three.js CharacterRenderer, stage, UI). Beat/tempo driven by an authoritative game clock, not animation frames.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Player | core domain | input mode (physical/fallback), stats | Player throws Throws in Rounds |
| Opponent Character | core domain | name, personality, AI profile, renderer type, stage | has one Stage; rendered by CharacterRenderer; plays via AI |
| Match | core domain | best-of-3 rounds, winner | contains Rounds |
| Round | core domain | target 10 points, scores | contains Throws |
| Throw | core domain | fingers 1–5 per side, call 2–10 per side, verdict | resolved by Rules Engine |
| Call | core domain | number 2–10, word form, language | part of Throw |
| Rules Engine | core domain | preset (micatio v1), validation, verdict logic | resolves Throws |
| Finger Recognizer | supporting | model, confidence, latency | feeds Player's Throw |
| Voice Recognizer | supporting | keyword set, confidence, latency | feeds Player's Call |
| Fallback Input | supporting | buttons for fingers + call | substitutes either Recognizer |
| Character Renderer | supporting | impl: 3D \| filmed-video; event timeline | animates Opponent Character |
| Stage | supporting | environment, audio ambience | belongs to Opponent Character |
| Score Presentation | supporting | mode: points \| health-bar | skins Round scores |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 8 | 8 | - | - | - |
| 2 | 10 | 2 | 1 | 7 | 80% |
| 3 | 10 | 0 | 0 | 10 | 100% |
| 4 | 11 | 1 | 0 | 10 | 91% |
| 5 | 12 | 1 | 0 | 11 | 92% |
| 6 | 12 | 0 | 0 | 12 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (6 rounds)</summary>

### Round 1
**Q:** During a round, what does the player physically do to make their move?
**A:** Full physical play (camera + mic as primary input) but with full fallback in place.
**Ambiguity:** 74.5% (Goal 0.45, Constraints 0.15, Criteria 0.10)

### Round 2
**Q:** Which qualities are non-negotiable for "out of this world"?
**A:** IRL tempo, living opponent, recognition just works. Atmosphere delivered as Street Fighter-style settings: each opponent has a stage and characteristics to beat.
**Ambiguity:** 51.5% (Goal 0.65, Constraints 0.20, Criteria 0.55)

### Round 3
**Q:** What platform is the first version built for?
**A:** Web desktop-first to move quick, but plan for later mobile native / cross-platform releases.
**Ambiguity:** 42% (Goal 0.70, Constraints 0.45, Criteria 0.55)

### Round 4 (Contrarian)
**Q:** v1 has no remote human — does "video streaming" exist at all, or is the real decision the character production pipeline? How is the opponent rendered?
**A:** Filmed actors would be best but none are available — real-time 3D characters for v1, with the ability to add filmed actors at any time.
**Ambiguity:** 35.5% (Goal 0.75, Constraints 0.60, Criteria 0.55)

### Round 5
**Q:** What does it take to beat an opponent?
**A:** First to 10 points, best of 3 rounds by default; offer health bars as a settings option.
**Ambiguity:** 27.6% (Goal 0.82, Constraints 0.62, Criteria 0.70)

### Round 6 (Simplifier)
**Q:** What's the smallest v1 you'd consider a success?
**A:** Vertical slice: one opponent, one stage, full magic loop end-to-end (camera fingers, voice call, 3D character, IRL tempo, first-to-10), plus perfecting the recognition + tempo core.
**Ambiguity:** 18.3% (Goal 0.88, Constraints 0.75, Criteria 0.80)

</details>
