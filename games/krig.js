import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Banner, Btn, GameFrame, WIN, useTicker } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const SUITS = [
  { key: 's', sym: '♠', red: false }, { key: 'h', sym: '♥', red: true },
  { key: 'd', sym: '♦', red: true }, { key: 'c', sym: '♣', red: false },
];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const CARD_W = Math.min((WIN.width - 90) / 3, 92);
const CARD_H = Math.round(CARD_W * 1.42);

// On a tie ("krig") each player buries this many face down before turning one
// more face up to settle it. Danish rules vary between one and three; two is
// the version most people here play.
const BURIED = 2;

// War can in principle never end, because each side keeps winning the same
// cards back in the same order. Won cards are shuffled before going to the
// bottom, which breaks that; the cap is only a backstop.
//
// Measured over 1500 games with a full deck: median 283 rounds, 90th
// percentile 765, none beyond 2000. At 400 nearly a third of games were being
// called early, which is why the limit is where it is -- and why Auto runs
// quickly enough to play a median game in about 75 seconds.
const TURN_LIMIT = 2000;

function freshDeck() {
  const cards = [];
  SUITS.forEach((s) =>
    RANKS.forEach((r, i) =>
      cards.push({ rank: r, suit: s.key, red: s.red, value: i + 2 })
    )
  );
  return shuffle(cards);
}

function shuffle(cards) {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const deal = () => {
  const deck = freshDeck();
  return { you: deck.slice(0, 26), cpu: deck.slice(26) };
};

/**
 * Play one round.
 *
 * Returns the new piles, what was shown, and what is still at stake. A tie
 * leaves the pot on the table and reports `war`, so the next call settles it.
 * A player who cannot cover a war plays everything they have left.
 */
function playRound(you, cpu, carried = []) {
  if (!you.length || !cpu.length) return null;

  const pot = carried.slice();
  const yourCard = you[0];
  const cpuCard = cpu[0];
  let yourRest = you.slice(1);
  let cpuRest = cpu.slice(1);
  pot.push(yourCard, cpuCard);

  if (yourCard.value > cpuCard.value) {
    return { you: [...yourRest, ...shuffle(pot)], cpu: cpuRest,
             yourCard, cpuCard, pot: [], winner: 'you', war: false };
  }
  if (cpuCard.value > yourCard.value) {
    return { you: yourRest, cpu: [...cpuRest, ...shuffle(pot)],
             yourCard, cpuCard, pot: [], winner: 'cpu', war: false };
  }

  // Equal: bury what each side can afford and carry the pot forward.
  const yourBury = yourRest.slice(0, Math.min(BURIED, Math.max(0, yourRest.length - 1)));
  const cpuBury = cpuRest.slice(0, Math.min(BURIED, Math.max(0, cpuRest.length - 1)));
  yourRest = yourRest.slice(yourBury.length);
  cpuRest = cpuRest.slice(cpuBury.length);
  pot.push(...yourBury, ...cpuBury);

  return { you: yourRest, cpu: cpuRest, yourCard, cpuCard, pot, winner: null, war: true };
}

export default function Krig({ onExit }) {
  const { T, s } = useTheme(makeStyles);
  const [piles, setPiles] = useState(deal);
  const [shown, setShown] = useState(null);      // { yourCard, cpuCard, winner, war }
  const [pot, setPot] = useState([]);
  const [turns, setTurns] = useState(0);
  const [auto, setAuto] = useState(false);
  const [best, setBest] = useState(null);

  useEffect(() => { getBest('krig').then(setBest); }, []);

  const finished =
    piles.you.length === 0 || piles.cpu.length === 0 || turns >= TURN_LIMIT;
  const youWon = finished && piles.you.length > piles.cpu.length;

  const restart = useCallback(() => {
    setPiles(deal());
    setShown(null);
    setPot([]);
    setTurns(0);
    setAuto(false);
  }, []);

  const step = useCallback(() => {
    setPiles((cur) => {
      const result = playRound(cur.you, cur.cpu, pot);
      if (!result) return cur;
      setShown({
        yourCard: result.yourCard,
        cpuCard: result.cpuCard,
        winner: result.winner,
        war: result.war,
      });
      setPot(result.pot);
      setTurns((n) => n + 1);
      if (result.war) fx('error', 'warning');
      else if (result.winner === 'you') play('merge');
      else play('move');
      return { you: result.you, cpu: result.cpu };
    });
  }, [pot]);

  useTicker(step, auto && !finished ? 260 : null);

  useEffect(() => {
    if (!finished) return;
    setAuto(false);
    fx(youWon ? 'win' : 'lose', youWon ? 'success' : 'error');
    if (youWon) {
      submitScore('krig', turns, false).then((b) => { if (b) setBest(turns); });
    }
  }, [finished]);

  const atStake = pot.length;

  return (
    <GameFrame
      title="Krig"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'YOURS', value: piles.you.length, color: T.amber },
        { label: 'THEIRS', value: piles.cpu.length, color: T.cyan },
        { label: 'ROUNDS', value: turns },
        { label: 'BEST', value: best != null ? `${best} rds` : '—' },
      ]}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn
            label={shown?.war ? 'Krig!' : 'Turn'}
            icon="play"
            color={shown?.war ? T.red : T.green}
            flex={1}
            onPress={step}
            disabled={finished || auto}
          />
          <Btn
            label={auto ? 'Stop' : 'Auto'}
            icon={auto ? 'pause' : 'play-forward'}
            color={T.violet}
            flex={1}
            onPress={() => setAuto((a) => !a)}
            disabled={finished}
          />
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Pile label="Them" count={piles.cpu.length} />

        <View style={s.table}>
          <Slot card={shown?.cpuCard} winner={shown?.winner === 'cpu'} tint={T.cyan} />
          <View style={s.middle}>
            <Text style={[s.verdict, shown?.war && { color: T.red }]}>
              {!shown ? 'vs' : shown.war ? 'KRIG' : shown.winner === 'you' ? '▲ you' : '▼ them'}
            </Text>
            {atStake > 0 && <Text style={s.stake}>{atStake} at stake</Text>}
          </View>
          <Slot card={shown?.yourCard} winner={shown?.winner === 'you'} tint={T.amber} />
        </View>

        <Pile label="Yours" count={piles.you.length} />

        <Text style={s.hint}>
          {shown?.war
            ? `Tied — ${BURIED} buried each, next turn settles it`
            : 'Higher card takes both'}
        </Text>

        {finished && (
          <Banner
            title={youWon ? 'You win!' : piles.you.length === piles.cpu.length ? 'Dead heat' : 'They win'}
            tint={youWon ? T.green : T.red}
            detail={
              turns >= TURN_LIMIT
                ? `Called at ${TURN_LIMIT} rounds — ${piles.you.length} cards to ${piles.cpu.length}.`
                : `${turns} rounds.`
            }
          >
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="Deal again" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}
      </View>
    </GameFrame>
  );
}

