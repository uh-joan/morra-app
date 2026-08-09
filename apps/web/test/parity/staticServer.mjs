// staticServer.mjs — minimal static file server, reused (same shape as
// packages/recognition's) for serving the SPIKE (rooted at REPO_ROOT, since
// spikes/s03-beat.html's own imports are relative to spikes/) during the
// M5 parity comparison. Read-only against the repo.
import http from "node:http";
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
    server.listen(port, () => {
      const actualPort = server.address().port;
      resolve({ server, port: actualPort, close: () => new Promise((res) => server.close(() => res())) });
    });
  });
}
