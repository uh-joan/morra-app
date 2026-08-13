import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // telemetry.ts POSTs NDJSON to "/log" (relative). In dev, forward that
    // to the spike log collector (spikes/serve.py on :8080) so app sessions
    // land in spikes/logs/ alongside spike sessions.
    proxy: {
      "/log": "http://127.0.0.1:8080",
    },
  },
  build: {
    outDir: "dist",
  },
});
