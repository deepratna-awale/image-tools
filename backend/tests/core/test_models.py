from core.models.job import Job, JobStatus, ServiceType


def test_job_round_trips_through_queue_payload():
    job = Job(
        service_type=ServiceType.BACKGROUND_REMOVAL,
        input_file_path="uploads/abc.png",
        parameters={"batch_id": "batch-1"},
    )

    restored = Job.from_dict(job.to_dict())

    assert restored == job
    assert restored.status == JobStatus.QUEUED
    assert restored.batch_id == "batch-1"


def test_job_payload_is_json_serialisable():
    import json

    payload = Job(service_type=ServiceType.BACKGROUND_REMOVAL).to_dict()

    assert json.loads(json.dumps(payload))["service_type"] == "background_removal"
