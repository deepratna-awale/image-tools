import asyncio
import os
from typing import Any, Dict, Optional

import aiofiles

from config.settings import settings
from .storage_manager import (
    RESULTS_PREFIX,
    UPLOADS_PREFIX,
    StorageManager,
    safe_filename,
    unique_filename,
)


class LocalStorage(StorageManager):
    """Filesystem storage rooted at settings.local_storage_path"""

    def __init__(self, base_path: Optional[str] = None):
        self.base_path = os.path.realpath(base_path or settings.local_storage_path)
        os.makedirs(os.path.join(self.base_path, UPLOADS_PREFIX), exist_ok=True)
        os.makedirs(os.path.join(self.base_path, RESULTS_PREFIX), exist_ok=True)

    def _resolve(self, path: str) -> str:
        """Map a stored path to an absolute path inside base_path"""
        candidate = path if os.path.isabs(path) else os.path.realpath(path)
        if not candidate.startswith(self.base_path + os.sep):
            candidate = os.path.realpath(os.path.join(self.base_path, path))
        if not candidate.startswith(self.base_path + os.sep):
            raise ValueError(f"Path outside storage root: {path}")
        return candidate

    async def _write(self, relative_path: str, content: bytes) -> str:
        full_path = os.path.join(self.base_path, relative_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        async with aiofiles.open(full_path, "wb") as f:
            await f.write(content)
        return full_path

    async def upload_file(self, content: bytes, filename: str, content_type: str) -> str:
        return await self._write(os.path.join(UPLOADS_PREFIX, unique_filename(filename)), content)

    async def upload_result_file(self, content: bytes, filename: str, content_type: str) -> str:
        return await self._write(os.path.join(RESULTS_PREFIX, safe_filename(filename)), content)

    async def download_file(self, path: str) -> Optional[bytes]:
        try:
            full_path = self._resolve(path)
        except ValueError:
            return None
        if not os.path.isfile(full_path):
            return None
        async with aiofiles.open(full_path, "rb") as f:
            return await f.read()

    async def file_exists(self, path: str) -> bool:
        try:
            return os.path.isfile(self._resolve(path))
        except ValueError:
            return False

    async def delete_file(self, path: str) -> None:
        full_path = self._resolve(path)
        if os.path.isfile(full_path):
            os.remove(full_path)

    async def get_storage_stats(self) -> Dict[str, Any]:
        def collect() -> Dict[str, Any]:
            stats: Dict[str, Any] = {"type": "local", "base_path": self.base_path}
            for prefix in (UPLOADS_PREFIX, RESULTS_PREFIX):
                directory = os.path.join(self.base_path, prefix)
                files = [os.path.join(directory, f) for f in os.listdir(directory)] if os.path.isdir(directory) else []
                files = [f for f in files if os.path.isfile(f)]
                stats[f"{prefix}_count"] = len(files)
                stats[f"{prefix}_bytes"] = sum(os.path.getsize(f) for f in files)
            return stats

        return await asyncio.get_running_loop().run_in_executor(None, collect)
