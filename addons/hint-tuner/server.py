#!/usr/bin/env python3
"""Dev server for the hint tuner — serves static files and saves hints to disk."""

import json
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent.parent
PLAYLIST = ROOT / "playlist.json"
HINTS_PY = ROOT / "scripts" / "song-hints-data.py"
PORT = 8080
TUNER_PATH = "/addons/hint-tuner/"


def patch_hints_py(title, hints):
    text = HINTS_PY.read_text(encoding="utf-8")
    block = "\n".join(
        f'        {{"start": {h["start"]}, "duration": {h["duration"]}, "label": {json.dumps(h["label"])}}},'
        for h in hints
    )
    pattern = rf'(\s"{re.escape(title)}": \[\n)(.*?)(\n\s+\],)'

    def replacer(match):
        return f"{match.group(1)}{block}\n    ],"

    new_text, count = re.subn(pattern, replacer, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise ValueError(f"Could not patch song-hints-data.py for {title!r}")
    HINTS_PY.write_text(new_text, encoding="utf-8")


def save_hints(song_id, hints):
    with PLAYLIST.open(encoding="utf-8") as f:
        playlist = json.load(f)

    song = next((s for s in playlist if s["id"] == song_id), None)
    if not song:
        raise ValueError(f"Unknown song id: {song_id}")

    cleaned = []
    for i, hint in enumerate(hints[:3]):
        start = int(round(float(hint["start"])))
        duration = int(round(float(hint["duration"])))
        if duration < 1:
            raise ValueError(f"Hint {i + 1} duration must be at least 1 second")
        label = str(hint.get("label") or "").strip() or f"hint {i + 1}"
        cleaned.append({"start": max(0, start), "duration": duration, "label": label})

    while len(cleaned) < 3:
        cleaned.append({"start": 0, "duration": 15, "label": f"hint {len(cleaned) + 1}"})

    song["hints"] = cleaned

    with PLAYLIST.open("w", encoding="utf-8") as f:
        json.dump(playlist, f, indent=2)
        f.write("\n")

    patch_hints_py(song["title"], cleaned)
    return song


class HintTunerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and "200" in str(args[1]):
            return
        super().log_message(fmt, *args)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _json_response(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self._json_response(200, {"ok": True, "server": "hint-tuner"})
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        match = re.fullmatch(r"/api/songs/([^/]+)/hints", unquote(path))
        if not match:
            self.send_error(404)
            return

        song_id = match.group(1)
        try:
            data = self._read_json()
            hints = data.get("hints")
            if not isinstance(hints, list):
                raise ValueError("Body must include a hints array")
            song = save_hints(song_id, hints)
            self._json_response(
                200,
                {
                    "ok": True,
                    "id": song_id,
                    "title": song["title"],
                    "hints": song["hints"],
                },
            )
            print(f"Saved hints for {song_id} ({song['title']})")
        except Exception as exc:
            self._json_response(400, {"ok": False, "error": str(exc)})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server = ThreadingHTTPServer(("127.0.0.1", port), HintTunerHandler)
    print(f"Hint tuner server at http://127.0.0.1:{port}{TUNER_PATH}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main() or 0)
