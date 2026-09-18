import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Banner, Btn, GameFrame, WIN, useTicker } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const COLS = 10;
const ROWS = 18;
const CELL = Math.floor(Math.min(WIN.width - 120, 260) / COLS);

// Each shape as a square matrix so rotation is a plain transpose+reverse.
const SHAPES = {
  I: { color: '#38BDF8', cells: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
  O: { color: '#FBBF24', cells: [[1,1],[1,1]] },
  T: { color: '#A78BFA', cells: [[0,1,0],[1,1,1],[0,0,0]] },
  S: { color: '#22D38A', cells: [[0,1,1],[1,1,0],[0,0,0]] },
  Z: { color: '#F4547A', cells: [[1,1,0],[0,1,1],[0,0,0]] },
  J: { color: '#60A5FA', cells: [[1,0,0],[1,1,1],[0,0,0]] },
  L: { color: '#F472B6', cells: [[0,0,1],[1,1,1],[0,0,0]] },
};
const KEYS = Object.keys(SHAPES);

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
const rotateCW = (m) => m[0].map((_, x) => m.map((row) => row[x]).reverse());
const randomPiece = () => {
  const k = KEYS[Math.floor(Math.random() * KEYS.length)];
  return { key: k, cells: SHAPES[k].cells, color: SHAPES[k].color };
};

function collides(board, cells, ox, oy) {
  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y].length; x++) {
      if (!cells[y][x]) continue;
      const bx = ox + x;
      const by = oy + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

function merge(board, piece, ox, oy) {
  const next = board.map((r) => r.slice());
  piece.cells.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v && oy + y >= 0) next[oy + y][ox + x] = piece.color;
    })
  );
  return next;
}

function clearLines(board) {
  const kept = board.filter((row) => row.some((c) => !c));
  const cleared = ROWS - kept.length;
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  return { board: kept, cleared };
}

const LINE_SCORE = [0, 100, 300, 500, 800];
const spawnX = (cells) => Math.floor((COLS - cells[0].length) / 2);

