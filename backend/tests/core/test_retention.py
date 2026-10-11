import json
import os
import time
from datetime import datetime, timedelta

from core.retention import sweep


def _write(path, age_hours):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"x")
    then = time.time() - age_hours * 3600
    os.utime(path, (then, then))


def test_sweep_removes_old_files_and_records(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, "uploads", "old.jpg"), 30)
    _write(os.path.join(root, "uploads", "new.jpg"), 1)
    _write(os.path.join(root, "results", "old.png"), 25)
    _write(os.path.join(root, "results", "new.png"), 0)

    old = (datetime.utcnow() - timedelta(hours=30)).isoformat()
    new = datetime.utcnow().isoformat()
    with open(os.path.join(root, "job_statuses.json"), "w") as f:
        json.dump({"a": {"status": "completed", "updated_at": old}, "b": {"status": "processing", "updated_at": new}}, f)
    with open(os.path.join(root, "batch_jobs.json"), "w") as f:
        json.dump({"x": {"job_ids": ["a"], "created_at": old}, "y": {"job_ids": ["b"], "created_at": new}}, f)

    removed = sweep(root, 24)

    assert removed == {"files": 2, "jobs": 1, "batches": 1}
    assert sorted(os.listdir(os.path.join(root, "uploads"))) == ["new.jpg"]
    assert sorted(os.listdir(os.path.join(root, "results"))) == ["new.png"]
    with open(os.path.join(root, "job_statuses.json")) as f:
        assert list(json.load(f)) == ["b"]
    with open(os.path.join(root, "batch_jobs.json")) as f:
        assert list(json.load(f)) == ["y"]


def test_sweep_keeps_api_key_database(tmp_path):
    root = str(tmp_path)
    _write(os.path.join(root, "api_keys.sqlite3"), 100)
    sweep(root, 24)
    assert os.path.exists(os.path.join(root, "api_keys.sqlite3"))
