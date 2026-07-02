/** Toggle shuffle for testing. Set true before the party. */
export const SHUFFLE_ENABLED = true;

/** Save/resume progress in the browser. Off during testing so refresh starts at song 1. */
export const PERSIST_PROGRESS = SHUFFLE_ENABLED;

/** Song picker + prev/next while testing (hidden when shuffle is on for the party). */
export const DEV_SONG_PICKER = !SHUFFLE_ENABLED;
