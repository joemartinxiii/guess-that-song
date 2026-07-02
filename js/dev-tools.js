import { DEV_SONG_PICKER } from "./config.js";

export function formatTestingProgress(playlist, songId) {
  const index = playlist.findIndex((s) => s.id === songId);
  if (index < 0) return null;
  const song = playlist[index];
  return `Testing ${index + 1}/${playlist.length} · ${song.title}`;
}

export function mountDevSongPicker({ playlist, container, getCurrentSongId, onSelectSong }) {
  if (!DEV_SONG_PICKER || !container) return null;

  container.classList.remove("hidden");
  container.innerHTML = "";

  const row = document.createElement("div");
  row.className = "dev-song-picker";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "btn btn-ghost dev-nav-btn";
  prevBtn.textContent = "←";
  prevBtn.setAttribute("aria-label", "Previous song");

  const select = document.createElement("select");
  select.className = "dev-song-select";
  select.setAttribute("aria-label", "Jump to song");

  playlist.forEach((song, index) => {
    const option = document.createElement("option");
    option.value = song.id;
    option.textContent = `${String(index + 1).padStart(2, "0")}. ${song.title} — ${song.artist}`;
    select.appendChild(option);
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "btn btn-ghost dev-nav-btn";
  nextBtn.textContent = "→";
  nextBtn.setAttribute("aria-label", "Next song");

  function currentIndex() {
    return playlist.findIndex((s) => s.id === getCurrentSongId());
  }

  function jumpToId(songId) {
    if (!songId || songId === getCurrentSongId()) {
      select.value = songId || select.value;
      return;
    }
    select.value = songId;
    onSelectSong(songId);
  }

  prevBtn.addEventListener("click", () => {
    const index = currentIndex();
    if (index > 0) jumpToId(playlist[index - 1].id);
  });

  nextBtn.addEventListener("click", () => {
    const index = currentIndex();
    if (index >= 0 && index < playlist.length - 1) jumpToId(playlist[index + 1].id);
  });

  select.addEventListener("change", () => jumpToId(select.value));

  row.append(prevBtn, select, nextBtn);
  container.appendChild(row);

  return {
    sync(songId) {
      if (songId) select.value = songId;
    },
  };
}
