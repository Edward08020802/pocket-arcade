import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Banner, Btn, GameFrame, WIN } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

// Each pad gets its own sound, so the sequence is learnable by ear as well as
// by sight -- which is how the original toy worked.
const PADS = [
  { key: 0, color: '#10B981', sfx: 'select' },
  { key: 1, color: '#EF4444', sfx: 'move' },
  { key: 2, color: '#0EA5E9', sfx: 'tap' },
  { key: 3, color: '#F59E0B', sfx: 'merge' },
];
const PAD = Math.min((WIN.width - 60) / 2, 150);
const SHOW_MS = 420;
const GAP_MS = 180;

export default function Simon({ onExit }) {
  const { T, s } = useTheme(makeStyles);
  const [seq, setSeq] = useState([]);
  const [step, setStep] = useState(0);        // how far the player has replayed
  const [lit, setLit] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | showing | input | over
  const [best, setBest] = useState(null);
  const timers = useRef([]);

  useEffect(() => { getBest('simon').then(setBest); }, []);

  // Any pending playback must be cancellable, or a restart mid-sequence keeps
  // flashing pads from the previous round.
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const play = useCallback((full) => {
    clearTimers();
    setPhase('showing');
    full.forEach((pad, i) => {
      timers.current.push(setTimeout(() => {
        setLit(pad);
        play(PADS[pad].sfx);
      }, i * (SHOW_MS + GAP_MS)));
      timers.current.push(setTimeout(() => setLit(null), i * (SHOW_MS + GAP_MS) + SHOW_MS));
    });
    timers.current.push(
      setTimeout(() => {
        setPhase('input');
        setStep(0);
      }, full.length * (SHOW_MS + GAP_MS))
    );
  }, []);

  const extend = useCallback((cur) => {
    const next = [...cur, Math.floor(Math.random() * 4)];
    setSeq(next);
    play(next);
  }, [play]);

  const restart = useCallback(() => {
    clearTimers();
    setSeq([]);
    setStep(0);
    setLit(null);
    setPhase('idle');
  }, []);

  const press = useCallback((pad) => {
    if (phase !== 'input') return;
    fx(PADS[pad].sfx, 'light');
    setLit(pad);
    timers.current.push(setTimeout(() => setLit(null), 150));

    if (seq[step] !== pad) {
      fx('lose', 'error');
      setPhase('over');
      submitScore('simon', seq.length - 1).then((b) => {
        if (b) setBest(seq.length - 1);
      });
      return;
    }
    if (step + 1 === seq.length) {
      timers.current.push(setTimeout(() => extend(seq), 550));
    } else {
      setStep(step + 1);
    }
  }, [phase, seq, step, extend]);

  const label =
    phase === 'showing' ? 'Watch' :
    phase === 'input' ? 'Your turn' :
    phase === 'over' ? 'Wrong pad' : 'Ready';

  return (
    <GameFrame
      title="Simon"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'ROUND', value: seq.length, color: T.violet },
        { label: 'BEST', value: best ?? '—' },
        { label: 'STATUS', value: label },
      ]}
      footer={
        phase === 'idle'
          ? <Btn label="Start" icon="play" color={T.green} onPress={() => extend([])} />
          : <Text style={s.hint}>Repeat the sequence</Text>
      }
    >
      <View style={s.pads}>
        {PADS.map((p) => (
          <Pad
            key={p.key}
            pad={p}
            lit={lit === p.key}
            disabled={phase !== 'input'}
            onPress={() => press(p.key)}
          />
        ))}
      </View>

      {phase === 'over' && (
        <Banner title="Wrong pad" tint={T.red} detail={`You reached round ${seq.length - 1}.`}>
          <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
            <Btn label="Try again" icon="refresh" color={T.green} onPress={restart} />
          </View>
        </Banner>
      )}
    </GameFrame>
  );
}

/** Lights and swells together, so a flash is visible even at a glance. */
function Pad({ pad, lit, disabled, onPress }) {
  const { T, s } = useTheme(makeStyles);
  const grow = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(grow, {
      toValue: lit ? 1.08 : 1, useNativeDriver: true, friction: 4, tension: 200,
    }).start();
  }, [lit, grow]);
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <Animated.View
        style={[
          s.pad,
          {
            width: PAD, height: PAD,
            backgroundColor: pad.color + (lit ? 'FF' : '2E'),
            borderColor: pad.color + (lit ? 'FF' : '66'),
            transform: [{ scale: grow }],
          },
        ]}
      />
    </Pressable>
  );
}

const makeStyles = (T) => StyleSheet.create({
  pads: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    width: PAD * 2 + 12, justifyContent: 'center',
  },
  pad: { borderRadius: 18, borderWidth: 2 },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
