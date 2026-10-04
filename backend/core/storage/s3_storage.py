import asyncio
from functools import partial
from typing import Any, Dict, Optional

from botocore.exceptions import ClientError

from config.aws_config import aws_config
from config.settings import settings
from .storage_manager import (
    RESULTS_PREFIX,
    UPLOADS_PREFIX,
    StorageManager,
    safe_filename,
    unique_filename,
)


class S3Storage(StorageManager):
    """S3 storage. Inputs go to S3_BUCKET_NAME, results to S3_RESULTS_BUCKET (or the same bucket)."""

    def __init__(self):
        if not settings.s3_bucket_name:
            raise ValueError("S3_BUCKET_NAME must be set when STORAGE_TYPE=s3")
        self.bucket = settings.s3_bucket_name
        self.results_bucket = settings.s3_results_bucket or settings.s3_bucket_name

    @property
    def client(self):
        return aws_config.s3_client

    def _bucket_for(self, key: str) -> str:
        return self.results_bucket if key.startswith(f"{RESULTS_PREFIX}/") else self.bucket

    async def _run(self, func, *args, **kwargs):
        return await asyncio.get_running_loop().run_in_executor(None, partial(func, *args, **kwargs))

    async def upload_file(self, content: bytes, filename: str, content_type: str) -> str:
        key = f"{UPLOADS_PREFIX}/{unique_filename(filename)}"
        await self._run(self.client.put_object, Bucket=self.bucket, Key=key, Body=content, ContentType=content_type)
        return key

    async def upload_result_file(self, content: bytes, filename: str, content_type: str) -> str:
        key = f"{RESULTS_PREFIX}/{safe_filename(filename)}"
        await self._run(self.client.put_object, Bucket=self.results_bucket, Key=key, Body=content, ContentType=content_type)
        return key

    async def download_file(self, path: str) -> Optional[bytes]:
        try:
            response = await self._run(self.client.get_object, Bucket=self._bucket_for(path), Key=path)
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                return None
            raise
        return await self._run(response["Body"].read)

    async def file_exists(self, path: str) -> bool:
        try:
            await self._run(self.client.head_object, Bucket=self._bucket_for(path), Key=path)
            return True
        except ClientError:
            return False

    async def delete_file(self, path: str) -> None:
        await self._run(self.client.delete_object, Bucket=self._bucket_for(path), Key=path)

    async def get_storage_stats(self) -> Dict[str, Any]:
        return {"type": "s3", "bucket": self.bucket, "results_bucket": self.results_bucket}
