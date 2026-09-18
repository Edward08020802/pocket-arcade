import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { T } from '../theme';
import { Banner, Btn, GameFrame, Pop, WIN, useSwipe } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const N = 4;
const GAP = 8;
const BOARD = Math.min(WIN.width - 32, 400);
const CELL = (BOARD - GAP * (N + 1)) / N;

// Warm as the numbers climb, so progress is legible at a glance.
const TILE = {
  2: ['#1E2836', T.dim], 4: ['#24324A', '#9FB3D1'],
  8: ['#2B4C6F', '#DCEBFF'], 16: ['#1F6F8B', '#EAF8FF'],
  32: ['#178A78', '#EAFFF9'], 64: ['#2FA65C', '#F1FFF3'],
  128: ['#7AA83A', '#FBFFEF'], 256: ['#B99A2E', '#FFFBEB'],
  512: ['#C97A2B', '#FFF6EC'], 1024: ['#CE5A46', '#FFEFEC'],
  2048: ['#C63E6B', '#FFECF3'],
};
const tileStyle = (v) => TILE[v] || ['#8E44AD', '#F7ECFF'];

const emptyGrid = () => Array.from({ length: N }, () => Array(N).fill(0));

function spawn(grid) {
  const free = [];
  grid.forEach((row, y) => row.forEach((v, x) => { if (!v) free.push([x, y]); }));
  if (!free.length) return grid;
  const [x, y] = free[Math.floor(Math.random() * free.length)];
  const next = grid.map((r) => r.slice());
  next[y][x] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

/** Slide one row left, merging each pair once. Returns [row, pointsGained]. */
function slide(row) {
  const vals = row.filter(Boolean);
  const out = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === vals[i + 1]) {
      const merged = vals[i] * 2;
      out.push(merged);
      gained += merged;
      i++;                       // consume the partner; no chain merges
    } else {
      out.push(vals[i]);
    }
  }
  while (out.length < N) out.push(0);
  return [out, gained];
}

// Rotate so every direction can reuse the left-slide.
const rotate = (g) => g[0].map((_, x) => g.map((r) => r[x]).reverse());
const rotateN = (g, times) => {
  let out = g;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) out = rotate(out);
  return out;
};

function move(grid, dir) {
  const turns = { left: 0, up: 3, right: 2, down: 1 }[dir];
  let work = rotateN(grid, turns);
  let gained = 0;
  work = work.map((row) => {
    const [next, g] = slide(row);
    gained += g;
    return next;
  });
  const result = rotateN(work, 4 - turns);
  const moved = JSON.stringify(result) !== JSON.stringify(grid);
  return { grid: result, gained, moved };
}

const canMove = (g) =>
  ['left', 'right', 'up', 'down'].some((d) => move(g, d).moved);

export default function Twenty48({ onExit }) {
  const [grid, setGrid] = useState(() => spawn(spawn(emptyGrid())));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(null);
  const [won, setWon] = useState(false);
  const [keepGoing, setKeepGoing] = useState(false);

  useEffect(() => { getBest('2048').then(setBest); }, []);

  const restart = useCallback(() => {
    setGrid(spawn(spawn(emptyGrid())));
    setScore(0);
    setWon(false);
    setKeepGoing(false);
  }, []);

  const dead = !canMove(grid);

  const onSwipe = useCallback((dir) => {
    if (won && !keepGoing) return;
    setGrid((cur) => {
      const { grid: next, gained, moved } = move(cur, dir);
      if (!moved) return cur;
      play(gained ? 'merge' : 'move');
      if (gained) setScore((n) => n + gained);
      if (!keepGoing && next.some((r) => r.some((v) => v >= 2048))) setWon(true);
      return spawn(next);
    });
  }, [won, keepGoing]);

  const swipe = useSwipe(onSwipe);

  useEffect(() => {
    if (!dead && !(won && !keepGoing)) return;
    submitScore('2048', score).then((better) => { if (better) setBest(score); });
  }, [dead, won, keepGoing, score]);

  return (
    <GameFrame
      title="2048"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'SCORE', value: score, color: T.amber },
        { label: 'BEST', value: best ?? '—' },
      ]}
    >
      <View {...swipe} style={{ alignItems: 'center' }}>
        <View style={[s.board, { width: BOARD, height: BOARD }]}>
          {grid.map((row, y) =>
            row.map((v, x) => {
              const [bg, fg] = tileStyle(v);
              return (
                <Pop
                  key={`${x}-${y}`}
                  trigger={v}
                  from={v ? 0.7 : 1}
                  style={[
                    s.tile,
                    {
                      width: CELL, height: CELL,
                      left: GAP + x * (CELL + GAP),
                      top: GAP + y * (CELL + GAP),
                      backgroundColor: v ? bg : '#1C2431',
                    },
                  ]}
                >
                  {!!v && (
                    <Text
                      style={[
                        s.tileText,
                        { color: fg, fontSize: v >= 1024 ? 22 : v >= 128 ? 27 : 31 },
                      ]}
                    >
                      {v}
                    </Text>
                  )}
                </Pop>
              );
            })
          )}
        </View>
        <Text style={s.hint}>Swipe to combine matching tiles</Text>

        {won && !keepGoing && (
          <Banner title="2048!" tint={T.amber} detail={`Reached it with ${score} points.`}>
            <View style={{ marginTop: 14, alignSelf: 'stretch', gap: 8 }}>
              <Btn label="Keep going" icon="arrow-forward" color={T.cyan}
                   onPress={() => setKeepGoing(true)} />
              <Btn label="New game" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}

        {dead && !(won && !keepGoing) && (
          <Banner title="No moves left" tint={T.red} detail={`Final score ${score}.`}>
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
  board: { backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border },
  tile: { position: 'absolute', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontWeight: '900' },
  hint: { color: T.dim, fontSize: 12, marginTop: 12 },
});
