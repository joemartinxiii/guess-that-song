# Guess That Song

A host-driven party game for your 4th of July gathering. Play song snippets, let guests guess aloud, then reveal the answer.

## Quick start (local)

You need a local web server (browsers block audio when opening `index.html` directly from disk).

```bash
cd music.game
python3 -m http.server 8080
```

Open `http://localhost:8080`.

If you have Node.js installed, you can also use:

```bash
npx serve .
```

## Deploy for a public URL

### Option A: GitHub Pages

1. Create a GitHub repo and push this project.
2. Go to **Settings → Pages**.
3. Source: **Deploy from branch** → `main` → `/ (root)`.
4. Your URL will be `https://<username>.github.io/<repo>/`.

### Option B: Netlify

1. Sign up at [netlify.com](https://netlify.com).
2. Drag and drop this folder, or connect your GitHub repo.
3. No build step needed — publish the root directory as-is.

### Option C: Cloudflare Pages

1. Connect your repo at [pages.cloudflare.com](https://pages.cloudflare.com).
2. Build command: *(none)*  
   Output directory: `/`

## Adding songs

Each song lives in `playlist.json` with three hint clips and optional album art.

### 1. Add audio files

Place **one full MP3 per song** in `clips/`:

```
clips/song-01.mp3
clips/song-02.mp3
...
clips/song-55.mp3
```

Hint 1, 2, and 3 are played automatically from timestamp windows defined in `playlist.json` — you do **not** need to cut separate clip files.

**Tips:**
- Use the full track (not a pre-cut snippet)
- MP3 at 128 kbps keeps the repo size reasonable
- If a hint starts too early/late for your copy of the track, tweak the `hints` timestamps in `playlist.json`

Example entry:

```json
{
  "id": "song-01",
  "title": "Too Tight",
  "artist": "Con Funk Shun",
  "audio": "clips/song-01.mp3",
  "hints": [
    { "start": 6, "duration": 10, "label": "intro groove" },
    { "start": 38, "duration": 10, "label": "verse" },
    { "start": 68, "duration": 12, "label": "chorus" }
  ]
}
```

Hint progression: **1 = hardest** (intro/instrumental), **2 = warmer** (verse), **3 = easiest** (chorus/hook).

To regenerate timestamps after editing the song list, edit `scripts/song-hints-data.py` and run:

```bash
python3 scripts/apply-hint-timestamps.py
```

### 2. Add album art (optional)

Place JPG or PNG in `art/`:

```
art/song-01.jpg
```

Square images (~400×400 or larger) look best.

### 3. Update playlist.json

```json
{
  "id": "song-01",
  "title": "Born in the U.S.A.",
  "artist": "Bruce Springsteen",
  "year": 1984,
  "albumArt": "art/song-01.jpg",
  "funFact": "Springsteen wrote this hit in one night.",
  "audio": "clips/song-01.mp3",
  "hints": [
    { "start": 6, "duration": 10, "label": "intro" },
    { "start": 38, "duration": 10, "label": "verse" },
    { "start": 68, "duration": 12, "label": "chorus" }
  ]
}
```

Legacy per-hint files (`snippets` array) still work if you prefer manually cut clips.

### 4. Redeploy

Push to GitHub or re-upload to Netlify. Progress is stored in the browser (`localStorage`), not on the server.

## How to play

1. Host taps **Hint 1**, **2**, or **3** to play snippets (replay anytime).
2. Guests shout guesses — house rules, unlimited guesses.
3. Host taps **Reveal answer** when ready.
4. Title, artist, year, album art, and fun fact stay visible until **Next song**.
5. Songs shuffle with no repeats until the full playlist has played, then reshuffle.

**New game** reshuffles everything and clears saved progress (with confirmation).

## Project structure

```
music.game/
  index.html          # App shell
  playlist.json       # Song manifest (~50 scaffold entries)
  css/styles.css      # July 4 themed UI
  js/
    app.js            # Game UI and audio
    deck.js           # Shuffle and localStorage
    playlist.js       # Load and validate playlist
  clips/              # One full MP3 per song (song-01.mp3, …)
  art/                # Album art images
```

## Customization

- **Title:** Edit `APP_TITLE` in `js/app.js` and the `<title>` in `index.html`.
- **Theme:** Adjust CSS variables in `css/styles.css`.
- **Playlist size:** Add or remove entries in `playlist.json` — the app adapts automatically.

## Demo / testing

Drop any MP3 into `clips/song-01.mp3` (etc.) and run a local server. Hint windows are pre-configured in `playlist.json`. Adjust `start`/`duration` if your file differs (e.g. remaster, live version).

## License

Personal use. You provide all audio and artwork; no streaming services are used.
