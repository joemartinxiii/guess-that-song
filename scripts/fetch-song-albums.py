#!/usr/bin/env python3
"""Look up album names and write songs.csv (title, artist, album)."""

import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAYLIST_PATH = ROOT / "playlist.json"
CSV_PATH = ROOT / "songs.csv"
USER_AGENT = "music.game/1.0 (album lookup)"


def normalize(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if text.startswith("the "):
        text = text[4:]
    return text


def fetch_json(url):
    time.sleep(0.35)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode())
    except Exception as exc:
        print(f"  fetch error: {exc}", file=sys.stderr)
        return None


def score_result(song, result):
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
        overlap = set(artist.split()) & set(result_artist.split())
        score += min(len(overlap) * 10, 20)

    year = song.get("year")
    release = (result.get("releaseDate") or "")[:4]
    if year and release.isdigit() and abs(int(release) - int(year)) <= 2:
        score += 15

    return score


def search_itunes(song):
    queries = [f'{song["artist"]} {song["title"]}', song["title"]]
    best_album = None
    best_score = 0

    for query in queries:
        params = urllib.parse.urlencode(
            {"term": query, "entity": "song", "limit": "10", "media": "music"}
        )
        data = fetch_json(f"https://itunes.apple.com/search?{params}")
        if not data or not data.get("resultCount"):
            continue

        for result in data.get("results", []):
            album = result.get("collectionName")
            if not album:
                continue
            score = score_result(song, result)
            if score > best_score:
                best_score = score
                best_album = album

        if best_score >= 70:
            break

    return best_album if best_score >= 40 else None


def search_deezer(song):
    query = urllib.parse.quote(f'artist:"{song["artist"]}" track:"{song["title"]}"')
    data = fetch_json(f"https://api.deezer.com/search?q={query}")
    if not data or not data.get("data"):
        return None

    for result in data["data"]:
        album = (result.get("album") or {}).get("title")
        if album:
            return album
    return None


def lookup_album(song):
    album = search_itunes(song)
    source = "iTunes"
    if not album:
        album = search_deezer(song)
        source = "Deezer"
    return album or "", source


def main():
    with PLAYLIST_PATH.open(encoding="utf-8") as f:
        playlist = json.load(f)

    rows = []
    missing = []

    for song in playlist:
        album, source = lookup_album(song)
        status = "OK" if album else "MISS"
        print(f'{status:4} [{source:6}] {song["title"]} — {album or "?"}')
        rows.append(
            {
                "title": song["title"],
                "artist": song["artist"],
                "album": album,
            }
        )
        if not album:
            missing.append(song["title"])

    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["title", "artist", "album"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {len(rows)} rows to {CSV_PATH.name}")
    if missing:
        print("No album found:", ", ".join(missing))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
