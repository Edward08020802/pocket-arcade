import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Easing, PanResponder, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from './theme';
import { fx, useMuted } from './sound';

export const WIN = Dimensions.get('window');

/** Screen chrome shared by every game: title, back, score line, restart. */
export function GameFrame({ title, onExit, onRestart, stats = [], children, footer }) {
  const insets = useSafeAreaInsets();
  const [muted, toggleMute] = useMuted();
  return (
    <View style={[s.root, { paddingTop: insets.top + 6 }]}>
      <View style={s.header}>
        <Pressable
          onPress={() => { fx('tap'); onExit(); }}
          hitSlop={12}
          style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={T.cyan} />
        </Pressable>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Pressable
          onPress={toggleMute}
          hitSlop={10}
          style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
        >
          <Ionicons
            name={muted ? 'volume-mute' : 'volume-medium'}
            size={19}
            color={muted ? T.dim : T.cyan}
          />
        </Pressable>
        <Pressable
          onPress={() => { fx('tap'); onRestart(); }}
          hitSlop={12}
          style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
        >
          <Ionicons name="refresh" size={20} color={T.cyan} />
        </Pressable>
      </View>

      {stats.length > 0 && (
        <View style={s.stats}>
          {stats.map((st) => (
            <View key={st.label} style={s.stat}>
              <Text style={s.statLabel}>{st.label}</Text>
              <Text style={[s.statValue, !!st.color && { color: st.color }]}>
                {st.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.body}>{children}</View>

      {!!footer && (
        <View style={[s.footer, { paddingBottom: insets.bottom + 8 }]}>{footer}</View>
      )}
    </View>
  );
}

/** Full-width action button. */
export function Btn({ label, icon, color = T.cyan, onPress, disabled, flex, sfx = 'tap' }) {
  return (
    <Pressable
      onPress={() => { if (sfx) fx(sfx); onPress?.(); }}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        !!flex && { flex },
        { borderColor: color + '55', backgroundColor: color + '14' },
        pressed && s.pressed,
        !!disabled && { opacity: 0.4 },
      ]}
    >
      {!!icon && <Ionicons name={icon} size={17} color={color} />}
      <Text style={[s.btnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Centred overlay for win/lose, drawn above the board rather than as an alert. */
export function Banner({ title, detail, tint = T.green, children }) {
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(grow, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }).start();
  }, [grow]);
  return (
    <View style={s.bannerWrap} pointerEvents="box-none">
      <Animated.View
        style={[
          s.banner,
          { borderColor: tint + '66' },
          {
            opacity: grow,
            transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          },
        ]}
      >
        <Text style={[s.bannerTitle, { color: tint }]}>{title}</Text>
        {!!detail && <Text style={s.bannerDetail}>{detail}</Text>}
        {children}
      </Animated.View>
    </View>
  );
}

/**
 * Scale-pops whenever `trigger` changes. Used for tiles appearing, discs
 * landing, pads lighting -- the small bits of feedback that make a board feel
 * like it responded rather than just redrew.
 */
export function Pop({ trigger, from = 0.6, style, children, spring = true }) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    v.setValue(from);
    if (spring) {
      Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 5, tension: 160 }).start();
    } else {
      Animated.timing(v, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  }, [trigger, v, from, spring]);
  return <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>;
}

/** Fades and slides in once, for boards and cards appearing. */
export function FadeIn({ delay = 0, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1, duration: 260, delay, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A value that animates towards `to` -- used for falling pieces. */
export function useSlide(to, duration = 180) {
  const v = useRef(new Animated.Value(to)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: to, duration, easing: Easing.bounce, useNativeDriver: true,
    }).start();
  }, [to, v, duration]);
  return v;
}

/**
 * Swipe detector. Games that are grid-based (Snake, 2048, Tetris) all want the
 * same thing: a single direction per gesture, decided by the dominant axis.
 */
export function useSwipe(onSwipe, { threshold = 24 } = {}) {
  const cb = useRef(onSwipe);
  useEffect(() => { cb.current = onSwipe; }, [onSwipe]);

  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderRelease: (_e, g) => {
        const { dx, dy } = g;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
        if (Math.abs(dx) > Math.abs(dy)) cb.current(dx > 0 ? 'right' : 'left');
        else cb.current(dy > 0 ? 'down' : 'up');
      },
    })
  ).current.panHandlers;
}

/**
 * setInterval that survives re-renders without restarting on every tick, and
 * pauses when `delay` is null. Every real-time game here needs exactly this.
 */
export function useTicker(fn, delay) {
  const saved = useRef(fn);
  useEffect(() => { saved.current = fn; }, [fn]);
  useEffect(() => {
    if (delay == null) return undefined;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 6, gap: 10,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center',
    justifyContent: 'center', backgroundColor: T.card,
    borderWidth: 1, borderColor: T.border,
  },
  title: { flex: 1, color: T.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  stats: {
    flexDirection: 'row', marginHorizontal: 12, marginTop: 4, marginBottom: 8,
    backgroundColor: T.card, borderRadius: 14, borderWidth: 1,
    borderColor: T.border, paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { color: T.dim, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  statValue: { color: T.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 12, paddingTop: 8, gap: 10 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 13, borderWidth: 1,
  },
  btnText: { fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.6 },
  bannerWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  banner: {
    backgroundColor: T.cardHi, borderRadius: 18, borderWidth: 1,
    paddingVertical: 22, paddingHorizontal: 30, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
  },
  bannerTitle: { fontSize: 24, fontWeight: '900' },
  bannerDetail: { color: T.dim, fontSize: 14, marginTop: 6, textAlign: 'center' },
});
