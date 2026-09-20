import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable, ScrollView, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from './theme';
import { loadBests } from './storage';
import { fx, useMuted, warmUp } from './sound';

import Snake from './games/snake';
import Solitaire from './games/solitaire';
import Twenty48 from './games/twenty48';
import Tetris from './games/tetris';
import Minesweeper from './games/minesweeper';
import Sudoku from './games/sudoku';
import Memory from './games/memory';
import Simon from './games/simon';
import ConnectFour from './games/connect4';
import Breakout from './games/breakout';
import Pong from './games/pong';
import Fifteen from './games/fifteen';
import LightsOut from './games/lightsout';
import Mastermind from './games/mastermind';
import Blackjack from './games/blackjack';
import Chess from './games/chess';
import Krig from './games/krig';

/**
 * Every game is self-contained and offline: no network calls anywhere in this
 * app, and the only stored state is a best score per game.
 *
 * `score` describes how the saved best should be read, since some games are
 * scored high-is-good and others by time or moves taken.
 */
const GAMES = [
  { key: 'snake', title: 'Snake', blurb: 'Eat, grow, do not bite yourself',
    icon: 'git-commit', tint: '#10B981', Component: Snake,
    score: (v) => `${v} apples` },
  { key: 'solitaire', title: 'Solitaire', blurb: 'Klondike, draw one',
    icon: 'albums', tint: '#EF4444', Component: Solitaire,
    score: (v) => `${v} moves` },
  { key: '2048', title: '2048', blurb: 'Slide tiles, double the numbers',
    icon: 'grid', tint: '#F59E0B', Component: Twenty48,
    score: (v) => `${v} pts` },
  { key: 'tetris', title: 'Tetris', blurb: 'Stack blocks, clear lines',
    icon: 'apps', tint: '#0EA5E9', Component: Tetris,
    score: (v) => `${v} pts` },
  { key: 'minesweeper', title: 'Minesweeper', blurb: 'Clear the field, flag the mines',
    icon: 'flag', tint: '#8B5CF6', Component: Minesweeper,
    score: (v) => `${v}s` },
  { key: 'sudoku-Easy', title: 'Sudoku', blurb: 'Three difficulties, always solvable',
    icon: 'keypad', tint: '#60A5FA', Component: Sudoku,
    score: (v) => `${Math.floor(v / 60)}m ${v % 60}s` },
  { key: 'memory', title: 'Memory', blurb: 'Match every pair from memory',
    icon: 'copy', tint: '#EC4899', Component: Memory,
    score: (v) => `${v} moves` },
  { key: 'simon', title: 'Simon', blurb: 'Repeat the sequence, one longer each time',
    icon: 'musical-note', tint: '#84CC16', Component: Simon,
    score: (v) => `round ${v}` },
  { key: 'connect4-Normal', title: 'Connect Four', blurb: 'Four in a row against the phone',
    icon: 'ellipse', tint: '#F97316', Component: ConnectFour,
    score: (v) => `${v} in a row` },
  { key: 'breakout', title: 'Breakout', blurb: 'Knock out every brick',
    icon: 'tablet-landscape', tint: '#22D3EE', Component: Breakout,
    score: (v) => `${v} pts` },
  { key: 'pong', title: 'Pong', blurb: 'First to seven against the phone',
    icon: 'ellipse-outline', tint: '#94A3B8', Component: Pong,
    score: (v) => `+${v}` },
  { key: 'fifteen', title: '15 Puzzle', blurb: 'Slide the tiles back into order',
    icon: 'swap-horizontal', tint: '#34D399', Component: Fifteen,
    score: (v) => `${v} moves` },
  { key: 'lightsout', title: 'Lights Out', blurb: 'Turn every light off',
    icon: 'bulb', tint: '#FCD34D', Component: LightsOut,
    score: (v) => `${v} moves` },
  { key: 'mastermind', title: 'Mastermind', blurb: 'Crack the hidden colour code',
    icon: 'color-palette', tint: '#C084FC', Component: Mastermind,
    score: (v) => `${v} tries` },
  { key: 'blackjack', title: 'Blackjack', blurb: 'Beat the dealer without busting',
    icon: 'diamond', tint: '#FB7185', Component: Blackjack,
    score: (v) => `${v} chips` },
  { key: 'chess', title: 'Chess', blurb: 'Five strength settings, ~400 to ~1600',
    icon: 'school', tint: '#E2E8F0', Component: Chess,
    score: (v) => `beat level ${v}` },
  { key: 'krig', title: 'Krig', blurb: 'Danish war — highest card takes both',
    icon: 'flash', tint: '#F43F5E', Component: Krig,
    score: (v) => `${v} rounds` },
];

