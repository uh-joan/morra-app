// settings.ts — the 5 tunables (spike harness L577–579 + the sensitivity
// slider + co-occurrence input). Values are read LIVE at use time by their
// consumers (velocity.ts reads highV/lowV/settleMs per frame, analysis.ts
// reads vadMult + coOccurrenceMs per throw, mic.ts pushes vadMult into the
// worklet on input) — exactly the spike's discipline. This module only adds
// the setting_change telemetry so tuning experiments are visible in session
// logs. Not persisted (spike parity).

import { el } from "./dom.js";
import { logEvent } from "./telemetry.js";

export function installSettings(): void {
  const watch = (input: HTMLInputElement, setting: string) => {
    input.addEventListener("change", () => {
      logEvent("setting_change", { setting, value: parseFloat(input.value) });
    });
  };
  watch(el.syncCoOccurrenceMs, "coOccurrenceMs");
  watch(el.tuneVadMult, "vadMult");
  watch(el.tuneHighV, "highV");
  watch(el.tuneLowV, "lowV");
  watch(el.tuneSettleMs, "settleMs");
}
