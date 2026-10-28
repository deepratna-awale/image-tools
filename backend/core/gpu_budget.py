"""Keep GPU spending under a monthly budget.

RunPod has no monthly cap of its own, only prepaid credit shared with everything
else on the account. So the worker estimates what each GPU job cost (cold start +
run time + the idle time the endpoint stays warm afterwards, at the GPU's hourly
price) and, once this month's total reaches GPU_MONTHLY_BUDGET_USD, sends jobs to
the CPU until the next UTC month. The estimate errs high: overlapping idle windows
are each counted in full. The total lives in a small JSON file on the shared
storage volume, so restarts don't reset it.
"""
import json
import os
import threading
from datetime import datetime, timezone
from typing import Optional

from config.settings import settings


def _this_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


class GpuBudget:
    def __init__(self, path: Optional[str] = None):
        self._path = path
        self._lock = threading.Lock()

    @property
    def path(self) -> str:
        return self._path or os.path.join(settings.local_storage_path, "gpu_spend.json")

    def spent(self) -> float:
        """Estimated dollars spent on the GPU this month"""
        with self._lock:
            return self._load()

    def exhausted(self) -> bool:
        return settings.gpu_monthly_budget_usd > 0 and self.spent() >= settings.gpu_monthly_budget_usd

    def record(self, busy_seconds: float) -> float:
        """Add one job's cost (from its billed seconds, excluding idle) and return the month's total"""
        seconds = busy_seconds + settings.gpu_idle_seconds
        cost = seconds * settings.gpu_price_per_hour / 3600
        with self._lock:
            total = self._load() + cost
            os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
            temporary = f"{self.path}.tmp"
            with open(temporary, "w") as f:
                json.dump({"month": _this_month(), "dollars": round(total, 6)}, f)
            os.replace(temporary, self.path)
        return total

    def _load(self) -> float:
        try:
            with open(self.path) as f:
                data = json.load(f)
        except (FileNotFoundError, ValueError):
            return 0.0
        return float(data.get("dollars", 0)) if data.get("month") == _this_month() else 0.0


budget = GpuBudget()
