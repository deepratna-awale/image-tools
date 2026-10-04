import os

import pytest

from core.storage.local_storage import LocalStorage


@pytest.fixture
def storage(tmp_path):
    return LocalStorage(str(tmp_path))


async def test_upload_and_download_input(storage):
    path = await storage.upload_file(b"data", "photo.jpg", "image/jpeg")

    assert path.startswith(storage.base_path)
    assert await storage.file_exists(path)
    assert await storage.download_file(path) == b"data"


async def test_result_paths_resolve_relative_to_root(storage):
    await storage.upload_result_file(b"png", "result_job1.png", "image/png")

    assert await storage.file_exists("results/result_job1.png")
    assert await storage.download_file("results/result_job1.png") == b"png"


async def test_client_filenames_cannot_escape_root(storage):
    path = await storage.upload_file(b"x", "../../etc/passwd", "image/jpeg")

    assert os.path.dirname(path) == os.path.join(storage.base_path, "uploads")
    assert await storage.download_file("../../etc/passwd") is None
    assert not await storage.file_exists("/etc/passwd")


async def test_delete_and_stats(storage):
    path = await storage.upload_file(b"1234", "a.png", "image/png")
    stats = await storage.get_storage_stats()
    assert stats["uploads_count"] == 1
    assert stats["uploads_bytes"] == 4

    await storage.delete_file(path)

    assert not await storage.file_exists(path)
