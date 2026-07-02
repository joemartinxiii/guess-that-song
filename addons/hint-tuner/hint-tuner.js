import { loadPlaylist } from "../../js/playlist.js";
import { createHintPlayer } from "../../js/audio-hints.js";

const GAME_ROOT = new URL("../../", import.meta.url);
const PLAYLIST_URL = new URL("playlist.json", GAME_ROOT).href;

function withGameAssets(song) {
  if (!song?.audio || /^https?:\/\//.test(song.audio)) return song;
  return { ...song, audio: new URL(song.audio, GAME_ROOT).href };
}

const HINT_COLORS = [
  { fill: "rgba(255, 193, 7, 0.32)", edge: "rgba(255, 193, 7, 0.95)" },
  { fill: "rgba(92, 124, 186, 0.32)", edge: "rgba(92, 124, 186, 0.95)" },
  { fill: "rgba(72, 187, 120, 0.32)", edge: "rgba(72, 187, 120, 0.95)" },
];

const MIN_HINT_DUR = 1;
const RESIZE_PX = 10;

const els = {
  songSelect: document.getElementById("song-select"),
  prevSong: document.getElementById("prev-song"),
  nextSong: document.getElementById("next-song"),
  saveBtn: document.getElementById("save-btn"),
  saveNextBtn: document.getElementById("save-next-btn"),
  saveStatus: document.getElementById("save-status"),
  playBtn: document.getElementById("play-btn"),
  playheadLabel: document.getElementById("playhead-label"),
  durationLabel: document.getElementById("duration-label"),
  waveWrap: document.getElementById("wave-wrap"),
  canvas: document.getElementById("wave-canvas"),
  waveLoading: document.getElementById("wave-loading"),
  toast: document.getElementById("toast"),
  audio: document.getElementById("audio-scrub"),
  serverWarn: document.getElementById("server-warn"),
};

const ctx = els.canvas.getContext("2d");
function setPlayhead(time) {
  playhead = Math.max(0, Math.min(trackDuration || time, time));
  els.playheadLabel.textContent = formatTime(playhead);
  draw();
}

const hintPlayer = createHintPlayer(els.audio, {
  onSegmentProgress: (time) => setPlayhead(time),
  onSegmentEnd: (time) => setPlayhead(time),
});

let playlist = [];
let currentSong = null;
let peaks = [];
let trackDuration = 0;
let playhead = 0;
let hints = [];
let dirty = false;
let toastTimer = null;

let drag = null;
let transportToken = 0;

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseTimeInput(raw) {
  const text = String(raw).trim();
  if (!text) return NaN;
  if (text.includes(":")) {
    const [m, s] = text.split(":");
    return parseInt(m, 10) * 60 + parseFloat(s);
  }
  return parseFloat(text);
}

function hintEnd(index) {
  return hints[index].start + hints[index].duration;
}

function formatRange(start, duration) {
  return `${formatTime(start)}–${formatTime(start + duration)}`;
}

function cloneHints(source) {
  return source.map((h) => ({
    start: Math.round(h.start),
    duration: Math.round(h.duration),
    label: h.label || "",
  }));
}

function defaultHints() {
  return [
    { start: 0, duration: 15, label: "intro" },
    { start: 30, duration: 15, label: "verse" },
    { start: 60, duration: 18, label: "chorus" },
  ];
}

function setDirty(value) {
  dirty = value;
  els.saveStatus.textContent = value ? "Unsaved" : "Saved";
  els.saveStatus.classList.toggle("dirty", value);
  els.saveStatus.classList.toggle("saved", !value);
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 3500);
}

function songIndex() {
  return playlist.findIndex((s) => s.id === currentSong?.id);
}

function buildPeaks(buffer, width) {
  const data = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / width));
  const out = new Float32Array(width);
  for (let i = 0; i < width; i++) {
    let max = 0;
    const start = i * block;
    const end = Math.min(data.length, start + block);
    for (let j = start; j < end; j++) {
      max = Math.max(max, Math.abs(data[j]));
    }
    out[i] = max;
  }
  return out;
}

