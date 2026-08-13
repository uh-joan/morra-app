// util.ts — pure helpers from spikes/s03-beat.html's "Pure logic" block.

// spike L683–688
export function median(arr: readonly number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
