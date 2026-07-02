#!/usr/bin/env python3
"""Fetch album art URLs from iTunes (Deezer fallback) and update playlist.json."""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAYLIST_PATH = ROOT / "playlist.json"
PLACEHOLDER = "art/placeholder.svg"
USER_AGENT = "music.game/1.0 (album art fetcher)"


def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    for prefix in ("the ",):
        if text.startswith(prefix):
            text = text[len(prefix) :]
    return text


def upscale_itunes_art(url: str) -> str:
    if not url:
        return url
    return re.sub(r"\d+x\d+bb\.jpg", "600x600bb.jpg", url)


def fetch_json(url: str):
    time.sleep(0.3)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode())
    except Exception as exc:
        print(f"  fetch error: {exc}", file=sys.stderr)
        return None


def score_itunes_result(song: dict, result: dict) -> int:
    artist = normalize(song["artist"])
    title = normalize(song["title"])
    result_artist = normalize(result.get("artistName", ""))
    result_title = normalize(result.get("trackName", ""))

    score = 0
    if title == result_title:
        score += 50
    elif title in result_title or result_title in title:
        score += 30

    if artist == result_artist:
        score += 50
    elif artist in result_artist or result_artist in artist:
        score += 30
    else:
        # Match on primary artist token (e.g. "2pac", "prince")
        artist_tokens = artist.split()
        result_tokens = result_artist.split()
        overlap = set(artist_tokens) & set(result_tokens)
        score += min(len(overlap) * 10, 20)

    year = song.get("year")
    release = result.get("releaseDate", "")[:4]
    if year and release.isdigit() and abs(int(release) - int(year)) <= 2:
        score += 15

    return score


def search_itunes(song: dict):
    queries = [
        f'{song["artist"]} {song["title"]}',
        song["title"],
    ]
    best_url = None
    best_score = 0

    for query in queries:
        params = urllib.parse.urlencode(
            {"term": query, "entity": "song", "limit": "10", "media": "music"}
        )
        data = fetch_json(f"https://itunes.apple.com/search?{params}")
        if not data or not data.get("resultCount"):
            continue

        for result in data.get("results", []):
            score = score_itunes_result(song, result)
            if score > best_score and result.get("artworkUrl100"):
                best_score = score
                best_url = upscale_itunes_art(result["artworkUrl100"])

        if best_score >= 70:
            break

    return best_url if best_score >= 40 else None


def search_deezer(song: dict):
    query = urllib.parse.quote(f'artist:"{song["artist"]}" track:"{song["title"]}"')
    data = fetch_json(f"https://api.deezer.com/search?q={query}")
    if not data or not data.get("data"):
        return None

    for result in data["data"]:
        album = result.get("album") or {}
        url = album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium")
        if url:
            return url

    return None


def fetch_art_for_song(song: dict) -> str:
    url = search_itunes(song)
    source = "iTunes"
    if not url:
        url = search_deezer(song)
        source = "Deezer"
    if not url:
        return PLACEHOLDER, "not found"
    return url, source


def main() -> int:
    with PLAYLIST_PATH.open(encoding="utf-8") as f:
        playlist = json.load(f)

    found = 0
    missing = []

    for song in playlist:
        art_url, source = fetch_art_for_song(song)
        song["albumArt"] = art_url
        status = "OK" if art_url != PLACEHOLDER else "MISS"
        print(f'{status:4} [{source:6}] {song["id"]} — {song["title"]} / {song["artist"]}')
        if art_url != PLACEHOLDER:
            found += 1
        else:
            missing.append(song["id"])

    with PLAYLIST_PATH.open("w", encoding="utf-8") as f:
        json.dump(playlist, f, indent=2)
        f.write("\n")

    print(f"\nDone: {found}/{len(playlist)} songs got album art.")
    if missing:
        print(f"Still on placeholder: {', '.join(missing)}")
    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
