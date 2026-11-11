import http.client
import json
import os
import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch

from platforms.windows.launcher import find_free_port, run_server, wait_until_started
from src.db.session import dispose_engines


def _request(
    port: int, method: str, path: str, payload: dict | None = None
) -> tuple[int, dict | None]:
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"} if body else {}
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        data = json.loads(raw) if raw else None
        return response.status, data
    finally:
        connection.close()


class PersistenceTests(unittest.IsolatedAsyncioTestCase):
    """User data must survive a full application restart (simulated EXE restart)."""

    async def asyncSetUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.env = patch.dict(
            os.environ,
            {
                "DOCFLOW_PLATFORM": "windows",
                "DOCFLOW_DATA_DIR": self._tmp.name,
            },
            clear=True,
        )
        self.env.start()

    async def asyncTearDown(self) -> None:
        await dispose_engines()
        self.env.stop()
        self._tmp.cleanup()

    def _start_server(self):
        port = find_free_port()
        server = run_server("127.0.0.1", port)
        wait_until_started(server)
        return server, port

    def _stop_server(self, server) -> None:
        server.should_exit = True
        server.docflow_thread.join(timeout=10)

    async def test_data_persists_across_restart(self) -> None:
        server, port = self._start_server()
        status, user = _request(
            port, "POST", "/auth/register", {"username": "alice", "password": "secret123"}
        )
        self.assertEqual(status, 201)
        self.assertEqual(user["username"], "alice")
        self._stop_server(server)
        await dispose_engines()

        server, port = self._start_server()
        try:
            status, user = _request(
                port, "POST", "/auth/login", {"username": "alice", "password": "secret123"}
            )
            self.assertEqual(status, 200)
            self.assertEqual(user["username"], "alice")
        finally:
            self._stop_server(server)

    async def test_restart_on_fresh_directory_requires_registration(self) -> None:
        server, port = self._start_server()
        try:
            status, _ = _request(
                port, "POST", "/auth/login", {"username": "ghost", "password": "x" * 12}
            )
            self.assertEqual(status, 401)
        finally:
            self._stop_server(server)


if __name__ == "__main__":
    unittest.main()
