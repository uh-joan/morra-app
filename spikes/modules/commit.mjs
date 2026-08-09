// commit.mjs — SHA-256 commit-before-reveal. Unchanged hash formula
// ("${fingers}|${call}|${nonce}") from the field-tested scheme already
// running in s03-beat.html — do NOT change the format: existing exported
// debug logs and NDJSON session logs already assume it. No DOM; uses only
// Web Crypto (available in the page and in a Node >=19 test harness via the
// global `crypto`).

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomNonceHex(byteLength = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Deliberately NOT declared `async` — an async function wrapping a returned
// promise adds an extra microtask tick to unwrap it, versus returning the
// promise straight through. That tick is invisible most of the time but
// commitAiMove() below calls this and is itself called fire-and-forget in a
// couple of places, so preserving the exact original timing (this used to
// be a single inline `await sha256Hex(...)`, no wrapping) avoids a subtle
// behavior change from the Phase F extraction.
export function computeCommitHash(fingers, call, nonce) {
  return sha256Hex(`${fingers}|${call}|${nonce}`);
}

export async function verifyCommitment(fingers, call, nonce, expectedHashHex) {
  const actual = await computeCommitHash(fingers, call, nonce);
  return actual === expectedHashHex;
}
