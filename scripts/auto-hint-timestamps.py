#!/usr/bin/env python3
"""Analyze MP3 clips and suggest hint windows (songs 4+). Songs 1–3 are skipped."""

import importlib.util
import json
import re
import sys
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CLIPS = ROOT / "clips"
PLAYLIST = ROOT / "playlist.json"
HINTS_PY = ROOT / "scripts" / "song-hints-data.py"

SKIP_TITLES = {"Too Tight", "Ffun", "Brick House"}

H1_DUR = 15
H2_DUR = 15
H3_DUR = 18
MIN_GAP = 8
SR = 22050


def fmt_time(seconds):
    minutes, secs = divmod(int(seconds), 60)
    return f"{minutes}:{secs:02d}"


def fmt_range(start, duration):
    return f"{fmt_time(start)}–{fmt_time(start + duration)}"


def window_score(values, start, duration):
    end = min(start + duration, len(values))
    if end <= start:
        return None
    return values[start:end]


def best_window(values, duration, lo, hi, scorer, avoid=None):
    """Find start in [lo, hi) maximizing scorer(segment)."""
    lo = max(0, int(lo))
    hi = min(len(values) - duration, int(hi))
    if hi <= lo:
        lo = max(0, min(lo, len(values) - duration))

    best_start = lo
    best_value = -np.inf
    for start in range(lo, max(lo + 1, hi + 1)):
        segment = window_score(values, start, duration)
        if segment is None or len(segment) < duration * 0.6:
            continue
        if avoid and any(abs(start - a) < MIN_GAP for a in avoid):
            continue
        value = scorer(segment, start)
        if value > best_value:
            best_value = value
            best_start = start
    return best_start


def analyze_track(path):
    y, sr = librosa.load(path, sr=SR, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)
    seconds = max(1, int(duration))

    hop = sr
    rms_list = []
    cent_list = []
    flat_list = []

    for i in range(seconds):
        frame = y[i * hop : (i + 1) * hop]
        if len(frame) < hop // 4:
            break
        rms_list.append(float(np.sqrt(np.mean(frame**2))))
        cent_list.append(
            float(librosa.feature.spectral_centroid(y=frame, sr=sr).mean())
        )
        flat_list.append(
            float(librosa.feature.spectral_flatness(y=frame).mean())
        )

    n = len(rms_list)
    if n < H1_DUR + H2_DUR + H3_DUR:
        return None

    rms = np.array(rms_list)
    cent = np.array(cent_list)
    flat = np.array(flat_list)

    def norm(arr):
        span = arr.max() - arr.min()
        if span < 1e-9:
            return np.zeros_like(arr)
        return (arr - arr.min()) / span

    rms_n = norm(rms)
    cent_n = norm(cent)
    flat_n = norm(flat)

    # Higher = more vocal / melodic lead; lower = more instrumental groove.
    vocal = 0.45 * rms_n + 0.35 * cent_n + 0.20 * (1.0 - flat_n)

    # --- Hint 3: chorus / hook — loudest sustained section, usually mid-song ---
    h3_lo = int(n * 0.22)
    h3_hi = int(n * 0.72)
    h3_start = best_window(
        rms_n,
        H3_DUR,
        h3_lo,
        h3_hi,
        lambda seg, _s: seg.mean() + 0.15 * np.std(seg),
    )

    # --- Hint 2: verse — moderate energy, before chorus, some vocals ---
    h2_hi = max(int(n * 0.15), h3_start - MIN_GAP)
    h2_lo = int(n * 0.10)
    target = np.percentile(rms_n, 55)

    def h2_scorer(seg, _start):
        return -abs(seg.mean() - target) + 0.25 * vocal[_start : _start + len(seg)].mean()

    h2_start = best_window(
        rms_n,
        H2_DUR,
        h2_lo,
        h2_hi,
        h2_scorer,
        avoid=[h3_start],
    )

    # --- Hint 1: intro / instrumental — low vocal, prefer t=0 if it fits ---
    intro_vocal = vocal[: min(H1_DUR, n)].mean()
    median_vocal = np.median(vocal)

    if intro_vocal <= median_vocal * 0.92:
        h1_start = 0
        h1_label = "intro"
    else:
        h1_lo = 0
        h1_hi = int(n * 0.28)
        h1_start = best_window(
            vocal,
            H1_DUR,
            h1_lo,
            h1_hi,
            lambda seg, _s: -seg.mean(),
            avoid=[h2_start, h3_start],
        )
        h1_label = "intro" if h1_start < 3 else "instrumental groove"

    # Nudge apart if still overlapping
    starts = sorted(
        [
            (h1_start, H1_DUR, "h1"),
            (h2_start, H2_DUR, "h2"),
            (h3_start, H3_DUR, "h3"),
        ],
        key=lambda x: x[0],
    )
    for i in range(1, len(starts)):
        prev_start, prev_dur, _ = starts[i - 1]
        cur_start, cur_dur, _ = starts[i]
        if cur_start < prev_start + prev_dur + MIN_GAP:
            starts[i] = (prev_start + prev_dur + MIN_GAP, cur_dur, starts[i][2])

    by_key = {key: start for start, _dur, key in starts}
    h1_start = by_key["h1"]
    h2_start = by_key["h2"]
    h3_start = by_key["h3"]

    return [
        {"start": h1_start, "duration": H1_DUR, "label": h1_label},
        {
            "start": h2_start,
            "duration": H2_DUR,
            "label": fmt_range(h2_start, H2_DUR),
        },
        {
            "start": h3_start,
            "duration": H3_DUR,
            "label": fmt_range(h3_start, H3_DUR),
        },
    ]


def load_playlist():
    with PLAYLIST.open(encoding="utf-8") as f:
        return json.load(f)


def update_hints_py(new_hints_by_title):
    text = HINTS_PY.read_text(encoding="utf-8")
    for title, hints in new_hints_by_title.items():
        pattern = rf'(\s"{re.escape(title)}": \[\n)(.*?)(\n\s+\],)'
        block = "\n".join(
            f'        {{"start": {h["start"]}, "duration": {h["duration"]}, "label": "{h["label"]}"}},'
            for h in hints
        )
        replacement = rf"\1{block}\n    ],"
        new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
        if count != 1:
            print(f"  WARN: could not patch {title!r}", file=sys.stderr)
        else:
            text = new_text
    HINTS_PY.write_text(text, encoding="utf-8")


def main():
    playlist = load_playlist()
    updated = {}

    for song in playlist:
        title = song["title"]
        if title in SKIP_TITLES:
            print(f"skip  {song['id']}  {title}")
            continue

        clip = CLIPS / f"{song['id']}.mp3"
        if not clip.exists():
            print(f"MISS  {song['id']}  {title} — no clip", file=sys.stderr)
            continue

        hints = analyze_track(clip)
        if not hints:
            print(f"FAIL  {song['id']}  {title} — track too short", file=sys.stderr)
            continue

        updated[title] = hints
        h1, h2, h3 = hints
        print(
            f"{song['id']}  {title}\n"
            f"  H1 {fmt_range(h1['start'], h1['duration'])} ({h1['label']})\n"
            f"  H2 {fmt_range(h2['start'], h2['duration'])}\n"
            f"  H3 {fmt_range(h3['start'], h3['duration'])}"
        )

    if not updated:
        print("Nothing to update.")
        return 1

    if "--dry-run" in sys.argv:
        print(f"\nDry run — would update {len(updated)} songs.")
        return 0

    update_hints_py(updated)
    print(f"\nPatched {len(updated)} entries in song-hints-data.py")
    print("Run: python3 scripts/apply-hint-timestamps.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
