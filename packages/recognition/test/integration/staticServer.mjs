// staticServer.mjs — a minimal static file server rooted at the repo root,
// used only by test/integration/run.mjs to serve test/fixtures/integration.html
// (which imports the REAL built dist/index.js) plus the read-only
// spikes/models/*.zip asset over http:// so the fixture's fetch()/import()
// calls work exactly as they would from a real deployment. Read-only against
// the repo — never writes anything, including under spikes/.
import http from "node:http";
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
 * Resolves with { server, port, close } once listening. */
export function startStaticServer(root, port = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
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
    server.listen(port, "127.0.0.1", () => {
      const actualPort = server.address().port;
      resolve({
        server,
        port: actualPort,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
