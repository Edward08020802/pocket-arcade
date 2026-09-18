import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { T } from '../theme';
import { Banner, Btn, GameFrame, WIN, useTicker } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const SIZE = Math.min(WIN.width - 24, 400);
const CELL = Math.floor(SIZE / 9);

const idx = (r, c) => r * 9 + c;

function allowed(board, r, c, n) {
  for (let i = 0; i < 9; i++) {
    if (board[idx(r, i)] === n || board[idx(i, c)] === n) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (board[idx(br + y, bc + x)] === n) return false;
    }
  }
  return true;
}

const shuffled = (a) => {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Fill an empty grid by backtracking in a random order -> a random solution. */
function solve(board, randomise = false) {
  const i = board.indexOf(0);
  if (i === -1) return true;
  const r = Math.floor(i / 9);
  const c = i % 9;
  const order = randomise ? shuffled([1,2,3,4,5,6,7,8,9]) : [1,2,3,4,5,6,7,8,9];
  for (const n of order) {
    if (!allowed(board, r, c, n)) continue;
    board[i] = n;
    if (solve(board, randomise)) return true;
    board[i] = 0;
  }
  return false;
}

/** Counts solutions, stopping at 2 -- all we need is "is it still unique". */
function countSolutions(board, cap = 2) {
  const i = board.indexOf(0);
  if (i === -1) return 1;
  const r = Math.floor(i / 9);
  const c = i % 9;
  let total = 0;
  for (let n = 1; n <= 9; n++) {
    if (!allowed(board, r, c, n)) continue;
    board[i] = n;
    total += countSolutions(board, cap);
    board[i] = 0;
    if (total >= cap) break;
  }
  return total;
}

const DIFFICULTY = { Easy: 40, Medium: 32, Hard: 26 };

/** Dig cells out of a full solution, keeping the puzzle uniquely solvable. */
function generate(clues) {
  const solution = new Array(81).fill(0);
  solve(solution, true);
  const puzzle = solution.slice();
  const cells = shuffled([...Array(81).keys()]);
  let remaining = 81;
  for (const i of cells) {
    if (remaining <= clues) break;
    const saved = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle.slice()) !== 1) puzzle[i] = saved;
    else remaining--;
  }
  return { puzzle, solution };
}

export default function Sudoku({ onExit }) {
  const [level, setLevel] = useState('Easy');
  const [{ puzzle, solution }, setGame] = useState(() => generate(DIFFICULTY.Easy));
  const [cells, setCells] = useState(() => puzzleCells(puzzle));
  const [pick, setPick] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [best, setBest] = useState(null);

  function puzzleCells(p) {
    return p.map((v) => ({ value: v, fixed: v !== 0 }));
  }

  const done = cells.every((c, i) => c.value === solution[i]);

  useEffect(() => { getBest(`sudoku-${level}`).then(setBest); }, [level]);
  useTicker(() => setSeconds((n) => n + 1), done ? null : 1000);

  const newGame = useCallback((lv) => {
    const g = generate(DIFFICULTY[lv]);
    setGame(g);
    setCells(puzzleCells(g.puzzle));
    setPick(null);
    setSeconds(0);
    setLevel(lv);
  }, []);

  useEffect(() => {
    if (!done) return;
    fx('win', 'success');
    submitScore(`sudoku-${level}`, seconds, false).then((b) => { if (b) setBest(seconds); });
  }, [done, seconds, level]);

  const enter = useCallback((n) => {
    if (pick == null) return;
    setCells((prev) => {
      if (prev[pick].fixed) return prev;
      const next = prev.slice();
      const value = next[pick].value === n ? 0 : n;
      // A wrong digit is allowed -- it just sounds wrong and shows red.
      if (value === 0) play('move');
      else if (value === solution[pick]) play('place');
      else fx('error', 'warning');
      next[pick] = { ...next[pick], value };
      return next;
    });
  }, [pick]);

  const wrong = (i) => cells[i].value !== 0 && cells[i].value !== solution[i];
  const pickedValue = pick != null ? cells[pick].value : 0;

  return (
    <GameFrame
      title="Sudoku"
      onExit={onExit}
      onRestart={() => newGame(level)}
      stats={[
        { label: 'LEVEL', value: level, color: T.violet },
        { label: 'TIME', value: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` },
        { label: 'BEST', value: best != null ? `${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}` : '—' },
      ]}
      footer={
        <>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1,2,3,4,5,6,7,8,9].map((n) => (
              <Pressable
                key={n}
                onPress={() => enter(n)}
                style={({ pressed }) => [s.key, pressed && { opacity: 0.6 }]}
              >
                <Text style={s.keyText}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Object.keys(DIFFICULTY).map((lv) => (
              <Btn
                key={lv}
                label={lv}
                flex={1}
                color={lv === level ? T.violet : T.dim}
                onPress={() => newGame(lv)}
              />
            ))}
          </View>
        </>
      }
    >
      <View style={s.board}>
        {Array.from({ length: 9 }).map((_, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {Array.from({ length: 9 }).map((__, c) => {
              const i = idx(r, c);
              const cell = cells[i];
              const selected = pick === i;
              const peer = pick != null && (Math.floor(pick / 9) === r || pick % 9 === c);
              const same = pickedValue !== 0 && cell.value === pickedValue;
              return (
                <Pressable
                  key={c}
                  onPress={() => { play('select'); setPick(i); }}
                  style={[
                    s.cell,
                    { width: CELL, height: CELL },
                    peer && s.peer,
                    same && s.same,
                    selected && s.selected,
                    c % 3 === 2 && c !== 8 && s.rightEdge,
                    r % 3 === 2 && r !== 8 && s.bottomEdge,
                  ]}
                >
                  {cell.value !== 0 && (
                    <Text
                      style={[
                        s.num,
                        { fontSize: CELL * 0.52 },
                        cell.fixed ? s.fixed : s.userNum,
                        wrong(i) && { color: T.red },
                      ]}
                    >
                      {cell.value}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        {done && (
          <Banner title="Solved!" tint={T.green}
                  detail={`${level} in ${Math.floor(seconds / 60)}m ${seconds % 60}s.`}>
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="New puzzle" icon="refresh" color={T.green} onPress={() => newGame(level)} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

const s = StyleSheet.create({
  board: {
    backgroundColor: T.card, borderRadius: 10, overflow: 'hidden',
    borderWidth: 2, borderColor: T.border,
  },
  cell: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5, borderColor: '#2A3240', backgroundColor: '#0F1420',
  },
  rightEdge: { borderRightWidth: 2, borderRightColor: T.border },
  bottomEdge: { borderBottomWidth: 2, borderBottomColor: T.border },
  peer: { backgroundColor: '#151C2A' },
  same: { backgroundColor: '#1D2A3A' },
  selected: { backgroundColor: T.cyan + '33' },
  num: { fontWeight: '800' },
  fixed: { color: T.text },
  userNum: { color: T.cyan },
  key: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12,
    backgroundColor: T.card, borderRadius: 9, borderWidth: 1, borderColor: T.border,
  },
  keyText: { color: T.text, fontSize: 19, fontWeight: '800' },
});
