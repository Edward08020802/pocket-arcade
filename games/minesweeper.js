import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '../theme';
import { Banner, Btn, GameFrame, WIN, useTicker } from '../ui';
import { getBest, submitScore } from '../storage';

const COLS = 9;
const ROWS = 12;
const MINES = 16;
const CELL = Math.floor(Math.min(WIN.width - 28, 400) / COLS);

const NUM_COLOR = [
  null, T.cyan, T.green, T.amber, T.violet, T.pink, T.red, T.lime, T.dim,
];

const key = (x, y) => `${x},${y}`;

function neighbours(x, y) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS) out.push([nx, ny]);
    }
  }
  return out;
}

/**
 * Mines are laid after the first tap, with that cell and its neighbours
 * excluded -- so the opening move always breaks into open space instead of
 * ending the game on click one.
 */
function layMines(safeX, safeY) {
  const banned = new Set([key(safeX, safeY), ...neighbours(safeX, safeY).map(([x, y]) => key(x, y))]);
  const cells = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (!banned.has(key(x, y))) cells.push([x, y]);
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const mines = new Set(cells.slice(0, MINES).map(([x, y]) => key(x, y)));
  const counts = {};
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      counts[key(x, y)] = mines.has(key(x, y))
        ? -1
        : neighbours(x, y).filter(([nx, ny]) => mines.has(key(nx, ny))).length;
    }
  }
  return { mines, counts };
}

export default function Minesweeper({ onExit }) {
  const [field, setField] = useState(null);       // null until the first tap
  const [revealed, setRevealed] = useState(() => new Set());
  const [flags, setFlags] = useState(() => new Set());
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [best, setBest] = useState(null);

  useEffect(() => { getBest('minesweeper').then(setBest); }, []);

  const running = !!field && !dead && !won;
  useTicker(() => setSeconds((n) => n + 1), running ? 1000 : null);

  const restart = useCallback(() => {
    setField(null);
    setRevealed(new Set());
    setFlags(new Set());
    setDead(false);
    setWon(false);
    setSeconds(0);
  }, []);

  const reveal = useCallback((x, y) => {
    if (dead || won || flags.has(key(x, y))) return;

    const f = field || layMines(x, y);
    if (!field) setField(f);

    if (f.counts[key(x, y)] === -1) {
      setRevealed((prev) => new Set([...prev, ...f.mines]));
      setDead(true);
      return;
    }

    // Flood outward from any zero, so a tap in open space clears the region.
    const next = new Set(revealed);
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const k = key(cx, cy);
      if (next.has(k) || flags.has(k)) continue;
      next.add(k);
      if (f.counts[k] === 0) {
        neighbours(cx, cy).forEach(([nx, ny]) => {
          if (!next.has(key(nx, ny))) stack.push([nx, ny]);
        });
      }
    }
    setRevealed(next);
    if (next.size === COLS * ROWS - MINES) setWon(true);
  }, [field, revealed, flags, dead, won]);

  const toggleFlag = useCallback((x, y) => {
    if (dead || won || revealed.has(key(x, y))) return;
    setFlags((prev) => {
      const next = new Set(prev);
      const k = key(x, y);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, [dead, won, revealed]);

  useEffect(() => {
    if (!won) return;
    submitScore('minesweeper', seconds, false).then((better) => {
      if (better) setBest(seconds);
    });
  }, [won, seconds]);

  const left = MINES - flags.size;
  const grid = useMemo(() => Array.from({ length: ROWS }, (_, y) => y), []);

  return (
    <GameFrame
      title="Minesweeper"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'MINES', value: left, color: left < 0 ? T.red : T.text },
        { label: 'TIME', value: `${seconds}s` },
        { label: 'BEST', value: best != null ? `${best}s` : '—' },
      ]}
      footer={<Text style={s.hint}>Tap to clear · hold to flag</Text>}
    >
      <View style={s.board}>
        {grid.map((y) => (
          <View key={y} style={{ flexDirection: 'row' }}>
            {Array.from({ length: COLS }).map((_, x) => {
              const k = key(x, y);
              const isUp = revealed.has(k);
              const isFlag = flags.has(k);
              const n = field ? field.counts[k] : 0;
              const isMine = isUp && n === -1;
              return (
                <Pressable
                  key={x}
                  onPress={() => reveal(x, y)}
                  onLongPress={() => toggleFlag(x, y)}
                  delayLongPress={220}
                  style={[
                    s.cell,
                    { width: CELL, height: CELL },
                    isUp ? s.open : s.closed,
                    isMine && { backgroundColor: T.red + '44' },
                  ]}
                >
                  {isMine ? (
                    <Ionicons name="nuclear" size={CELL * 0.5} color={T.red} />
                  ) : isFlag && !isUp ? (
                    <Ionicons name="flag" size={CELL * 0.45} color={T.amber} />
                  ) : isUp && n > 0 ? (
                    <Text style={[s.num, { color: NUM_COLOR[n], fontSize: CELL * 0.5 }]}>
                      {n}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        {(dead || won) && (
          <Banner
            title={won ? 'Cleared!' : 'Boom'}
            tint={won ? T.green : T.red}
            detail={won ? `All ${MINES} mines found in ${seconds}s.` : 'You hit a mine.'}
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
    backgroundColor: T.card, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: T.border,
  },
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#0B0D1255' },
  closed: { backgroundColor: T.cardHi },
  open: { backgroundColor: '#0F1420' },
  num: { fontWeight: '900' },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
