import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Banner, Btn, FadeIn, GameFrame, WIN } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const SUITS = [
  { key: 's', sym: '♠', red: false }, { key: 'h', sym: '♥', red: true },
  { key: 'd', sym: '♦', red: true }, { key: 'c', sym: '♣', red: false },
];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_W = Math.min((WIN.width - 90) / 5, 62);
const CARD_H = Math.round(CARD_W * 1.42);
const START_CHIPS = 100;

function freshShoe() {
  const cards = [];
  // Four decks, like a real shoe -- one deck runs out too fast to be fun.
  for (let d = 0; d < 4; d++) {
    SUITS.forEach((s) => RANKS.forEach((r) => cards.push({ rank: r, suit: s.key, red: s.red })));
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** Aces count 11 until that would bust, then 1 -- the usual soft-hand rule. */
function handValue(cards) {
  let total = 0;
  let aces = 0;
  cards.forEach((c) => {
    if (c.rank === 'A') { aces++; total += 11; }
    else if (['K', 'Q', 'J', '10'].includes(c.rank)) total += 10;
    else total += Number(c.rank);
  });
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

const isBlackjack = (cards) => cards.length === 2 && handValue(cards) === 21;

export default function Blackjack({ onExit }) {
  const { T, s } = useTheme(makeStyles);
  const [shoe, setShoe] = useState(freshShoe);
  const [player, setPlayer] = useState([]);
  const [dealer, setDealer] = useState([]);
  const [phase, setPhase] = useState('betting');   // betting | player | dealer | done
  const [result, setResult] = useState(null);
  const [chips, setChips] = useState(START_CHIPS);
  const [bet, setBet] = useState(10);
  const [best, setBest] = useState(null);

  useEffect(() => { getBest('blackjack').then(setBest); }, []);

  /** Draw from the shoe, reshuffling when it runs low. */
  const draw = useCallback((n, from) => {
    let src = from;
    if (src.length < n + 8) src = freshShoe();
    return [src.slice(0, n), src.slice(n)];
  }, []);

  const restart = useCallback(() => {
    setShoe(freshShoe());
    setPlayer([]); setDealer([]);
    setPhase('betting'); setResult(null);
    setChips(START_CHIPS); setBet(10);
  }, []);

  const deal = useCallback(() => {
    if (bet > chips) { fx('error', 'warning'); return; }
    const [cards, rest] = draw(4, shoe);
    const p = [cards[0], cards[2]];
    const d = [cards[1], cards[3]];
    setShoe(rest); setPlayer(p); setDealer(d); setResult(null);
    play('flip');

    if (isBlackjack(p) || isBlackjack(d)) {
      finish(p, d, true);
      return;
    }
    setPhase('player');
  }, [bet, chips, shoe, draw]);

  const finish = useCallback((p, d, natural = false) => {
    const pv = handValue(p);
    const dv = handValue(d);
    let outcome;
    let delta;
    if (pv > 21) { outcome = 'Bust'; delta = -bet; }
    else if (natural && isBlackjack(p) && !isBlackjack(d)) {
      outcome = 'Blackjack!'; delta = Math.round(bet * 1.5);   // pays 3:2
    } else if (natural && isBlackjack(d) && !isBlackjack(p)) {
      outcome = 'Dealer blackjack'; delta = -bet;
    } else if (dv > 21) { outcome = 'Dealer bust'; delta = bet; }
    else if (pv > dv) { outcome = 'You win'; delta = bet; }
    else if (pv < dv) { outcome = 'Dealer wins'; delta = -bet; }
    else { outcome = 'Push'; delta = 0; }

    setChips((c) => {
      const next = c + delta;
      if (next > (best ?? 0)) {
        submitScore('blackjack', next).then((b) => { if (b) setBest(next); });
      }
      return next;
    });
    setResult({ outcome, delta });
    setPhase('done');
    if (delta > 0) fx('win', 'success');
    else if (delta < 0) fx('lose', 'error');
    else play('move');
  }, [bet, best]);

  const hit = useCallback(() => {
    const [cards, rest] = draw(1, shoe);
    const p = [...player, cards[0]];
    setShoe(rest); setPlayer(p); play('flip');
    if (handValue(p) > 21) finish(p, dealer);
  }, [shoe, player, dealer, draw, finish]);

  const stand = useCallback(() => {
    setPhase('dealer');
    let d = dealer.slice();
    let src = shoe;
    // Dealer draws to 17 and stands on all 17s.
    while (handValue(d) < 17) {
      const [cards, rest] = draw(1, src);
      d = [...d, cards[0]];
      src = rest;
    }
    setShoe(src); setDealer(d); play('place');
    finish(player, d);
  }, [dealer, shoe, player, draw, finish]);

  const nextHand = useCallback(() => {
    setPlayer([]); setDealer([]); setResult(null);
    setPhase(chips > 0 ? 'betting' : 'broke');
  }, [chips]);

  const hideHole = phase === 'player';
  const pv = handValue(player);
  const dv = handValue(hideHole ? dealer.slice(0, 1) : dealer);

  return (
    <GameFrame
      title="Blackjack"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'CHIPS', value: chips, color: chips >= START_CHIPS ? T.green : T.amber },
        { label: 'BET', value: bet },
        { label: 'BEST', value: best ?? '—' },
      ]}
      footer={
        phase === 'betting' || phase === 'broke' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[5, 10, 25, 50].map((v) => (
                <Btn
                  key={v}
                  label={`${v}`}
                  flex={1}
                  color={bet === v ? T.amber : T.dim}
                  onPress={() => setBet(v)}
                  disabled={v > chips}
                />
              ))}
            </View>
            <Btn
              label={chips > 0 ? 'Deal' : 'Out of chips — restart'}
              icon={chips > 0 ? 'play' : 'refresh'}
              color={T.green}
              onPress={chips > 0 ? deal : restart}
              disabled={chips > 0 && bet > chips}
            />
          </>
        ) : phase === 'player' ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="Hit" icon="add" color={T.cyan} flex={1} onPress={hit} />
            <Btn label="Stand" icon="hand-left" color={T.amber} flex={1} onPress={stand} />
          </View>
        ) : (
          <Btn label="Next hand" icon="arrow-forward" color={T.green} onPress={nextHand} />
        )
      }
    >
      <View style={{ alignItems: 'center', gap: 18 }}>
        <Hand title={`Dealer — ${hideHole ? `${dv}+` : dv}`} cards={dealer} hideFirst={false}
              hideLast={hideHole} />
        <Hand title={`You — ${pv}`} cards={player} />

        {phase === 'done' && !!result && (
          <Banner
            title={result.outcome}
            tint={result.delta > 0 ? T.green : result.delta < 0 ? T.red : T.dim}
            detail={result.delta === 0 ? 'Bet returned.' : `${result.delta > 0 ? '+' : ''}${result.delta} chips`}
          >
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="Next hand" icon="arrow-forward" color={T.green} onPress={nextHand} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

function Hand({ title, cards, hideLast }) {
  const { T, s } = useTheme(makeStyles);
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={s.handTitle}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 6, minHeight: CARD_H }}>
        {cards.map((c, i) => (
          <FadeIn key={`${c.rank}${c.suit}${i}`} delay={i * 70}>
            {hideLast && i === cards.length - 1 ? (
              <View style={s.back} />
            ) : (
              <View style={s.card}>
                <Text style={[s.rank, { color: c.red ? T.cardRed : T.cardBlack }]}>{c.rank}</Text>
                <Text style={[s.suit, { color: c.red ? T.cardRed : T.cardBlack }]}>
                  {SUITS.find((x) => x.key === c.suit).sym}
                </Text>
              </View>
            )}
          </FadeIn>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (T) => StyleSheet.create({
  handTitle: { color: T.dim, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 7, backgroundColor: T.cardFace,
    borderWidth: 1, borderColor: T.cardEdge, alignItems: 'center', paddingTop: 3,
  },
  back: {
    width: CARD_W, height: CARD_H, borderRadius: 7, backgroundColor: T.cardBack,
    borderWidth: 1, borderColor: T.cardBackEdge,
  },
  rank: { fontSize: CARD_W * 0.34, fontWeight: '900' },
  suit: { fontSize: CARD_W * 0.32 },
});