function resizeCanvas() {
  const rect = els.waveWrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  els.canvas.height = Math.floor(120 * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function timeToX(time) {
  const width = els.waveWrap.clientWidth;
  if (!trackDuration) return 0;
  return (time / trackDuration) * width;
}

function xToTime(x) {
  const width = els.waveWrap.clientWidth;
  if (!width || !trackDuration) return 0;
  return Math.max(0, Math.min(trackDuration, (x / width) * trackDuration));
}

function draw() {
  const width = els.waveWrap.clientWidth;
  const height = 120;
  if (!width) return;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0a1424";
  ctx.fillRect(0, 0, width, height);

  const mid = height / 2;
  const barW = Math.max(1, width / Math.max(1, peaks.length));

  ctx.fillStyle = "rgba(92, 124, 186, 0.55)";
  for (let i = 0; i < peaks.length; i++) {
    const amp = peaks[i] * (height * 0.42);
    const x = i * barW;
    ctx.fillRect(x, mid - amp, Math.ceil(barW), amp * 2);
  }

  hints.forEach((hint, index) => {
    const x = timeToX(hint.start);
    const w = Math.max(2, timeToX(hintEnd(index)) - x);
    const colors = HINT_COLORS[index];
    ctx.fillStyle = colors.fill;
    ctx.fillRect(x, 0, w, height);
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, 1, Math.max(0, w - 2), height - 2);
    ctx.fillStyle = colors.edge;
    ctx.fillRect(x + w - 3, 0, 3, height);
  });

  const px = timeToX(playhead);
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, height);
  ctx.stroke();
}

function syncInputs() {
  hints.forEach((hint, index) => {
    document.querySelector(`.hint-start[data-hint="${index}"]`).value = formatTime(hint.start);
    document.querySelector(`.hint-end[data-hint="${index}"]`).value = formatTime(hintEnd(index));
    document.querySelector(`.hint-dur[data-hint="${index}"]`).value = hint.duration;
  });
}

function applyInput(index) {
  const start = parseTimeInput(document.querySelector(`.hint-start[data-hint="${index}"]`).value);
  const end = parseTimeInput(document.querySelector(`.hint-end[data-hint="${index}"]`).value);
  const durInput = parseInt(document.querySelector(`.hint-dur[data-hint="${index}"]`).value, 10);

  let startSec = Number.isFinite(start) ? start : hints[index].start;
  let duration = Number.isFinite(durInput) ? durInput : hints[index].duration;

  if (Number.isFinite(end) && end > startSec) {
    duration = Math.round(end - startSec);
  }

  duration = Math.max(MIN_HINT_DUR, duration);
  startSec = Math.max(0, Math.min(trackDuration - MIN_HINT_DUR, startSec));
  if (startSec + duration > trackDuration) {
    duration = Math.max(MIN_HINT_DUR, Math.round(trackDuration - startSec));
  }

  hints[index].start = Math.round(startSec);
  hints[index].duration = Math.round(duration);
  hints[index].label = formatRange(hints[index].start, hints[index].duration);
  syncInputs();
  setDirty(true);
  draw();
}

function clientXToTime(clientX) {
  const rect = els.canvas.getBoundingClientRect();
  return xToTime(clientX - rect.left);
}

function seekToTime(time, { preview = false } = {}) {
  playhead = Math.max(0, Math.min(trackDuration, time));
  els.playheadLabel.textContent = formatTime(playhead);
  draw();
  if (preview && currentSong?.audio) {
    hintPlayer.previewAt(currentSong.audio, playhead, 0.35).catch(() => {});
  }
}

function setHintStartFromPlayhead(index) {
  const hint = hints[index];
  hint.start = Math.round(Math.max(0, Math.min(trackDuration - hint.duration, playhead)));
  hint.label = formatRange(hint.start, hint.duration);
  syncInputs();
  setDirty(true);
  draw();
}

function hitTest(clientX) {
  const rect = els.canvas.getBoundingClientRect();
  const x = clientX - rect.left;

  for (let i = hints.length - 1; i >= 0; i--) {
    const startX = timeToX(hints[i].start);
    const endX = timeToX(hintEnd(i));
    if (x >= endX - RESIZE_PX && x <= endX + 4) {
      return { mode: "resize", index: i };
    }
    if (x >= startX && x <= endX) {
      return { mode: "move", index: i };
    }
  }

  return { mode: "seek", index: -1 };
}

