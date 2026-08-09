import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // dist/ is gitignored repo-wide already (see root .gitignore) — same
    // convention as the tsc-built packages/*/dist.
    outDir: "dist",
  },
});
