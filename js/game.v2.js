// js/game.v2.js
// Parallel re-implementation of the game logic for local development.
// The visual UI (index.html + css/styles.css) remains 100% untouched.
// This version uses its own localStorage key so it can coexist with the original.
// Open via index-v2.html while developing.

import { createHintPlayer, getHintSpec, getPrimaryAudioPath } from "./audio-hints.js";
import { SHUFFLE_ENABLED, PERSIST_PROGRESS, DEV_SONG_PICKER } from "./config.js";
import { jumpToSong } from "./deck.js";
import { mountDevSongPicker, formatTestingProgress } from "./dev-tools.js";

const APP_TITLE = "Guess That Song";
const STORAGE_KEY = "guessThatSong_v2_dev"; // separate key for safe parallel testing

// -----------------------------
// Playlist loading + validation
// -----------------------------
async function loadPlaylist() {
  const response = await fetch("playlist.json");
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

  const snippets = Array.isArray(song.snippets) ? [...song.snippets] : [];
  while (snippets.length < 3) snippets.push("");

  if (!usesSegments && !snippets.some(Boolean)) {
    throw new Error(`Song "${id}" needs audio+hints or snippet files`);
  }

  return Object.freeze({
    id,
    title: song.title,
    artist: song.artist,
    year: song.year ?? null,
    category: song.category || "",
    audio,
    hints: Object.freeze(hints),
    albumArt: song.albumArt || "art/placeholder.svg",
    funFact: song.funFact || "",
    snippets: Object.freeze(snippets.slice(0, 3)),
    usesSegments,
  });
}

function getSongById(playlist, id) {
  return playlist.find((s) => s.id === id) ?? null;
}

// -----------------------------
// Dev-only: filter to songs that actually have audio files on disk
// This keeps the v2 page usable while you only have the 3 demo tone clips.
// When you drop real MP3s into clips/ and update playlist.json, they appear automatically.
// -----------------------------
async function filterPlayableSongs(songs) {
  const out = [];
  for (const song of songs) {
    const firstClip = getPrimaryAudioPath(song);
    if (!firstClip) continue;

    let canPlay = false;
    try {
      // HEAD is fast and doesn't download the audio
      const head = await fetch(firstClip, { method: "HEAD" });
      if (head.ok) {
        canPlay = true;
      }
    } catch {
      // Fallback for picky static servers: try to load just the metadata
      try {
        const probe = new Audio();
        probe.src = firstClip;
        await new Promise((resolve, reject) => {
          const done = () => resolve();
          probe.addEventListener("loadedmetadata", done, { once: true });
          probe.addEventListener("error", () => reject(), { once: true });
          setTimeout(() => reject(new Error("timeout")), 1400);
          probe.load();
        });
        canPlay = true;
      } catch {}
    }

    if (canPlay) out.push(song);
  }
  return out;
}

