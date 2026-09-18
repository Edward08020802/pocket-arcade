import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { T } from '../theme';
import { Banner, Btn, GameFrame, WIN } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';
import {
  BLACK, WHITE, chooseMove, colorOf, gameStatus, indexToSquare, initialPosition,
  inCheck, kingSquare, legalMoves, makeMove, typeOf,
} from './chess-engine';

const BOARD = Math.min(WIN.width - 20, 400);
const CELL = BOARD / 8;

const GLYPH = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

/**
 * Strength settings.
 *
 * The Elo figures are rough approximations, NOT measured ratings -- nothing
 * here has been played against rated opposition. They describe the ballpark
 * each setting plays at, set by search depth, a per-move time budget and a
 * blunder rate. Because the search is time-capped, the top level is also a
 * little weaker on a slow device than a fast one.
 *
 * A shallow search alone still never hangs a piece to a one-move tactic, which
 * does not resemble a weak human at all, so the easier levels discard their
 * best move some of the time instead.
 */
const LEVELS = [
  { name: 'Beginner', elo: '~400',  depth: 1, blunder: 0.60, budget: 400 },
  { name: 'Casual',   elo: '~700',  depth: 2, blunder: 0.35, budget: 700 },
  { name: 'Club',     elo: '~1000', depth: 2, blunder: 0.12, budget: 1200 },
  { name: 'Strong',   elo: '~1300', depth: 3, blunder: 0.04, budget: 2200 },
  { name: 'Expert',   elo: '~1600', depth: 5, blunder: 0,    budget: 3500 },
];

const MATERIAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function materialEdge(board) {
  let edge = 0;
  board.forEach((p) => {
    if (!p) return;
    edge += (colorOf(p) === WHITE ? 1 : -1) * MATERIAL[typeOf(p)];
  });
  return edge;
}

