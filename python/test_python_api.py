import json
import threading
import unittest
from datetime import datetime, timezone
from http.client import HTTPConnection
from wsgiref.simple_server import WSGIRequestHandler, make_server

from python_api import InMemoryTimeStore, create_app, parse_datetime, serialize_entry


class QuietHandler(WSGIRequestHandler):
    def log_message(self, *_args):
        pass


class StoreUnitTests(unittest.TestCase):
    def setUp(self):
        self.store = InMemoryTimeStore()

    def test_create_update_and_delete(self):
        entry = self.store.create({"description": "launch", "time": "2025-01-02T03:04:05Z"})
        self.assertRegex(entry["_id"], r"^[0-9a-f]{24}$")
        self.assertEqual(entry["time"], datetime(2025, 1, 2, 3, 4, 5, tzinfo=timezone.utc))
        updated = self.store.update(entry["_id"], {"description": "updated"})
        self.assertEqual(updated["description"], "updated")
        self.assertTrue(self.store.delete(entry["_id"]))
        self.assertIsNone(self.store.get(entry["_id"]))

    def test_datetime_serialization_matches_json_date_shape(self):
        value = {"time": parse_datetime("2025-01-02T03:04:05.123456Z")}
        self.assertEqual(serialize_entry(value)["time"], "2025-01-02T03:04:05.123Z")


class ApiIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = make_server("127.0.0.1", 0, create_app(InMemoryTimeStore()), handler_class=QuietHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.host, cls.port = cls.server.server_address

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join()

    def request(self, method, path, body=None):
        connection = HTTPConnection(self.host, self.port)
        encoded = json.dumps(body).encode() if body is not None else None
        connection.request(method, path, encoded, {"Content-Type": "application/json"} if encoded else {})
        response = connection.getresponse()
        payload = json.loads(response.read())
        connection.close()
        return response.status, payload

    def test_crud_timezone_and_health_parity(self):
        status, health = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertEqual(health["message"], "pong")
        self.assertIsInstance(health["ts"], int)

        status, created = self.request("POST", "/time", {"description": "meeting", "time": "2025-06-01T12:00:00Z"})
        self.assertEqual(status, 201)
        entry_id = created["_id"]
        self.assertEqual(created["time"], "2025-06-01T12:00:00.000Z")

        status, converted = self.request("GET", f"/time/{entry_id}?zone=America%2FNew_York")
        self.assertEqual(status, 200)
        self.assertEqual(converted["time"], "2025-06-01T08:00:00.000-04:00")

        status, updated = self.request("PUT", f"/time/{entry_id}", {"description": "rescheduled", "time": "2025-06-02T12:00:00Z"})
        self.assertEqual(status, 200)
        self.assertEqual(updated["description"], "rescheduled")

        status, entries = self.request("GET", "/time")
        self.assertEqual(status, 200)
        self.assertEqual(len(entries), 1)

        status, deleted = self.request("DELETE", f"/time/{entry_id}")
        self.assertEqual(status, 200)
        self.assertIn(entry_id, deleted["message"])

    def test_invalid_ids_and_missing_entries_match_contract(self):
        status, payload = self.request("GET", "/time/nope")
        self.assertEqual((status, payload), (400, {"error": "Invalid ID format"}))
        status, payload = self.request("GET", "/time/0123456789abcdef01234567")
        self.assertEqual(status, 404)
        self.assertIn("not found", payload["error"])


if __name__ == "__main__":
    unittest.main()