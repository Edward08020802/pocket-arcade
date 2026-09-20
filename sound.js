import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * expo-audio and expo-haptics are loaded lazily, on first use.
 *
 * Importing a native module at module scope means any problem registering it
 * throws while the bundle is still evaluating, which takes the whole app down
 * to a blank screen before anything renders. Sound is optional; it must never
 * be able to do that. Loaded this way a missing module costs silence, nothing
 * more.
 */
let audioMod;
function audio() {
  if (audioMod === undefined) {
    try {
      audioMod = require('expo-audio');
    } catch {
      audioMod = null;
    }
  }
  return audioMod;
}

let hapticsMod;
function haptics() {
  if (hapticsMod === undefined) {
    try {
      hapticsMod = require('expo-haptics');
    } catch {
      hapticsMod = null;
    }
  }
  return hapticsMod;
}

/**
 * Sound effects and haptics.
 *
 * Every call is wrapped: audio is a nice-to-have, and a device that refuses to
 * play a sound (silent switch, an interrupted session, a simulator without an
 * audio route) must never take a game down with it.
 *
 * Players are created once and rewound before each play, because these effects
 * fire far faster than a sound finishes -- a merge chain in 2048 can retrigger
 * within a few frames.
 */
// Metro resolves these at bundle time, so the calls themselves are safe; the
// map is still built defensively because it runs during module evaluation.
const FILES = {
  tap: require('./assets/sfx/tap.wav'),
  move: require('./assets/sfx/move.wav'),
  place: require('./assets/sfx/place.wav'),
  drop: require('./assets/sfx/drop.wav'),
  merge: require('./assets/sfx/merge.wav'),
  flip: require('./assets/sfx/flip.wav'),
  clear: require('./assets/sfx/clear.wav'),
  win: require('./assets/sfx/win.wav'),
  lose: require('./assets/sfx/lose.wav'),
  error: require('./assets/sfx/error.wav'),
  boom: require('./assets/sfx/boom.wav'),
  select: require('./assets/sfx/select.wav'),
};

/**
 * The audio session is configured once, before any player is built.
 *
 * Without this iOS uses the default session and activates it lazily, on the
 * first sound -- which happens inside a press handler, so the activation cost
 * lands on a tap. Setting it up front also means effects are audible with the
 * silent switch on, and `mixWithOthers` keeps whatever the player had going
 * from being stopped by a card flip.
 */
let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  try {
    const mod = audio();
    if (!mod || !mod.setAudioModeAsync) return;
    const r = mod.setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
    if (r && r.catch) r.catch(() => {});
  } catch {
    // An unconfigured session still plays; it just costs more on first use.
  }
}

const MUTE_KEY = 'pocket-arcade:muted';
const players = {};
let muted = false;
let listeners = new Set();

AsyncStorage.getItem(MUTE_KEY)
  .then((v) => {
    muted = v === '1';
    listeners.forEach((fn) => fn(muted));
  })
  .catch(() => {});

function player(name) {
  if (!(name in players)) {
    configure();
    try {
      const mod = audio();
      players[name] = mod ? mod.createAudioPlayer(FILES[name]) : null;
    } catch {
      players[name] = null;      // remembered, so it is not retried every tap
    }
  }
  return players[name];
}

/**
 * Builds every player ahead of time, one per tick.
 *
 * `createAudioPlayer` is a synchronous native call that loads and decodes the
 * asset, and it used to run on the first tap that needed a given sound. That
 * put a stall on the first Deal, then another on the first Hit, then another
 * the first time a hand was won -- read as intermittent lag spikes, because a
 * sound is only ever slow once and a game keeps reaching new ones.
 *
 * Spread across ticks rather than looped: twelve synchronous loads back to
 * back would simply move the same stall to startup.
 */
export function warmUp() {
  const names = Object.keys(FILES);
  let i = 0;
  const step = () => {
    if (i >= names.length) return;
    player(names[i++]);
    setTimeout(step, 24);
  };
  setTimeout(step, 120);   // after the first screen has painted
}

export function play(name) {
  if (muted || !FILES[name]) return;
  try {
    const p = player(name);
    if (!p) return;
    // seekTo returns a promise on iOS; play() straight after is fine because
    // the native player queues the seek.
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Silence is an acceptable failure mode.
  }
}

/** Short tactile tick. Separate from sound so it still works when muted. */
export function buzz(kind = 'light') {
  try {
    const H = haptics();
    if (!H) return;
    if (kind === 'success') H.notificationAsync(H.NotificationFeedbackType.Success);
    else if (kind === 'warning') H.notificationAsync(H.NotificationFeedbackType.Warning);
    else if (kind === 'error') H.notificationAsync(H.NotificationFeedbackType.Error);
    else if (kind === 'medium') H.impactAsync(H.ImpactFeedbackStyle.Medium);
    else if (kind === 'heavy') H.impactAsync(H.ImpactFeedbackStyle.Heavy);
    else H.impactAsync(H.ImpactFeedbackStyle.Light);
  } catch {
    // Not every device has a haptic engine.
  }
}

/** Sound plus matching haptic, which is what games actually want. */
export function fx(name, haptic = 'light') {
  play(name);
  if (haptic) buzz(haptic);
}

export function isMuted() {
  return muted;
}

export async function setMuted(next) {
  muted = next;
  listeners.forEach((fn) => fn(muted));
  try {
    await AsyncStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {}
}

/** Subscribe so the mute button re-renders when the value loads or changes. */
export function useMuted() {
  const [value, setValue] = useState(muted);
  useEffect(() => {
    listeners.add(setValue);
    setValue(muted);
    return () => listeners.delete(setValue);
  }, []);
  const toggle = useCallback(() => {
    setMuted(!muted).then(() => play('tap'));
  }, []);
  return [value, toggle];
}
