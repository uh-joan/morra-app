// character-renderer.ts — the rival's visual (SVG hand + avatar) contract,
// M4 dispatch: "an imperative CharacterRenderer implementation behind
// core's renderer contract, React owns only its mount point." Same pattern
// as types.ts's FingerRecognizer/CallRecognizer: a pure TYPE-ONLY interface
// here, no DOM — the real DOM-owning implementation lives in apps/play
// (SvgHandCharacterRenderer), imperatively driven so high-frequency
// reveal/settle updates stay outside any view-layer render cycle.
import type { FingerCount } from "../types.js";

export interface CharacterRenderState {
  /** null = closed fist / not yet revealed. */
  fingerCount: FingerCount | null;
  /** The AI level's avatar glyph (see ai.ts's LEVELS) — swappable per
   * opponent without the renderer needing to know about AiLevel itself. */
  avatarGlyph: string;
  /** True once the hand has settled into fingerCount (vs. mid-motion) —
   * purely a styling hint (e.g. the spike's settled/unsettled stroke
   * color), never gates game logic. */
  settled: boolean;
}

/** Container is opaque to core (a real DOM Element in the browser
 * implementation) — core only fixes the lifecycle contract. */
export interface CharacterRenderer {
  mount(container: unknown): void;
  render(state: CharacterRenderState): void;
  unmount(): void;
}
