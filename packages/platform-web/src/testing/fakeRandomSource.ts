// fakeRandomSource.ts — @morra/core already ships createSeededRandomSource
// (deterministic mulberry32) and createSequenceRandomSource (fixed replay
// sequence); re-exported here so platform-web's test-mode seam is
// discoverable from one place, per the M3 dispatch's explicit
// "FakeRandomSource (already in core)" call-out. Not reimplemented — same
// RandomSource contract, same factories.
export { createSeededRandomSource, createSequenceRandomSource } from "@morra/core";