function onPointerDown(event) {
  if (!trackDuration) return;
  els.canvas.setPointerCapture(event.pointerId);
  const hit = hitTest(event.clientX);

  if (hit.mode === "seek") {
    pauseTransport();
    seekToTime(clientXToTime(event.clientX), { preview: true });
    drag = { mode: "seek", lastPreviewAt: performance.now() };
    return;
  }

  pauseTransport();
  drag = {
    mode: hit.mode,
    index: hit.index,
    startX: event.clientX,
    origStart: hints[hit.index].start,
    origDuration: hints[hit.index].duration,
  };
}

function onPointerMove(event) {
  if (!drag || !trackDuration) return;

  if (drag.mode === "seek") {
    const time = clientXToTime(event.clientX);
    seekToTime(time);
    const now = performance.now();
    if (now - drag.lastPreviewAt > 90) {
      drag.lastPreviewAt = now;
      if (currentSong?.audio) {
        hintPlayer.previewAt(currentSong.audio, playhead, 0.35).catch(() => {});
      }
    }
    return;
  }

  const deltaT = clientXToTime(event.clientX) - clientXToTime(drag.startX);
  const hint = hints[drag.index];

  if (drag.mode === "move") {
    let next = drag.origStart + deltaT;
    next = Math.max(0, Math.min(trackDuration - hint.duration, next));
    hint.start = Math.round(next);
  } else {
    let nextDur = drag.origDuration + deltaT;
    nextDur = Math.max(MIN_HINT_DUR, Math.min(trackDuration - hint.start, nextDur));
    hint.duration = Math.round(nextDur);
  }

  hint.label = formatRange(hint.start, hint.duration);
  syncInputs();
  setDirty(true);
  draw();
}

function onPointerUp() {
  if (drag?.mode === "seek") {
    hintPlayer.stop();
    playTransportFromPlayhead();
  }
  drag = null;
}

function pauseTransport() {
  transportToken += 1;
  hintPlayer.stop();
  els.audio.pause();
  els.playBtn.textContent = "Play";
}

async function playTransportFromPlayhead() {
  if (!currentSong?.audio) return;
  const token = ++transportToken;
  els.playBtn.textContent = "Pause";
  try {
    await hintPlayer.playFrom(currentSong.audio, playhead);
  } catch {
    // stopped mid-play
  } finally {
    if (token === transportToken) {
      els.playBtn.textContent = "Play";
    }
  }
}

async function loadSong(songId) {
  const song = playlist.find((s) => s.id === songId);
  if (!song) return;

  pauseTransport();
  els.waveLoading.classList.remove("hidden");
  currentSong = song;
  els.songSelect.value = song.id;

  try {
    // One fetch + decode for waveform and hint preview (no duplicate on first play).
    const buffer = await hintPlayer.preload(song.audio);
    trackDuration = buffer.duration;
    peaks = buildPeaks(buffer, Math.max(200, els.waveWrap.clientWidth));
    hints =
      song.hints?.length === 3
        ? cloneHints(song.hints)
        : defaultHints();

    els.audio.src = song.audio;
    els.audio.load();
    playhead = 0;
    els.durationLabel.textContent = `/ ${formatTime(trackDuration)}`;
    els.playheadLabel.textContent = formatTime(0);
    syncInputs();
    setDirty(false);
    resizeCanvas();
    prefetchAdjacentSongs();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    els.waveLoading.classList.add("hidden");
  }
}

async function confirmDiscard() {
  if (!dirty) return true;
  return window.confirm("Discard unsaved hint changes for this song?");
}

async function switchSong(songId) {
  if (!(await confirmDiscard())) {
    els.songSelect.value = currentSong.id;
    return;
  }
  await loadSong(songId);
}

function prefetchAdjacentSongs() {
  const index = songIndex();
  if (index < 0) return;
  [index - 1, index + 1].forEach((i) => {
    const song = playlist[i];
    if (song?.audio && !hintPlayer.hasBuffer(song.audio)) {
      hintPlayer.preload(song.audio).catch(() => {});
    }
  });
}

async function checkSaveServer() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("not hint tuner server");
    const data = await response.json();
    if (data.server !== "hint-tuner") throw new Error("wrong server");
    els.serverWarn.classList.add("hidden");
    return true;
  } catch {
    els.serverWarn.classList.remove("hidden");
    return false;
  }
}

