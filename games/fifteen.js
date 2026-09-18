import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Banner, Btn, GameFrame, Pop, WIN, useTicker } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const N = 4;
const GAP = 7;
const BOARD = Math.min(WIN.width - 32, 380);
const CELL = (BOARD - GAP * (N + 1)) / N;
const SOLVED = [...Array(N * N - 1).keys()].map((i) => i + 1).concat(0);

const where = (tiles, v) => tiles.indexOf(v);
const rc = (i) => [Math.floor(i / N), i % N];

/** Legal only from a tile orthogonally adjacent to the hole. */
function slide(tiles, i) {
  const hole = where(tiles, 0);
  const [r1, c1] = rc(i);
  const [r2, c2] = rc(hole);
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return null;
  const next = tiles.slice();
  next[hole] = next[i];
  next[i] = 0;
  return next;
}

/**
 * Shuffle by walking the hole at random. Dealing the tiles randomly would give
 * an unsolvable board half the time; every position reachable by legal moves is
 * solvable by definition.
 */
function shuffle(steps = 200) {
  let tiles = SOLVED.slice();
  let last = -1;
  for (let n = 0; n < steps; n++) {
    const hole = where(tiles, 0);
    const [hr, hc] = rc(hole);
    const options = [];
    for (let i = 0; i < N * N; i++) {
      const [r, c] = rc(i);
      if (Math.abs(r - hr) + Math.abs(c - hc) === 1 && i !== last) options.push(i);
    }
    const pick = options[Math.floor(Math.random() * options.length)];
    last = hole;
    tiles = slide(tiles, pick);
  }
  return tiles;
}

const isSolved = (t) => t.every((v, i) => v === SOLVED[i]);

export default function Fifteen({ onExit }) {
  const { T, s } = useTheme(makeStyles);
  const [tiles, setTiles] = useState(shuffle);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [best, setBest] = useState(null);

  const won = isSolved(tiles);

  useEffect(() => { getBest('fifteen').then(setBest); }, []);
  useTicker(() => setSeconds((n) => n + 1), won ? null : 1000);

  const restart = useCallback(() => {
    setTiles(shuffle());
    setMoves(0);
    setSeconds(0);
  }, []);

  const tap = useCallback((i) => {
    if (won) return;
    setTiles((cur) => {
      const next = slide(cur, i);
      if (!next) { play('error'); return cur; }
      play('move');
      setMoves((n) => n + 1);
      return next;
    });
  }, [won]);

  useEffect(() => {
    if (!won || moves === 0) return;
    fx('win', 'success');
    submitScore('fifteen', moves, false).then((b) => { if (b) setBest(moves); });
  }, [won, moves]);

  return (
    <GameFrame
      title="15 Puzzle"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'MOVES', value: moves, color: T.cyan },
        { label: 'TIME', value: `${seconds}s` },
        { label: 'BEST', value: best != null ? `${best} mv` : '—' },
      ]}
      footer={<Text style={s.hint}>Tap a tile beside the gap to slide it</Text>}
    >
      <View style={[s.board, { width: BOARD, height: BOARD }]}>
        {tiles.map((v, i) => {
          if (v === 0) return null;
          const [r, c] = rc(i);
          return (
            <Pop
              key={v}
              trigger={i}
              from={0.92}
              style={[
                s.tile,
                {
                  width: CELL, height: CELL,
                  left: GAP + c * (CELL + GAP),
                  top: GAP + r * (CELL + GAP),
                },
              ]}
            >
              <Pressable onPress={() => tap(i)} style={s.fill}>
                <Text style={[s.num, v === SOLVED[i] && { color: T.green }]}>{v}</Text>
              </Pressable>
            </Pop>
          );
        })}

        {won && moves > 0 && (
          <Banner title="Solved!" tint={T.green} detail={`${moves} moves in ${seconds}s.`}>
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="Shuffle again" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

const makeStyles = (T) => StyleSheet.create({
  board: { backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border },
  tile: { position: 'absolute', borderRadius: 10, backgroundColor: T.cardHi,
          borderWidth: 1, borderColor: T.border },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  num: { color: T.text, fontSize: CELL * 0.4, fontWeight: '900' },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
