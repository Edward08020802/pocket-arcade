import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '../theme';
import { Banner, Btn, GameFrame, WIN } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const SUITS = [
  { key: 's', sym: '♠', red: false },
  { key: 'h', sym: '♥', red: true },
  { key: 'd', sym: '♦', red: true },
  { key: 'c', sym: '♣', red: false },
];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const GAP = 5;
const CARD_W = Math.floor((Math.min(WIN.width, 460) - GAP * 8) / 7);
const CARD_H = Math.round(CARD_W * 1.42);
const FAN = Math.round(CARD_H * 0.29);      // vertical overlap in the tableau

const cardId = (c) => `${c.rank}${c.suit}`;

function freshDeck() {
  const deck = [];
  SUITS.forEach((s) =>
    RANKS.forEach((r, i) => deck.push({ suit: s.key, red: s.red, rank: r, value: i + 1, up: false }))
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function deal() {
  const deck = freshDeck();
  const tableau = [];
  for (let col = 0; col < 7; col++) {
    const pile = deck.splice(0, col + 1);
    pile[pile.length - 1].up = true;       // only the last card of each pile shows
    tableau.push(pile);
  }
  return {
    tableau,
    stock: deck,
    waste: [],
    foundations: { s: [], h: [], d: [], c: [] },
  };
}

/** Tableau rule: one lower, opposite colour. An empty column takes only a King. */
function canStack(card, onto) {
  if (!onto) return card.value === 13;
  return onto.up && onto.red !== card.red && onto.value === card.value + 1;
}

/** Foundation rule: same suit, next rank up, starting at the Ace. */
function canFound(card, pile) {
  if (!pile.length) return card.value === 1;
  const top = pile[pile.length - 1];
  return top.suit === card.suit && card.value === top.value + 1;
}

export default function Solitaire({ onExit }) {
  const [game, setGame] = useState(deal);
  const [sel, setSel] = useState(null);     // {from:'waste'|'tableau', col, index}
  const [moves, setMoves] = useState(0);
  const [best, setBest] = useState(null);

  useEffect(() => { getBest('solitaire').then(setBest); }, []);

  const restart = useCallback(() => {
    setGame(deal());
    setSel(null);
    setMoves(0);
  }, []);

  const won = useMemo(
    () => Object.values(game.foundations).every((p) => p.length === 13),
    [game]
  );

  useEffect(() => {
    if (!won) return;
    fx('win', 'success');
    submitScore('solitaire', moves, false).then((b) => { if (b) setBest(moves); });
  }, [won, moves]);

  const drawStock = useCallback(() => {
    setSel(null);
    setGame((g) => {
      if (g.stock.length) {
        const stock = g.stock.slice();
        const card = { ...stock.pop(), up: true };
        return { ...g, stock, waste: [...g.waste, card] };
      }
      if (!g.waste.length) return g;
      // recycling the waste back under the stock
      // Recycle: the waste goes back under the stock in the same order.
      return { ...g, stock: g.waste.slice().reverse().map((c) => ({ ...c, up: false })), waste: [] };
    });
    setMoves((n) => n + 1);
  }, []);

  /** Lift the selected card (plus anything stacked on it) off its pile. */
  const takeSelection = (g, s) => {
    if (s.from === 'waste') {
      const waste = g.waste.slice();
      const cards = [waste.pop()];
      return { cards, rest: { ...g, waste } };
    }
    const tableau = g.tableau.map((p) => p.slice());
    const cards = tableau[s.col].splice(s.index);
    const pile = tableau[s.col];
    if (pile.length) {
      // Replace rather than mutate: slice() copied the array, not the cards in
      // it, so assigning .up here would also flip the card in the old state.
      pile[pile.length - 1] = { ...pile[pile.length - 1], up: true };
    }
    return { cards, rest: { ...g, tableau } };
  };

  const moveToFoundation = useCallback((s) => {
    let done = false;
    setGame((g) => {
      const { cards, rest } = takeSelection(g, s);
      if (cards.length !== 1) return g;                 // only a single card founds
      const card = cards[0];
      const pile = rest.foundations[card.suit];
      if (!canFound(card, pile)) return g;
      done = true;
      return { ...rest, foundations: { ...rest.foundations, [card.suit]: [...pile, card] } };
    });
    if (done) { fx('merge'); setMoves((n) => n + 1); }
    return done;
  }, []);

  const tryMoveToColumn = useCallback((col) => {
    if (!sel) return false;
    let ok = false;
    setGame((g) => {
      const { cards, rest } = takeSelection(g, sel);
      if (!cards.length) return g;
      const target = rest.tableau[col];
      if (!canStack(cards[0], target[target.length - 1])) return g;
      const tableau = rest.tableau.map((p, i) => (i === col ? [...p, ...cards] : p));
      ok = true;
      return { ...rest, tableau };
    });
    if (ok) { play('place'); setMoves((n) => n + 1); setSel(null); }
    return ok;
  }, [sel]);

  const tapCard = useCallback((from, col, index) => {
    const pile = from === 'waste' ? game.waste : game.tableau[col];
    const card = pile[index];
    if (!card || !card.up) return;

    // Tapping the current selection again means "send it home if you can".
    if (sel && sel.from === from && sel.col === col && sel.index === index) {
      if (!moveToFoundation(sel)) setSel(null);
      else setSel(null);
      return;
    }

    // Tapping a face-up tableau card while holding a selection tries a move
    // onto it; otherwise it becomes the new selection.
    if (sel && from === 'tableau') {
      const target = game.tableau[col];
      if (index === target.length - 1) {
        const moved = tryMoveToColumn(col);
        if (moved) return;
      }
    }
    setSel({ from, col, index });
  }, [game, sel, moveToFoundation]);

  const tapFoundation = useCallback((suit) => {
    if (!sel) return;
    let ok = false;
    setGame((g) => {
      const { cards, rest } = takeSelection(g, sel);
      if (cards.length !== 1) return g;
      const card = cards[0];
      if (card.suit !== suit || !canFound(card, rest.foundations[suit])) return g;
      ok = true;
      return {
        ...rest,
        foundations: { ...rest.foundations, [suit]: [...rest.foundations[suit], card] },
      };
    });
    if (ok) { fx('merge'); setMoves((n) => n + 1); setSel(null); }
  }, [sel]);

  const isSel = (from, col, index) =>
    sel && sel.from === from && sel.col === col && sel.index <= index &&
    (from === 'waste' ? sel.index === index : true);

  const wasteTop = game.waste.length - 1;

  return (
    <GameFrame
      title="Solitaire"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'MOVES', value: moves, color: T.cyan },
        { label: 'DONE', value: Object.values(game.foundations).reduce((n, p) => n + p.length, 0) },
        { label: 'BEST', value: best != null ? `${best} mv` : '—' },
      ]}
      footer={<Text style={s.hint}>Tap a card to pick it up · tap it again to send it home</Text>}
    >
      <ScrollView
        style={{ alignSelf: 'stretch' }}
        contentContainerStyle={{ paddingHorizontal: GAP, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* stock, waste, foundations */}
        <View style={s.topRow}>
          <Pressable onPress={drawStock} style={[s.slot, s.stock]}>
            {game.stock.length ? (
              <View style={s.back}><Text style={s.backText}>{game.stock.length}</Text></View>
            ) : (
              <Ionicons name="refresh" size={20} color={T.dim} />
            )}
          </Pressable>

          <Pressable
            onPress={() => wasteTop >= 0 && tapCard('waste', 0, wasteTop)}
            style={[s.slot]}
          >
            {wasteTop >= 0
              ? <Card card={game.waste[wasteTop]} selected={isSel('waste', 0, wasteTop)} />
              : <View style={s.empty} />}
          </Pressable>

          <View style={{ flex: 1 }} />

          {SUITS.map((su) => {
            const pile = game.foundations[su.key];
            const top = pile[pile.length - 1];
            return (
              <Pressable key={su.key} onPress={() => tapFoundation(su.key)} style={s.slot}>
                {top ? <Card card={top} /> : (
                  <View style={s.empty}>
                    <Text style={[s.emptySuit, su.red && { color: T.red + '99' }]}>{su.sym}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* tableau */}
        <View style={s.tableau}>
          {game.tableau.map((pile, col) => (
            <Pressable
              key={col}
              onPress={() => { if (!pile.length) tryMoveToColumn(col); }}
              style={{ width: CARD_W, minHeight: CARD_H }}
            >
              {pile.length === 0 && <View style={s.empty} />}
              {pile.map((card, i) => (
                <Pressable
                  key={cardId(card) + i}
                  onPress={() => tapCard('tableau', col, i)}
                  style={{ marginTop: i === 0 ? 0 : -(CARD_H - FAN) }}
                >
                  <Card card={card} selected={isSel('tableau', col, i)} />
                </Pressable>
              ))}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {won && (
        <Banner title="You win!" tint={T.amber} detail={`Cleared in ${moves} moves.`}>
          <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
            <Btn label="New deal" icon="refresh" color={T.green} onPress={restart} />
          </View>
        </Banner>
      )}
    </GameFrame>
  );
}

function Card({ card, selected }) {
  if (!card.up) return <View style={s.back} />;
  const color = card.red ? '#FF6B8A' : '#DDE5F2';
  const sym = SUITS.find((x) => x.key === card.suit).sym;
  return (
    <View style={[s.card, selected && s.selected]}>
      <Text style={[s.rank, { color }]} numberOfLines={1}>{card.rank}</Text>
      <Text style={[s.suit, { color }]}>{sym}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: GAP, marginBottom: 14, alignItems: 'flex-start' },
  slot: { width: CARD_W, height: CARD_H },
  stock: { alignItems: 'center', justifyContent: 'center' },
  tableau: { flexDirection: 'row', gap: GAP },
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 6, backgroundColor: '#1A2231',
    borderWidth: 1, borderColor: '#2A3446', paddingTop: 2, alignItems: 'center',
  },
  selected: { borderColor: T.amber, borderWidth: 2, backgroundColor: '#2A2A1E' },
  back: {
    width: CARD_W, height: CARD_H, borderRadius: 6, backgroundColor: '#20304A',
    borderWidth: 1, borderColor: '#33456B', alignItems: 'center', justifyContent: 'center',
  },
  backText: { color: '#6E86AD', fontSize: 12, fontWeight: '800' },
  empty: {
    width: CARD_W, height: CARD_H, borderRadius: 6, borderWidth: 1,
    borderColor: T.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
  },
  emptySuit: { color: T.dim + '99', fontSize: 20 },
  rank: { fontSize: CARD_W * 0.36, fontWeight: '900', lineHeight: CARD_W * 0.44 },
  suit: { fontSize: CARD_W * 0.34, marginTop: -2 },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center' },
});
