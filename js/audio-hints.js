/** Shared hint playback: one full track + timestamp windows, or legacy per-hint files. */

const DEFAULT_HINT_DURATION = 10;
const HINT_DURATIONS = [15, 15, 12];

export function configureAudioSession() {
  try {
    if ("audioSession" in navigator) {
      navigator.audioSession.type = "playback";
    }
  } catch {
    // Ignore — not supported on all browsers.
  }
}

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function usesSegmentHints(song) {
  return Boolean(song.audio && Array.isArray(song.hints) && song.hints.length >= 3);
}

export function getPrimaryAudioPath(song) {
  if (song.audio) return song.audio;
  if (Array.isArray(song.snippets) && song.snippets[0]) return song.snippets[0];
  return null;
}

export function getHintSpec(song, index) {
  if (usesSegmentHints(song)) {
    const hint = song.hints[index];
    if (!hint || typeof hint.start !== "number") return null;
    return {
      mode: "segment",
      src: song.audio,
      start: hint.start,
      duration: hint.duration ?? HINT_DURATIONS[index] ?? DEFAULT_HINT_DURATION,
    };
  }

  const src = song.snippets?.[index];
  if (!src) return null;
  return { mode: "file", src };
}

export function createHintPlayer(audioEl, options = {}) {
  let stopTimer = null;
  let audioCtx = null;
  let bufferCache = new Map();
  let activeBufferSource = null;
  let playing = false;
  let progressRaf = null;
  let inflight = new Map();
  let mediaSegmentEnd = null;
  let iosPrimed = false;
  const useMediaElement = isIOS();

  async function primeIOSAudio() {
    if (!useMediaElement || iosPrimed) return;
    configureAudioSession();
    if (audioEl) {
      audioEl.setAttribute("playsinline", "");
      audioEl.setAttribute("webkit-playsinline", "");
    }
    iosPrimed = true;
  }

  function resolveSrc(src) {
    return new URL(src, window.location.href).href;
  }

  function clearProgressLoop() {
    if (progressRaf) {
      cancelAnimationFrame(progressRaf);
      progressRaf = null;
    }
  }

  function clearSegment() {
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    clearProgressLoop();
  }

  function stopBufferSource() {
    if (activeBufferSource) {
      try {
        activeBufferSource.stop();
      } catch {}
      activeBufferSource.disconnect();
      activeBufferSource = null;
    }
  }

  function getContext() {
    if (!audioCtx) {
      audioCtx =
        options.audioContext ||
        new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function getOutputNode(ctx) {
    if (typeof options.getOutputNode === "function") {
      const node = options.getOutputNode(ctx);
      if (node) return node;
    }
    return ctx.destination;
  }

  async function loadBuffer(src) {
    const url = resolveSrc(src);
    if (bufferCache.has(url)) return bufferCache.get(url);
    if (inflight.has(url)) return inflight.get(url);

    const task = (async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load audio (${response.status})`);
      }

      const data = await response.arrayBuffer();
      const buffer = await getContext().decodeAudioData(data);
      bufferCache.set(url, buffer);
      return buffer;
    })();

    inflight.set(url, task);
    try {
      return await task;
    } finally {
      inflight.delete(url);
    }
  }

  async function preload(src) {
    if (!src) return null;
    if (useMediaElement) {
      return ensureMediaSource(src);
    }
    return loadBuffer(src);
  }

  function seedBuffer(src, buffer) {
    if (!src || !buffer) return;
    bufferCache.set(resolveSrc(src), buffer);
  }

  function hasBuffer(src) {
    if (useMediaElement) {
      return sameSource(src) && audioEl.readyState >= 1;
    }
    return bufferCache.has(resolveSrc(src));
  }

  function sameSource(src) {
    if (!audioEl.src) return false;
    try {
      const current = new URL(audioEl.src, window.location.href).pathname;
      const next = new URL(src, window.location.href).pathname;
      return current === next;
    } catch {
      return audioEl.src.includes(src);
    }
  }

  async function ensureMediaSource(src) {
    const url = resolveSrc(src);
    if (!sameSource(src)) {
      audioEl.src = url;
      audioEl.load();
    }

    if (audioEl.readyState >= 1) return;

    await new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error("Failed to load audio"));
      };
      const cleanup = () => {
        audioEl.removeEventListener("loadedmetadata", onReady);
        audioEl.removeEventListener("canplay", onReady);
        audioEl.removeEventListener("error", onErr);
      };
      audioEl.addEventListener("loadedmetadata", onReady);
      audioEl.addEventListener("canplay", onReady);
      audioEl.addEventListener("error", onErr);
    });
  }

  async function seekMedia(time) {
    if (Math.abs(audioEl.currentTime - time) < 0.05) return;
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        audioEl.removeEventListener("seeked", done);
        resolve();
      };
      audioEl.addEventListener("seeked", done);
      audioEl.currentTime = time;
      setTimeout(done, 300);
    });
  }

  async function playSegmentWithMediaElement(src, start, duration) {
    stopBufferSource();
    clearSegment();
    await primeIOSAudio();
    await ensureMediaSource(src);

    const safeStart = Math.max(0, start);
    await seekMedia(safeStart);
    await audioEl.play();

    playing = true;
    mediaSegmentEnd = duration == null ? null : safeStart + duration;

    const onProgress = options.onSegmentProgress;
    if (onProgress) {
      const tick = () => {
        if (!playing || audioEl.paused) return;
        const end = mediaSegmentEnd ?? audioEl.duration;
        onProgress(audioEl.currentTime, safeStart, end - safeStart);
        progressRaf = requestAnimationFrame(tick);
      };
      onProgress(safeStart, safeStart, (mediaSegmentEnd ?? audioEl.duration) - safeStart);
      progressRaf = requestAnimationFrame(tick);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearProgressLoop();
        audioEl.onended = null;
        if (stopTimer) {
          clearTimeout(stopTimer);
          stopTimer = null;
        }
        audioEl.pause();
        playing = false;
        mediaSegmentEnd = null;
        if (options.onSegmentEnd) {
          const end = duration == null ? audioEl.duration : safeStart + duration;
          options.onSegmentEnd(end, safeStart, duration ?? audioEl.duration - safeStart);
        }
        resolve();
      };

      if (duration != null) {
        stopTimer = setTimeout(finish, duration * 1000 + 100);
      } else {
        audioEl.onended = finish;
      }
    });
  }

  async function playSegmentWithWebAudio(src, start, duration) {
    stopBufferSource();
    audioEl.pause();

    const ctx = getContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const buffer = await loadBuffer(src);
    const safeStart = Math.max(0, Math.min(start, Math.max(0, buffer.duration - 0.1)));
    const safeDuration =
      duration == null
        ? Math.max(0.1, buffer.duration - safeStart)
        : Math.min(duration, Math.max(0.1, buffer.duration - safeStart));

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(getOutputNode(ctx));
    source.start(0, safeStart, safeDuration);

    activeBufferSource = source;
    playing = true;

    const onProgress = options.onSegmentProgress;
    if (onProgress) {
      const wallStart = performance.now();
      const tick = () => {
        if (activeBufferSource !== source) return;
        const elapsed = (performance.now() - wallStart) / 1000;
        const t = Math.min(safeStart + elapsed, safeStart + safeDuration);
        onProgress(t, safeStart, safeDuration);
        if (elapsed < safeDuration) {
          progressRaf = requestAnimationFrame(tick);
        }
      };
      onProgress(safeStart, safeStart, safeDuration);
      progressRaf = requestAnimationFrame(tick);
    }

    return new Promise((resolve) => {
      const done = () => {
        if (activeBufferSource !== source) return;
        clearProgressLoop();
        if (options.onSegmentEnd) {
          options.onSegmentEnd(safeStart + safeDuration, safeStart, safeDuration);
        }
        stopBufferSource();
        playing = false;
        resolve();
      };

      stopTimer = setTimeout(done, safeDuration * 1000 + 150);
      source.onended = done;
    });
  }

  async function playSegment(src, start, duration) {
    if (useMediaElement) {
      return playSegmentWithMediaElement(src, start, duration);
    }
    return playSegmentWithWebAudio(src, start, duration);
  }

  async function playFile(src) {
    stopBufferSource();
    clearSegment();
    if (useMediaElement) {
      await primeIOSAudio();
    }
    if (!sameSource(src)) {
      audioEl.src = resolveSrc(src);
      audioEl.load();
    }
    playing = true;
    await audioEl.play();
  }

  function stop() {
    stopBufferSource();
    clearSegment();
    mediaSegmentEnd = null;
    audioEl.onended = null;
    audioEl.pause();
    playing = false;
  }

  async function previewAt(src, start, duration = 0.35) {
    return playSegment(src, start, duration);
  }

  async function playFrom(src, start) {
    return playSegment(src, start, null);
  }

  async function playHint(song, index) {
    const spec = getHintSpec(song, index);
    if (!spec) {
      throw new Error(`Hint ${index + 1} is not configured`);
    }

    stop();

    if (spec.mode === "segment") {
      await playSegment(spec.src, spec.start, spec.duration);
      return;
    }

    await playFile(spec.src);
  }

  function isPlaying() {
    return playing || (!audioEl.paused && audioEl.currentTime > 0);
  }

  function isPlayingHint(index, song) {
    if (!isPlaying()) return false;

    const spec = getHintSpec(song, index);
    if (!spec) return false;

    if (spec.mode === "file") {
      return sameSource(spec.src);
    }

    if (activeBufferSource) {
      return true;
    }

    if (useMediaElement && playing && sameSource(spec.src)) {
      const t = audioEl.currentTime;
      return t >= spec.start && t < spec.start + spec.duration + 0.25;
    }

    return (
      sameSource(spec.src) &&
      audioEl.currentTime >= spec.start &&
      audioEl.currentTime < spec.start + spec.duration + 0.25
    );
  }

  return {
    playHint,
    stop,
    clearSegment,
    isPlaying,
    isPlayingHint,
    preload,
    seedBuffer,
    hasBuffer,
    previewAt,
    playFrom,
    primeIOSAudio,
  };
}
