// HandMount.tsx — "React owns only its mount point" (M4 dispatch). The
// actual SVG hand is owned imperatively by SvgHandCharacterRenderer; this
// component only creates/destroys it on mount/unmount and forwards a plain
// state object to its render() method on change — it never lets React's
// reconciler touch the SVG tree.
import { useEffect, useRef } from "react";
import type { CharacterRenderState } from "@morra/core";
import { SvgHandCharacterRenderer } from "../render/SvgHandCharacterRenderer.js";

export function HandMount({ state }: { state: CharacterRenderState }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<SvgHandCharacterRenderer | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    const renderer = new SvgHandCharacterRenderer();
    renderer.mount(container);
    rendererRef.current = renderer;
    return () => {
      renderer.unmount();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.render(state);
  }, [state]);

  return <div ref={mountRef} className="hand-mount" />;
}
