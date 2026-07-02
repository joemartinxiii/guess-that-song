#!/usr/bin/env python3
"""
Fetch hint timestamps from Spotify Audio Analysis (sections/segments).

NOTE: Spotify deprecated /audio-analysis for new apps in Nov 2024 (403 for new
Client IDs). This script is kept for reference only — use addons/hint-tuner/ instead.

Requires a Spotify Developer app (free):
  https://developer.spotify.com/dashboard

Set credentials in .env (see .env.example) or the environment:
  SPOTIFY_CLIENT_ID
  SPOTIFY_CLIENT_SECRET

Usage:
  python3 scripts/spotify-hints.py              # songs 4–55, write files
  python3 scripts/spotify-hints.py --dry-run    # preview only
  python3 scripts/spotify-hints.py --all        # include songs 1–3
"""

import argparse
import base64
import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAYLIST = ROOT / "playlist.json"
HINTS_PY = ROOT / "scripts" / "song-hints-data.py"
ENV_FILE = ROOT / ".env"

SKIP_TITLES = {"Too Tight", "Ffun", "Brick House"}

H1_DUR = 15
H2_DUR = 15
H3_DUR = 18
MIN_GAP = 8

TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"


def load_dotenv():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in __import__("os").environ:
            __import__("os").environ[key] = value


