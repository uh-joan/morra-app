import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // The app's EventBusTelemetrySink POSTs NDJSON to "/log" (relative).
    // In dev, forward that to the spike log collector (spikes/serve.py on
    // :8080) so app sessions land in spikes/logs/ like spike sessions do.
    proxy: {
      "/log": "http://127.0.0.1:8080",
    },
  },
  build: {
    // dist/ is gitignored repo-wide already (see root .gitignore) — same
    // convention as the tsc-built packages/*/dist.
    outDir: "dist",
  },
});
