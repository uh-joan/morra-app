import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The store (game logic outside React) is plain TS, testable under
    // node. Component-level rendering, if any is ever added here, would
    // need a jsdom project override — not needed yet since the React
    // boundary rule keeps components as thin, low-frequency projections
    // covered by the integration harness instead.
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