async function saveHints({ goNext = false } = {}) {
  if (!currentSong) return;

  els.saveBtn.disabled = true;
  try {
    const payload = {
      hints: hints.map((h) => ({
        start: h.start,
        duration: h.duration,
        label: h.label || formatRange(h.start, h.duration),
      })),
    };

    const response = await fetch(`/api/songs/${currentSong.id}/hints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      if (response.status === 501 || response.status === 404) {
        throw new Error(
          "Save needs addons/hint-tuner/server.py — stop python3 -m http.server, then run: python3 addons/hint-tuner/server.py"
        );
      }
      throw new Error(data.error || `Save failed (${response.status})`);
    }

    currentSong.hints = cloneHints(data.hints || payload.hints);
    hints = cloneHints(currentSong.hints);
    syncInputs();
    setDirty(false);
    showToast(`Saved ${currentSong.title}`);

    if (goNext) {
      const index = songIndex();
      if (index >= 0 && index < playlist.length - 1) {
        await loadSong(playlist[index + 1].id);
      }
    }
  } catch (err) {
    showToast(err.message, true);
  } finally {
    els.saveBtn.disabled = false;
  }
}

function previewHint(index) {
  if (!currentSong) return;
  pauseTransport();
  setPlayhead(hints[index].start);
  const draft = {
    ...currentSong,
    hints: hints.map((h) => ({ ...h })),
  };
  hintPlayer.playHint(draft, index).catch(() => {
    showToast(`Could not preview hint ${index + 1}`, true);
  });
}

function togglePlay() {
  if (!trackDuration || !currentSong) return;
  if (hintPlayer.isPlaying()) {
    pauseTransport();
    return;
  }
  playTransportFromPlayhead();
}

function bindEvents() {
  els.songSelect.addEventListener("change", () => switchSong(els.songSelect.value));

  els.prevSong.addEventListener("click", () => {
    const index = songIndex();
    if (index > 0) switchSong(playlist[index - 1].id);
  });

  els.nextSong.addEventListener("click", () => {
    const index = songIndex();
    if (index < playlist.length - 1) switchSong(playlist[index + 1].id);
  });

  els.saveBtn.addEventListener("click", () => saveHints());
  els.saveNextBtn.addEventListener("click", () => saveHints({ goNext: true }));
  els.playBtn.addEventListener("click", togglePlay);

  els.canvas.addEventListener("pointerdown", onPointerDown);
  els.canvas.addEventListener("pointermove", onPointerMove);
  els.canvas.addEventListener("pointerup", onPointerUp);
  els.canvas.addEventListener("pointercancel", onPointerUp);

  document.querySelectorAll(".hint-start, .hint-end, .hint-dur").forEach((input) => {
    input.addEventListener("change", () => applyInput(Number(input.dataset.hint)));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        applyInput(Number(input.dataset.hint));
        input.blur();
      }
    });
  });

  document.querySelectorAll(".preview-btn").forEach((btn) => {
    btn.addEventListener("click", () => previewHint(Number(btn.dataset.hint)));
  });

  document.querySelectorAll(".btn-set-start").forEach((btn) => {
    btn.addEventListener("click", () => setHintStartFromPlayhead(Number(btn.dataset.hint)));
  });

  els.audio.addEventListener("ended", () => {
    els.playBtn.textContent = "Play";
  });

  window.addEventListener("resize", resizeCanvas);

  window.addEventListener("keydown", (event) => {
    if (event.target.matches("input, select, textarea")) return;

    if (event.key === "1" || event.key === "2" || event.key === "3") {
      previewHint(Number(event.key) - 1);
    } else if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "s" || event.key === "S") {
      saveHints();
    } else if (event.key === "ArrowLeft") {
      const index = songIndex();
      if (index > 0) switchSong(playlist[index - 1].id);
    } else if (event.key === "ArrowRight") {
      const index = songIndex();
      if (index < playlist.length - 1) switchSong(playlist[index + 1].id);
    }
  });
}

async function init() {
  try {
    playlist = (await loadPlaylist({ url: PLAYLIST_URL })).map(withGameAssets);
    els.songSelect.innerHTML = playlist
      .map(
        (song, index) =>
          `<option value="${song.id}">${String(index + 1).padStart(2, "0")}. ${song.title} — ${song.artist}</option>`
      )
      .join("");

    bindEvents();
    await checkSaveServer();
    await loadSong(playlist[0].id);
  } catch (err) {
    showToast(err.message, true);
  }
}

init();
