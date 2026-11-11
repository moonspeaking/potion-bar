#!/usr/bin/env python3
"""Приёмник снимков canvas: POST base64 -> PNG/JPG файл."""
import base64, datetime
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = '/Users/Apple/Desktop/Bar/extracted/sheets'

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n).decode()
        if ',' in body: body = body.split(',', 1)[1]
        name = datetime.datetime.now().strftime('shot_%H%M%S_%f')[:-3] + '.jpg'
        open(f'{OUT}/{name}', 'wb').write(base64.b64decode(body))
        self.send_response(200); self._cors()
        self.send_header('Content-Type', 'text/plain'); self.end_headers()
        self.wfile.write(name.encode())
    def log_message(self, *a): pass

HTTPServer(('127.0.0.1', 8766), H).serve_forever()
