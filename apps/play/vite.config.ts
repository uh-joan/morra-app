import { defineConfig, type Plugin } from "vite";

// Content-Security-Policy — injected into the built index.html only (a meta
// CSP in the source would break Vite's dev HMR, which needs inline/eval).
// The app is fully same-origin: MediaPipe + vosk are vendored under
// /assets/vendor (no runtime CDN), telemetry POSTs to same-origin /log, the
// model zip is same-origin. So `default-src 'self'` is the baseline and each
// exception below is a real, audited need:
//   script 'wasm-unsafe-eval'  — MediaPipe + vosk compile WebAssembly
//   script/worker blob:        — vosk-browser spawns its recognizer Worker
//                                from a blob: URL (createObjectURL)
//   style 'unsafe-inline'      — the app sets element.style.* throughout and
//                                uses inline style="" attributes (no nonce
//                                path exists for style attributes)
//   img/media data:, blob:     — canvas/audio decode paths
// frame-ancestors / X-Frame-Options are HTTP-header-only (ignored in a meta
// CSP) — set them at the edge/deploy layer; see docs/security-audit.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

function cspMeta(): Plugin {
  return {
    name: "morra-csp-meta",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        `<head>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`
      );
    },
  };
}

export default defineConfig({
  plugins: [cspMeta()],
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
