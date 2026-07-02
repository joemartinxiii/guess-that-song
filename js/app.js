import { loadPlaylist, getSongById } from "./playlist.js";
import { createHintPlayer, getHintSpec } from "./audio-hints.js";
import {
  initDeck,
  drawNextSong,
  reshuffleDeck,
  saveState,
  clearState,
  loadState,
  getProgress,
  jumpToSong,
} from "./deck.js";
import { DEV_SONG_PICKER } from "./config.js";
import { mountDevSongPicker, formatTestingProgress } from "./dev-tools.js";

const APP_TITLE = "Guess That Song";

const elements = {
  progress: document.getElementById("progress"),
  hintText: document.getElementById("hint-text"),
  playCard: document.getElementById("play-card"),
  revealCard: document.getElementById("reveal-card"),
  hintButtons: [
    document.getElementById("hint-0"),
    document.getElementById("hint-1"),
    document.getElementById("hint-2"),
  ],
  hintStatuses: [
    document.getElementById("hint-0-status"),
    document.getElementById("hint-1-status"),
    document.getElementById("hint-2-status"),
  ],
  revealBtn: document.getElementById("reveal-btn"),
  nextBtn: document.getElementById("next-btn"),
  playFullBtn: document.getElementById("play-full-btn"),
  newGameBtn: document.getElementById("new-game-btn"),
  albumArt: document.getElementById("album-art"),
  songTitle: document.getElementById("song-title"),
  songArtist: document.getElementById("song-artist"),
  songYear: document.getElementById("song-year"),
  funFact: document.getElementById("fun-fact"),
  toast: document.getElementById("toast"),
  audio: document.getElementById("audio-player"),
};

let playlist = [];
let deckState = null;
let currentSong = null;
let activeHintIndex = null;
let toastTimer = null;
let devPicker = null;
let fullSongToken = 0;
const hintPlayer = createHintPlayer(elements.audio);

function warmCurrentSongAudio() {
  if (currentSong?.audio && currentSong.usesSegments) {
    hintPlayer.preload(currentSong.audio).catch(() => {});
  }
}

async function init() {
  document.title = APP_TITLE;

  try {
    playlist = await loadPlaylist();
    deckState = initDeck(
      playlist.map((s) => s.id),
      loadState()
    );

    bindEvents();
    devPicker = mountDevSongPicker({
      playlist,
      container: document.getElementById("dev-tools"),
      getCurrentSongId: () => deckState?.currentSongId,
      onSelectSong: jumpToSongForTest,
    });
    resumeOrStartRound();
  } catch (err) {
    showToast(err.message, true);
    elements.progress.textContent = "Could not load game";
  }
}

function persist() {
  saveState(deckState);
}

function bindEvents() {
  elements.hintButtons.forEach((btn, index) => {
    btn.addEventListener("click", () => playHint(index));
  });

  elements.revealBtn.addEventListener("click", revealAnswer);
  elements.nextBtn.addEventListener("click", nextSong);
  elements.playFullBtn.addEventListener("click", toggleFullSong);
  elements.newGameBtn.addEventListener("click", confirmNewGame);

  elements.audio.addEventListener("ended", () => {
    if (currentSong?.usesSegments) return;
    activeHintIndex = null;
    updateHintButtons();
  });

  elements.audio.addEventListener("error", () => {
    if (activeHintIndex !== null) {
      showToast("Could not play this clip. Add the audio file or skip to reveal.", true);
    }
    activeHintIndex = null;
    hintPlayer.clearSegment();
    updateHintButtons();
  });
}

function jumpToSongForTest(songId) {
  hintPlayer.stop();
  activeHintIndex = null;
  jumpToSong(deckState, songId);
  currentSong = getSongById(playlist, songId);
  persist();
  showPlayState();
  updateProgress();
  devPicker?.sync(songId);
}

function resumeOrStartRound() {
  if (deckState.currentSongId && deckState.roundState) {
    currentSong = getSongById(playlist, deckState.currentSongId);
    if (!currentSong) {
      deckState.currentSongId = null;
      deckState.roundState = null;
      startNewRound();
      return;
    }

    if (deckState.roundState.revealed) {
      showRevealState();
    } else {
      showPlayState();
    }
    updateProgress();
    return;
  }

  startNewRound();
}

function startNewRound() {
  const nextId = drawNextSong(deckState);
  if (!nextId) {
    showGameComplete();
    return;
  }

  currentSong = getSongById(playlist, nextId);
  persist();
  showPlayState();
  updateProgress();
  devPicker?.sync(nextId);
}

function stopFullSong() {
  fullSongToken += 1;
  hintPlayer.stop();
  updateFullSongButton(false);
}

function updateFullSongButton(playing) {
  if (!elements.playFullBtn) return;
  elements.playFullBtn.textContent = playing ? "Stop full song" : "Play full song";
  elements.playFullBtn.classList.toggle("playing-full", playing);
}