def normalize(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if text.startswith("the "):
        text = text[4:]
    return text


def fmt_time(seconds):
    seconds = max(0, int(round(seconds)))
    m, s = divmod(seconds, 60)
    return f"{m}:{s:02d}"


def fmt_range(start, duration):
    return f"{fmt_time(start)}–{fmt_time(start + duration)}"


class SpotifyClient:
    def __init__(self, client_id, client_secret):
        self.client_id = client_id
        self.client_secret = client_secret
        self.token = None
        self.expires_at = 0

    def _request(self, method, url, data=None, headers=None, retries=3):
        for attempt in range(retries):
            req = urllib.request.Request(url, data=data, method=method)
            req.add_header("User-Agent", "music.game/1.0")
            if headers:
                for key, value in headers.items():
                    req.add_header(key, value)
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    if resp.status == 204:
                        return None
                    return json.loads(resp.read().decode())
            except urllib.error.HTTPError as err:
                if err.code == 429 and attempt < retries - 1:
                    retry_after = int(err.headers.get("Retry-After", "2"))
                    time.sleep(retry_after + 0.5)
                    continue
                body = err.read().decode(errors="replace")
                raise RuntimeError(f"Spotify HTTP {err.code}: {body}") from err
        return None

    def authenticate(self):
        if self.token and time.time() < self.expires_at - 30:
            return
        creds = f"{self.client_id}:{self.client_secret}".encode()
        auth = base64.b64encode(creds).decode()
        data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
        payload = self._request(
            "POST",
            TOKEN_URL,
            data=data,
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        self.token = payload["access_token"]
        self.expires_at = time.time() + payload.get("expires_in", 3600)

    def api_get(self, path):
        self.authenticate()
        url = f"{API_BASE}{path}"
        return self._request(
            "GET",
            url,
            headers={"Authorization": f"Bearer {self.token}"},
        )

    def search_track(self, title, artist):
        queries = [
            f'track:"{title}" artist:"{artist}"',
            f"{title} {artist}",
            title,
        ]
        title_n = normalize(title)
        artist_n = normalize(artist)

        best = None
        best_score = -1

        for query in queries:
            params = urllib.parse.urlencode(
                {"q": query, "type": "track", "limit": "8", "market": "US"}
            )
            data = self.api_get(f"/search?{params}")
            for item in data.get("tracks", {}).get("items", []):
                item_title = normalize(item.get("name", ""))
                item_artists = " ".join(
                    normalize(a.get("name", "")) for a in item.get("artists", [])
                )
                score = 0
                if title_n == item_title:
                    score += 60
                elif title_n in item_title or item_title in title_n:
                    score += 35
                if artist_n in item_artists or any(
                    part in item_artists for part in artist_n.split() if len(part) > 2
                ):
                    score += 40
                if item.get("is_local"):
                    score -= 20
                duration_ms = item.get("duration_ms") or 0
                if duration_ms > 0:
                    score += 5
                if score > best_score:
                    best_score = score
                    best = item
            if best_score >= 85:
                break
            time.sleep(0.15)

        if best_score < 55:
            return None, best_score
        return best, best_score

    def get_audio_analysis(self, track_id):
        return self.api_get(f"/audio-analysis/{track_id}")


def build_loudness_curve(segments, seconds):
    curve = [None] * seconds
    for seg in segments:
        start = int(seg["start"])
        end = int(seg["start"] + seg["duration"]) + 1
        loudness = seg.get("loudness_max", seg.get("loudness_start", -20))
        for i in range(max(0, start), min(seconds, end)):
            if curve[i] is None or loudness > curve[i]:
                curve[i] = loudness
    last = -30.0
    for i in range(seconds):
        if curve[i] is None:
            curve[i] = last
        else:
            last = curve[i]
    return curve


def best_window(curve, duration, lo, hi, scorer):
    lo = max(0, int(lo))
    hi = min(len(curve) - duration, int(hi))
    if hi <= lo:
        lo = max(0, min(lo, len(curve) - duration))

    best_start = lo
    best_score = -1e9
    for start in range(lo, max(lo + 1, hi + 1)):
        segment = curve[start : start + duration]
        if len(segment) < duration:
            continue
        score = scorer(segment, start)
        if score > best_score:
            best_score = score
            best_start = start
    return best_start


def hints_from_analysis(analysis):
    track = analysis.get("track", {})
    duration = float(track.get("duration", 0))
    if duration < 45:
        raise ValueError("Track too short for hint windows")

    seconds = int(duration) + 1
    segments = analysis.get("segments") or []
    if not segments:
        raise ValueError("No segment data in analysis")

    curve = build_loudness_curve(segments, seconds)

    def mean(values):
        return sum(values) / len(values) if values else 0.0

    def std(values):
        return statistics.pstdev(values) if len(values) > 1 else 0.0

    def percentile(values, pct):
        if not values:
            return 0.0
        ordered = sorted(values)
        idx = (len(ordered) - 1) * (pct / 100)
        lo = int(idx)
        hi = min(lo + 1, len(ordered) - 1)
        frac = idx - lo
        return ordered[lo] * (1 - frac) + ordered[hi] * frac

    median = percentile(curve, 50)
    p55 = percentile(curve, 55)

    intro_loud = mean(curve[: min(H1_DUR, len(curve))])
    if intro_loud <= median * 0.95:
        h1_start = 0
        h1_label = "intro"
    else:
        h1_start = best_window(
            curve,
            H1_DUR,
            0,
            duration * 0.28,
            lambda seg, _s: -mean(seg),
        )
        h1_label = "intro" if h1_start < 3 else "instrumental groove"

    h3_start = best_window(
        curve,
        H3_DUR,
        duration * 0.20,
        duration * 0.72,
        lambda seg, _s: mean(seg) + 0.12 * std(seg),
    )

    h2_hi = max(int(duration * 0.12), h3_start - MIN_GAP)
    h2_start = best_window(
        curve,
        H2_DUR,
        int(duration * 0.10),
        h2_hi,
        lambda seg, _s: -abs(mean(seg) - p55),
    )

    starts = sorted(
        [
            (h1_start, H1_DUR),
            (h2_start, H2_DUR),
            (h3_start, H3_DUR),
        ]
    )
    adjusted = []
    for start, dur in starts:
        if adjusted and start < adjusted[-1][0] + adjusted[-1][1] + MIN_GAP:
            start = adjusted[-1][0] + adjusted[-1][1] + MIN_GAP
        adjusted.append((start, dur))

    h1_start, h2_start, h3_start = [s for s, _d in adjusted]

    return [
        {"start": h1_start, "duration": H1_DUR, "label": h1_label},
        {"start": h2_start, "duration": H2_DUR, "label": fmt_range(h2_start, H2_DUR)},
        {"start": h3_start, "duration": H3_DUR, "label": fmt_range(h3_start, H3_DUR)},
    ]


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


def apply_playlist(playlist, updates_by_id):
    for song in playlist:
        if song["id"] in updates_by_id:
            song["hints"] = updates_by_id[song["id"]]
    with PLAYLIST.open("w", encoding="utf-8") as f:
        json.dump(playlist, f, indent=2)
        f.write("\n")


def patch_all_hints_py(all_hints_by_title):
    text = HINTS_PY.read_text(encoding="utf-8")
    for title, hints in all_hints_by_title.items():
        block = "\n".join(
            f'        {{"start": {h["start"]}, "duration": {h["duration"]}, "label": {json.dumps(h["label"])}}},'
            for h in hints
        )
        pattern = rf'(\s"{re.escape(title)}": \[\n)(.*?)(\n\s+\],)'

        def replacer(match, block=block):
            return f"{match.group(1)}{block}\n    ],"

        text, count = re.subn(pattern, replacer, text, count=1, flags=re.DOTALL)
        if count != 1:
            raise ValueError(f"Could not patch song-hints-data.py for {title!r}")
    HINTS_PY.write_text(text, encoding="utf-8")


def main():
    load_dotenv()
    import os

    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "").strip()
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        print(
            "Missing Spotify credentials.\n"
            "1. Create an app: https://developer.spotify.com/dashboard\n"
            "2. Copy Client ID + Client Secret into .env (see .env.example)\n"
            "3. Re-run this script",
            file=sys.stderr,
        )
        return 1

    parser = argparse.ArgumentParser(description="Apply Spotify audio-analysis hints")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--all", action="store_true", help="Include songs 1–3")
    args = parser.parse_args()

    with PLAYLIST.open(encoding="utf-8") as f:
        playlist = json.load(f)

    skip = set() if args.all else SKIP_TITLES
    client = SpotifyClient(client_id, client_secret)

    updates_by_id = {}
    hints_by_title = {}
    failed = []

    for song in playlist:
        title = song["title"]
        artist = song["artist"]
        if title in skip:
            print(f"skip  {song['id']}  {title}")
            continue

        try:
            match, score = client.search_track(title, artist)
            if not match:
                failed.append((song["id"], title, "no Spotify match"))
                print(f"MISS  {song['id']}  {title} — no match")
                continue

            track_id = match["id"]
            track_name = match["name"]
            track_artists = ", ".join(a["name"] for a in match["artists"])
            print(f"match {song['id']}  {title} → {track_name} — {track_artists} (score {score})")

            analysis = client.get_audio_analysis(track_id)
            hints = hints_from_analysis(analysis)
            updates_by_id[song["id"]] = hints
            hints_by_title[title] = hints

            h1, h2, h3 = hints
            print(
                f"       H1 {fmt_range(h1['start'], h1['duration'])} | "
                f"H2 {fmt_range(h2['start'], h2['duration'])} | "
                f"H3 {fmt_range(h3['start'], h3['duration'])}"
            )
            time.sleep(0.2)
        except Exception as exc:
            failed.append((song["id"], title, str(exc)))
            print(f"FAIL  {song['id']}  {title} — {exc}", file=sys.stderr)

    print(f"\nMatched {len(updates_by_id)} / {len(playlist) - len(skip)} songs")
    if failed:
        print("Issues:")
        for song_id, title, reason in failed:
            print(f"  {song_id} {title}: {reason}")

    if not updates_by_id:
        return 1

    if args.dry_run:
        print("\nDry run — no files written.")
        return 0

    apply_playlist(playlist, updates_by_id)
    patch_all_hints_py(hints_by_title)
    print(f"\nWrote playlist.json + song-hints-data.py ({len(updates_by_id)} songs)")
    print("Spot-check a few in the game, then use addons/hint-tuner/ for fixes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
