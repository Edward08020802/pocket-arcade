import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { SPECTRUM, useTheme } from '../theme';
import { Banner, Btn, GameFrame, WIN } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const W = Math.min(WIN.width - 24, 380);
const H = Math.round(W * 1.35);
const COLS = 7;
const ROWS = 5;
const BRICK_W = W / COLS;
const BRICK_H = 20;
const TOP = 34;                 // empty strip above the bricks
const BALL = 9;
const PADDLE_W = Math.round(W * 0.24);
const PADDLE_H = 12;
const PADDLE_Y = H - 34;
const SPEED = 0.34;             // pixels per millisecond

const makeBricks = (level) =>
  Array.from({ length: COLS * ROWS }, (_, i) => ({
    id: i,
    alive: true,
    // Lower rows are worth less; higher levels add a second hit to top rows.
    hits: level > 1 && Math.floor(i / COLS) === 0 ? 2 : 1,
  }));

export default function Breakout({ onExit }) {
  const { T, s } = useTheme(makeStyles);
  const [bricks, setBricks] = useState(() => makeBricks(1));
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [state, setState] = useState('ready');   // ready | playing | lost | won
  const [best, setBest] = useState(null);

  const ballX = useRef(new Animated.Value(W / 2 - BALL / 2)).current;
  const ballY = useRef(new Animated.Value(PADDLE_Y - BALL - 2)).current;
  const padX = useRef(new Animated.Value(W / 2 - PADDLE_W / 2)).current;

  // Physics lives in a ref so the loop never triggers a render.
  const p = useRef({
    x: W / 2, y: PADDLE_Y - BALL, vx: SPEED * 0.6, vy: -SPEED, pad: W / 2 - PADDLE_W / 2,
  });
  const raf = useRef(null);
  const last = useRef(0);
  const bricksRef = useRef(bricks);
  bricksRef.current = bricks;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => { getBest('breakout').then(setBest); }, []);

  const resetBall = useCallback(() => {
    p.current.x = W / 2;
    p.current.y = PADDLE_Y - BALL - 2;
    p.current.vx = SPEED * (Math.random() > 0.5 ? 0.6 : -0.6);
    p.current.vy = -SPEED;
    ballX.setValue(p.current.x - BALL / 2);
    ballY.setValue(p.current.y);
  }, [ballX, ballY]);

  const restart = useCallback(() => {
    setBricks(makeBricks(1));
    setScore(0); setLives(3); setLevel(1); setState('ready');
    resetBall();
  }, [resetBall]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => movePaddle(e.nativeEvent.locationX),
      onPanResponderMove: (e) => movePaddle(e.nativeEvent.locationX),
    })
  ).current;

  function movePaddle(x) {
    const next = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
    p.current.pad = next;
    padX.setValue(next);
    if (stateRef.current === 'ready') setState('playing');
  }

  const step = useCallback((now) => {
    raf.current = requestAnimationFrame(step);
    if (stateRef.current !== 'playing') { last.current = now; return; }
    // Clamp dt so a backgrounded tab does not teleport the ball through walls.
    const dt = Math.min(32, now - (last.current || now));
    last.current = now;

    const st = p.current;
    st.x += st.vx * dt;
    st.y += st.vy * dt;

    if (st.x - BALL / 2 <= 0) { st.x = BALL / 2; st.vx *= -1; play('tap'); }
    if (st.x + BALL / 2 >= W) { st.x = W - BALL / 2; st.vx *= -1; play('tap'); }
    if (st.y <= 0) { st.y = 0; st.vy *= -1; play('tap'); }

    // Paddle: bounce angle depends on where it hit, so the player can aim.
    if (st.vy > 0 && st.y + BALL >= PADDLE_Y && st.y + BALL <= PADDLE_Y + PADDLE_H + 6) {
      if (st.x >= st.pad - 4 && st.x <= st.pad + PADDLE_W + 4) {
        const offset = (st.x - (st.pad + PADDLE_W / 2)) / (PADDLE_W / 2);
        st.vy = -Math.abs(st.vy);
        st.vx = SPEED * Math.max(-1.1, Math.min(1.1, offset * 1.1));
        play('place');
      }
    }

    // Bricks
    const col = Math.floor(st.x / BRICK_W);
    const row = Math.floor((st.y - TOP) / BRICK_H);
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      const i = row * COLS + col;
      const brick = bricksRef.current[i];
      if (brick && brick.alive) {
        st.vy *= -1;
        play('merge');
        setScore((n) => n + (ROWS - row) * 10);
        setBricks((cur) => {
          const next = cur.slice();
          const b = { ...next[i] };
          b.hits -= 1;
          if (b.hits <= 0) b.alive = false;
          next[i] = b;
          return next;
        });
      }
    }

    // Missed
    if (st.y > H) {
      setLives((n) => {
        const left = n - 1;
        if (left <= 0) { fx('lose', 'error'); setState('lost'); }
        else { play('error'); setState('ready'); resetBall(); }
        return left;
      });
    }

    ballX.setValue(st.x - BALL / 2);
    ballY.setValue(st.y);
  }, [ballX, ballY, resetBall]);

  useEffect(() => {
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [step]);

  // Cleared the board -> next level, a little faster.
  useEffect(() => {
    if (state !== 'playing' || bricks.some((b) => b.alive)) return;
    fx('win', 'success');
    setLevel((l) => {
      const next = l + 1;
      setBricks(makeBricks(next));
      return next;
    });
    setState('ready');
    resetBall();
  }, [bricks, state, resetBall]);

  useEffect(() => {
    if (state !== 'lost') return;
    submitScore('breakout', score).then((b) => { if (b) setBest(score); });
  }, [state, score]);

  return (
    <GameFrame
      title="Breakout"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'SCORE', value: score, color: T.cyan },
        { label: 'LIVES', value: lives, color: lives === 1 ? T.red : T.text },
        { label: 'LEVEL', value: level },
        { label: 'BEST', value: best ?? '—' },
      ]}
      footer={<Text style={s.hint}>Drag anywhere on the board to move the paddle</Text>}
    >
      <View style={[s.board, { width: W, height: H }]} {...pan.panHandlers}>
        {bricks.map((b, i) => {
          if (!b.alive) return null;
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          const colour = SPECTRUM[row % SPECTRUM.length];
          return (
            <View
              key={b.id}
              style={{
                position: 'absolute',
                left: col * BRICK_W + 1.5, top: TOP + row * BRICK_H + 1.5,
                width: BRICK_W - 3, height: BRICK_H - 3,
                borderRadius: 4,
                backgroundColor: colour + (b.hits > 1 ? 'FF' : '99'),
                borderWidth: b.hits > 1 ? 1.5 : 0, borderColor: '#FFFFFF66',
              }}
            />
          );
        })}

        <Animated.View
          style={[s.ball, { transform: [{ translateX: ballX }, { translateY: ballY }] }]}
        />
        <Animated.View
          style={[s.paddle, { transform: [{ translateX: padX }] }]}
        />

        {state === 'ready' && (
          <View style={s.readyWrap} pointerEvents="none">
            <Text style={s.readyText}>Drag to start</Text>
          </View>
        )}

        {state === 'lost' && (
          <Banner title="Game over" tint={T.red} detail={`${score} points on level ${level}.`}>
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="Play again" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

const makeStyles = (T) => StyleSheet.create({
  board: {
    backgroundColor: T.well, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: T.border,
  },
  ball: {
    position: 'absolute', width: BALL, height: BALL, borderRadius: BALL,
    backgroundColor: T.text,
  },
  paddle: {
    position: 'absolute', top: PADDLE_Y, width: PADDLE_W, height: PADDLE_H,
    borderRadius: PADDLE_H, backgroundColor: T.cyan,
  },
  readyWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  readyText: { color: T.dim, fontSize: 15, fontWeight: '700' },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
