// installNudge.ts — the iOS "add to home screen" whisper. Safari on iOS has
// no install-prompt API (no beforeinstallprompt, ever), so the most the web
// can do is notice it's running in a Safari TAB — not the installed app —
// and teach the two taps. The banner shows on the title screen only,
// dismisses forever, and by definition never appears once the game is
// launched from its home-screen icon (standalone).

import { logEvent } from "./telemetry.js";

const DISMISS_KEY = "morra-install-nudge-v1";

/** PURE: should the nudge show? iOS Safari in a tab, not dismissed.
 * iPadOS 13+ masquerades as Macintosh — the touch-point count tells. */
export function shouldShowInstallNudge(
  ua: string,
  standalone: boolean | undefined,
  displayModeStandalone: boolean,
  maxTouchPoints: number,
  dismissed: boolean
): boolean {
  if (dismissed) return false;
  if (standalone === true || displayModeStandalone) return false; // already the app
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (!isIOS) return false;
  // other iOS browsers word the share flow differently — Safari only
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
}

export function installInstallNudge(): void {
  const nudge = document.getElementById("installNudge");
  if (!nudge) return;
  // The ✕ binds unconditionally — dismissal must work however the banner
  // came to be visible, not only when this run's detection showed it.
  document.getElementById("installNudgeClose")?.addEventListener("click", () => {
    delete document.body.dataset.installNudge;
    try { localStorage.setItem(DISMISS_KEY, "off"); } catch { /* session-only */ }
    logEvent("install_nudge_dismissed", {});
  });
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === "off"; } catch { /* session-only */ }
  const show = shouldShowInstallNudge(
    navigator.userAgent,
    (navigator as { standalone?: boolean }).standalone,
    window.matchMedia("(display-mode: standalone)").matches,
    navigator.maxTouchPoints ?? 0,
    dismissed
  );
  if (!show) return;
  document.body.dataset.installNudge = "on";
  logEvent("install_nudge_shown", {});
}
