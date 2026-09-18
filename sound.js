import { useCallback, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  if (!players[name]) {
    try {
      players[name] = createAudioPlayer(FILES[name]);
    } catch {
      players[name] = null;      // remembered, so it is not retried every tap
    }
  }
  return players[name];
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
    if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (kind === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else if (kind === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (kind === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
