import http.server
import tempfile
import threading
import unittest
from pathlib import Path
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


if __name__ == '__main__':
    unittest.main()
