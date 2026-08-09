#!/usr/bin/env python3
"""Static file server that sends COOP/COEP headers so the page loads with
crossOriginIsolated === true. Use this to compare capability probes against
the plain `python3 -m http.server` case (crossOriginIsolated === false).

Usage: python3 serve-coi.py [port]   (default port 8000)
"""
import sys
import http.server
import socketserver

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class COIHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


if __name__ == "__main__":
    with socketserver.TCPServer(("127.0.0.1", PORT), COIHandler) as httpd:  # loopback only (audit H2)
        print(f"Serving with COOP/COEP headers on http://localhost:{PORT}")
        httpd.serve_forever()