export default function Tetris({ onExit }) {
  const { T, s } = useTheme(makeStyles);
  const [board, setBoard] = useState(emptyBoard);
  const [piece, setPiece] = useState(randomPiece);
  const [next, setNext] = useState(randomPiece);
  const [pos, setPos] = useState(() => ({ x: 3, y: -1 }));
  const [lines, setLines] = useState(0);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState(null);

  useEffect(() => { getBest('tetris').then(setBest); }, []);

  // The tick reads current values through refs so its identity stays stable.
  const st = useRef({});
  st.current = { board, piece, next, pos, over, paused };

  const restart = useCallback(() => {
    const p = randomPiece();
    setBoard(emptyBoard());
    setPiece(p);
    setNext(randomPiece());
    setPos({ x: spawnX(p.cells), y: -1 });
    setLines(0);
    setScore(0);
    setOver(false);
    setPaused(false);
  }, []);

  const lock = useCallback((b, p, x, y) => {
    const merged = merge(b, p, x, y);
    const { board: cleaned, cleared } = clearLines(merged);
    if (cleared) {
      fx(cleared === 4 ? 'win' : 'clear', cleared === 4 ? 'success' : 'medium');
      setLines((n) => n + cleared);
      setScore((n) => n + LINE_SCORE[cleared]);
    } else {
      play('place');
    }
    const upcoming = st.current.next;
    const nx = spawnX(upcoming.cells);
    if (collides(cleaned, upcoming.cells, nx, -1)) {
      fx('lose', 'error');
      setBoard(cleaned);
      setOver(true);
      return;
    }
    setBoard(cleaned);
    setPiece(upcoming);
    setNext(randomPiece());
    setPos({ x: nx, y: -1 });
  }, []);

  const step = useCallback(() => {
    const { board: b, piece: p, pos: c, over: o, paused: pa } = st.current;
    if (o || pa) return;
    if (!collides(b, p.cells, c.x, c.y + 1)) setPos({ x: c.x, y: c.y + 1 });
    else lock(b, p, c.x, c.y);
  }, [lock]);

  const level = Math.floor(lines / 10) + 1;
  useTicker(step, over || paused ? null : Math.max(90, 620 - (level - 1) * 55));

  const shift = useCallback((dx) => {
    const { board: b, piece: p, pos: c, over: o, paused: pa } = st.current;
    if (o || pa) return;
    if (!collides(b, p.cells, c.x + dx, c.y)) {
      play('move');
      setPos({ x: c.x + dx, y: c.y });
    }
  }, []);

  const spin = useCallback(() => {
    const { board: b, piece: p, pos: c, over: o, paused: pa } = st.current;
    if (o || pa) return;
    const turned = rotateCW(p.cells);
    // Wall kicks: try in place, then nudged one or two cells off the wall.
    for (const dx of [0, -1, 1, -2, 2]) {
      if (!collides(b, turned, c.x + dx, c.y)) {
        play('select');
        setPiece({ ...p, cells: turned });
        setPos({ x: c.x + dx, y: c.y });
        return;
      }
    }
  }, []);

  const drop = useCallback(() => {
    const { board: b, piece: p, pos: c, over: o, paused: pa } = st.current;
    if (o || pa) return;
    let y = c.y;
    while (!collides(b, p.cells, c.x, y + 1)) y++;
    fx('drop', 'medium');
    setScore((n) => n + (y - c.y) * 2);
    lock(b, p, c.x, y);
  }, [lock]);

  useEffect(() => {
    if (!over) return;
    submitScore('tetris', score).then((better) => { if (better) setBest(score); });
  }, [over, score]);

  // Ghost: where the piece would land, so drops are predictable on a small screen.
  let ghostY = pos.y;
  while (!collides(board, piece.cells, pos.x, ghostY + 1)) ghostY++;

  const view = board.map((r) => r.slice());
  piece.cells.forEach((row, y) =>
    row.forEach((v, x) => {
      if (!v) return;
      const gy = ghostY + y;
      if (gy >= 0 && gy < ROWS && !view[gy][pos.x + x]) view[gy][pos.x + x] = 'ghost';
    })
  );
  piece.cells.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v && pos.y + y >= 0) view[pos.y + y][pos.x + x] = piece.color;
    })
  );

  return (
    <GameFrame
      title="Tetris"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'SCORE', value: score, color: T.cyan },
        { label: 'LINES', value: lines },
        { label: 'LEVEL', value: level },
        { label: 'BEST', value: best ?? '—' },
      ]}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pad icon="chevron-back" onPress={() => shift(-1)} />
          <Pad icon="sync" onPress={spin} color={T.violet} />
          <Pad icon="chevron-down" onPress={step} />
          <Pad icon="arrow-down" onPress={drop} color={T.amber} />
          <Pad icon="chevron-forward" onPress={() => shift(1)} />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <View style={s.board}>
          {view.map((row, y) => (
            <View key={y} style={{ flexDirection: 'row' }}>
              {row.map((c, x) => (
                <View
                  key={x}
                  style={[
                    { width: CELL, height: CELL },
                    s.cell,
                    c === 'ghost'
                      ? { backgroundColor: '#FFFFFF10', borderColor: '#FFFFFF22' }
                      : c
                        ? { backgroundColor: c }
                        : null,
                  ]}
                />
              ))}
            </View>
          ))}
        </View>

        <View style={{ gap: 10 }}>
          <Text style={s.sideLabel}>NEXT</Text>
          <View style={s.preview}>
            {next.cells.map((row, y) => (
              <View key={y} style={{ flexDirection: 'row' }}>
                {row.map((v, x) => (
                  <View
                    key={x}
                    style={{
                      width: 13, height: 13, margin: 1, borderRadius: 2,
                      backgroundColor: v ? next.color : 'transparent',
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
          <Btn
            label={paused ? 'Resume' : 'Pause'}
            icon={paused ? 'play' : 'pause'}
            color={T.amber}
            onPress={() => setPaused((p) => !p)}
            disabled={over}
          />
        </View>

        {over && (
          <Banner title="Game over" tint={T.red} detail={`${lines} lines · ${score} points.`}>
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="Play again" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

function Pad({ icon, onPress, color }) {
  const { T, s } = useTheme(makeStyles);
  const tint = color || T.cyan;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.pad, { borderColor: tint + '55' }, pressed && { opacity: 0.55 }]}
    >
      <Ionicons name={icon} size={22} color={tint} />
    </Pressable>
  );
}

const makeStyles = (T) => StyleSheet.create({
  board: {
    backgroundColor: T.well, borderRadius: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: T.border,
  },
  cell: { borderWidth: 0.5, borderColor: T.border + '55' },
  sideLabel: { color: T.dim, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  preview: {
    backgroundColor: T.card, borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: T.border, minHeight: 64, justifyContent: 'center',
  },
  pad: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: 13, borderWidth: 1, backgroundColor: T.card,
  },
});
