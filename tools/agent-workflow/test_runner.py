"""Behavioral tests for gates, stale evidence, isolation and blocked completion."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("workflow_runner", Path(__file__).with_name("runner.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RunnerTests(unittest.TestCase):
    def setUp(self):
        test_home = Path(__file__).resolve().parents[2] / ".agent-runs/unit-tests"
        test_home.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=test_home)
        assert Path(self.temporary.name).resolve().is_relative_to(test_home.resolve())
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        real_run = subprocess.run
        def fixture_git(argv, **kwargs):
            if argv[:2] == ["git", "ls-files"]:
                names = [p.relative_to(self.root).as_posix() for p in self.root.rglob("*")
                         if p.is_file() and ".agent-runs" not in p.relative_to(self.root).parts]
                return subprocess.CompletedProcess(argv, 0, stdout=("\0".join(names) + "\0").encode())
            return real_run(argv, **kwargs)
        mock_git = patch.object(module.subprocess, "run", side_effect=fixture_git)
        mock_git.start()
        self.addCleanup(mock_git.stop)
        (self.root / ".gitignore").write_text(".agent-runs/\n", encoding="utf-8")
        config_dir = self.root / "tools/agent-workflow"
        config_dir.mkdir(parents=True)
        config = module.read(Path(__file__).with_name("workflow.json"))
        config["candidate_roots"] = ["tools", "source.py"]
        config["pilot"]["required_checks"] = ["automatic", "device"]
        config["pilot"]["acceptance"] = [{"id": "AC", "description": "Both", "checks": ["automatic", "device"]}]
        checks = {
            "automatic": {"kind": "command", "cwd": ".", "description": "test", "timeout_seconds": 10,
                          "argv": [sys.executable, "-c", "print('executed')"]},
            "device": {"kind": "manual", "description": "phone", "resume": "connect phone", "required_metadata": ["device"]}
        }
        module.write(config_dir / "workflow.json", config)
        module.write(config_dir / "checks.json", checks)
        (self.root / "source.py").write_text("version = 1\n", encoding="utf-8")
        self.runner = module.Runner(self.root)
        self.directory = self.runner.init("test")

    def submission(self, stage, **changes):
        state = module.read(self.directory / "state.json")
        record = {"stage": stage, "candidateDigest": state["candidateDigest"], "inputRevision": 1,
                  "reviewer": {"kind": "same-agent", "name": "test reviewer"}, "summary": "Reviewed", "decision": "APPROVE", "findings": []}
        record.update(changes)
        path = self.directory / "submission.json"
        module.write(path, record)
        return path

    def approve(self):
        self.runner.review("test", "plan", self.submission("plan"))
        self.runner.review("test", "code", self.submission("code"))

    def test_cannot_run_without_reviews_or_skip_plan(self):
        with self.assertRaises(module.WorkflowError):
            self.runner.execute("test", "automatic")
        with self.assertRaises(module.WorkflowError):
            self.runner.review("test", "code", self.submission("code"))

    def test_blocking_findings_cannot_be_approved(self):
        with self.assertRaises(module.WorkflowError):
            self.runner.review("test", "plan", self.submission("plan", findings=[{"severity": "blocking", "reason": "missing requirement"}]))

    def test_stale_code_rejects_review_and_refresh_discards_old_qa(self):
        self.approve()
        self.runner.execute("test", "automatic")
        (self.root / "source.py").write_text("version = 2\n", encoding="utf-8")
        with self.assertRaisesRegex(module.WorkflowError, "ARTIFACT_STALE"):
            self.runner.execute("test", "device")
        self.runner.refresh("test")
        state = module.read(self.directory / "state.json")
        self.assertEqual(state["qa"], {})
        self.assertEqual(state["reviews"], {})

    def test_request_or_registry_cannot_be_changed_silently(self):
        module.write(self.directory / "request.json", {"title": "different"})
        with self.assertRaisesRegex(module.WorkflowError, "request changed"):
            self.runner.load("test")
        with self.assertRaises(module.WorkflowError):
            self.runner.refresh("test")

    def test_blocked_device_is_not_complete(self):
        self.approve()
        self.assertEqual(self.runner.execute("test", "automatic")["status"], "PASS")
        self.assertEqual(self.runner.execute("test", "device")["status"], "BLOCKED")
        with self.assertRaisesRegex(module.WorkflowError, "required QA"):
            self.runner.finish("test")

    def device_pass(self):
        state = module.read(self.directory / "state.json")
        evidence = self.directory / "device.log"
        evidence.write_text("synthetic test evidence", encoding="utf-8")
        submission = self.directory / "device.json"
        module.write(submission, {"candidateDigest": state["candidateDigest"], "status": "PASS", "tester": "unit-test",
                                 "reason": "Observed", "metadata": {"device": "test-device"},
                                 "evidence": [evidence.relative_to(self.root).as_posix()]})
        self.runner.manual("test", "device", submission)

    def test_valid_evidence_can_finish_but_changed_artifact_cannot(self):
        self.approve()
        self.runner.execute("test", "automatic")
        self.device_pass()
        state = module.read(self.directory / "state.json")
        record = self.directory / state["qa"]["device"]["path"]
        (record.parent / "evidence-00.log").write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(module.WorkflowError, "artifact"):
            self.runner.finish("test")

    def test_complete_run_and_review_tampering(self):
        self.approve()
        self.runner.execute("test", "automatic")
        self.device_pass()
        self.runner.finish("test")
        self.assertEqual(module.read(self.directory / "state.json")["status"], "VERIFIED")
        review = self.directory / "reviews/revision-0001/code-01.json"
        module.write(review, {"decision": "APPROVE"})
        with self.assertRaisesRegex(module.WorkflowError, "Review record"):
            self.runner.finish("test")

    def test_no_path_escape_or_unknown_command(self):
        with self.assertRaises(module.WorkflowError):
            self.runner.directory("../elsewhere")
        with self.assertRaises(module.WorkflowError):
            module.inside(self.root, "../elsewhere")
        self.approve()
        with self.assertRaises(module.WorkflowError):
            self.runner.execute("test", "arbitrary-shell")

    def test_single_runner_lock_and_retry_limit(self):
        with self.runner.lock():
            with self.assertRaises(module.WorkflowError):
                with self.runner.lock():
                    pass
        for _ in range(3):
            self.runner.review("test", "plan", self.submission("plan", decision="REQUEST_CHANGES"))
        self.assertEqual(module.read(self.directory / "state.json")["status"], "LIMIT_REACHED")

    def test_refresh_keeps_prior_review_files(self):
        self.approve()
        original = (self.directory / "reviews/revision-0001/plan-01.json").read_bytes()
        (self.root / "source.py").write_text("version = 2\n", encoding="utf-8")
        self.runner.refresh("test")
        self.runner.review("test", "plan", self.submission("plan"))
        self.assertEqual((self.directory / "reviews/revision-0001/plan-01.json").read_bytes(), original)
        self.assertTrue((self.directory / "reviews/revision-0002/plan-01.json").is_file())

    def test_manual_pass_needs_metadata_and_real_evidence(self):
        self.approve()
        submission = self.directory / "device.json"
        state = module.read(self.directory / "state.json")
        module.write(submission, {"candidateDigest": state["candidateDigest"], "status": "PASS", "tester": "tester", "reason": "claimed"})
        with self.assertRaisesRegex(module.WorkflowError, "metadata"):
            self.runner.manual("test", "device", submission)

    def test_qa_record_tampering_prevents_completion(self):
        self.approve()
        self.runner.execute("test", "automatic")
        self.device_pass()
        state = module.read(self.directory / "state.json")
        module.write(self.directory / state["qa"]["automatic"]["path"], {"status": "PASS"})
        with self.assertRaisesRegex(module.WorkflowError, "QA record"):
            self.runner.finish("test")

    def test_interrupted_check_gets_a_new_attempt(self):
        self.approve()
        (self.directory / "checks/automatic/01").mkdir(parents=True)
        self.runner.execute("test", "automatic")
        self.assertTrue((self.directory / "checks/automatic/02/result.json").is_file())

    def test_failed_command_is_not_a_pass(self):
        self.runner.checks["automatic"]["argv"] = [sys.executable, "-c", "raise SystemExit(7)"]
        directory = self.runner.init("failure")
        for stage in ["plan", "code"]:
            record = module.read(self.submission(stage))
            record["candidateDigest"] = module.read(directory / "state.json")["candidateDigest"]
            submission = directory / "input.json"
            module.write(submission, record)
            self.runner.review("failure", stage, submission)
        self.assertEqual(self.runner.execute("failure", "automatic")["status"], "FAIL")

    def test_device_evidence_cannot_collect_source_files(self):
        self.approve()
        submission = self.directory / "device.json"
        state = module.read(self.directory / "state.json")
        module.write(submission, {"candidateDigest": state["candidateDigest"], "status": "PASS", "tester": "tester", "reason": "claimed",
                                 "metadata": {"device": "test"}, "evidence": ["source.py"]})
        with self.assertRaisesRegex(module.WorkflowError, "inside this run"):
            self.runner.manual("test", "device", submission)


if __name__ == "__main__":
    unittest.main()
