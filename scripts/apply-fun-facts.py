#!/usr/bin/env python3
"""Apply fun facts from fun-facts-data.py to playlist.json."""

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAYLIST = ROOT / "playlist.json"

spec = importlib.util.spec_from_file_location(
    "fun_facts_data", ROOT / "scripts" / "fun-facts-data.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
FACTS = mod.FUN_FACTS_BY_TITLE


def main():
    with PLAYLIST.open(encoding="utf-8") as f:
        playlist = json.load(f)

    missing = []
    for song in playlist:
        fact = FACTS.get(song["title"])
        if not fact:
            missing.append(song["title"])
            continue
        song["funFact"] = fact

    with PLAYLIST.open("w", encoding="utf-8") as f:
        json.dump(playlist, f, indent=2)
        f.write("\n")

    print(f"Updated {len(playlist) - len(missing)} fun facts.")
    if missing:
        print("Missing:", ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
