import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { T } from '../theme';
import { Banner, Btn, GameFrame, WIN, useSwipe, useTicker } from '../ui';
import { getBest, submitScore } from '../storage';

const COLS = 15;
const ROWS = 19;
const CELL = Math.floor(Math.min(WIN.width - 28, 420) / COLS);
const BASE_MS = 190;          // starting tick
const MIN_MS = 70;            // fastest it ever gets
const STEP_MS = 5;            // shaved off per apple

const DIRS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

const startSnake = () => [
  { x: 7, y: 10 }, { x: 7, y: 11 }, { x: 7, y: 12 },
];

function randomFood(snake) {
  // Pick from free cells only: on a nearly full board, guessing at random can
  // spin for a very long time.
  const taken = new Set(snake.map((p) => `${p.x},${p.y}`));
  const free = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!taken.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)];
}

export default function Snake({ onExit }) {
  const [snake, setSnake] = useState(startSnake);
  const [food, setFood] = useState({ x: 7, y: 5 });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(null);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [paused, setPaused] = useState(false);

  // Direction lives in a ref as well as state: the tick reads it synchronously,
  // and two swipes inside one tick must not both apply.
  const dir = useRef(DIRS.up);
  const queued = useRef(null);

  useEffect(() => { getBest('snake').then(setBest); }, []);

  const restart = useCallback(() => {
    const s = startSnake();
    dir.current = DIRS.up;
    queued.current = null;
    setSnake(s);
    setFood(randomFood(s));
    setScore(0);
    setOver(false);
    setWon(false);
    setPaused(false);
  }, []);

  const turn = useCallback((d) => {
    const next = DIRS[d];
    const cur = queued.current || dir.current;
    // Refuse a straight reversal -- it would run the head into the neck.
    if (next.x === -cur.x && next.y === -cur.y) return;
    queued.current = next;
  }, []);

  const swipe = useSwipe(turn);

  const tick = useCallback(() => {
    if (queued.current) {
      dir.current = queued.current;
      queued.current = null;
    }
    setSnake((prev) => {
      const head = {
        x: prev[0].x + dir.current.x,
        y: prev[0].y + dir.current.y,
      };
      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
        setOver(true);
        return prev;
      }
      // The tail cell is vacated this tick, so running into it is legal --
      // except when eating, because then the tail stays put.
      const eating = food && head.x === food.x && head.y === food.y;
      const body = eating ? prev : prev.slice(0, -1);
      if (body.some((p) => p.x === head.x && p.y === head.y)) {
        setOver(true);
        return prev;
      }
      const next = [head, ...body];
      if (eating) {
        setScore((n) => n + 1);
        const f = randomFood(next);
        setFood(f);
        if (!f) setWon(true);
      }
      return next;
    });
  }, [food]);

  const speed = Math.max(MIN_MS, BASE_MS - score * STEP_MS);
  useTicker(tick, over || won || paused ? null : speed);

  useEffect(() => {
    if (!over && !won) return;
    submitScore('snake', score).then((better) => {
      if (better) setBest(score);
    });
  }, [over, won, score]);

  const occupied = new Map();
  snake.forEach((p, i) => occupied.set(`${p.x},${p.y}`, i));

  return (
    <GameFrame
      title="Snake"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'SCORE', value: score, color: T.green },
        { label: 'BEST', value: best ?? '—' },
        { label: 'SPEED', value: `${Math.round((BASE_MS / speed) * 100)}%` },
      ]}
      footer={
        <Btn
          label={paused ? 'Resume' : 'Pause'}
          icon={paused ? 'play' : 'pause'}
          color={T.amber}
          onPress={() => setPaused((p) => !p)}
          disabled={over || won}
        />
      }
    >
      <View {...swipe} style={s.boardWrap}>
        <View style={[s.board, { width: COLS * CELL, height: ROWS * CELL }]}>
          {Array.from({ length: ROWS }).map((_, y) => (
            <View key={y} style={{ flexDirection: 'row' }}>
              {Array.from({ length: COLS }).map((__, x) => {
                const idx = occupied.get(`${x},${y}`);
                const isFood = food && food.x === x && food.y === y;
                const isHead = idx === 0;
                return (
                  <View
                    key={x}
                    style={[
                      { width: CELL, height: CELL },
                      s.cell,
                      isFood && s.food,
                      idx != null && s.snake,
                      isHead && s.head,
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>

        <Text style={s.hint}>Swipe to steer</Text>

        {(over || won) && (
          <Banner
            title={won ? 'Perfect!' : 'Game over'}
            tint={won ? T.amber : T.red}
            detail={won ? 'You filled the whole board.' : `You scored ${score}.`}
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
  boardWrap: { alignItems: 'center' },
  board: {
    backgroundColor: T.card, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: T.border,
  },
  cell: { borderWidth: 0.5, borderColor: '#00000018' },
  snake: { backgroundColor: T.green, borderRadius: 3 },
  head: { backgroundColor: T.lime },
  food: { backgroundColor: T.amber, borderRadius: CELL / 2 },
  hint: { color: T.dim, fontSize: 12, marginTop: 10 },
});
