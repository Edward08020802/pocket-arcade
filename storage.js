import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Best scores, kept on the device. Every read is guarded: a game must still be
 * playable if storage is unavailable, so a failure returns the default rather
 * than throwing into a render.
 */
const KEY = 'pocket-arcade:best';
const VERSION_KEY = 'pocket-arcade:best-version';
const VERSION = 2;

let cache = null;

/**
 * One-off repairs to already-saved scores.
 *
 * v2: Connect Four counted a win once per repaint rather than once per game,
 * so stored streaks ran into the thousands. Those entries are unbeatable and
 * meaningless, so they are dropped; every other game's bests are untouched.
 */
function migrate(bests) {
  let changed = false;
  for (const k of Object.keys(bests)) {
    if (k.startsWith('connect4')) {
      delete bests[k];
      changed = true;
    }
  }
  return changed;
}

export async function loadBests() {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : {};
    const version = Number(await AsyncStorage.getItem(VERSION_KEY)) || 1;
    if (version < VERSION) {
      if (migrate(cache)) {
        await AsyncStorage.setItem(KEY, JSON.stringify(cache));
      }
      await AsyncStorage.setItem(VERSION_KEY, String(VERSION));
    }
  } catch {
    cache = {};
  }
  return cache;
}

export async function getBest(game) {
  const all = await loadBests();
  return all[game] ?? null;
}

/**
 * Records a score and says whether it was an improvement.
 * `higherIsBetter` is false for games scored by time or moves.
 */
export async function submitScore(game, score, higherIsBetter = true) {
  const all = await loadBests();
  const prev = all[game];
  const better =
    prev == null || (higherIsBetter ? score > prev : score < prev);
  if (better) {
    all[game] = score;
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // Not fatal: the score just will not survive a restart.
    }
  }
  return better;
}
