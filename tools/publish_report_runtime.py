"""Publish the API image's public report engine alongside the web, without SPA fallback.

Only reviewed runtime files and Pyodide's declared Pillow/lxml dependencies are copied.
No report input, credentials, uploads or private API responses enter the web directory.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import tempfile
from urllib.request import urlopen
import zipfile

FILES = ("index.html", "host.js", "worker.js", "report-html.js", "report-html-style.js",
         "report-map.js", "report-map-plan.js", "report-marker-layout.js", "python.zip")
CORE = ("pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip")


def fetch(base, name):
    with urlopen(base.rstrip("/") + "/report-runtime/" + name, timeout=30) as response:
        content_type = response.headers.get_content_type()
        data = response.read(128 * 1024 * 1024 + 1)
    if not data or len(data) > 128 * 1024 * 1024:
        raise ValueError(f"Invalid report runtime size: {name}")
    if name == "index.html":
        if b'<script src="host.js"' not in data:
            raise ValueError("Report runtime URL returned the web page instead of the report engine")
    elif data.lstrip().lower().startswith((b"<!doctype html", b"<html")):
        raise ValueError(f"Report runtime URL returned HTML instead of {name}")
    if name.endswith(".js") and content_type not in ("text/javascript", "application/javascript", "application/ecmascript", "text/ecmascript"):
        raise ValueError(f"Invalid script MIME type for {name}: {content_type}")
    if name.endswith(".wasm") and content_type != "application/wasm":
        raise ValueError(f"Invalid WebAssembly MIME type: {content_type}")
    if name.endswith(".wasm") and not data.startswith(b"\x00asm"):
        raise ValueError(f"Invalid WebAssembly file: {name}")
    if name.endswith((".zip", ".whl")):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if archive.testzip() is not None:
                raise ValueError(f"Damaged archive: {name}")
            if name == "python.zip" and "engine/app.py" not in archive.namelist():
                raise ValueError("Missing individual report engine")
    return data


def publish(base, output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    # Validate the complete bundle before changing the publication directory.
    with tempfile.TemporaryDirectory(prefix="report-runtime-", dir=output.parent) as temporary:
        staged = Path(temporary)
        def save(name, sha=None):
            data = fetch(base, name)
            if sha and hashlib.sha256(data).hexdigest() != sha:
                raise ValueError(f"Report runtime checksum mismatch: {name}")
            path = staged / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            return data
        lock = json.loads(save("vendor/pyodide-lock.json"))
        for name in FILES:
            save(name)
        for name in CORE:
            save("vendor/" + name)
        done = set()
        def package(name):
            if name in done:
                return
            item = lock["packages"][name]
            for dependency in item["depends"]:
                package(dependency)
            filename = item["file_name"]
            if Path(filename).name != filename or "/" in filename or "\\" in filename:
                raise ValueError("Invalid package filename")
            save("vendor/" + filename, item["sha256"])
            done.add(name)
        for name in ("pillow", "lxml"):
            package(name)
        # TemporaryDirectory is private (0700). Nginx runs as another user and
        # must be able to traverse the copied public runtime directory.
        staged.chmod(0o755)
        shutil.copytree(staged, output, dirs_exist_ok=True)
    print(f"Published report runtime: {output}")


def verify(base):
    for name in ("index.html", "host.js", "worker.js", "report-html.js", "python.zip",
                 "vendor/pyodide.js", "vendor/pyodide-lock.json"):
        fetch(base, name)
    print("Public report runtime verified (HTML and HWPX engines)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.output:
        publish(args.base_url, args.output)
    else:
        verify(args.base_url)
