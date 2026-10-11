"""Delete uploaded images, results and job records once they are old enough.

The privacy policy promises uploads are kept only briefly, so the API runs this
sweep every hour against the shared storage volume (local storage only).
"""
import asyncio
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Dict

from config.settings import settings
from .batch_tracker import BatchJobTracker
from .storage.storage_manager import RESULTS_PREFIX, UPLOADS_PREFIX

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 3600


def _older_than(timestamp: str, cutoff: datetime) -> bool:
    try:
        return datetime.fromisoformat(timestamp) < cutoff
    except (TypeError, ValueError):
        return True


def sweep(storage_path: str, max_age_hours: float) -> Dict[str, int]:
    """Remove files and job records older than max_age_hours; return what was removed"""
    removed = {"files": 0, "jobs": 0, "batches": 0}
    file_cutoff = time.time() - max_age_hours * 3600
    for prefix in (UPLOADS_PREFIX, RESULTS_PREFIX):
        directory = os.path.join(storage_path, prefix)
        if not os.path.isdir(directory):
            continue
        for root, _, files in os.walk(directory):
            for name in files:
                path = os.path.join(root, name)
                try:
                    if os.path.getmtime(path) < file_cutoff:
                        os.remove(path)
                        removed["files"] += 1
                except FileNotFoundError:
                    pass

    record_cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
    tracker = BatchJobTracker(storage_path)
    with tracker._locked():
        jobs = tracker.load_job_data()
        stale = [job_id for job_id, job in jobs.items() if _older_than(job.get("updated_at"), record_cutoff)]
        for job_id in stale:
            del jobs[job_id]
        if stale:
            tracker.save_job_data(jobs)
        removed["jobs"] = len(stale)

        batches = tracker.load_data()
        stale = [batch_id for batch_id, batch in batches.items() if _older_than(batch.get("created_at"), record_cutoff)]
        for batch_id in stale:
            del batches[batch_id]
        if stale:
            tracker.save_data(batches)
        removed["batches"] = len(stale)
    return removed


async def run_forever() -> None:
    """Sweep on startup and then every hour until cancelled"""
    while True:
        try:
            removed = await asyncio.to_thread(sweep, settings.local_storage_path, settings.file_retention_hours)
            if any(removed.values()):
                logger.info(f"Retention sweep removed {removed}")
        except Exception as e:
            logger.warning(f"Retention sweep failed: {e}")
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
