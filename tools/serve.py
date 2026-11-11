#!/usr/bin/env python3
"""Локальный сервер игры (без кэша): python3 tools/serve.py [порт] -> http://localhost:8765"""
import functools, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f'http://localhost:{port}')
ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=ROOT)).serve_forever()
