export async function loadPlaylist(options = {}) {
  const url =
    typeof options === "string"
      ? options
      : options.url ?? "playlist.json";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load playlist (${response.status})`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Playlist is empty or invalid");
  }

  return data.map((song, index) => validateSong(song, index));
}

const DEFAULT_HINT_DURATION = 10;

function normalizeHints(hints) {
  if (!Array.isArray(hints)) return [];
  return hints.slice(0, 3).map((hint) => ({
    start: Number(hint.start),
    duration: Number(hint.duration ?? DEFAULT_HINT_DURATION),
    label: hint.label || "",
  }));
}

function validateSong(song, index) {
  const id = song.id || `song-${String(index + 1).padStart(2, "0")}`;

  if (!song.title || !song.artist) {
    throw new Error(`Song "${id}" is missing title or artist`);
  }

  const hints = normalizeHints(song.hints);
  const audio = song.audio || "";
  const usesSegments = Boolean(audio && hints.length === 3);

  const snippets = Array.isArray(song.snippets) ? song.snippets : [];
  while (snippets.length < 3) {
    snippets.push("");
  }

  if (!usesSegments && !snippets.some(Boolean)) {
    throw new Error(`Song "${id}" needs audio+hints or snippet files`);
  }

  return {
    id,
    title: song.title,
    artist: song.artist,
    year: song.year ?? null,
    category: song.category || "",
    audio,
    hints,
    albumArt: song.albumArt || "art/placeholder.svg",
    funFact: song.funFact || "",
    snippets: snippets.slice(0, 3),
    usesSegments,
  };
}

export function getSongById(playlist, id) {
  return playlist.find((song) => song.id === id) ?? null;
}
