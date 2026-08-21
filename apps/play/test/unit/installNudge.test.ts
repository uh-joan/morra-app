import { describe, expect, it } from "vitest";
import { shouldShowInstallNudge } from "../../src/installNudge.js";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const MAC_SAFARI = IPAD_DESKTOP_UA; // same string — touch points tell them apart
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("shouldShowInstallNudge", () => {
  it("shows for iPhone Safari in a tab", () => {
    expect(shouldShowInstallNudge(IPHONE_SAFARI, false, false, 5, false)).toBe(true);
  });

  it("never shows once running as the installed app", () => {
    expect(shouldShowInstallNudge(IPHONE_SAFARI, true, false, 5, false)).toBe(false);
    expect(shouldShowInstallNudge(IPHONE_SAFARI, undefined, true, 5, false)).toBe(false);
  });

  it("stays gone after dismissal", () => {
    expect(shouldShowInstallNudge(IPHONE_SAFARI, false, false, 5, true)).toBe(false);
  });

  it("skips other iOS browsers — their share flow is worded differently", () => {
    expect(shouldShowInstallNudge(IPHONE_CHROME, false, false, 5, false)).toBe(false);
  });

  it("catches iPadOS masquerading as a Mac (touch points tell)", () => {
    expect(shouldShowInstallNudge(IPAD_DESKTOP_UA, false, false, 5, false)).toBe(true);
  });

  it("leaves real Macs and Android alone", () => {
    expect(shouldShowInstallNudge(MAC_SAFARI, undefined, false, 0, false)).toBe(false);
    expect(shouldShowInstallNudge(ANDROID_CHROME, undefined, false, 5, false)).toBe(false);
  });
});
