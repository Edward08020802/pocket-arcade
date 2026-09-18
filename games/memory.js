import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, SPECTRUM } from '../theme';
import { Banner, Btn, GameFrame, WIN, useTicker } from '../ui';
import { getBest, submitScore } from '../storage';

const COLS = 4;
const ROWS = 5;                       // 20 cards = 10 pairs
const GAP = 8;
const BOARD = Math.min(WIN.width - 28, 380);
const CARD = (BOARD - GAP * (COLS - 1)) / COLS;

const FACES = [
  'planet', 'rocket', 'skull', 'paw', 'pizza', 'flower',
  'flash', 'heart', 'diamond', 'musical-notes',
];

function newDeck() {
  const pairs = FACES.slice(0, (COLS * ROWS) / 2);
  const cards = pairs.flatMap((icon, i) => [
    { id: `${i}a`, icon, pair: i },
    { id: `${i}b`, icon, pair: i },
  ]);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export default function Memory({ onExit }) {
  const [deck, setDeck] = useState(newDeck);
  const [up, setUp] = useState([]);           // indices currently face up
  const [done, setDone] = useState(() => new Set());
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [best, setBest] = useState(null);

  const won = done.size === deck.length;

  useEffect(() => { getBest('memory').then(setBest); }, []);
  useTicker(() => setSeconds((n) => n + 1), won ? null : 1000);

  const restart = useCallback(() => {
    setDeck(newDeck());
    setUp([]);
    setDone(new Set());
    setMoves(0);
    setSeconds(0);
  }, []);

  // A non-matching pair stays visible briefly, then flips back.
  useEffect(() => {
    if (up.length !== 2) return undefined;
    const [a, b] = up;
    if (deck[a].pair === deck[b].pair) {
      setDone((prev) => new Set([...prev, a, b]));
      setUp([]);
      return undefined;
    }
    const id = setTimeout(() => setUp([]), 750);
    return () => clearTimeout(id);
  }, [up, deck]);

  useEffect(() => {
    if (!won) return;
    submitScore('memory', moves, false).then((b) => { if (b) setBest(moves); });
  }, [won, moves]);

  const flip = useCallback((i) => {
    setUp((prev) => {
      if (prev.length >= 2 || prev.includes(i) || done.has(i)) return prev;
      if (prev.length === 1) setMoves((n) => n + 1);
      return [...prev, i];
    });
  }, [done]);

  return (
    <GameFrame
      title="Memory"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'MOVES', value: moves, color: T.pink },
        { label: 'PAIRS', value: `${done.size / 2}/${deck.length / 2}` },
        { label: 'BEST', value: best != null ? `${best} mv` : '—' },
      ]}
      footer={<Text style={s.hint}>Find every pair in as few moves as you can</Text>}
    >
      <View style={[s.board, { width: BOARD }]}>
        {deck.map((card, i) => {
          const shown = up.includes(i) || done.has(i);
          const tint = SPECTRUM[card.pair % SPECTRUM.length];
          return (
            <Pressable
              key={card.id}
              onPress={() => flip(i)}
              style={[
                s.card,
                { width: CARD, height: CARD },
                shown
                  ? { backgroundColor: tint + '22', borderColor: tint }
                  : s.faceDown,
                done.has(i) && { opacity: 0.45 },
              ]}
            >
              {shown ? (
                <Ionicons name={card.icon} size={CARD * 0.44} color={tint} />
              ) : (
                <Ionicons name="help" size={CARD * 0.3} color={T.dim} />
              )}
            </Pressable>
          );
        })}

        {won && (
          <Banner title="All matched!" tint={T.green} detail={`${moves} moves · ${seconds}s.`}>
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="Shuffle again" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

const s = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, justifyContent: 'center' },
  card: { borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  faceDown: { backgroundColor: T.card, borderColor: T.border },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
