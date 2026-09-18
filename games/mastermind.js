import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SPECTRUM, useTheme } from '../theme';
import { Banner, Btn, GameFrame, Pop, WIN } from '../ui';
import { getBest, submitScore } from '../storage';
import { fx, play } from '../sound';

const SLOTS = 4;
const COLORS = SPECTRUM.slice(0, 6);
const MAX_ROWS = 10;
const PEG = Math.min((WIN.width - 150) / SLOTS, 40);

const secret = () =>
  Array.from({ length: SLOTS }, () => Math.floor(Math.random() * COLORS.length));

/**
 * Standard scoring: exact hits first, then colours that appear somewhere else,
 * counted so a colour is never credited twice.
 */
function score(guess, code) {
  const exact = guess.filter((g, i) => g === code[i]).length;
  const countBy = (arr) => arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {});
  const gc = countBy(guess);
  const cc = countBy(code);
  const shared = Object.keys(gc).reduce(
    (n, k) => n + Math.min(gc[k], cc[k] || 0), 0
  );
  return { exact, colour: shared - exact };
}

export default function Mastermind({ onExit }) {
  const { T, s } = useTheme(makeStyles);
  const [code, setCode] = useState(secret);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(Array(SLOTS).fill(null));
  const [best, setBest] = useState(null);

  const solved = rows.length > 0 && rows[rows.length - 1].exact === SLOTS;
  const lost = !solved && rows.length >= MAX_ROWS;

  useEffect(() => { getBest('mastermind').then(setBest); }, []);

  const restart = useCallback(() => {
    setCode(secret());
    setRows([]);
    setDraft(Array(SLOTS).fill(null));
  }, []);

  const setSlot = useCallback((colour) => {
    setDraft((cur) => {
      const i = cur.indexOf(null);
      if (i === -1) return cur;
      play('select');
      const next = cur.slice();
      next[i] = colour;
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setDraft((cur) => {
      const filled = cur.filter((v) => v !== null).length;
      if (!filled) return cur;
      play('move');
      const next = cur.slice();
      next[filled - 1] = null;
      return next;
    });
  }, []);

  const submit = useCallback(() => {
    if (draft.some((v) => v === null) || solved || lost) return;
    const result = score(draft, code);
    const next = [...rows, { guess: draft, ...result }];
    setRows(next);
    setDraft(Array(SLOTS).fill(null));
    if (result.exact === SLOTS) {
      fx('win', 'success');
      submitScore('mastermind', next.length, false).then((b) => {
        if (b) setBest(next.length);
      });
    } else if (next.length >= MAX_ROWS) {
      fx('lose', 'error');
    } else {
      play('place');
    }
  }, [draft, code, rows, solved, lost]);

  const done = solved || lost;

  return (
    <GameFrame
      title="Mastermind"
      onExit={onExit}
      onRestart={restart}
      stats={[
        { label: 'GUESS', value: `${rows.length}/${MAX_ROWS}`, color: T.violet },
        { label: 'BEST', value: best != null ? `${best} tries` : '—' },
      ]}
      footer={
        <>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
            {COLORS.map((c, i) => (
              <Pressable
                key={c}
                onPress={() => setSlot(i)}
                disabled={done}
                style={({ pressed }) => [
                  s.swatch,
                  { backgroundColor: c, opacity: done ? 0.35 : pressed ? 0.6 : 1 },
                ]}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="Undo" icon="arrow-undo" color={T.dim} flex={1} onPress={undo} disabled={done} />
            <Btn
              label="Check"
              icon="checkmark"
              color={T.green}
              flex={1}
              onPress={submit}
              disabled={done || draft.some((v) => v === null)}
            />
          </View>
        </>
      }
    >
      <ScrollView
        style={{ alignSelf: 'stretch' }}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row, i) => (
          <View key={i} style={s.row}>
            <Text style={s.rowNum}>{i + 1}</Text>
            {row.guess.map((g, j) => (
              <View key={j} style={[s.peg, { backgroundColor: COLORS[g] }]} />
            ))}
            <View style={s.marks}>
              <Text style={[s.mark, { color: T.green }]}>{'●'.repeat(row.exact) || ''}</Text>
              <Text style={[s.mark, { color: T.amber }]}>{'○'.repeat(row.colour) || ''}</Text>
            </View>
          </View>
        ))}

        {!done && (
          <View style={[s.row, s.draftRow]}>
            <Text style={s.rowNum}>{rows.length + 1}</Text>
            {draft.map((g, j) => (
              <Pop key={j} trigger={g} from={0.6}>
                <View
                  style={[
                    s.peg,
                    g === null ? s.emptyPeg : { backgroundColor: COLORS[g] },
                  ]}
                />
              </Pop>
            ))}
            <View style={s.marks} />
          </View>
        )}

        {done && (
          <Banner
            title={solved ? 'Cracked it!' : 'Out of guesses'}
            tint={solved ? T.green : T.red}
            detail={solved ? `Found in ${rows.length} tries.` : 'The code was:'}
          >
            {!solved && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {code.map((c, i) => (
                  <View key={i} style={[s.peg, { backgroundColor: COLORS[c] }]} />
                ))}
              </View>
            )}
            <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
              <Btn label="New code" icon="refresh" color={T.green} onPress={restart} />
            </View>
          </Banner>
        )}
      </ScrollView>
    </GameFrame>
  );
}

const makeStyles = (T) => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7,
    backgroundColor: T.card, borderRadius: 12, paddingVertical: 7,
    paddingHorizontal: 10, borderWidth: 1, borderColor: T.border,
  },
  draftRow: { borderColor: T.violet + '88' },
  rowNum: { color: T.dim, fontSize: 11, width: 18, fontWeight: '800' },
  peg: { width: PEG, height: PEG, borderRadius: PEG },
  emptyPeg: { borderWidth: 1.5, borderColor: T.border, backgroundColor: 'transparent' },
  marks: { width: 62, paddingLeft: 6 },
  mark: { fontSize: 11, letterSpacing: 1.5 },
  swatch: { width: 42, height: 42, borderRadius: 21 },
});