async function toggleFullSong() {
  if (!currentSong?.audio || !deckState.roundState?.revealed) return;

  if (hintPlayer.isPlaying()) {
    stopFullSong();
    return;
  }

  const token = ++fullSongToken;
  updateFullSongButton(true);
  try {
    await hintPlayer.primeIOSAudio();
    await hintPlayer.playFrom(currentSong.audio, 0);
  } catch {
    showToast("Could not play the full song.", true);
  } finally {
    if (token === fullSongToken) {
      updateFullSongButton(false);
    }
  }
}

function showPlayState() {
  elements.playCard.classList.remove("hidden");
  elements.revealCard.classList.add("hidden");
  elements.hintText.textContent = "Tap a hint to play a snippet. Shout your guess!";
  elements.revealBtn.disabled = false;

  stopFullSong();
  warmCurrentSongAudio();
  updateHintButtons();
}

function showRevealState() {
  if (!currentSong) return;

  elements.playCard.classList.remove("hidden");
  elements.revealCard.classList.remove("hidden");
  elements.hintText.textContent = "Answer revealed — read it out, then go to the next song.";
  elements.revealBtn.disabled = true;

  elements.albumArt.src = currentSong.albumArt;
  elements.albumArt.alt = `Album art for ${currentSong.title}`;
  elements.songTitle.textContent = currentSong.title;
  elements.songArtist.textContent = currentSong.artist;
  elements.songYear.textContent = currentSong.year ? String(currentSong.year) : "";
  elements.funFact.textContent = currentSong.funFact || "No fun fact for this one.";

  updateFullSongButton(false);
  updateHintButtons();
}

function updateHintButtons() {
  const round = deckState.roundState;
  const revealed = round?.revealed ?? false;

  elements.hintButtons.forEach((btn, index) => {
    const played = round?.hintsPlayed?.[index] ?? false;
    const isPlaying = activeHintIndex === index && hintPlayer.isPlaying();

    btn.classList.toggle("played", played);
    btn.classList.toggle("playing", isPlaying);
    btn.classList.toggle("muted-hint", revealed);
    btn.disabled = revealed;

    const status = elements.hintStatuses[index];
    if (isPlaying) {
      status.textContent = "Playing…";
    } else if (played) {
      status.textContent = "Tap to replay";
    } else {
      status.textContent = "Not played";
    }
  });
}

async function playHint(index) {
  if (!currentSong || deckState.roundState?.revealed) return;

  if (!getHintSpec(currentSong, index)) {
    showToast(`Hint ${index + 1} is not set up yet. Add the audio file to clips/.`, true);
    return;
  }

  activeHintIndex = index;
  updateHintButtons();

  try {
    await hintPlayer.primeIOSAudio();
    await hintPlayer.playHint(currentSong, index);
    deckState.roundState.hintsPlayed[index] = true;
    persist();
  } catch {
    showToast("Could not play audio. Tap the hint again or check the clip file.", true);
  } finally {
    activeHintIndex = null;
    updateHintButtons();
  }
}

function revealAnswer() {
  if (!currentSong || deckState.roundState?.revealed) return;

  hintPlayer.stop();
  activeHintIndex = null;

  deckState.roundState.revealed = true;
  persist();
  showRevealState();
}

function nextSong() {
  if (!deckState.roundState?.revealed) return;

  stopFullSong();
  activeHintIndex = null;

  deckState.currentSongId = null;
  deckState.roundState = null;
  deckState.playedCount = (deckState.playedCount ?? 0) + 1;
  persist();

  if (deckState.remainingIds.length === 0) {
    showToast("All songs played! Reshuffling for a new round…");
    deckState = reshuffleDeck(playlist.map((s) => s.id));
    persist();
  }

  startNewRound();
}

function showGameComplete() {
  elements.progress.textContent = "All songs played!";
  elements.playCard.classList.add("hidden");
  elements.revealCard.classList.add("hidden");
  showToast("Every song has been played. Starting a fresh shuffle…");

  deckState = reshuffleDeck(playlist.map((s) => s.id));
  persist();
  setTimeout(startNewRound, 1500);
}

function updateProgress() {
  if (DEV_SONG_PICKER && deckState?.currentSongId) {
    const label = formatTestingProgress(playlist, deckState.currentSongId);
    if (label) {
      elements.progress.textContent = label;
      return;
    }
  }

  const { currentNumber, total, remaining } = getProgress(deckState, playlist.length);

  if (deckState.currentSongId) {
    elements.progress.textContent = `Song ${currentNumber} of ${total} · ${remaining} left in this round`;
  } else {
    elements.progress.textContent = `${total} songs in playlist`;
  }
}

function confirmNewGame() {
  const ok = window.confirm(
    "Start a new game? This reshuffles all songs and clears your progress."
  );
  if (!ok) return;

  hintPlayer.stop();
  activeHintIndex = null;
  stopFullSong();
  clearState();

  deckState = reshuffleDeck(playlist.map((s) => s.id));
  persist();
  showToast("New game started!");
  startNewRound();
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.remove("hidden");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 4000);
}

init();