export default function Chess({ onExit }) {
  const [levelIndex, setLevelIndex] = useState(2);
  const [pos, setPos] = useState(initialPosition);
  const [history, setHistory] = useState([]);
  const [from, setFrom] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [best, setBest] = useState(null);

  const level = LEVELS[levelIndex];
  const status = useMemo(() => gameStatus(pos), [pos]);
  const over = status !== 'playing';
  const yourTurn = pos.turn === WHITE && !over;

  useEffect(() => { getBest('chess').then(setBest); }, []);

  const moves = useMemo(() => (yourTurn ? legalMoves(pos) : []), [pos, yourTurn]);
  const targets = useMemo(
    () => (from == null ? [] : moves.filter((m) => m.from === from)),
    [moves, from]
  );

  const restart = useCallback(() => {
    setPos(initialPosition());
    setHistory([]);
    setFrom(null);
    setLastMove(null);
  }, []);

  const applyMove = useCallback((move, current) => {
    const next = makeMove(current, move);
    setHistory((h) => [...h, current]);
    setPos(next);
    setLastMove(move);
    if (move.promo) fx('merge', 'success');
    else if (next.captured) fx('place', 'medium');
    else play('move');
    return next;
  }, []);

  // The engine runs on a timer so the board repaints with the player's move
  // first -- otherwise the UI freezes mid-search and the move appears late.
  useEffect(() => {
    if (pos.turn !== BLACK || over) return undefined;
    setThinking(true);
    const id = setTimeout(() => {
      const move = chooseMove(pos, {
        depth: level.depth, blunder: level.blunder, budgetMs: level.budget,
      });
      setThinking(false);
      if (move) applyMove(move, pos);
    }, 120);
    return () => { clearTimeout(id); setThinking(false); };
  }, [pos, over, level, applyMove]);

  useEffect(() => {
    if (status === 'checkmate') {
      const youWon = pos.turn === BLACK;
      fx(youWon ? 'win' : 'lose', youWon ? 'success' : 'error');
      if (youWon) {
        submitScore('chess', levelIndex + 1).then((b) => { if (b) setBest(levelIndex + 1); });
      }
    } else if (over) {
      play('move');
    }
  }, [status]);

  const tap = useCallback((square) => {
    if (!yourTurn) return;
    const move = targets.find((m) => m.to === square);
    if (move) {
      // Promotion is always to a queen: underpromotion matters so rarely that a
      // picker on every pawn push would cost more than it gains.
      const chosen = move.promo ? targets.find((m) => m.to === square && m.promo === 'q') : move;
      setFrom(null);
      applyMove(chosen, pos);
      return;
    }
    const piece = pos.board[square];
    if (piece && colorOf(piece) === WHITE) {
      play('select');
      setFrom(square);
    } else {
      setFrom(null);
    }
  }, [yourTurn, targets, pos, applyMove]);

  const undo = useCallback(() => {
    if (!history.length) return;
    // Step back a full move where possible, so it is your turn again.
    const back = history.length >= 2 ? 2 : 1;
    setPos(history[history.length - back]);
    setHistory((h) => h.slice(0, h.length - back));
    setFrom(null);
    setLastMove(null);
    play('move');
  }, [history]);

  const checked = !over && inCheck(pos);
  const checkedSquare = checked ? kingSquare(pos.board, pos.turn) : -1;
  const edge = materialEdge(pos.board);

  const statusText =
    status === 'checkmate' ? (pos.turn === BLACK ? 'You win' : 'Checkmate')
    : status === 'stalemate' ? 'Stalemate'
    : status === 'insufficient' ? 'Draw'
    : status === 'fifty-move' ? 'Draw'
    : thinking ? 'Thinking' : checked ? 'Check' : yourTurn ? 'Your move' : '—';

  return (
    <GameFrame
      title="Chess"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'LEVEL', value: level.name, color: T.violet },
        { label: 'ELO', value: level.elo },
        { label: 'MATERIAL', value: edge === 0 ? 'even' : `${edge > 0 ? '+' : ''}${edge}`,
          color: edge > 0 ? T.green : edge < 0 ? T.red : T.dim },
        { label: 'STATUS', value: statusText, color: checked ? T.red : T.text },
      ]}
      footer={
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 6 }}>
            {LEVELS.map((lv, i) => (
              <Pressable
                key={lv.name}
                onPress={() => { play('select'); setLevelIndex(i); }}
                style={({ pressed }) => [
                  s.level,
                  i === levelIndex && { borderColor: T.violet, backgroundColor: T.violet + '1C' },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={[s.levelName, i === levelIndex && { color: T.violet }]}>{lv.name}</Text>
                <Text style={s.levelElo}>{lv.elo}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={s.eloNote}>Ratings are rough guides, not measured Elo</Text>
          <Btn label="Take back" icon="arrow-undo" color={T.dim}
               onPress={undo} disabled={!history.length || thinking} />
        </>
      }
    >
      <View style={s.boardWrap}>
        <View style={[s.board, { width: BOARD, height: BOARD }]}>
          {Array.from({ length: 64 }).map((_, i) => {
            const rank = Math.floor(i / 8);
            const file = i % 8;
            const dark = (rank + file) % 2 === 1;
            const piece = pos.board[i];
            const isTarget = targets.some((m) => m.to === i);
            const isFrom = from === i;
            const wasMove = lastMove && (lastMove.from === i || lastMove.to === i);
            return (
              <Pressable
                key={i}
                onPress={() => tap(i)}
                style={[
                  s.square,
                  { width: CELL, height: CELL, left: file * CELL, top: rank * CELL },
                  dark ? s.dark : s.light,
                  wasMove && s.lastMove,
                  isFrom && s.selected,
                  i === checkedSquare && s.inCheck,
                ]}
              >
                {!!piece && (
                  <Text style={[s.piece, colorOf(piece) === WHITE ? s.white : s.black]}>
                    {GLYPH[piece]}
                  </Text>
                )}
                {isTarget && !piece && <View style={s.dot} />}
                {isTarget && !!piece && <View style={s.captureRing} />}
              </Pressable>
            );
          })}
        </View>

        <Text style={s.coords}>
          {pos.turn === WHITE ? 'White to move' : 'Black to move'} · move {pos.full}
          {lastMove ? `  ·  last ${indexToSquare(lastMove.from)}${indexToSquare(lastMove.to)}` : ''}
        </Text>

        {thinking && (
          <View style={s.thinking}>
            <ActivityIndicator size="small" color={T.cyan} />
            <Text style={s.thinkingText}>{level.name} is thinking…</Text>
          </View>
        )}

        {over && (
          <Banner
            title={statusText}
            tint={status === 'checkmate' && pos.turn === BLACK ? T.green
                  : status === 'checkmate' ? T.red : T.dim}
            detail={
              status === 'checkmate'
                ? (pos.turn === BLACK ? `You beat ${level.name} (${level.elo}).` : `${level.name} wins.`)
                : status === 'stalemate' ? 'No legal moves, but not in check.'
                : status === 'insufficient' ? 'Neither side has enough material to mate.'
                : 'Fifty moves without a capture or pawn move.'
            }
          >
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="New game" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

const s = StyleSheet.create({
  boardWrap: { alignItems: 'center' },
  board: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
  square: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  light: { backgroundColor: '#3A4658' },
  dark: { backgroundColor: '#222C3C' },
  lastMove: { backgroundColor: '#4A5540' },
  selected: { backgroundColor: T.cyan + '55' },
  inCheck: { backgroundColor: T.red + '66' },
  piece: { fontSize: CELL * 0.78, lineHeight: CELL * 0.96 },
  white: { color: '#FFFFFF', textShadowColor: '#000', textShadowRadius: 2 },
  black: { color: '#10141C', textShadowColor: '#FFFFFF55', textShadowRadius: 1 },
  dot: {
    position: 'absolute', width: CELL * 0.26, height: CELL * 0.26,
    borderRadius: CELL, backgroundColor: '#FFFFFF66',
  },
  captureRing: {
    position: 'absolute', width: CELL * 0.92, height: CELL * 0.92,
    borderRadius: CELL, borderWidth: 3, borderColor: '#FFFFFF77',
  },
  coords: { color: T.dim, fontSize: 12, marginTop: 10 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  thinkingText: { color: T.dim, fontSize: 12 },
  level: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 11,
    backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: 'center',
  },
  levelName: { color: T.text, fontSize: 14, fontWeight: '800' },
  levelElo: { color: T.dim, fontSize: 10, marginTop: 1 },
  eloNote: { color: T.dim, fontSize: 11, textAlign: 'center' },
});
