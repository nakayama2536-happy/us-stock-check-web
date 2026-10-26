"""Non-mutating diagnostic wrapper for the fixture-only SW transition test."""
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import Page
import browser_sw_roundtrip as scenario

original_reload = Page.reload


def traced_reload(self, *args, **kwargs):
    response = original_reload(self, *args, **kwargs)
    if response:
        data = response.body()
        print('ROUNDTRIP NAVIGATION:', json.dumps({
            'url': response.url, 'status': response.status,
            'from_service_worker': response.from_service_worker,
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'last_modified': response.headers.get('last-modified'),
            'cache_control': response.headers.get('cache-control'),
        }), flush=True)
    return response


class TraceHandler(scenario.SimpleHTTPRequestHandler):
    def do_GET(self):
        route = urlparse(self.path).path
        if route.endswith(('/', '/index.html', '/assets.json', '/sw.js')):
            p = Path(self.translate_path(self.path))
            print('ROUNDTRIP SERVER:', json.dumps({
                'route': route,
                'file_sha256': hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None,
                'if_modified_since': self.headers.get('If-Modified-Since'),
                'if_none_match': self.headers.get('If-None-Match'),
            }), flush=True)
        return super().do_GET()


Page.reload = traced_reload
scenario.SimpleHTTPRequestHandler = TraceHandler
if __name__ == '__main__':
    scenario.main()
