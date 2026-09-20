import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Banner, Btn, GameFrame, Pop, WIN } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const N = 5;
const GAP = 9;
const BOARD = Math.min(WIN.width - 36, 360);
const CELL = (BOARD - GAP * (N - 1)) / N;

const idx = (r, c) => r * N + c;

/** A press flips the cell and its orthogonal neighbours. */
function press(grid, r, c) {
  const next = grid.slice();
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nc >= 0 && nr < N && nc < N) next[idx(nr, nc)] = !next[idx(nr, nc)];
  });
  return next;
}

/**
 * Scramble from the solved board by pressing random cells. Any position built
 * this way is solvable, which a random fill would not be.
 */
function scramble(presses = 12) {
  let grid = Array(N * N).fill(false);
  for (let i = 0; i < presses; i++) {
    grid = press(grid, Math.floor(Math.random() * N), Math.floor(Math.random() * N));
  }
  // A board that scrambles back to solved would be no puzzle at all.
  return grid.some(Boolean) ? grid : scramble(presses);
}

export default function LightsOut({ onExit }) {
  const { T, s } = useTheme(makeStyles);
  const [grid, setGrid] = useState(scramble);
  const [moves, setMoves] = useState(0);
  const [best, setBest] = useState(null);

  const won = !grid.some(Boolean);

  useEffect(() => { getBest('lightsout').then(setBest); }, []);

  const restart = useCallback(() => {
    setGrid(scramble());
    setMoves(0);
  }, []);

  const tap = useCallback((r, c) => {
    if (won) return;
    play('select');
    setGrid((cur) => press(cur, r, c));
    setMoves((n) => n + 1);
  }, [won]);

  useEffect(() => {
    if (!won || moves === 0) return;
    fx('win', 'success');
    submitScore('lightsout', moves, false).then((b) => { if (b) setBest(moves); });
  }, [won, moves]);

  const lit = grid.filter(Boolean).length;

  return (
    <GameFrame
      title="Lights Out"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'MOVES', value: moves, color: T.amber },
        { label: 'LIT', value: lit },
        { label: 'BEST', value: best != null ? `${best} mv` : '—' },
      ]}
      footer={<Text style={s.hint}>A tap flips that light and its neighbours</Text>}
    >
      <View style={{ width: BOARD }}>
        <View style={s.board}>
          {Array.from({ length: N }).map((_, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
              {Array.from({ length: N }).map((__, c) => {
                const on = grid[idx(r, c)];
                return (
                  <Pop key={c} trigger={on} from={0.85} style={{ width: CELL, height: CELL }}>
                    <Pressable
                      onPress={() => tap(r, c)}
                      style={[s.cell, on ? s.on : s.off]}
                    />
                  </Pop>
                );
              })}
            </View>
          ))}
        </View>

        {won && moves > 0 && (
          <Banner title="Lights out!" tint={T.green} detail={`Cleared in ${moves} moves.`}>
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="New board" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

const makeStyles = (T) => StyleSheet.create({
  board: { alignItems: 'center' },
  cell: { flex: 1, borderRadius: 12, borderWidth: 1.5 },
  // shadowOffset is given explicitly: without it iOS renders the shadow
  // offscreen and composites it, which is wasted work on 25 cells that all
  // change together.
  on: {
    backgroundColor: T.amber + '33', borderColor: T.amber,
    shadowColor: T.amber, shadowOpacity: 0.6, shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  off: { backgroundColor: T.card, borderColor: T.border },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
