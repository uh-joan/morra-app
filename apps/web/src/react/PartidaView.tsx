// PartidaView.tsx — a thin, low-frequency projection of gameStore.ts's
// state (M4 boundary law: React renders projections, never owns game
// state). Every string here comes from game/copy.ts — the literal Catalan
// UI copy from the spike — never composed ad hoc.
import { LEVELS, LEVEL_ORDER, type AiLevel } from "@morra/core";
import { store } from "../appSingletons.js";
import { useGameStore } from "./useStore.js";
import { HandMount } from "./HandMount.js";
import {
  AI_COMMIT_STATUS,
  AI_LEVEL_AVATAR,
  COACH_HINT,
  GAME_END_TEXT,
  GO_TO_TRAINING,
  PLAY_AGAIN,
  READY_PILL_TEXT,
  SCOREBOARD_TEXT,
  roundResultText,
  voidDetail,
} from "../game/copy.js";

export function PartidaView() {
  const gameScore = useGameStore(store, (s) => s.gameScore, (a, b) => a.player === b.player && a.ai === b.ai);
  const gameOver = useGameStore(store, (s) => s.gameOver);
  const gameEndWinner = useGameStore(store, (s) => s.gameEndWinner);
  const roundPhase = useGameStore(store, (s) => s.roundPhase);
  const voidOutcome = useGameStore(store, (s) => s.voidOutcome);
  const throwInProgress = useGameStore(store, (s) => s.throwInProgress);
  const handArmed = useGameStore(store, (s) => s.handArmedForNextThrow);
  const aiLevel = useGameStore(store, (s) => s.aiLevel);
  const displayedAiMove = useGameStore(store, (s) => s.displayedAiMove);
  const displayedVerified = useGameStore(store, (s) => s.displayedVerified);
  const displayedCommitHash = useGameStore(store, (s) => s.displayedCommitHash);
  const currentCommitHash = useGameStore(store, (s) => s.currentCommitHash);

  const pillClass = throwInProgress ? "analyzing" : handArmed ? "armed" : "not-armed";
  const pillText = throwInProgress ? READY_PILL_TEXT.analyzing : handArmed ? READY_PILL_TEXT.armed : READY_PILL_TEXT.notArmed;

  const resultText = gameOver
    ? "" // the end banner takes over
    : roundPhase === "void" && voidOutcome
      ? `${roundResultText("void")} (${voidDetail(voidOutcome)})`
      : roundResultText(roundPhase);

  return (
    <section className="partida-view">
      <div className="ai-level-selector">
        {LEVEL_ORDER.map((level: AiLevel) => (
          <button
            key={level}
            type="button"
            aria-pressed={aiLevel === level}
            title={LEVELS[level].description}
            onClick={() => store.setAiLevel(level)}
          >
            {AI_LEVEL_AVATAR[level]} {LEVELS[level].name}
          </button>
        ))}
      </div>

      <HandMount
        state={{
          fingerCount: displayedAiMove ? displayedAiMove.fingers : null,
          avatarGlyph: AI_LEVEL_AVATAR[aiLevel] ?? "🙂",
          settled: !throwInProgress,
        }}
      />

      <p className="ai-commit-status">
        {gameOver
          ? AI_COMMIT_STATUS.gameOver
          : displayedAiMove
            ? displayedVerified
              ? AI_COMMIT_STATUS.verified((displayedCommitHash ?? "").slice(0, 8))
              : AI_COMMIT_STATUS.verifyFailed
            : AI_COMMIT_STATUS.committed((currentCommitHash ?? "").slice(0, 8))}
      </p>

      <div id="readyPill" className={`ready-pill ${pillClass}`}>
        {pillText}
      </div>
      {/* Feature 2 — teaches the reset palette ritual (hide the hand / lower
          it below the line / wave) while the pill is amber, matching the
          spike's own heroCoachHint's display-tied-to-not-armed behavior. */}
      {pillClass === "not-armed" && (
        <p id="coachHint" className="coach-hint">
          {COACH_HINT}
        </p>
      )}

      <p id="roundResultText" className={`round-result ${roundPhase}`}>
        {resultText}
      </p>

      <p id="scoreboard" className="scoreboard">
        {SCOREBOARD_TEXT(gameScore.player, gameScore.ai)}
      </p>

      {gameOver && gameEndWinner && (
        <div id="gameEndBanner" className="game-end-banner">
          <p id="gameEndText">{GAME_END_TEXT(gameEndWinner, gameScore.player, gameScore.ai)}</p>
          <button type="button" id="btnGoToTraining" onClick={() => store.setMode("entrenament")}>
            {GO_TO_TRAINING}
          </button>
          <button type="button" id="btnPlayAgain" onClick={() => store.resetGame()}>
            {PLAY_AGAIN}
          </button>
        </div>
      )}
    </section>
  );
}
