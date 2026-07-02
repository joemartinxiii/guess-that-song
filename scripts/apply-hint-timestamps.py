#!/usr/bin/env python3
"""Apply single-file audio + hint timestamps to playlist.json."""

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAYLIST = ROOT / "playlist.json"

spec = importlib.util.spec_from_file_location(
    "song_hints_data", ROOT / "scripts" / "song-hints-data.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
HINTS = mod.HINTS_BY_TITLE


def normalize_hint_durations(hints):
    """Default hints 1–2 to 15s and hint 3 to 12s when duration is omitted."""
    out = []
    for i, hint in enumerate(hints):
        entry = dict(hint)
        if entry.get("duration") is None:
            entry["duration"] = 15 if i < 2 else 12
        out.append(entry)
    return out


def main():
    with PLAYLIST.open(encoding="utf-8") as f:
        playlist = json.load(f)

    missing = []
    for song in playlist:
        title = song["title"]
        hints = HINTS.get(title)
        if not hints:
            missing.append(title)
            continue

        song_id = song["id"]
        song["audio"] = f"clips/{song_id}.mp3"
        song["hints"] = normalize_hint_durations(hints)
        song.pop("snippets", None)

    if missing:
        print("Missing hint data for:", ", ".join(missing), file=sys.stderr)
        return 1

    with PLAYLIST.open("w", encoding="utf-8") as f:
        json.dump(playlist, f, indent=2)
        f.write("\n")

    print(f"Updated {len(playlist)} songs with audio + hint timestamps.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
