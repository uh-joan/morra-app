#!/usr/bin/env python3
"""Spike server: static files + live event-log ingestion.

Usage: python3 serve.py [port]   (default 8080, serves this directory)

POST /log with an NDJSON body (one JSON event per line) appends to
logs/session-<sessionId>.ndjson so the orchestrator can tail sessions live
without manual exports. Everything else is plain static file serving.
"""
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(ROOT, "logs")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path != "/log":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > 5_000_000:
            self.send_error(400, "bad length")
            return
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        os.makedirs(LOG_DIR, exist_ok=True)
        written = 0
        by_session = {}
        for line in body.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                evt = json.loads(line)
            except json.JSONDecodeError:
                continue
            sid = str(evt.get("sessionId", "unknown"))[:64].replace("/", "_")
            by_session.setdefault(sid, []).append(line)
            written += 1
        for sid, lines in by_session.items():
            with open(os.path.join(LOG_DIR, f"session-{sid}.ndjson"), "a") as f:
                f.write("\n".join(lines) + "\n")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "written": written}).encode())

    def log_message(self, fmt, *args):
        # Quieter than default: only log non-200 and /log posts are implicit
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"serving {ROOT} on http://localhost:{port} (POST /log -> logs/)")
    # Loopback only — this directory contains private voice recordings and
    # session logs; never expose it to the LAN (security audit H2).
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
