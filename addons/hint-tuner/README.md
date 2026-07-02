# Hint Tuner

A **dev add-on** for setting when each hint plays inside a full song MP3.

The party game does not cut separate clip files. Each song uses one file in `clips/` (e.g. `clips/song-01.mp3`), and `playlist.json` stores three **start + duration** windows per song. Hint 1 is usually the hardest (intro/instrumental), hint 3 the easiest (chorus/hook). This tool lets you pick those windows by ear instead of editing JSON by hand.

**Not for party night** — the main game at `index.html` does not link here. Use this while building or updating the playlist.

## What it saves

When you click **Save song** or **Save & next**, the tuner writes:

1. **`playlist.json`** — hint timestamps for that song (what the game loads at runtime)
2. **`scripts/song-hints-data.py`** — the same timestamps in the Python source file used to regenerate the playlist

After saving, redeploy (git push) if you want the live GitHub Pages site to pick up changes.

## Run locally

From the **project root** (not inside `addons/hint-tuner/`):

```bash
python3 addons/hint-tuner/server.py
```

Open **http://127.0.0.1:8080/addons/hint-tuner/**

Use a custom port if 8080 is taken:

```bash
python3 addons/hint-tuner/server.py 9090
```

### Important

- **Do not** use plain `python3 -m http.server` — the UI will load, but **Save will fail** (501 / no API).
- **GitHub Pages** can serve the tuner page for viewing, but **Save only works** with `server.py` running on your machine.

## How to use

1. **Select a song** from the dropdown (or use ← / →).
2. Wait for the **waveform** to load from the full MP3.
3. **Scrub:** click or drag on empty waveform, release to play from that point. Use **Play** / **Pause** for transport.
4. **Adjust hints:** drag the yellow / blue / green regions, or type **Start**, **End**, and **Duration** in the panels below.
5. **Preview:** click **Preview hint 1/2/3** or press keyboard **1**, **2**, **3**.
6. **Save song** — writes this song’s hints to disk.
7. **Save & next** — saves and jumps to the next song (handy when tuning the whole playlist).

Unsaved changes prompt you before switching songs.

## Hint order (game rules)

| Hint | Typical content |
|------|-----------------|
| 1 | Hardest — intro, instrumental, or obscure section |
| 2 | Warmer — verse or groove |
| 3 | Easiest — chorus, hook, or iconic lyric |

Labels (e.g. `"intro"`, `"2:18–2:38"`) are stored for your reference; the game shows Hint 1 / 2 / 3 to players.

## Files in this add-on

```
addons/hint-tuner/
  index.html       UI
  hint-tuner.js    Waveform, drag hints, save logic
  hint-tuner.css   Tuner-only layout/styles
  server.py        Serves the repo + POST /api/songs/:id/hints
```

Shared with the main game: `../../js/playlist.js`, `../../js/audio-hints.js`, `../../css/styles.css`, plus root `playlist.json` and `clips/`.

The old URL **`hint-tuner.html`** at the repo root redirects here.