function Hub({ onPick }) {
  const { T, s, theme, toggle } = useTheme(makeStyles);
  const insets = useSafeAreaInsets();
  const [bests, setBests] = useState({});
  const [muted, toggleMute] = useMuted();

  // Re-read on every return to the hub so a new best shows up immediately.
  useEffect(() => { loadBests().then((b) => setBests({ ...b })); }, []);
  // Build the sound players while the menu is idle, so no tap ever pays for it.
  useEffect(() => { warmUp(); }, []);

  return (
    <View style={[s.root, { paddingTop: insets.top + 10 }]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Pocket Arcade</Text>
          <Text style={s.subtitle}>{GAMES.length} games · works with no signal</Text>
        </View>
        <Pressable
          onPress={() => { fx('tap'); toggle(); }}
          hitSlop={12}
          style={({ pressed }) => [s.muteBtn, { marginRight: 8 }, pressed && s.pressed]}
        >
          <Ionicons name={theme === 'dark' ? 'moon' : 'sunny'} size={19} color={T.amber} />
        </Pressable>
        <Pressable
          onPress={toggleMute}
          hitSlop={12}
          style={({ pressed }) => [s.muteBtn, pressed && s.pressed]}
        >
          <Ionicons
            name={muted ? 'volume-mute' : 'volume-medium'}
            size={20}
            color={muted ? T.dim : T.cyan}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {GAMES.map((g) => {
          const best = bests[g.key];
          return (
            <Pressable
              key={g.key}
              onPress={() => { fx('select'); onPick(g); }}
              style={({ pressed }) => [s.card, pressed && s.pressed]}
            >
              <View style={[s.iconWrap, { backgroundColor: g.tint + '1E' }]}>
                <Ionicons name={g.icon} size={23} color={g.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{g.title}</Text>
                <Text style={s.cardBlurb}>{g.blurb}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {best != null ? (
                  <>
                    <Text style={s.bestLabel}>BEST</Text>
                    <Text style={[s.bestValue, { color: g.tint }]}>{g.score(best)}</Text>
                  </>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={T.dim} />
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Inside the provider, so it can read the palette it is painted with. */
function Root() {
  const { T, s, theme } = useTheme(makeStyles);
  const [game, setGame] = useState(null);
  const exit = useCallback(() => setGame(null), []);

  return (
    <>
      <StatusBar
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={T.bg}
      />
      <View style={s.root}>
        {game
          ? <game.Component key={game.key} onExit={exit} />
          : <Hub key="hub" onPick={setGame} />}
      </View>
    </>
  );
}

/**
 * Catches render errors and shows them.
 *
 * A JS exception in a release build renders nothing at all -- the app just
 * launches to a blank screen with no way to tell what failed. This draws the
 * message instead, with hardcoded styles and no imports of its own, so it
 * cannot fail for the same reason the thing it is reporting on did.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, extra: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidMount() {
    // Errors outside render -- async callbacks, timers, native events.
    const handler = global.ErrorUtils && global.ErrorUtils.getGlobalHandler
      ? global.ErrorUtils.getGlobalHandler()
      : null;
    if (global.ErrorUtils && global.ErrorUtils.setGlobalHandler) {
      global.ErrorUtils.setGlobalHandler((error, isFatal) => {
        this.setState({ extra: `${isFatal ? 'FATAL ' : ''}${error && (error.stack || error.message)}` });
        if (handler) handler(error, isFatal);
      });
    }
  }

  render() {
    const { error, extra } = this.state;
    if (!error && !extra) return this.props.children;
    const text = error ? (error.stack || error.message || String(error)) : extra;
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: '#1A0C10' }}
        contentContainerStyle={{ padding: 18, paddingTop: 70 }}
      >
        <Text style={{ color: '#FF8FA6', fontSize: 17, fontWeight: '800', marginBottom: 10 }}>
          Pocket Arcade crashed
        </Text>
        <Text style={{ color: '#FFD7DF', fontSize: 11, lineHeight: 16 }} selectable>
          {String(text)}
        </Text>
      </ScrollView>
    );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const makeStyles = (T) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 6 },
  muteBtn: {
    width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.card, borderWidth: 1, borderColor: T.border,
  },
  title: { color: T.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: T.dim, fontSize: 13, marginTop: 3 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: T.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: T.border,
  },
  pressed: { opacity: 0.65 },
  iconWrap: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: T.text, fontSize: 17, fontWeight: '800' },
  cardBlurb: { color: T.dim, fontSize: 13, marginTop: 2 },
  bestLabel: { color: T.dim, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  bestValue: { fontSize: 13, fontWeight: '800', marginTop: 2 },
});
