"""
Admin Logs API endpoints.
"""

import os
import re
from fastapi import APIRouter, Depends, Query, HTTPException
from app.models.user import User
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/admin/logs", tags=["Admin Logs"])

LOG_LINE_REGEX = re.compile(
    r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) - ([^-]+) - ([^-]+) - (.*)$"
)

def _match_entry(entry: dict, search_query: str | None, level_filter: str | None) -> bool:
    if level_filter and entry["level"].upper() != level_filter.upper():
        return False
    if search_query:
        q = search_query.lower()
        if q not in entry["message"].lower() and q not in entry["logger"].lower():
            return False
    return True

def parse_log_file(file_path: str, max_entries: int, search_query: str | None, level_filter: str | None) -> list[dict]:
    if not os.path.exists(file_path):
        return []

    entries = []
    current_entry = None

    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.rstrip("\n")
            match = LOG_LINE_REGEX.match(line)
            if match:
                if current_entry:
                    if _match_entry(current_entry, search_query, level_filter):
                        entries.append(current_entry)

                timestamp, logger_name, level, message = match.groups()
                current_entry = {
                    "timestamp": timestamp,
                    "logger": logger_name.strip(),
                    "level": level.strip(),
                    "message": message,
                }
            else:
                if current_entry:
                    current_entry["message"] += "\n" + line
                else:
                    current_entry = {
                        "timestamp": "",
                        "logger": "system",
                        "level": "INFO",
                        "message": line,
                    }

        if current_entry and _match_entry(current_entry, search_query, level_filter):
            entries.append(current_entry)

    # Reverse to get newest first
    entries.reverse()
    return entries[:max_entries]


@router.get("")
async def get_system_logs(
    limit: int = Query(300, ge=1, le=1000),
    search: str | None = Query(None),
    level: str | None = Query(None),
    _: User = Depends(get_current_user),
):
    """Retrieve system logs from app.log with optional filtering."""
    logs_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../logs"))
    log_file_path = os.path.join(logs_dir, "app.log")

    try:
        entries = parse_log_file(log_file_path, limit, search, level)
        return {
            "total_returned": len(entries),
            "entries": entries
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read logs: {str(e)}")
