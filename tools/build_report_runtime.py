"""Bundle the device-side Python runtime. Only public code/template/dependencies are copied.

Run before the backend build: python tools/build_report_runtime.py
The client never downloads executable code from a third-party CDN at runtime.
"""
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "backend/src/main/resources/static/report-runtime"
VERSION = "0.27.7"
CDN = f"https://cdn.jsdelivr.net/pyodide/v{VERSION}/full/"
HWPX_URL = "https://files.pythonhosted.org/packages/90/5e/32619782b4f23723f68abc92eb0cb65bbbb5b90ce7784d0c7df9c1cd7ffe/python_hwpx-6.10.0-py3-none-any.whl"
HWPX_SHA = "c590fe556823d7f31e59a7fe32b26062c7c681bea0a72732b10c736efa49b2c2"


def download(url, path, sha=None):
    if path.is_file() and (not sha or hashlib.sha256(path.read_bytes()).hexdigest() == sha):
        return path.read_bytes()
    with urllib.request.urlopen(url, timeout=90) as response:
        data = response.read()
    if sha and hashlib.sha256(data).hexdigest() != sha:
        raise ValueError(f"Checksum mismatch: {path.name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"Bundled {path.name} ({len(data)} bytes)")
    return data


def main():
    import shutil
    TARGET.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / 'backend/src/main/resources/report-marker-layout.js', TARGET / 'report-marker-layout.js')
    shutil.copyfile(ROOT / 'frontend/utils/reportMapPlan.js', TARGET / 'report-map-plan.js')
    vendor = TARGET / "vendor"
    vendor.mkdir(parents=True, exist_ok=True)
    lock = json.loads(download(CDN + "pyodide-lock.json", vendor / "pyodide-lock.json"))
    for name in ("pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip"):
        download(CDN + name, vendor / name)
    done = set()

    def package(name):
        if name in done:
            return
        item = lock["packages"][name]
        for dependency in item["depends"]:
            package(dependency)
        download(CDN + item["file_name"], vendor / item["file_name"], item["sha256"])
        done.add(name)

    for name in ("pillow", "lxml"):
        package(name)
    wheel = download(HWPX_URL, vendor / "python_hwpx-6.10.0-py3-none-any.whl", HWPX_SHA)
    # ZIP contains only the reviewed public sources and a blank template, never .env/uploads/output.
    with zipfile.ZipFile(TARGET / "python.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
        for name in ("app.py", "compiled_report.py", "hwpx_images.py"):
            bundle.write(ROOT / "ai" / name, "engine/" + name)
        bundle.write(ROOT / "ai/templates/template.hwpx", "engine/templates/template.hwpx")
        with zipfile.ZipFile(io.BytesIO(wheel)) as package_zip:
            for name in package_zip.namelist():
                if name.startswith("hwpx/") and not name.endswith("/"):
                    bundle.writestr(name, package_zip.read(name))
    print("Report runtime ready (Pyodide " + VERSION + ", python-hwpx 6.10.0)")


if __name__ == "__main__":
    main()
