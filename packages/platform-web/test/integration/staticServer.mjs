// staticServer.mjs — same repo-root static file server as
// packages/recognition/test/integration/staticServer.mjs, EXTENDED with a
// POST /log handler (mirroring spikes/serve.py's own POST /log -> NDJSON
// file contract) so this package's integration test can prove
// EventBusTelemetrySink's batched POST actually lands somewhere real,
// rather than only asserting "fetch() was called" against a mock. Still
// read-only against the repo itself — POST /log only ever writes under the
// caller-supplied `logDir` (a scratch temp dir), never into the repo.
import http from "node:http";
import { appendFile } from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".zip": "application/zip",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

/** Starts a server rooted at `root`, listening on `port` (0 = ephemeral).
 * POST /log appends its NDJSON body to `${logDir}/telemetry.ndjson` when
 * `logDir` is provided. Resolves with { port, close }. */
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
      const filePath = normalize(join(root, urlPath));
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
