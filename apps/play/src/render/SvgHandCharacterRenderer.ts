// SvgHandCharacterRenderer.ts — the browser implementation of
// @morra/core's CharacterRenderer contract: an imperative, DOM-API-only
// (no innerHTML, no dangerouslySetInnerHTML — security audit M5) SVG hand,
// geometry ported verbatim from spikes/s03-beat.html's HAND_FINGER_GEOMETRY/
// HAND_FINGER_ORDER/handSvgMarkup (a fixed, deterministic finger order —
// index/middle/ring/pinky/thumb — N extended, the rest folded flush into
// the palm). React only owns the mount point (see react/HandMount.tsx);
// this class owns everything inside it, updated outside React's render
// cycle so high-frequency reveal/settle updates never touch React state.
import type { CharacterRenderer, CharacterRenderState } from "@morra/core";

const SVG_NS = "http://www.w3.org/2000/svg";

interface FingerGeom {
  name: string;
  x: number;
  w: number;
  foldedY: number;
  extendedY: number;
}

const HAND_FINGER_GEOMETRY: readonly FingerGeom[] = [
  { name: "index", x: 20, w: 15, foldedY: 70, extendedY: 14 },
  { name: "middle", x: 39, w: 15, foldedY: 68, extendedY: 4 },
  { name: "ring", x: 58, w: 15, foldedY: 70, extendedY: 16 },
  { name: "pinky", x: 77, w: 13, foldedY: 74, extendedY: 34 },
  { name: "thumb", x: 4, w: 15, foldedY: 76, extendedY: 52 },
];
const HAND_FINGER_ORDER = ["index", "middle", "ring", "pinky", "thumb"];
const PALM_TOP = 80;

export class SvgHandCharacterRenderer implements CharacterRenderer {
  private container: HTMLElement | null = null;
  private svg: SVGSVGElement | null = null;
  private avatarEl: HTMLDivElement | null = null;
  private readonly fingerRects = new Map<string, SVGRectElement>();

  mount(container: unknown): void {
    const el = container as HTMLElement;
    this.container = el;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "hand-svg");
    svg.setAttribute("viewBox", "0 0 106 140");
    svg.setAttribute("role", "img");

    for (const f of HAND_FINGER_GEOMETRY) {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "finger folded");
      rect.setAttribute("data-finger", f.name);
      rect.setAttribute("x", String(f.x));
      rect.setAttribute("width", String(f.w));
      rect.setAttribute("rx", "7");
      svg.appendChild(rect);
      this.fingerRects.set(f.name, rect);
    }

    const palm = document.createElementNS(SVG_NS, "rect");
    palm.setAttribute("class", "palm");
    palm.setAttribute("x", "6");
    palm.setAttribute("y", String(PALM_TOP));
    palm.setAttribute("width", "94");
    palm.setAttribute("height", "52");
    palm.setAttribute("rx", "20");
    svg.appendChild(palm);

    const avatarEl = document.createElement("div");
    avatarEl.setAttribute("class", "hand-avatar");

    el.replaceChildren(svg, avatarEl);
    this.svg = svg;
    this.avatarEl = avatarEl;
  }

  render(state: CharacterRenderState): void {
    if (!this.svg) return;
    const extendedSet = new Set(
      state.fingerCount == null ? [] : HAND_FINGER_ORDER.slice(0, Math.max(0, Math.min(5, state.fingerCount)))
    );
    for (const f of HAND_FINGER_GEOMETRY) {
      const rect = this.fingerRects.get(f.name);
      if (!rect) continue;
      const isExtended = extendedSet.has(f.name);
      const y = isExtended ? f.extendedY : f.foldedY;
      const h = PALM_TOP - y + 16;
      rect.setAttribute("y", String(y));
      rect.setAttribute("height", String(h));
      rect.setAttribute("class", `finger ${isExtended ? "extended" : "folded"}`);
    }
    const label = state.fingerCount == null ? "closed fist" : `${state.fingerCount} finger${state.fingerCount === 1 ? "" : "s"}`;
    this.svg.setAttribute("aria-label", label);
    this.svg.classList.toggle("settled", state.settled);
    this.svg.classList.toggle("unsettled", !state.settled);
    // .textContent (never innerHTML) — avatarGlyph is always rendered as a
    // plain text node, satisfying the XSS discipline pass even though this
    // particular value is app-controlled, not user input.
    if (this.avatarEl) this.avatarEl.textContent = state.avatarGlyph;
  }

  unmount(): void {
    this.container?.replaceChildren();
    this.fingerRects.clear();
    this.svg = null;
    this.avatarEl = null;
    this.container = null;
  }
}
