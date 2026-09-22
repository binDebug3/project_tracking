#!/usr/bin/env python3
"""Safari-friendly local server for Hours Pilot CSV persistence."""
from __future__ import annotations

import argparse
import json
import os
import tempfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = Path.home() / ".hours-pilot" / "config.json"
DEFAULT_CSV_PATH = Path.home() / "Documents" / "hours-pilot.csv"


def csv_path(value: str | None) -> Path:
    path = Path(value).expanduser() if value else DEFAULT_CSV_PATH
    path = path.resolve()
    if path.suffix.lower() != ".csv":
        raise ValueError("CSV path must end in .csv")
    return path


def load_config() -> dict[str, str]:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_config(path: Path) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps({"csv_path": str(path)}, indent=2) + "\n", encoding="utf-8")


def current_csv_path() -> Path:
    return csv_path(load_config().get("csv_path"))


def status_payload(path: Path) -> dict[str, object]:
    exists = path.is_file()
    return {
        "path": str(path),
        "fileName": path.name,
        "exists": exists,
        "csvText": path.read_text(encoding="utf-8") if exists else "",
    }


class HoursPilotHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, object]:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 10_000_000:
            raise ValueError("Request is too large")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/csv/status":
            try:
                self.send_json(status_payload(current_csv_path()))
            except (OSError, ValueError) as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return
        super().do_GET()

    def do_POST(self) -> None:
        route = urlparse(self.path).path
        try:
            payload = self.read_json()
            if route == "/api/csv/configure":
                path = csv_path(str(payload.get("path") or ""))
                save_config(path)
                self.send_json(status_payload(path))
                return
            if route == "/api/csv/write":
                path = current_csv_path()
                csv_text = str(payload.get("csvText") or "")
                path.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temp:
                    temp.write(csv_text)
                    temporary_path = Path(temp.name)
                os.replace(temporary_path, path)
                self.send_json({"fileName": path.name, "rowCount": int(payload.get("rowCount") or 0)})
                return
            self.send_json({"error": "Unknown API route"}, HTTPStatus.NOT_FOUND)
        except (OSError, ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Hours Pilot with a persistent local CSV backend.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--csv", help="CSV path to use now and remember for future launches")
    args = parser.parse_args()
    if args.csv:
        save_config(csv_path(args.csv))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), HoursPilotHandler)
    print(f"Hours Pilot is running at http://127.0.0.1:{args.port}/app/")
    print(f"CSV: {current_csv_path()}")
    server.serve_forever()


if __name__ == "__main__":
    main()
