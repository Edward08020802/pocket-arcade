import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { T } from '../theme';
import { Banner, Btn, GameFrame, WIN } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const W = Math.min(WIN.width - 24, 380);
const H = Math.round(W * 1.45);
const BALL = 10;
const PAD_W = Math.round(W * 0.26);
const PAD_H = 12;
const MARGIN = 26;
const TARGET = 7;               // first to seven
const SPEED = 0.30;

export default function Pong({ onExit }) {
  const [you, setYou] = useState(0);
  const [cpu, setCpu] = useState(0);
  const [state, setState] = useState('ready');    // ready | playing | over
  const [best, setBest] = useState(null);

  const ballX = useRef(new Animated.Value(W / 2)).current;
  const ballY = useRef(new Animated.Value(H / 2)).current;
  const youX = useRef(new Animated.Value(W / 2 - PAD_W / 2)).current;
  const cpuX = useRef(new Animated.Value(W / 2 - PAD_W / 2)).current;

  const p = useRef({
    x: W / 2, y: H / 2, vx: SPEED * 0.5, vy: SPEED,
    you: W / 2 - PAD_W / 2, cpu: W / 2 - PAD_W / 2,
  });
  const raf = useRef(null);
  const last = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => { getBest('pong').then(setBest); }, []);

  const serve = useCallback((towards) => {
    const st = p.current;
    st.x = W / 2;
    st.y = H / 2;
    st.vx = SPEED * (Math.random() > 0.5 ? 0.55 : -0.55);
    st.vy = SPEED * towards;
    ballX.setValue(st.x - BALL / 2);
    ballY.setValue(st.y - BALL / 2);
  }, [ballX, ballY]);

  const restart = useCallback(() => {
    setYou(0); setCpu(0); setState('ready');
    serve(1);
  }, [serve]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => move(e.nativeEvent.locationX),
      onPanResponderMove: (e) => move(e.nativeEvent.locationX),
    })
  ).current;

  function move(x) {
    const next = Math.max(0, Math.min(W - PAD_W, x - PAD_W / 2));
    p.current.you = next;
    youX.setValue(next);
    if (stateRef.current === 'ready') setState('playing');
  }

  const score = useCallback((who) => {
    if (who === 'you') {
      setYou((n) => {
        const next = n + 1;
        if (next >= TARGET) { fx('win', 'success'); setState('over'); }
        else { play('merge'); serve(-1); }
        return next;
      });
    } else {
      setCpu((n) => {
        const next = n + 1;
        if (next >= TARGET) { fx('lose', 'error'); setState('over'); }
        else { play('error'); serve(1); }
        return next;
      });
    }
  }, [serve]);

  const step = useCallback((now) => {
    raf.current = requestAnimationFrame(step);
    if (stateRef.current !== 'playing') { last.current = now; return; }
    const dt = Math.min(32, now - (last.current || now));
    last.current = now;
    const st = p.current;

    st.x += st.vx * dt;
    st.y += st.vy * dt;

    if (st.x - BALL / 2 <= 0) { st.x = BALL / 2; st.vx *= -1; play('tap'); }
    if (st.x + BALL / 2 >= W) { st.x = W - BALL / 2; st.vx *= -1; play('tap'); }

    // The CPU chases the ball but is deliberately capped, so it is beatable.
    const targetX = st.x - PAD_W / 2;
    const chase = 0.17 * dt;
    st.cpu += Math.max(-chase, Math.min(chase, targetX - st.cpu));
    st.cpu = Math.max(0, Math.min(W - PAD_W, st.cpu));
    cpuX.setValue(st.cpu);

    const hit = (padLeft) => st.x >= padLeft - 4 && st.x <= padLeft + PAD_W + 4;

    if (st.vy < 0 && st.y - BALL / 2 <= MARGIN + PAD_H && st.y > MARGIN) {
      if (hit(st.cpu)) {
        st.vy = Math.abs(st.vy);
        st.vx = SPEED * ((st.x - (st.cpu + PAD_W / 2)) / (PAD_W / 2)) * 1.1;
        play('place');
      }
    }
    if (st.vy > 0 && st.y + BALL / 2 >= H - MARGIN - PAD_H && st.y < H - MARGIN) {
      if (hit(st.you)) {
        st.vy = -Math.abs(st.vy);
        st.vx = SPEED * ((st.x - (st.you + PAD_W / 2)) / (PAD_W / 2)) * 1.1;
        play('place');
      }
    }

    if (st.y < -BALL) { score('you'); return; }
    if (st.y > H + BALL) { score('cpu'); return; }

    ballX.setValue(st.x - BALL / 2);
    ballY.setValue(st.y - BALL / 2);
  }, [ballX, ballY, cpuX]);

  useEffect(() => {
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [step]);

  useEffect(() => {
    if (state !== 'over' || you < TARGET) return;
    submitScore('pong', you - cpu).then((b) => { if (b) setBest(you - cpu); });
  }, [state, you, cpu]);

  return (
    <GameFrame
      title="Pong"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'YOU', value: you, color: T.cyan },
        { label: 'CPU', value: cpu, color: T.red },
        { label: 'BEST', value: best != null ? `+${best}` : '—' },
      ]}
      footer={<Text style={s.hint}>Drag to move your paddle · first to {TARGET}</Text>}
    >
      <View style={[s.board, { width: W, height: H }]} {...pan.panHandlers}>
        <View style={s.midline} />
        <Animated.View style={[s.cpuPad, { transform: [{ translateX: cpuX }] }]} />
        <Animated.View style={[s.youPad, { transform: [{ translateX: youX }] }]} />
        <Animated.View
          style={[s.ball, { transform: [{ translateX: ballX }, { translateY: ballY }] }]}
        />

        {state === 'ready' && (
          <View style={s.readyWrap} pointerEvents="none">
            <Text style={s.readyText}>Drag to start</Text>
          </View>
        )}

        {state === 'over' && (
          <Banner
            title={you >= TARGET ? 'You win!' : 'CPU wins'}
            tint={you >= TARGET ? T.green : T.red}
            detail={`${you} — ${cpu}`}
          >
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="Play again" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

const s = StyleSheet.create({
  board: {
    backgroundColor: '#0F1420', borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: T.border,
  },
  midline: {
    position: 'absolute', top: H / 2, left: 10, right: 10, height: 1,
    backgroundColor: T.border,
  },
  ball: { position: 'absolute', width: BALL, height: BALL, borderRadius: BALL, backgroundColor: T.text },
  youPad: {
    position: 'absolute', top: H - MARGIN - PAD_H, width: PAD_W, height: PAD_H,
    borderRadius: PAD_H, backgroundColor: T.cyan,
  },
  cpuPad: {
    position: 'absolute', top: MARGIN, width: PAD_W, height: PAD_H,
    borderRadius: PAD_H, backgroundColor: T.red,
  },
  readyWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  readyText: { color: T.dim, fontSize: 15, fontWeight: '700' },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
