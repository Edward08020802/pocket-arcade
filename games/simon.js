import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { T } from '../theme';
import { Banner, Btn, GameFrame, WIN } from '../ui';
import { getBest, submitScore } from '../storage';

const PADS = [
  { key: 0, color: T.green },
  { key: 1, color: T.red },
  { key: 2, color: T.cyan },
  { key: 3, color: T.amber },
];
const PAD = Math.min((WIN.width - 60) / 2, 150);
const SHOW_MS = 420;
const GAP_MS = 180;

export default function Simon({ onExit }) {
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
      timers.current.push(setTimeout(() => setLit(pad), i * (SHOW_MS + GAP_MS)));
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
    setLit(pad);
    timers.current.push(setTimeout(() => setLit(null), 150));

    if (seq[step] !== pad) {
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
          <Pressable
            key={p.key}
            onPress={() => press(p.key)}
            disabled={phase !== 'input'}
            style={[
              s.pad,
              { width: PAD, height: PAD, backgroundColor: p.color + (lit === p.key ? 'FF' : '2E'),
                borderColor: p.color + (lit === p.key ? 'FF' : '66') },
            ]}
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

const s = StyleSheet.create({
  pads: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    width: PAD * 2 + 12, justifyContent: 'center',
  },
  pad: { borderRadius: 18, borderWidth: 2 },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
