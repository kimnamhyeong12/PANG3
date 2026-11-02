import http.server
import hashlib
import json
import os
import stat
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from publish_report_runtime import fetch, publish


class RuntimePublicationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                data = RuntimePublicationTest.files.get(self.path, b'<!doctype html><html>SPA fallback</html>')
                self.send_response(200)
                self.end_headers()
                self.wfile.write(data)
            def log_message(self, *args):
                pass
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        type(self).files = {}

    def test_spa_fallback_is_not_a_report_engine(self):
        for name in ('index.html', 'host.js', 'python.zip', 'vendor/pyodide.js'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                fetch(self.base, name)

    def test_failed_publication_preserves_existing_runtime(self):
        type(self).files = {'/report-runtime/vendor/pyodide-lock.json': b'{"packages":{}}'}
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'report-runtime'
            output.mkdir()
            entry = output / 'host.js'
            entry.write_text('existing engine')
            with self.assertRaises(ValueError):
                publish(self.base, output)
            self.assertEqual('existing engine', entry.read_text())
            self.assertEqual([entry], list(output.iterdir()))

    def test_publication_is_readable_by_the_web_server_user(self):
        content = b'public engine'
        packages = {name: {'depends': [], 'file_name': name + '.whl',
                          'sha256': hashlib.sha256(content).hexdigest()} for name in ('pillow', 'lxml')}
        def source(base, name):
            return json.dumps({'packages': packages}).encode() if name.endswith('pyodide-lock.json') else content
        with tempfile.TemporaryDirectory() as directory, patch('publish_report_runtime.fetch', side_effect=source):
            output = Path(directory) / 'report-runtime'
            publish(self.base, output)
            self.assertTrue((output / 'host.js').is_file())
            self.assertTrue(os.access(output, os.R_OK | os.X_OK))
            if os.name != 'nt':
                self.assertEqual(0o755, stat.S_IMODE(output.stat().st_mode))


if __name__ == '__main__':
    unittest.main()