// -----------------------------
// Deck / Session / Shuffle
// -----------------------------
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function loadPersistedState() {
  if (!PERSIST_PROGRESS) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  if (!PERSIST_PROGRESS) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearPersistedState() {
  localStorage.removeItem(STORAGE_KEY);
}

function buildPlayOrder(allSongIds) {
  if (SHUFFLE_ENABLED) return shuffle(allSongIds);
  return [...allSongIds].reverse();
}

function createFreshSession(allSongIds) {
  return {
    remainingIds: buildPlayOrder(allSongIds),
    currentSongId: null,
    roundState: null,
    playedCount: 0,
  };
}

function initSession(allSongIds, saved) {
  const valid = new Set(allSongIds);
  if (saved?.remainingIds?.length) {
    const remaining = saved.remainingIds.filter((id) => valid.has(id));
    if (remaining.length > 0) {
      return {
        remainingIds: remaining,
        currentSongId: saved.currentSongId ?? null,
        roundState: saved.roundState ?? null,
        playedCount: saved.playedCount ?? (allSongIds.length - remaining.length),
      };
    }
  }
  return createFreshSession(allSongIds);
}

function drawNextRound(session) {
  if (session.remainingIds.length === 0) return null;
  const nextId = session.remainingIds.pop();
  session.currentSongId = nextId;
  session.roundState = { hintsPlayed: [false, false, false], revealed: false };
  return nextId;
}

function reshuffle(allSongIds) {
  return createFreshSession(allSongIds);
}

function getProgress(session, total) {
  const remaining = session.remainingIds.length;
  const inRound = session.currentSongId ? 1 : 0;
  const played = total - remaining - inRound;
  const currentNumber = session.currentSongId ? played + 1 : played;
  return { currentNumber, total, remaining, played, inRound: Boolean(session.currentSongId) };
}

// -----------------------------
// Audio controller (legacy hook for visualizer; hints use createHintPlayer)
// -----------------------------
class AudioController {
  constructor(audioEl) {
    this.audio = audioEl;
    this.onEnded = null;
    this.onError = null;

    this.audio.addEventListener("ended", () => {
      if (this.onEnded) this.onEnded();
    });
    this.audio.addEventListener("error", () => {
      if (this.onError) this.onError();
    });
  }

  pause() {
    this.audio.pause();
  }

  get isPlaying() {
    return !this.audio.paused && this.audio.currentTime > 0;
  }
}

// -----------------------------
// Main Game (orchestrates everything, drives the exact same DOM)
// -----------------------------
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
  newGameBtn: document.getElementById("new-game-btn"),
  albumArt: document.getElementById("album-art"),
  songTitle: document.getElementById("song-title"),
  songArtist: document.getElementById("song-artist"),
  songYear: document.getElementById("song-year"),
  funFact: document.getElementById("fun-fact"),
  toast: document.getElementById("toast"),
  audio: document.getElementById("audio-player"),
};

const DEBUG = new URLSearchParams(location.search).has("debug");

function log(...args) {
  if (DEBUG) console.log("[game.v2]", ...args);
}

let playlist = [];
let session = null;
let currentSong = null;
let activeHintIndex = null;
let toastTimer = null;
let devPicker = null;
let audioCtrl = null;
let hintPlayer = null;

// Visual extras (only active on the dev page where the canvases exist)
let starfield = null;
let visualizer = null;

function setPhase(phase) {
  log("phase →", phase);
}

async function init() {
  document.title = APP_TITLE;
  audioCtrl = new AudioController(elements.audio);
  hintPlayer = createHintPlayer(elements.audio);

  // Initialize flashy dev visuals (safe no-ops if the elements don't exist)
  initStarfield();
  initVisualizer();
  initFireworks();
  initWavingFlag();

  try {
    playlist = await loadPlaylist();

    // On the dev page we only want songs that actually have audio files.
    // This makes the visualizer and the whole game immediately testable.
    const originalCount = playlist.length;
    playlist = await filterPlayableSongs(playlist);
    log(`Playable songs after filter: ${playlist.length} (was ${originalCount})`);

    if (playlist.length === 0) {
      throw new Error("No playable audio clips found in clips/. The dev build only shows songs with real files.");
    }

    // Friendly notice on the dev page
    if (playlist.length < originalCount) {
      // We'll update the hint text later in resumeOrStartRound / showPlayState
    }

    const saved = loadPersistedState();
    session = initSession(playlist.map((s) => s.id), saved);

    bindEvents();
    devPicker = mountDevSongPicker({
      playlist,
      container: document.getElementById("dev-tools"),
      getCurrentSongId: () => session?.currentSongId,
      onSelectSong: jumpToSongForTest,
    });
    audioCtrl.onEnded = handleAudioEnded;
    audioCtrl.onError = handleAudioError;

    resumeOrStartRound();
  } catch (err) {
    showToast(err.message, true);
    elements.progress.textContent = "Could not load game";
    log("init failed", err);
  }
}

function bindEvents() {
  elements.hintButtons.forEach((btn, index) => {
    btn.addEventListener("click", () => playHint(index));
  });
  elements.revealBtn.addEventListener("click", revealAnswer);
  elements.nextBtn.addEventListener("click", nextSong);
  elements.newGameBtn.addEventListener("click", confirmNewGame);
}

