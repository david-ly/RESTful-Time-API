"""Standard-library Python implementation of the RESTful time API."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from typing import Any, Protocol
from urllib.parse import parse_qs, unquote, urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


OBJECT_ID = re.compile(r"^[0-9a-fA-F]{24}$")
DATE_FIELDS = ("created", "time", "updated")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("time must be an ISO 8601 string")
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def serialize_datetime(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def serialize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    result = dict(entry)
    for field in DATE_FIELDS:
        if isinstance(result.get(field), datetime):
            result[field] = serialize_datetime(result[field])
    return result


class TimeStore(Protocol):
    def all(self) -> list[dict[str, Any]]: ...

    def get(self, entry_id: str) -> dict[str, Any] | None: ...

    def create(self, values: dict[str, Any]) -> dict[str, Any]: ...

    def update(self, entry_id: str, values: dict[str, Any]) -> dict[str, Any] | None: ...

    def delete(self, entry_id: str) -> bool: ...


class InMemoryTimeStore:
    def __init__(self) -> None:
        self.entries: dict[str, dict[str, Any]] = {}

    def all(self) -> list[dict[str, Any]]:
        return list(self.entries.values())

    def get(self, entry_id: str) -> dict[str, Any] | None:
        return self.entries.get(entry_id)

    def create(self, values: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        entry = {
            "_id": uuid.uuid4().hex[:24],
            "description": values.get("description"),
            "time": parse_datetime(values["time"]) if "time" in values else None,
            "created": now,
            "updated": now,
        }
        self.entries[entry["_id"]] = entry
        return entry

    def update(self, entry_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
        entry = self.entries.get(entry_id)
        if entry is None:
            return None
        if "description" in values:
            entry["description"] = values["description"]
        if "time" in values:
            entry["time"] = parse_datetime(values["time"])
        entry["updated"] = utc_now()
        return entry

    def delete(self, entry_id: str) -> bool:
        return self.entries.pop(entry_id, None) is not None


class SQLiteTimeStore:
    def __init__(self, path: str) -> None:
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute(
            """CREATE TABLE IF NOT EXISTS time_entries (
                id TEXT PRIMARY KEY,
                description TEXT,
                time TEXT,
                created TEXT NOT NULL,
                updated TEXT NOT NULL
            )"""
        )
        self.connection.commit()

    def _entry(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "_id": row["id"],
            "description": row["description"],
            "time": parse_datetime(row["time"]) if row["time"] else None,
            "created": parse_datetime(row["created"]),
            "updated": parse_datetime(row["updated"]),
        }

    def all(self) -> list[dict[str, Any]]:
        rows = self.connection.execute("SELECT * FROM time_entries ORDER BY rowid").fetchall()
        return [self._entry(row) for row in rows]

    def get(self, entry_id: str) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM time_entries WHERE id = ?", (entry_id,)).fetchone()
        return self._entry(row) if row else None

    def create(self, values: dict[str, Any]) -> dict[str, Any]:
        entry = InMemoryTimeStore().create(values)
        self.connection.execute(
            "INSERT INTO time_entries VALUES (?, ?, ?, ?, ?)",
            (entry["_id"], entry["description"], serialize_datetime(entry["time"]) if entry["time"] else None,
             serialize_datetime(entry["created"]), serialize_datetime(entry["updated"])),
        )
        self.connection.commit()
        return entry

    def update(self, entry_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
        entry = self.get(entry_id)
        if entry is None:
            return None
        if "description" in values:
            entry["description"] = values["description"]
        if "time" in values:
            entry["time"] = parse_datetime(values["time"])
        entry["updated"] = utc_now()
        self.connection.execute(
            "UPDATE time_entries SET description = ?, time = ?, updated = ? WHERE id = ?",
            (entry["description"], serialize_datetime(entry["time"]) if entry["time"] else None,
             serialize_datetime(entry["updated"]), entry_id),
        )
        self.connection.commit()
        return entry

    def delete(self, entry_id: str) -> bool:
        cursor = self.connection.execute("DELETE FROM time_entries WHERE id = ?", (entry_id,))
        self.connection.commit()
        return cursor.rowcount > 0


class TimeApi:
    def __init__(self, store: TimeStore) -> None:
        self.store = store

    def __call__(self, environ: dict[str, Any], start_response: Any) -> list[bytes]:
        method = environ["REQUEST_METHOD"]
        parsed = urlsplit(environ.get("PATH_INFO", "/"))
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(environ.get("QUERY_STRING", parsed.query))
        try:
            status, payload = self._handle(method, path, query, environ)
        except ValueError as error:
            status, payload = HTTPStatus.BAD_REQUEST, {"error": str(error)}
        except Exception as error:
            status, payload = HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)}
        body = json.dumps(payload, separators=(",", ":")).encode()
        start_response(f"{status.value} {status.phrase}", [("Content-Type", "application/json"), ("Content-Length", str(len(body)))])
        return [body]

    def _handle(self, method: str, path: str, query: dict[str, list[str]], environ: dict[str, Any]) -> tuple[HTTPStatus, Any]:
        if method == "GET" and path in ("/", "/ping"):
            return HTTPStatus.OK, {"message": "pong", "ts": int(utc_now().timestamp() * 1000)}
        if path != "/time" and not path.startswith("/time/"):
            return HTTPStatus.NOT_FOUND, {"error": "Not found"}
        parts = path.split("/")
        if len(parts) > 3:
            return HTTPStatus.NOT_FOUND, {"error": "Not found"}
        entry_id = parts[2] if len(parts) == 3 and parts[2] else None
        if entry_id and not OBJECT_ID.fullmatch(entry_id):
            return HTTPStatus.BAD_REQUEST, {"error": "Invalid ID format"}
        if method == "GET" and entry_id is None:
            return HTTPStatus.OK, [serialize_entry(entry) for entry in self.store.all()]
        if method == "GET" and entry_id:
            entry = self.store.get(entry_id)
            if entry is None:
                return HTTPStatus.NOT_FOUND, {"error": f"Time entry [{entry_id}] not found"}
            result = dict(entry)
            if query.get("zone"):
                zone = unquote(query["zone"][0])
                try:
                    result["time"] = result["time"].astimezone(ZoneInfo(zone))
                except (ZoneInfoNotFoundError, ValueError):
                    return HTTPStatus.BAD_REQUEST, {"error": f"Invalid TZ {zone}"}
            return HTTPStatus.OK, serialize_entry(result)
        if method == "POST" and entry_id is None:
            values = self._body(environ)
            return HTTPStatus.CREATED, serialize_entry(self.store.create(values))
        if method == "PUT" and entry_id:
            values = self._body(environ)
            if query.get("UTC") and "time" in values:
                values["time"] = serialize_datetime(parse_datetime(values["time"]))
            updated = self.store.update(entry_id, values)
            if updated is None:
                return HTTPStatus.NOT_FOUND, {"error": f"Time entry [{entry_id}] not found"}
            return HTTPStatus.OK, serialize_entry(updated)
        if method == "DELETE" and entry_id:
            if not self.store.delete(entry_id):
                return HTTPStatus.NOT_FOUND, {"error": f"Time entry [{entry_id}] not found"}
            return HTTPStatus.OK, {"message": f"Time entry [{entry_id}] successfully deleted"}
        return HTTPStatus.NOT_FOUND, {"error": "Not found"}

    @staticmethod
    def _body(environ: dict[str, Any]) -> dict[str, Any]:
        length = int(environ.get("CONTENT_LENGTH") or 0)
        raw = environ["wsgi.input"].read(length)
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError as error:
            raise ValueError("Invalid JSON body") from error
        if not isinstance(body, dict):
            raise ValueError("JSON body must be an object")
        return body


def create_app(store: TimeStore | None = None) -> TimeApi:
    return TimeApi(store or SQLiteTimeStore(os.getenv("TIME_API_DB", "time_api.sqlite3")))


app = create_app()


if __name__ == "__main__":
    from wsgiref.simple_server import make_server

    port = int(os.getenv("PORT", "3000"))
    print(f"Python time API listening on port {port}")
    make_server("", port, app).serve_forever()
