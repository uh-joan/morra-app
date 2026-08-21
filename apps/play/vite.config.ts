import { defineConfig, type Plugin } from "vite";

// Content-Security-Policy — injected into the built index.html only (a meta
// CSP in the source would break Vite's dev HMR, which needs inline/eval).
// The app is fully same-origin: MediaPipe + vosk are vendored under
// /assets/vendor (no runtime CDN), telemetry POSTs to same-origin /log, the
// model zip is same-origin. So `default-src 'self'` is the baseline and each
// exception below is a real, audited need:
// vosk-browser@0.0.8 needs BOTH of the following to load voice (verified on
// the deployed site, full 41 MB model): its Emscripten worker fetch()es the
// inlined WASM from a base64 `data:` URI and a `blob:` URL, AND evals a string
// during recognizer init. Under the strict CSP the fetch is blocked
// (connect-src) and the eval is blocked (no 'unsafe-eval'), so the model
// finishes downloading and then voice hangs forever. Both concessions are
// bounded — the CSP's real value here stays intact: script-src 'self' (no
// foreign JS can load) and no cross-ORIGIN connect (blob:/data: are
// self-contained, no network egress). 'unsafe-eval' is only reachable via an
// XSS vector, and the XSS surface is verified clean (name only via
// textContent — security audit 2026-08-20).
//   script 'wasm-unsafe-eval'  — MediaPipe + vosk compile WebAssembly
//   script 'unsafe-eval'       — vosk Emscripten worker init (see above)
//   script/worker/connect blob:, connect data: — vosk WASM load (see above)
//   style 'unsafe-inline'      — the app sets element.style.* throughout and
//                                uses inline style="" attributes (no nonce
//                                path exists for style attributes)
//   img/media data:, blob:     — canvas/audio decode paths
// frame-ancestors / X-Frame-Options are HTTP-header-only (ignored in a meta
// CSP) — set them at the edge/deploy layer; see docs/security-audit.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' blob: data:",
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
      // the global Classificació — run the collector locally for the full
      // loop (DATA_DIR=/tmp/morra-dev node deploy/collector/collector.mjs);
      // absent, the proxy 502s and the board falls back to the local shadow
      "/classificacio": "http://127.0.0.1:9310",
    },
  },
  build: {
    outDir: "dist",
  },
});
