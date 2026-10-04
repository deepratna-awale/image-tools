from core.batch_tracker import BatchJobTracker


def test_batch_and_job_status_are_persisted(tmp_path):
    tracker = BatchJobTracker(str(tmp_path))
    tracker.save_batch_info("b1", ["j1", "j2"], 2)
    tracker.update_job_status("j1", "completed", output_url="results/result_j1.png")

    # A second instance (e.g. the worker process) sees the same state
    other = BatchJobTracker(str(tmp_path))

    assert other.get_batch_job_ids("b1") == ["j1", "j2"]
    assert other.get_batch_info("b1")["total_files"] == 2
    assert other.get_job_status("j1")["status"] == "completed"
    assert other.get_job_status("j1")["output_url"] == "results/result_j1.png"
    assert other.get_job_status("j2") is None
