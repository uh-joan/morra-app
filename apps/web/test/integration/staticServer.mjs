// staticServer.mjs — serves apps/web/dist (the BUILT, bundled app — Vite's
// build already inlines every workspace dependency and node_modules import
// into one self-contained JS file, so unlike packages/recognition's and
// packages/platform-web's integration servers, this one does NOT need to
// be rooted at the repo root or carry an import map: dist/index.html's own
// absolute asset paths resolve correctly once THIS directory is the root.
// POST /log support mirrors packages/platform-web's staticServer.mjs, for
// the same reason: proving EventBusTelemetrySink's batched POST actually
// lands somewhere real, server-side, not just "fetch() was called".
import http from "node:http";
import { appendFile } from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".map": "application/json",
};

export function startStaticServer(root, { port = 0, logDir = null } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/log") {
        if (!logDir) {
          res.writeHead(404);
          res.end();
          return;
        }
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
          try {
            await appendFile(join(logDir, "telemetry.ndjson"), Buffer.concat(chunks));
            res.writeHead(204);
            res.end();
          } catch (err) {
            res.writeHead(500);
            res.end(String(err));
          }
        });
        return;
      }

      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const filePath = normalize(join(root, urlPath === "/" ? "/index.html" : urlPath));
      if (!filePath.startsWith(normalize(root))) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404);
        res.end("not found: " + urlPath);
        return;
      }
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      createReadStream(filePath).pipe(res);
    });
    server.on("error", reject);
    server.listen(port, () => {
      const actualPort = server.address().port;
      resolve({
        server,
        port: actualPort,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
