import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Banner, Btn, GameFrame, WIN } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const COLS = 7;
const ROWS = 6;
const CELL = Math.floor(Math.min(WIN.width - 30, 380) / COLS);
const YOU = 1;
const CPU = 2;

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
const firstFree = (b, c) => {
  for (let r = ROWS - 1; r >= 0; r--) if (!b[r][c]) return r;
  return -1;
};
const legalCols = (b) => [...Array(COLS).keys()].filter((c) => firstFree(b, c) >= 0);

function drop(b, c, who) {
  const r = firstFree(b, c);
  if (r < 0) return null;
  const next = b.map((row) => row.slice());
  next[r][c] = who;
  return next;
}

const LINES = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** The winning four, or null. Returned as cells so the board can highlight them. */
function winner(b) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const who = b[r][c];
      if (!who) continue;
      for (const [dr, dc] of LINES) {
        const cells = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS || b[nr][nc] !== who) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return { who, cells };
      }
    }
  }
  return null;
}

/** Score a window of four for the CPU: rewards its own runs, punishes yours. */
function scoreWindow(cells) {
  const mine = cells.filter((v) => v === CPU).length;
  const yours = cells.filter((v) => v === YOU).length;
  if (mine && yours) return 0;                 // blocked, worth nothing
  if (mine === 4) return 10000;
  if (yours === 4) return -10000;
  if (mine === 3) return 60;
  if (yours === 3) return -80;                 // blocking beats building
  if (mine === 2) return 8;
  if (yours === 2) return -10;
  return 0;
}

function evaluate(b) {
  let total = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of LINES) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || ec < 0 || er >= ROWS || ec >= COLS) continue;
        total += scoreWindow([0, 1, 2, 3].map((k) => b[r + dr * k][c + dc * k]));
      }
    }
  }
  // Central columns open more lines, so nudge the CPU toward the middle.
  for (let r = 0; r < ROWS; r++) {
    if (b[r][3] === CPU) total += 6;
    if (b[r][3] === YOU) total -= 6;
  }
  return total;
}

