"""Single-run, file-backed review and QA recorder. No model or deployment side effects."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
KST = timezone(timedelta(hours=9))


class WorkflowError(Exception):
    pass


def now():
    return datetime.now(KST).isoformat(timespec="seconds")


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def inside(base, relative):
    path = (base / relative).resolve()
    if not path.is_relative_to(base.resolve()):
        raise WorkflowError("Path escapes its allowed directory")
    return path


class Runner:
    def __init__(self, root=ROOT):
        self.root = Path(root).resolve()
        self.config_dir = self.root / "tools/agent-workflow"
        self.config = read(self.config_dir / "workflow.json")
        self.checks = read(self.config_dir / "checks.json")
        self.home = self.root / ".agent-runs"

    @contextmanager
    def lock(self):
        self.home.mkdir(exist_ok=True)
        lock = self.home / ".runner.lock"
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as error:
            raise WorkflowError("Another command holds .agent-runs/.runner.lock; inspect its PID before recovering a stale lock") from error
        try:
            with os.fdopen(fd, "w") as stream:
                stream.write(str(os.getpid()))
            yield
        finally:
            lock.unlink()

    def directory(self, run_id):
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}", run_id):
            raise WorkflowError("Invalid run ID")
        return inside(self.home, run_id)

    def snapshot(self):
        result = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
                                cwd=self.root, capture_output=True, check=True)
        paths = sorted(set(result.stdout.decode("utf-8").split("\0")) - {""})
        selected = {}
        for relative in paths:
            path = Path(relative)
            if not any(relative == prefix or relative.startswith(prefix + "/") for prefix in self.config["candidate_roots"]):
                continue
            if path.suffix.lower() not in self.config["candidate_extensions"] or path.name.startswith(".env"):
                continue
            if any(part in self.config["excluded_parts"] for part in path.parts):
                continue
            absolute = inside(self.root, relative)
            if absolute.is_file():
                selected[relative] = file_hash(absolute)
        return {"files": selected, "digest": digest(selected)}

    def event(self, directory, kind, **details):
        with (directory / "events.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps({"at": now(), "event": kind, **details}, ensure_ascii=False) + "\n")

    def load(self, run_id, guard=True):
        directory = self.directory(run_id)
        if not (directory / "state.json").is_file():
            raise WorkflowError("Run does not exist")
        state = read(directory / "state.json")
        if guard:
            for name in ("request", "plan", "registry"):
                if digest(read(directory / (name + ".json"))) != state[name + "Digest"]:
                    raise WorkflowError(name + " changed; create a new run for revised scope")
            for review in state["reviews"].values():
                if digest(read(inside(directory, review["path"]))) != review["recordDigest"]:
                    raise WorkflowError("Review record was changed")
            if self.snapshot()["digest"] != state["candidateDigest"]:
                raise WorkflowError("ARTIFACT_STALE: source changed; use refresh and obtain new reviews")
        return directory, state

    def save(self, directory, state):
        state["updatedAt"] = now()
        write(directory / "state.json", state)
        self.render(directory, state)

    def render(self, directory, state):
        request = read(directory / "request.json")
        lines = ["# " + request["title"], "", "- State: " + state["status"],
                 "- Candidate: " + state["candidateDigest"], "- Updated (KST): " + state["updatedAt"],
                 "- Environment: " + request["environment"], "", "## Reviews", ""]
        for stage, review in state["reviews"].items():
            lines.append(f"- {stage}: {review['decision']} / {review['reviewer']['kind']} / {review['path']}")
        lines += ["", "## QA", "", "| Check | Result | Evidence |", "|---|---|---|"]
        for check in request["required_checks"]:
            item = state["qa"].get(check, {})
            lines.append(f"| {check} | {item.get('status', 'NOT_RUN')} | {item.get('path', '')} |")
        lines += ["", "## Acceptance", ""]
        for acceptance in request["acceptance"]:
            statuses = [state["qa"].get(key, {}).get("status", "NOT_RUN") for key in acceptance["checks"]]
            outcome = "PASS" if all(x == "PASS" for x in statuses) else "INCOMPLETE"
            lines.append(f"- {acceptance['id']}: {outcome} — {acceptance['description']}")
        lines += ["", "Review records are attributed submissions, not proof of reviewer identity or isolation.",
                  "MockMvc/Node checks do not establish device, TCP, PostgreSQL or visual viewer success.", ""]
        (directory / "result.md").write_text("\n".join(lines), encoding="utf-8")

    def init(self, run_id):
        directory = self.directory(run_id)
        directory.mkdir(parents=True, exist_ok=False)
        request = dict(self.config["pilot"], runId=run_id, createdAt=now())
        plan = {"revision": 1, "tasks": request.pop("tasks"), "required_checks": request["required_checks"]}
        manifest = self.snapshot()
        for name, value in (("request", request), ("plan", plan), ("manifest", manifest), ("registry", self.checks)):
            write(directory / (name + ".json"), value)
        state = {"status": "PLAN_REVIEW", "candidateDigest": manifest["digest"], "requestDigest": digest(request),
                 "planDigest": digest(plan), "registryDigest": digest(self.checks), "generation": 1, "reviews": {}, "qa": {}, "reviewAttempts": {}}
        write(directory / "manifests" / (manifest["digest"] + ".json"), manifest)
        self.event(directory, "RUN_CREATED", candidateDigest=manifest["digest"])
        self.save(directory, state)
        return directory

    def refresh(self, run_id):
        directory, state = self.load(run_id, guard=False)
        # Scope and registry changes need a new run rather than silent approval reuse.
        for name in ("request", "plan", "registry"):
            if digest(read(directory / (name + ".json"))) != state[name + "Digest"]:
                raise WorkflowError("Run scope changed; create a new run")
        manifest = self.snapshot()
        write(directory / "manifest.json", manifest)
        write(directory / "manifests" / (manifest["digest"] + ".json"), manifest)
        state["generation"] += 1
        state.update(status="PLAN_REVIEW", candidateDigest=manifest["digest"], reviews={}, qa={}, reviewAttempts={})
        self.event(directory, "CANDIDATE_REFRESHED", candidateDigest=manifest["digest"])
        self.save(directory, state)

    def review(self, run_id, stage, submission):
        directory, state = self.load(run_id)
        allowed = {"plan": ("PLAN_REVIEW",), "code": ("IMPLEMENTING", "CODE_REVIEW")}
        if stage not in allowed or state["status"] not in allowed[stage]:
            raise WorkflowError("Review is not allowed in this state")
        record = read(submission)
        if record.get("stage") != stage or record.get("candidateDigest") != state["candidateDigest"]:
            raise WorkflowError("Review stage/digest mismatch")
        if record.get("inputRevision") != 1:
            raise WorkflowError("Review plan revision mismatch")
        reviewer = record.get("reviewer", {})
        if reviewer.get("kind") not in ("human", "same-agent", "external-model") or not reviewer.get("name"):
            raise WorkflowError("Reviewer kind and name are required")
        if not isinstance(record.get("summary"), str) or not record["summary"].strip():
            raise WorkflowError("Review summary is required")
        decision = record.get("decision")
        findings = record.get("findings")
        if decision not in ("APPROVE", "REQUEST_CHANGES") or not isinstance(findings, list):
            raise WorkflowError("Invalid review decision/findings")
        if any(not isinstance(item, dict) or item.get("severity") not in ("blocking", "non-blocking") or not item.get("reason") for item in findings):
            raise WorkflowError("Findings need severity and reason")
        if decision == "APPROVE" and any(item["severity"] == "blocking" for item in findings):
            raise WorkflowError("Cannot approve blocking findings")
        attempt = state["reviewAttempts"].get(stage, 0) + 1
        if attempt > self.config["max_review_attempts"]:
            raise WorkflowError("Review attempt limit reached")
        record.update(recordedAt=now())
        path = f"reviews/revision-{state['generation']:04d}/{stage}-{attempt:02d}.json"
        write(directory / path, record)
        state["reviewAttempts"][stage] = attempt
        state["reviews"][stage] = dict(record, path=path, recordDigest=digest(record))
        if decision == "APPROVE":
            state["status"] = "IMPLEMENTING" if stage == "plan" else "QA"
        else:
            state["status"] = "PLAN_REVIEW" if stage == "plan" else "CODE_REVIEW"
            if attempt == self.config["max_review_attempts"]:
                state["status"] = "LIMIT_REACHED"
        self.event(directory, "REVIEW_RECORDED", stage=stage, decision=decision, path=path)
        self.save(directory, state)

    def report_python(self):
        choices = [self.root / "backend/target/release-local/report-venv/Scripts/python.exe",
                   self.root / "ai/venv/Scripts/python.exe", self.root / "ai/venv/bin/python"]
        return str(next((p for p in choices if p.is_file()), Path(sys.executable)))

    def execute(self, run_id, check_id):
        directory, state = self.load(run_id)
        if state["status"] not in ("QA", "BLOCKED", "QA_FAILED", "QA_PASSED"):
            raise WorkflowError("Approved plan and code reviews are required before QA")
        registry = read(directory / "registry.json")
        if check_id not in read(directory / "request.json")["required_checks"]:
            raise WorkflowError("Check is not part of this run")
        check = registry[check_id]
        attempts = [p for p in (directory / "checks" / check_id).glob("*") if p.is_dir()]
        relative = f"checks/{check_id}/{len(attempts) + 1:02d}"
        evidence = directory / relative
        evidence.mkdir(parents=True, exist_ok=False)
        result = {"check": check_id, "candidateDigest": state["candidateDigest"], "startedAt": now(),
                  "description": check["description"], "status": "BLOCKED", "exitCode": None}
        self.event(directory, "CHECK_STARTED", check=check_id, path=relative)
        if check["kind"] == "manual":
            result["reason"] = "DEVICE_QA_NOT_PERFORMED: " + check["resume"]
        else:
            replacements = {"root": str(self.root).replace("\\", "/"), "evidence": str(evidence).replace("\\", "/"),
                            "report_python": self.report_python().replace("\\", "/")}
            argv = [value.format(**replacements) for value in check["argv"]]
            argv[0] = shutil.which(argv[0]) or argv[0]
            missing = [name for name in check.get("needs", []) if name in ("mvn", "node") and not shutil.which(name)]
            if "frontend-babel" in check.get("needs", []) and not (self.root / "frontend/node_modules/@babel/core").is_dir():
                missing.append("frontend node_modules/@babel/core")
            env = os.environ.copy()
            env.update(PYTHONUTF8="1", PYTHONIOENCODING="utf-8", PYTHON_DOTENV_DISABLED="1", GEMINI_API_KEY="", GOOGLE_API_KEY="")
            if "report-python" in check.get("needs", []):
                try:
                    probe = subprocess.run([self.report_python(), "-c", "import PIL, hwpx, dotenv, google.genai, pillow_heif, inspect; assert 'PYTHON_DOTENV_DISABLED' in inspect.getsource(dotenv.main.load_dotenv)"],
                                           capture_output=True, env=env, timeout=30)
                    dependencies_ok = probe.returncode == 0
                except (OSError, subprocess.SubprocessError):
                    dependencies_ok = False
                if not dependencies_ok:
                    missing.append("report Python dependencies / dotenv disable support")
                import ast
                tree = ast.parse((self.root / "ai/app.py").read_text(encoding="utf-8-sig"))
                flags = [node.value.value for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "ENABLE_AI_ANALYSIS" for target in node.targets) and isinstance(node.value, ast.Constant)]
                if flags != [False]:
                    missing.append("AI analysis must remain disabled for offline pilot")
            result.update(argv=argv, cwd=check["cwd"])
            if missing:
                result["reason"] = "DEPENDENCY_MISSING: " + ", ".join(missing)
            else:
                if "mvn" in check.get("needs", []):
                    (self.root / "backend/target/workflow-tmp").mkdir(parents=True, exist_ok=True)
                started = time.monotonic()
                try:
                    with (evidence / "command.log").open("wb") as output:
                        process = subprocess.Popen(argv, cwd=inside(self.root, check["cwd"]), env=env,
                                                   stdout=output, stderr=subprocess.STDOUT, shell=False)
                        result["pid"] = process.pid
                        try:
                            result["exitCode"] = process.wait(timeout=check["timeout_seconds"])
                        except subprocess.TimeoutExpired:
                            if os.name == "nt":
                                try:
                                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, timeout=10)
                                except (OSError, subprocess.SubprocessError):
                                    pass
                            else:
                                process.kill()
                            try:
                                process.wait(timeout=5)
                            except subprocess.TimeoutExpired:
                                result["cleanupPending"] = True
                            result["reason"] = "TIMEOUT: no automatic retry of writes"
                    result["status"] = "BLOCKED" if result.get("cleanupPending") else "PASS" if result["exitCode"] == 0 else "FAIL"
                    if result["exitCode"] not in (0, None) and "mvn" in check.get("needs", []):
                        log = (evidence / "command.log").read_text(encoding="utf-8", errors="replace")
                        if "Could not resolve dependencies" in log or "PluginResolutionException" in log:
                            result.update(status="BLOCKED", reason="DEPENDENCY_MISSING: Maven cache is incomplete; see command.log")
                except OSError as error:
                    result["reason"] = "EXECUTION_UNAVAILABLE: " + str(error)
                result["durationSeconds"] = round(time.monotonic() - started, 3)
                if result["status"] == "PASS" and any(not (evidence / name).is_file() for name in check.get("artifacts", [])):
                    result.update(status="FAIL", reason="Expected artifacts were not produced")
        if self.snapshot()["digest"] != state["candidateDigest"]:
            result.update(status="FAIL", reason="ARTIFACT_STALE: source changed during execution")
        result["finishedAt"] = now()
        result["artifacts"] = {p.relative_to(evidence).as_posix(): file_hash(p) for p in evidence.rglob("*") if p.is_file()}
        write(evidence / "result.json", result)
        state["qa"][check_id] = {"status": result["status"], "path": relative + "/result.json", "recordDigest": digest(result)}
        statuses = [state["qa"].get(key, {}).get("status") for key in read(directory / "request.json")["required_checks"]]
        state["status"] = "QA_FAILED" if "FAIL" in statuses else "BLOCKED" if "BLOCKED" in statuses else "QA_PASSED" if all(s == "PASS" for s in statuses) else "QA"
        self.event(directory, "CHECK_FINISHED", check=check_id, status=result["status"], path=relative)
        self.save(directory, state)
        return result

    def manual(self, run_id, check_id, submission):
        directory, state = self.load(run_id)
        if state["status"] not in ("QA", "BLOCKED", "QA_FAILED", "QA_PASSED"):
            raise WorkflowError("QA requires approved reviews")
        check = read(directory / "registry.json").get(check_id, {})
        if check.get("kind") != "manual" or check_id not in read(directory / "request.json")["required_checks"]:
            raise WorkflowError("Only a required manual check can accept a device submission")
        record = read(submission)
        if record.get("candidateDigest") != state["candidateDigest"] or record.get("status") not in ("PASS", "FAIL", "BLOCKED"):
            raise WorkflowError("Invalid device result or candidate digest")
        if not record.get("tester") or not record.get("reason"):
            raise WorkflowError("Tester and observed reason are required")
        if record["status"] in ("PASS", "FAIL"):
            if any(not record.get("metadata", {}).get(key) for key in check["required_metadata"]):
                raise WorkflowError("Device/build/network/steps/actual result metadata is required")
            if not record.get("evidence"):
                raise WorkflowError("Device results need evidence files")
        sources = [inside(self.root, name) for name in record.get("evidence", [])]
        if any(not path.is_relative_to(directory) for path in sources):
            raise WorkflowError("Device evidence must be inside this run directory")
        if any(not path.is_file() or path.stat().st_size == 0 for path in sources):
            raise WorkflowError("Evidence is missing or empty")
        attempts = [p for p in (directory / "checks" / check_id).glob("*") if p.is_dir()]
        relative = f"checks/{check_id}/{len(attempts) + 1:02d}"
        destination = directory / relative
        destination.mkdir(parents=True, exist_ok=False)
        artifacts = {}
        for number, source in enumerate(sources):
            filename = f"evidence-{number:02d}" + source.suffix
            shutil.copyfile(source, destination / filename)
            artifacts[filename] = file_hash(destination / filename)
        record.update(check=check_id, recordedAt=now(), artifacts=artifacts)
        write(destination / "result.json", record)
        state["qa"][check_id] = {"status": record["status"], "path": relative + "/result.json", "recordDigest": digest(record)}
        statuses = [state["qa"].get(key, {}).get("status") for key in read(directory / "request.json")["required_checks"]]
        state["status"] = "QA_FAILED" if "FAIL" in statuses else "BLOCKED" if "BLOCKED" in statuses else "QA_PASSED" if all(s == "PASS" for s in statuses) else "QA"
        self.event(directory, "MANUAL_QA_RECORDED", check=check_id, status=record["status"], path=relative)
        self.save(directory, state)

    def finish(self, run_id):
        directory, state = self.load(run_id)
        for stage in ("plan", "code"):
            review = state["reviews"].get(stage, {})
            if review.get("decision") != "APPROVE" or review.get("candidateDigest") != state["candidateDigest"]:
                raise WorkflowError("Missing current review approval")
            if digest(read(inside(directory, review["path"]))) != review["recordDigest"]:
                raise WorkflowError("Review record was changed")
        for key in read(directory / "request.json")["required_checks"]:
            item = state["qa"].get(key)
            if not item or item["status"] != "PASS":
                raise WorkflowError("Cannot finish: required QA has not passed: " + key)
            record = read(inside(directory, item["path"]))
            if digest(record) != item["recordDigest"] or record["candidateDigest"] != state["candidateDigest"]:
                raise WorkflowError("QA record was changed or is stale")
            for name, expected in record["artifacts"].items():
                artifact = inside((directory / item["path"]).parent, name)
                if not artifact.is_file() or file_hash(artifact) != expected:
                    raise WorkflowError("QA artifact was removed or changed")
        state["status"] = "VERIFIED"
        self.event(directory, "RUN_VERIFIED")
        self.save(directory, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "refresh", "status", "finish"):
        command = commands.add_parser(name)
        command.add_argument("run_id")
    review = commands.add_parser("review")
    review.add_argument("run_id")
    review.add_argument("stage", choices=("plan", "code"))
    review.add_argument("submission", type=Path)
    check = commands.add_parser("check")
    check.add_argument("run_id")
    check.add_argument("check_id", help="Registered check ID, or all")
    manual = commands.add_parser("manual")
    manual.add_argument("run_id")
    manual.add_argument("check_id")
    manual.add_argument("submission", type=Path)
    args = parser.parse_args()
    runner = Runner()
    exit_code = 0
    try:
        with runner.lock():
            if args.command == "init":
                print(runner.init(args.run_id))
            elif args.command == "refresh":
                runner.refresh(args.run_id)
            elif args.command == "review":
                runner.review(args.run_id, args.stage, args.submission)
            elif args.command == "check":
                directory, state = runner.load(args.run_id)
                ids = read(directory / "request.json")["required_checks"] if args.check_id == "all" else [args.check_id]
                for check_id in ids:
                    result = runner.execute(args.run_id, check_id)
                    print(check_id + ": " + result["status"], flush=True)
                    if result["status"] == "FAIL":
                        exit_code = 3
                    elif result["status"] == "BLOCKED" and exit_code == 0:
                        exit_code = 4
                    if result.get("cleanupPending"):
                        print("Test process cleanup requires attention; stopping further checks", file=sys.stderr)
                        break
            elif args.command == "manual":
                runner.manual(args.run_id, args.check_id, args.submission)
            elif args.command == "finish":
                runner.finish(args.run_id)
            else:
                directory, state = runner.load(args.run_id, guard=False)
                print(json.dumps(dict(state, sourceCurrent=runner.snapshot()["digest"] == state["candidateDigest"]), ensure_ascii=False, indent=2))
        return exit_code
    except (WorkflowError, FileExistsError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