function persist() {
  saveState(session);
}

function jumpToSongForTest(songId) {
  hintPlayer.stop();
  activeHintIndex = null;
  visualizer?.stop();
  jumpToSong(session, songId);
  currentSong = getSongById(playlist, songId);
  persist();
  showPlayState();
  updateProgress();
  devPicker?.sync(songId);
}

function resumeOrStartRound() {
  if (session.currentSongId && session.roundState) {
    currentSong = getSongById(playlist, session.currentSongId);
    if (!currentSong) {
      session.currentSongId = null;
      session.roundState = null;
      startNewRound();
      return;
    }
    if (session.roundState.revealed) {
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
  const nextId = drawNextRound(session);
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

function warmCurrentSongAudio() {
  if (currentSong?.audio) {
    hintPlayer?.preload(currentSong.audio).catch(() => {});
  }
}

function showPlayState() {
  setPhase("PLAYING");
  elements.playCard.classList.remove("hidden");
  elements.revealCard.classList.add("hidden");

  // Clean, minimal instruction — the big cinematic world carries the personality now.
  // The old "Demo tracks only" message is hidden; info lives in the tiny "i" button.
  elements.hintText.textContent = "Tap a hint to play a snippet. Shout your guess!";

  elements.revealBtn.disabled = false;
  warmCurrentSongAudio();
  updateHintButtons();
}

function showRevealState() {
  if (!currentSong) return;
  setPhase("REVEALED");
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

  updateHintButtons();
}

function updateHintButtons() {
  const round = session.roundState;
  const revealed = round?.revealed ?? false;

  elements.hintButtons.forEach((btn, index) => {
    const played = round?.hintsPlayed?.[index] ?? false;
    const isPlaying = activeHintIndex === index && hintPlayer.isPlaying();

    btn.classList.toggle("played", played);
    btn.classList.toggle("playing", isPlaying);
    btn.classList.toggle("muted-hint", revealed);
    btn.disabled = revealed;

    const status = elements.hintStatuses[index];
    if (isPlaying) status.textContent = "Playing…";
    else if (played) status.textContent = "Tap to replay";
    else status.textContent = "Not played";
  });
}

async function playHint(index) {
  if (!currentSong || session.roundState?.revealed) return;

  if (!getHintSpec(currentSong, index)) {
    showToast(`Hint ${index + 1} is not set up yet. Add the audio file to clips/.`, true);
    return;
  }

  activeHintIndex = index;
  updateHintButtons();
  visualizer?.start();

  try {
    await hintPlayer.playHint(currentSong, index);
    session.roundState.hintsPlayed[index] = true;
    persist();

    if (window.__triggerHintFireworks) {
      const intensity = 0.85 + Math.random() * 0.5;
      window.__triggerHintFireworks(intensity);
    }
  } catch (e) {
    showToast("Could not play audio. Tap the hint again or check the clip file.", true);
    log("playHint error", e);
  } finally {
    activeHintIndex = null;
    updateHintButtons();
    visualizer?.stop();
  }
}

function handleAudioEnded() {
  if (currentSong?.usesSegments) return;
  activeHintIndex = null;
  updateHintButtons();
  visualizer?.stop();
}

function handleAudioError() {
  if (activeHintIndex !== null) {
    showToast("Could not play this clip. Add the audio file or skip to reveal.", true);
  }
  activeHintIndex = null;
  hintPlayer?.clearSegment();
  updateHintButtons();
  visualizer?.stop();
}

function revealAnswer() {
  if (!currentSong || session.roundState?.revealed) return;

  hintPlayer.stop();
  activeHintIndex = null;

  visualizer?.stop();

  // The real cinematic grand finale (hundreds of GPU particles + bloom + glitch + flag reaction)
  if (window.__triggerRevealFinale) {
    window.__triggerRevealFinale();
  }

  session.roundState.revealed = true;
  persist();
  showRevealState();
}

function nextSong() {
  if (!session.roundState?.revealed) return;

  hintPlayer.stop();
  activeHintIndex = null;
  visualizer?.stop();

  session.currentSongId = null;
  session.roundState = null;
  session.playedCount = (session.playedCount ?? 0) + 1;
  persist();

  if (session.remainingIds.length === 0) {
    showToast("All songs played! Reshuffling for a new round…");
    session = reshuffle(playlist.map((s) => s.id));
    persist();
  }

  startNewRound();
}

function showGameComplete() {
  setPhase("COMPLETE");
  elements.progress.textContent = "All songs played!";
  elements.playCard.classList.add("hidden");
  elements.revealCard.classList.add("hidden");
  showToast("Every song has been played. Starting a fresh shuffle…");

  session = reshuffle(playlist.map((s) => s.id));
  persist();
  setTimeout(startNewRound, 1500);
}

function updateProgress() {
  if (DEV_SONG_PICKER && session?.currentSongId) {
    const label = formatTestingProgress(playlist, session.currentSongId);
    if (label) {
      elements.progress.textContent = label;
      return;
    }
  }

  const { currentNumber, total, remaining } = getProgress(session, playlist.length);
  if (session.currentSongId) {
    elements.progress.textContent = `Song ${currentNumber} of ${total} · ${remaining} left in this round`;
  } else {
    elements.progress.textContent = `${total} songs in playlist`;
  }
}

function confirmNewGame() {
  const ok = window.confirm("Start a new game? This reshuffles all songs and clears your progress.");
  if (!ok) return;

  hintPlayer.stop();
  activeHintIndex = null;
  visualizer?.stop();
  clearPersistedState();

  session = reshuffle(playlist.map((s) => s.id));
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

// ============================================================
// FLASHY DEV VISUALS (only active on index-v2.html)
// ============================================================

function initStarfield() {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  let stars = [];
  let raf = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  // Elegant, restrained starfield — cool indigo tint, fewer stars, very slow
  stars = Array.from({ length: 92 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * (canvas.height * 0.88),
    r: Math.random() * 1.15 + 0.45,
    tw: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.0045 + 0.0022,
    drift: (Math.random() - 0.5) * 0.035,
    hue: 225 + Math.random() * 18, // cool blue-indigo
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const s of stars) {
      const alpha = 0.28 + Math.sin(s.tw) * 0.32;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `hsla(${s.hue}, 65%, 92%, 1)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();

      // extremely gentle movement
      s.tw += s.speed;
      s.x += s.drift;
      if (s.x < 0) s.x = canvas.width;
      if (s.x > canvas.width) s.x = 0;
    }
    ctx.globalAlpha = 1;

    raf = requestAnimationFrame(draw);
  }

  draw();
  starfield = { stop: () => cancelAnimationFrame(raf) };
  log("starfield initialized");
}

function initVisualizer() {
  const canvas = document.getElementById("viz");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  let audioCtx = null;
  let analyser = null;
  let source = null;
  let raf = null;
  let mode = "idle"; // "idle" | "playing"

  function ensureAudioGraph() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.68;
    source = audioCtx.createMediaElementSource(elements.audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  // Elegant 4th of July idle line — always visible, premium flat state
  function drawIdle(time = 0) {
    const w = canvas.width;
    const h = canvas.height;
    const y = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Very dark subtle rounded background for the strip
    ctx.fillStyle = "rgba(8, 11, 20, 0.75)";
    ctx.beginPath();
    ctx.roundRect(6, 4, w - 12, h - 8, 999);
    ctx.fill();

    // Main patriotic gradient line (red → white → blue)
    const grad = ctx.createLinearGradient(28, y, w - 28, y);
    grad.addColorStop(0.0, "#c41e3a");
    grad.addColorStop(0.42, "#f8f9fb");
    grad.addColorStop(0.58, "#f8f9fb");
    grad.addColorStop(1.0, "#1e3a8a"); // deep patriotic blue

    // Soft outer glow (breathing)
    const pulse = 0.55 + Math.sin(time / 920) * 0.35;
    ctx.strokeStyle = `rgba(196, 30, 58, ${0.22 * pulse})`;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(w - 32, y);
    ctx.stroke();

    ctx.strokeStyle = `rgba(30, 58, 138, ${0.18 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(w - 32, y);
    ctx.stroke();

    // Crisp center line
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.25;
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(w - 32, y);
    ctx.stroke();

    // Tiny "stars" along the line (patriotic micro detail)
    ctx.fillStyle = "rgba(248, 249, 251, 0.9)";
    const starPositions = [0.18, 0.5, 0.82];
    for (let p of starPositions) {
      const sx = 32 + (w - 64) * p;
      const twinkle = 0.6 + Math.sin((time + p * 800) / 650) * 0.4;
      ctx.globalAlpha = twinkle;
      ctx.beginPath();
      ctx.arc(sx, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Very subtle inner highlight on the line
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(34, y - 0.6);
    ctx.lineTo(w - 34, y - 0.6);
    ctx.stroke();

    raf = requestAnimationFrame((t) => drawIdle(t || Date.now()));
  }

  // Rich animated bars when music is playing — patriotic red/white/blue energy
  function drawPlaying() {
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(data);

    const w = canvas.width;
    const h = canvas.height;
    const centerY = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Dark elegant background
    ctx.fillStyle = "rgba(8, 11, 20, 0.82)";
    ctx.beginPath();
    ctx.roundRect(6, 4, w - 12, h - 8, 999);
    ctx.fill();

    const barCount = Math.min(42, bufferLength);
    const step = Math.floor(bufferLength / barCount);
    const barWidth = Math.max(3.5, (w - 48) / barCount * 0.82);
    const gap = (w - 48 - barCount * barWidth) / (barCount + 1);
    let x = 24 + gap;

    for (let i = 0; i < barCount; i++) {
      const idx = i * step;
      const v = data[idx] / 255;
      const barH = Math.max(2, v * (h * 0.82));

      const y = centerY - barH / 2;

      // Patriotic bar gradient (red energy on left → white → blue on right)
      const t = i / barCount;
      let c1, c2;
      if (t < 0.5) {
        c1 = "#c41e3a";
        c2 = "#f8f9fb";
      } else {
        c1 = "#f8f9fb";
        c2 = "#1e3a8a";
      }

      const grad = ctx.createLinearGradient(x, y, x, y + barH);
      grad.addColorStop(0, c1);
      grad.addColorStop(0.5, c2);
      grad.addColorStop(1, c1);

      ctx.fillStyle = grad;

      const radius = Math.min(barWidth / 2, 5);
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, radius);
      ctx.fill();

      // Bright top highlight
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(x, y, barWidth, Math.max(1.2, barH * 0.12));

      x += barWidth + gap;
    }

    raf = requestAnimationFrame(drawPlaying);
  }

  function start() {
    if (mode === "playing") return;
    try {
      ensureAudioGraph();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

      mode = "playing";
      cancelAnimationFrame(raf);
      drawPlaying();

      log("visualizer playing");
    } catch (e) {
      log("visualizer start blocked", e);
    }
  }

  function stop() {
    mode = "idle";
    cancelAnimationFrame(raf);
    // Immediately show the elegant idle line
    drawIdle(Date.now());
    log("visualizer idle");
  }

  function idle() {
    if (mode === "idle") return;
    mode = "idle";
    cancelAnimationFrame(raf);
    drawIdle(Date.now());
  }

  // Expose clean API
  visualizer = { start, stop, idle };

  // Show the beautiful flat patriotic line immediately on load
  // (canvas is always visible on the dev page now)
  setTimeout(() => drawIdle(Date.now()), 60);

  log("visualizer ready — always visible with elegant idle line");
}

// ============================================================
// PATRIOTIC FIREWORKS + WAVING FLAG (extra 4th of July joy)
// Only active on the dev page (index-v2.html)
// ============================================================

let fireworks = null;
let wavingFlag = null;

function initFireworks() {
  const canvas = document.getElementById("fireworks");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  let particles = [];
  let raf = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  const COLORS = ["#c41e3a", "#f8fafc", "#1e3a8a", "#d4a853", "#fda4af"];

  function launchBurst(cx, cy, count = 28, spread = 3.2, baseVel = 3.8) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * spread - Math.PI / 2;
      const vel = baseVel + Math.random() * 2.4;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - 1.2,
        life: 52 + Math.random() * 28,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 2.2 + Math.random() * 1.8,
        gravity: 0.085 + Math.random() * 0.04,
      });
    }
    // A few bright center sparks
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = 0.8 + Math.random() * 1.6;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - 2.8,
        life: 18 + Math.random() * 12,
        color: "#f8fafc",
        size: 1.4,
        gravity: 0.06,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.995;
      p.life -= 1;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = Math.max(0.08, p.life / 65);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      // Soft glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (particles.length > 0) {
      raf = requestAnimationFrame(draw);
    } else {
      // Critical fix: allow future bursts to restart the animation loop
      raf = null;
    }
  }

  function burst(x = null, y = null, intensity = 1) {
    const cx = x ?? (canvas.width * (0.2 + Math.random() * 0.6));
    const cy = y ?? (canvas.height * (0.38 + Math.random() * 0.32));
    const count = Math.floor(22 * intensity);
    launchBurst(cx, cy, count, 2.8 + intensity * 0.6, 3.4 + intensity * 1.1);

    // Secondary lower burst for fullness
    setTimeout(() => {
      if (particles.length < 180) {
        launchBurst(cx + (Math.random() - 0.5) * 80, cy + 40, Math.floor(14 * intensity), 3.1, 2.8);
      }
    }, 140);

    // Always ensure the loop is running when we add new particles
    raf = raf || requestAnimationFrame(draw);
  }

  function grandFinale() {
    const w = canvas.width;
    const h = canvas.height;

    // Big celebratory sequence
    const positions = [
      [w * 0.18, h * 0.28], [w * 0.5, h * 0.22], [w * 0.82, h * 0.31],
      [w * 0.32, h * 0.38], [w * 0.68, h * 0.26], [w * 0.5, h * 0.42],
      [w * 0.12, h * 0.34], [w * 0.88, h * 0.29],
    ];

    positions.forEach((pos, i) => {
      setTimeout(() => {
        launchBurst(pos[0], pos[1], 36 + Math.random() * 12, 3.6, 4.6);
        if (i % 2 === 0) {
          setTimeout(() => launchBurst(pos[0] + (Math.random() - 0.5) * 60, pos[1] + 50, 18, 3.2, 3.2), 180);
        }
      }, i * 95);
    });

    // Extra high bursts + one massive center finale
    setTimeout(() => launchBurst(w * 0.5, h * 0.18, 48, 4.2, 5.2), 420);
    setTimeout(() => launchBurst(w * 0.5, h * 0.24, 62, 4.8, 6.1), 780); // huge central boom
    setTimeout(() => launchBurst(w * 0.28, h * 0.33, 31, 3.4, 4.0), 980);
    setTimeout(() => launchBurst(w * 0.72, h * 0.29, 29, 3.5, 3.9), 1040);

    // Always kick the animation (in case previous one finished)
    raf = raf || requestAnimationFrame(draw);

    // Auto-clean after ~3.2s
    setTimeout(() => {
      // let remaining particles naturally fade
    }, 3200);
  }

  fireworks = { burst, grandFinale };
  log("fireworks ready — 4th of July mode engaged");
}

function initWavingFlag() {
  const canvas = document.getElementById("flag");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  let raf = null;
  let t = 0;

  const W = canvas.width;
  const H = canvas.height;
  const stripes = 13;
  const stripeH = H / stripes;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Soft outer shadow for fabric depth (modern, not flat)
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 9;
    ctx.shadowOffsetX = 1.5;
    ctx.shadowOffsetY = 3;

    // === Layered realistic fabric waves ===
    // We draw the entire flag shape with multiple sine layers for organic cloth movement
    const baseAmp = 3.6;
    const slow = t * 0.018;
    const med = t * 0.031;
    const fast = t * 0.047;

    // Draw each stripe as a separate rippling band
    for (let i = 0; i < stripes; i++) {
      const yBase = i * stripeH;
      const isRed = (i % 2 === 0);
      const color = isRed ? "#b91c3b" : "#f8fafc"; // slightly richer red

      ctx.fillStyle = color;

      ctx.beginPath();
      ctx.moveTo(0, yBase);

      for (let x = 0; x <= W; x += 2) {
        // Three frequency layers for believable fabric
        const w1 = Math.sin((x * 0.072) + slow + (i * 0.4)) * baseAmp;
        const w2 = Math.sin((x * 0.139) + med + (i * 1.1)) * (baseAmp * 0.42);
        const w3 = Math.sin((x * 0.27) + fast + (i * 0.7)) * (baseAmp * 0.22);
        const wave = w1 + w2 + w3;

        // Very subtle vertical breathing of the whole stripe
        const vBreath = Math.sin(slow * 0.6 + i) * 0.6;

        ctx.lineTo(x, yBase + wave + vBreath);
      }

      ctx.lineTo(W, yBase + stripeH);
      ctx.lineTo(0, yBase + stripeH);
      ctx.closePath();
      ctx.fill();

      // Very faint horizontal highlight that travels across the fabric (real cloth specular)
      if (!isRed) {
        const hlX = ((t * 0.8) % (W * 2.2)) - (W * 0.3);
        const grad = ctx.createLinearGradient(hlX, yBase, hlX + 38, yBase + stripeH);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.18)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }

    ctx.restore(); // end shadow

    // === Navy canton with gentle wave on its right edge ===
    const cantonW = W * 0.405;
    const cantonH = H * 0.538;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0.5;
    ctx.shadowOffsetY = 1.5;

    ctx.fillStyle = "#1e3a8a";
    ctx.beginPath();
    ctx.moveTo(0, 0);

    // Wavy right edge on the canton
    for (let y = 0; y <= cantonH; y += 2) {
      const wx = Math.sin((y * 0.11) + slow * 1.1) * 2.1 +
                Math.sin((y * 0.19) + med * 0.9) * 0.9;
      ctx.lineTo(cantonW + wx, y);
    }
    ctx.lineTo(cantonW, cantonH);
    ctx.lineTo(0, cantonH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // === Stars in the canton — crisp, modern, with tiny glow ===
    const starRows = [3, 3, 4, 3, 4];
    const starSize = 3.35;
    let starY = 4.2;

    for (let row = 0; row < starRows.length; row++) {
      const count = starRows[row];
      const startX = 5.5 + (row % 2) * 4.8;
      for (let s = 0; s < count; s++) {
        const sx = startX + s * 8.6;
        const sy = starY + row * 6.35;
        const phase = t * 0.022 + row * 1.3 + s * 0.9;

        // Soft glow behind each star
        ctx.fillStyle = "rgba(248,250,252,0.35)";
        ctx.beginPath();
        ctx.arc(sx, sy, starSize * 1.55, 0, Math.PI * 2);
        ctx.fill();

        // Crisp white star
        drawPremiumStar(ctx, sx, sy, starSize, phase);
      }
    }

    t += 1;
    raf = requestAnimationFrame(draw);
  }

  function drawPremiumStar(ctx, cx, cy, r, phase) {
    ctx.save();
    ctx.translate(cx, cy);
    // Very subtle organic rotation (feels like real flag in breeze)
    ctx.rotate(Math.sin(phase * 0.7) * 0.035);

    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();

    const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const rad = (i % 2 === 0) ? r : r * 0.40;
      ctx.lineTo(Math.cos(angle) * rad, Math.sin(angle) * rad);
    }
    ctx.closePath();
    ctx.fill();

    // Tiny inner highlight for premium feel
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    const innerR = r * 0.28;
    ctx.moveTo(0, -innerR);
    for (let i = 1; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const rad = (i % 2 === 0) ? innerR : innerR * 0.35;
      ctx.lineTo(Math.cos(angle) * rad, Math.sin(angle) * rad);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  draw();
  wavingFlag = { stop: () => cancelAnimationFrame(raf) };
  log("waving flag initialized — modern premium fabric");
}

// Boot
init();
