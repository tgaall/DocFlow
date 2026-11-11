"""Windows desktop launcher for DocFlow.

Starts a local FastAPI server bound to 127.0.0.1 with a SQLite database under
%LOCALAPPDATA%/DocFlow, opens the UI in the default browser and shuts the
server down cleanly when the process exits.
"""

import logging
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn  # noqa: E402

from src.config import get_settings  # noqa: E402

logger = logging.getLogger("docflow.launcher")


class SingleInstanceLock:
    """OS-level exclusive lock preventing a second DocFlow instance."""

    def __init__(self, lock_path: Path) -> None:
        self.lock_path = lock_path
        self._file = None

    def acquire(self) -> bool:
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        self._file = open(self.lock_path, "a+b")
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(self._file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self._file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self._file.close()
            self._file = None
            return False
        self._file.seek(0)
        self._file.truncate()
        self._file.write(str(os.getpid()).encode())
        self._file.flush()
        return True

    def release(self) -> None:
        if self._file is None:
            return
        try:
            if os.name == "nt":
                import msvcrt

                self._file.seek(0)
                msvcrt.locking(self._file.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(self._file.fileno(), fcntl.LOCK_UN)
        finally:
            self._file.close()
            self._file = None


def find_free_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


def _setup_logging(logs_dir: Path) -> None:
    logs_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(logs_dir / "docflow.log", encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )


def run_server(host: str, port: int, ready: threading.Event | None = None) -> uvicorn.Server:
    """Run uvicorn in a background thread and return the server handle."""
    from src.main import app

    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    server.docflow_thread = thread  # type: ignore[attr-defined]
    thread.start()
    if ready is not None:
        ready.set()
    return server


def wait_until_started(server: uvicorn.Server, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("Local server did not start in time")
        time.sleep(0.05)


def main() -> int:
    os.environ["DOCFLOW_PLATFORM"] = "windows"
    settings = get_settings()
    settings.ensure_data_dirs()
    _setup_logging(settings.logs_dir)

    lock = SingleInstanceLock(settings.data_dir / "docflow.lock")
    if not lock.acquire():
        logging.error("DocFlow is already running (lock: %s)", lock.lock_path)
        return 1

    server = None
    try:
        port = find_free_port(settings.host)
        logger.info("Starting DocFlow on http://%s:%d", settings.host, port)
        server = run_server(settings.host, port)
        wait_until_started(server)
        webbrowser.open(f"http://{settings.host}:{port}/app/")
        while server.docflow_thread.is_alive():  # type: ignore[attr-defined]
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    except Exception:
        logger.exception("DocFlow failed to start")
        return 1
    finally:
        if server is not None:
            server.should_exit = True
            time.sleep(0.5)
        lock.release()
    return 0


if __name__ == "__main__":
    sys.exit(main())