function minimax(b, depth, alpha, beta, maximising) {
  const win = winner(b);
  if (win) return { score: win.who === CPU ? 100000 - depth : -100000 + depth };
  const moves = legalCols(b);
  if (!depth || !moves.length) return { score: evaluate(b) };

  let bestCol = moves[0];
  if (maximising) {
    let value = -Infinity;
    for (const c of moves) {
      const { score } = minimax(drop(b, c, CPU), depth - 1, alpha, beta, false);
      if (score > value) { value = score; bestCol = c; }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return { score: value, col: bestCol };
  }
  let value = Infinity;
  for (const c of moves) {
    const { score } = minimax(drop(b, c, YOU), depth - 1, alpha, beta, true);
    if (score < value) { value = score; bestCol = c; }
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return { score: value, col: bestCol };
}

/**
 * Difficulty is search depth plus a blunder rate: at the easy end the CPU often
 * plays a random legal column instead of its best, which is a far more natural
 * kind of weakness than a shallow search alone (a depth-1 engine still never
 * misses an immediate win, which feels oddly sharp for an "easy" opponent).
 */
const LEVELS = {
  Easy: { depth: 1, blunder: 0.45 },
  Normal: { depth: 3, blunder: 0.15 },
  Hard: { depth: 5, blunder: 0 },
  Brutal: { depth: 7, blunder: 0 },
};

export default function ConnectFour({ onExit }) {
  const { T, s } = useTheme(makeStyles);
  const [board, setBoard] = useState(emptyBoard);
  const [turn, setTurn] = useState(YOU);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(null);
  const [level, setLevel] = useState('Normal');

  useEffect(() => { getBest(`connect4-${level}`).then(setBest); }, [level]);

  const win = winner(board);
  const full = legalCols(board).length === 0;
  const finished = !!win || full;

  const restart = useCallback(() => {
    setBoard(emptyBoard());
    setTurn(YOU);
  }, []);

  const changeLevel = useCallback((lv) => {
    setLevel(lv);
    setBoard(emptyBoard());
    setTurn(YOU);
    setStreak(0);
  }, []);

  const playerDrop = useCallback((c) => {
    if (finished || turn !== YOU) return;
    const next = drop(board, c, YOU);
    if (!next) { fx('error', 'warning'); return; }
    fx('drop', 'medium');
    setBoard(next);
    setTurn(CPU);
  }, [board, turn, finished]);

  // The CPU replies on a short delay so its move is visible as a move.
  useEffect(() => {
    if (turn !== CPU || finished) return undefined;
    const id = setTimeout(() => {
      const { depth, blunder } = LEVELS[level];
      const options = legalCols(board);
      let col;
      if (blunder > 0 && Math.random() < blunder) {
        col = options[Math.floor(Math.random() * options.length)];
      } else {
        col = minimax(board, depth, -Infinity, Infinity, true).col;
      }
      const next = drop(board, col ?? options[0], CPU);
      if (next) { play('drop'); setBoard(next); }
      setTurn(YOU);
    }, 320);
    return () => clearTimeout(id);
  }, [turn, board, finished, level]);

  useEffect(() => {
    if (!win) return;
    if (win.who === YOU) {
      fx('win', 'success');
      const n = streak + 1;
      setStreak(n);
      submitScore(`connect4-${level}`, n).then((b) => { if (b) setBest(n); });
    } else {
      fx('lose', 'error');
      setStreak(0);
    }
  }, [win]);

  const highlight = new Set((win?.cells || []).map(([r, c]) => `${r},${c}`));

  return (
    <GameFrame
      title="Connect Four"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'TURN', value: finished ? '—' : turn === YOU ? 'You' : 'CPU',
          color: turn === YOU ? T.amber : T.cyan },
        { label: 'LEVEL', value: level, color: T.violet },
        { label: 'STREAK', value: streak },
        { label: 'BEST', value: best ?? '—' },
      ]}
      footer={
        <>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Object.keys(LEVELS).map((lv) => (
              <Btn
                key={lv}
                label={lv}
                flex={1}
                color={lv === level ? T.violet : T.dim}
                onPress={() => changeLevel(lv)}
              />
            ))}
          </View>
          <Text style={s.hint}>Tap a column to drop · four in a row wins</Text>
        </>
      }
    >
      <View style={s.board}>
        {board.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {row.map((v, c) => (
              <Pressable
                key={c}
                onPress={() => playerDrop(c)}
                style={[s.cell, { width: CELL, height: CELL }]}
              >
                <Disc value={v} row={r} winning={highlight.has(`${r},${c}`)} />
              </Pressable>
            ))}
          </View>
        ))}

        {finished && (
          <Banner
            title={win ? (win.who === YOU ? 'You win!' : 'CPU wins') : 'Draw'}
            tint={win ? (win.who === YOU ? T.amber : T.cyan) : T.dim}
            detail={win && win.who === YOU ? `Streak: ${streak}` : undefined}
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

/**
 * One cell. When it goes from empty to filled it drops in from above its own
 * row, so the disc visibly falls the distance it would really fall, and a disc
 * in the winning four keeps pulsing.
 */
function Disc({ value, row, winning }) {
  const { T, s } = useTheme(makeStyles);
  const fall = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === 0 && value !== 0) {
      fall.setValue(-(row + 1) * CELL);
      Animated.timing(fall, {
        toValue: 0,
        duration: 120 + row * 45,
        easing: Easing.bounce,
        useNativeDriver: true,
      }).start();
    }
    prev.current = value;
  }, [value, row, fall]);

  useEffect(() => {
    if (!winning) { pulse.setValue(1); return undefined; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 380, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 380, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [winning, pulse]);

  return (
    <Animated.View
      style={[
        s.disc,
        { width: CELL * 0.78, height: CELL * 0.78, borderRadius: CELL },
        value === YOU && { backgroundColor: T.amber },
        value === CPU && { backgroundColor: T.cyan },
        winning && s.winning,
        { transform: [{ translateY: fall }, { scale: pulse }] },
      ]}
    />
  );
}

const makeStyles = (T) => StyleSheet.create({
  board: {
    backgroundColor: T.frame, borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: T.border,
  },
  cell: { alignItems: 'center', justifyContent: 'center' },
  disc: { backgroundColor: T.hole },
  winning: { borderWidth: 3, borderColor: T.text },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
