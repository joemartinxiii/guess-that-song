import { SHUFFLE_ENABLED, PERSIST_PROGRESS } from "./config.js";

const STORAGE_KEY = "guessThatSong_v1";

export function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function loadState() {
  if (!PERSIST_PROGRESS) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(state) {
  if (!PERSIST_PROGRESS) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

function buildPlayOrder(allSongIds) {
  if (SHUFFLE_ENABLED) return shuffle(allSongIds);
  // Deck draws with pop(), so reverse to play song-01 first.
  return [...allSongIds].reverse();
}

export function createDeck(allSongIds) {
  return buildPlayOrder(allSongIds);
}

export function initDeck(allSongIds, savedState) {
  const validIds = new Set(allSongIds);

  if (savedState?.remainingIds?.length) {
    const remaining = savedState.remainingIds.filter((id) => validIds.has(id));
    if (remaining.length > 0) {
      return {
        remainingIds: remaining,
        currentSongId: savedState.currentSongId ?? null,
        roundState: savedState.roundState ?? null,
        playedCount: savedState.playedCount ?? allSongIds.length - remaining.length,
      };
    }
  }

  return {
    remainingIds: createDeck(allSongIds),
    currentSongId: null,
    roundState: null,
    playedCount: 0,
  };
}

export function drawNextSong(deckState) {
  if (deckState.remainingIds.length === 0) {
    return null;
  }

  const nextId = deckState.remainingIds.pop();
  deckState.currentSongId = nextId;
  deckState.roundState = {
    hintsPlayed: [false, false, false],
    revealed: false,
  };

  return nextId;
}

export function reshuffleDeck(allSongIds) {
  return {
    remainingIds: createDeck(allSongIds),
    currentSongId: null,
    roundState: null,
    playedCount: 0,
  };
}

export function freshRoundState() {
  return { hintsPlayed: [false, false, false], revealed: false };
}

/** Jump to any song for testing — resets hints without advancing the deck. */
export function jumpToSong(deckState, songId) {
  deckState.currentSongId = songId;
  deckState.roundState = freshRoundState();
}

export function getProgress(deckState, totalSongs) {
  const remaining = deckState.remainingIds.length;
  const inRound = deckState.currentSongId ? 1 : 0;
  const played = totalSongs - remaining - inRound;
  const currentNumber = played + 1;

  return {
    currentNumber: deckState.currentSongId ? currentNumber : played,
    total: totalSongs,
    remaining,
    played,
    inRound: Boolean(deckState.currentSongId),
  };
}
