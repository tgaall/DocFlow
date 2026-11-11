import http.client
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from platforms.windows.launcher import (
    SingleInstanceLock,
    find_free_port,
    run_server,
    wait_until_started,
)
from src.db.session import dispose_engines


def _http_get(port: int, path: str, headers: dict | None = None) -> tuple[int, str]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        connection.request("GET", path, headers=headers or {})
        response = connection.getresponse()
        return response.status, response.read().decode("utf-8", "replace")
    finally:
        connection.close()


class FreePortTests(unittest.TestCase):
    def test_returns_bindable_port(self) -> None:
        port = find_free_port()
        self.assertGreater(port, 0)
        self.assertLess(port, 65536)


class SingleInstanceLockTests(unittest.TestCase):
    def test_second_lock_on_same_file_fails(self) -> None:
        with TemporaryDirectory() as tmp:
            lock_path = Path(tmp) / "docflow.lock"
            first = SingleInstanceLock(lock_path)
            second = SingleInstanceLock(lock_path)
            self.assertTrue(first.acquire())
            try:
                self.assertFalse(second.acquire())
            finally:
                first.release()

    def test_lock_can_be_reacquired_after_release(self) -> None:
        with TemporaryDirectory() as tmp:
            lock_path = Path(tmp) / "docflow.lock"
            first = SingleInstanceLock(lock_path)
            self.assertTrue(first.acquire())
            first.release()
            second = SingleInstanceLock(lock_path)
            self.assertTrue(second.acquire())
            second.release()

    def test_lock_forbids_two_instances_on_same_database(self) -> None:
        with TemporaryDirectory() as tmp:
            lock_path = Path(tmp) / "docflow.lock"
            first = SingleInstanceLock(lock_path)
            self.assertTrue(first.acquire())
            try:
                second = SingleInstanceLock(lock_path)
                self.assertFalse(second.acquire())
            finally:
                first.release()


class WindowsServerIntegrationTests(unittest.IsolatedAsyncioTestCase):
    """Start the real app with the windows profile against a temp SQLite file."""

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
        self.port = find_free_port()
        self.server = run_server("127.0.0.1", self.port)
        wait_until_started(self.server)

    async def asyncTearDown(self) -> None:
        self.server.should_exit = True
        self.server.docflow_thread.join(timeout=10)
        await dispose_engines()
        self.env.stop()
        self._tmp.cleanup()

    async def test_health_endpoint_responds(self) -> None:
        status, body = _http_get(self.port, "/health")
        self.assertEqual(status, 200)
        self.assertIn("everything is okay", body)

    async def test_frontend_is_served(self) -> None:
        status, body = _http_get(self.port, "/app/")
        self.assertEqual(status, 200)
        self.assertIn("<html", body.lower())

    async def test_database_file_created_in_data_dir(self) -> None:
        _http_get(self.port, "/health")
        database_file = Path(self._tmp.name) / "database" / "docflow.db"
        self.assertTrue(database_file.is_file())

    async def test_foreign_host_header_is_rejected(self) -> None:
        status, _ = _http_get(self.port, "/health", headers={"Host": "evil.example"})
        self.assertEqual(status, 403)

    async def test_foreign_origin_is_rejected_for_mutations(self) -> None:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.request(
                "POST",
                "/auth/login",
                body=b"{}",
                headers={
                    "Host": "127.0.0.1",
                    "Origin": "http://evil.example",
                    "Content-Type": "application/json",
                },
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 403)
            response.read()
        finally:
            connection.close()

    async def test_localhost_origin_is_allowed(self) -> None:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.request(
                "POST",
                "/auth/login",
                body=b'{"username": "nobody", "password": "xxxxxxxxxxxx"}',
                headers={
                    "Host": "127.0.0.1",
                    "Origin": f"http://127.0.0.1:{self.port}",
                    "Content-Type": "application/json",
                },
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 401)
            response.read()
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