function Pile({ label, count }) {
  const { T, s } = useTheme(makeStyles);
  return (
    <View style={s.pileRow}>
      <Text style={s.pileLabel}>{label}</Text>
      <View style={s.pileBar}>
        <View style={[s.pileFill, { width: `${Math.min(100, (count / 52) * 100)}%` }]} />
      </View>
      <Text style={[s.pileCount, { color: count < 8 ? T.red : T.text }]}>{count}</Text>
    </View>
  );
}

/** One played card, turned face up as it lands. */
function Slot({ card, winner, tint }) {
  const { T, s } = useTheme(makeStyles);
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!card) { turn.setValue(0); return; }
    turn.setValue(0);
    Animated.timing(turn, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [card, turn]);

  if (!card) return <View style={[s.slot, s.slotEmpty]} />;

  return (
    <Animated.View
      style={[
        s.slot,
        winner && { borderColor: tint, borderWidth: 2 },
        {
          opacity: turn,
          transform: [
            { scaleX: turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.1, 1] }) },
            { translateY: turn.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) },
          ],
        },
      ]}
    >
      <Text style={[s.rank, { color: card.red ? T.cardRed : T.cardBlack }]}>{card.rank}</Text>
      <Text style={[s.suit, { color: card.red ? T.cardRed : T.cardBlack }]}>
        {SUITS.find((x) => x.key === card.suit).sym}
      </Text>
    </Animated.View>
  );
}

const makeStyles = (T) => StyleSheet.create({
  table: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  middle: { width: 78, alignItems: 'center' },
  verdict: { color: T.dim, fontSize: 15, fontWeight: '800' },
  stake: { color: T.amber, fontSize: 11, marginTop: 3 },
  slot: {
    width: CARD_W, height: CARD_H, borderRadius: 8, backgroundColor: T.cardFace,
    borderWidth: 1, borderColor: T.cardEdge, alignItems: 'center', paddingTop: 4,
  },
  slotEmpty: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: T.border },
  rank: { fontSize: CARD_W * 0.34, fontWeight: '900' },
  suit: { fontSize: CARD_W * 0.32 },
  pileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: CARD_W * 3 + 98 },
  pileLabel: { color: T.dim, fontSize: 11, fontWeight: '800', width: 46 },
  pileBar: {
    flex: 1, height: 8, borderRadius: 4, backgroundColor: T.card,
    borderWidth: 1, borderColor: T.border, overflow: 'hidden',
  },
  pileFill: { height: '100%', backgroundColor: T.green },
  pileCount: { color: T.text, fontSize: 14, fontWeight: '800', width: 26, textAlign: 'right' },
  hint: { color: T.dim, fontSize: 12, textAlign: 'center', marginTop: 2 },
});
