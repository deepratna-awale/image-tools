import os
import re
import uuid
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

UPLOADS_PREFIX = "uploads"
RESULTS_PREFIX = "results"


def safe_filename(filename: Optional[str], default: str = "file") -> str:
    """Strip directories and unsafe characters from a client-supplied filename"""
    name = os.path.basename(filename or "") or default
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name.lstrip(".") or default


def unique_filename(filename: Optional[str]) -> str:
    return f"{uuid.uuid4().hex}_{safe_filename(filename)}"


class StorageManager(ABC):
    """Abstract base class for file storage"""

    @abstractmethod
    async def upload_file(self, content: bytes, filename: str, content_type: str) -> str:
        """Store an input file and return its path/key"""

    @abstractmethod
    async def upload_result_file(self, content: bytes, filename: str, content_type: str) -> str:
        """Store a result file and return its path/key"""

    @abstractmethod
    async def download_file(self, path: str) -> Optional[bytes]:
        """Return the file's bytes, or None if it does not exist"""

    @abstractmethod
    async def file_exists(self, path: str) -> bool:
        """Return whether a file exists"""

    @abstractmethod
    async def delete_file(self, path: str) -> None:
        """Delete a file if it exists"""

    @abstractmethod
    async def get_storage_stats(self) -> Dict[str, Any]:
        """Return storage statistics"""
